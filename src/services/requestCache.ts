/**
 * What the rider app's requests share, so no screen has to invent it.
 *
 * - `singleFlight`: identical requests in flight at the same time become one.
 *   A double tap sent "accept" twice.
 * - `freshFlight`: the same for reads asked for because something changed. A
 *   socket event, a reconnect and a push token arriving together each asked
 *   for the whole waybill again; now they share one follow-up request.
 * - `remember` / `recall`: the last answer to a read, kept for the session, so
 *   a screen opening again shows it at once and asks again quietly (stale
 *   while revalidate) instead of a spinner over nothing.
 * - `trackPending` / `whenSettled`: work the screen has already shown as done
 *   (an optimistic upload), which anything that needs it on the server first
 *   waits for.
 * - `optimistic`: show the change, send it, undo it if the server says no.
 *
 * No React and no native imports, so all of it runs under vitest.
 */

const inFlight = new Map<string, Promise<unknown>>();

/**
 * Runs `run` unless a call with the same key is still in flight, in which
 * case that call's promise is returned instead. The key must name everything
 * that makes two calls different (path, arguments, body); two calls that
 * share one are taken to be the same request.
 */
export function singleFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  let started: Promise<T>;
  try {
    started = run();
  } catch (err) {
    started = Promise.reject(err);
  }
  const shared = started.finally(() => {
    if (inFlight.get(key) === shared) inFlight.delete(key);
  });
  inFlight.set(key, shared);
  return shared;
}

const trailing = new Map<string, Promise<unknown>>();

/**
 * singleFlight for reads that something has just made stale.
 *
 * Joining a request already in flight is wrong when the caller is asking
 * BECAUSE something changed: a socket event saying "errand updated" that lands
 * while a waybill fetch is out would be answered by that fetch, which left
 * before the change and comes back without it. So a call arriving mid-flight
 * gets one follow-up request, started when the in-flight one finishes, and
 * every other call arriving meanwhile shares that same follow-up. A burst of
 * ten events costs two requests, and the last answer always postdates the
 * last event.
 */
export function freshFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const current = inFlight.get(key);
  if (!current) return singleFlight(key, run);

  const queued = trailing.get(key) as Promise<T> | undefined;
  if (queued) return queued;

  const followUp = current
    .catch(() => undefined)
    .then(() => {
      trailing.delete(key);
      return singleFlight(key, run);
    });
  trailing.set(key, followUp);
  return followUp;
}

/** How many distinct requests are in flight right now. */
export function inFlightCount(): number {
  return inFlight.size;
}

export interface Remembered<T> {
  value: T;
  /** When it was remembered, epoch ms. */
  at: number;
}

const remembered = new Map<string, Remembered<unknown>>();

/** Keeps the latest answer to a read for the rest of the session. */
export function remember<T>(key: string, value: T, now: number = Date.now()): void {
  remembered.set(key, { value, at: now });
}

/** The last answer remembered under `key`, however old, or null. */
export function recall<T>(key: string): Remembered<T> | null {
  return (remembered.get(key) as Remembered<T> | undefined) ?? null;
}

/** Forgets every remembered answer. Called on sign-out: they were one rider's. */
export function forgetAll(): void {
  remembered.clear();
}

const pending = new Map<string, Set<Promise<boolean>>>();

/**
 * Records work the UI already shows as done, under a scope (an errand id).
 * The work's own failure handling (the rollback) is the caller's; this only
 * lets others wait for it.
 */
export function trackPending(scope: string, work: Promise<unknown>): void {
  const outcome = work.then(
    () => true,
    () => false
  );
  let set = pending.get(scope);
  if (!set) {
    set = new Set();
    pending.set(scope, set);
  }
  set.add(outcome);
  void outcome.then(() => {
    const current = pending.get(scope);
    if (!current) return;
    current.delete(outcome);
    if (current.size === 0) pending.delete(scope);
  });
}

/** Whether `scope` has work still in flight. */
export function hasPending(scope: string): boolean {
  return (pending.get(scope)?.size ?? 0) > 0;
}

/**
 * Resolves once everything tracked under `scope` has finished: true when all
 * of it succeeded (or there was none), false when any of it failed.
 */
export async function whenSettled(scope: string): Promise<boolean> {
  const set = pending.get(scope);
  if (!set || set.size === 0) return true;
  const outcomes = await Promise.all(Array.from(set));
  return outcomes.every(Boolean);
}

/**
 * The optimistic update, in one place: `apply` changes the screen now,
 * `commit` tells the server, and `rollback` undoes `apply` if the server
 * refused or could not be reached. Resolves with the server's answer, or
 * undefined after a rollback; never rejects.
 */
export async function optimistic<T>(
  apply: () => void,
  commit: () => Promise<T>,
  rollback: (error: unknown) => void
): Promise<T | undefined> {
  apply();
  try {
    return await commit();
  } catch (err) {
    rollback(err);
    return undefined;
  }
}

/**
 * Runs `run`, and again after each delay in `delaysMs` while it fails and
 * `shouldRetry` says the failure is worth another go. For requests that are
 * safe to repeat (the server applies them once however often they arrive),
 * sent behind an optimistic update, where nobody is watching to press retry.
 */
export async function retrying<T>(
  run: () => Promise<T>,
  delaysMs: number[],
  shouldRetry: (error: unknown) => boolean,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (err) {
      if (attempt >= delaysMs.length || !shouldRetry(err)) throw err;
      await wait(delaysMs[attempt]);
    }
  }
}

/** Tests only. */
export function __resetRequestCacheForTests(): void {
  inFlight.clear();
  trailing.clear();
  remembered.clear();
  pending.clear();
}
