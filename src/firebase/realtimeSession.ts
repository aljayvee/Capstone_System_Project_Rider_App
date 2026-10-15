import { onAuthStateChanged, signInWithCustomToken, signOut } from 'firebase/auth';
import { auth, isFirebaseAuthConfigured } from './config';
import { apiClient } from '../services/apiClient';

/**
 * The rider app's Firebase identity, derived from the session it already holds.
 *
 * ## What this replaces
 *
 * Nothing. There was no Firebase identity: `getDatabase()` was called and
 * subscribed to as an anonymous client, which is why the Realtime Database
 * rules had to be wide open for the rider pin and dispatcher chat to work at
 * all. When they were tightened, every location write started being refused and
 * `saveRiderLocation` swallowed the rejection, so an entire shift could publish
 * nothing while the rider's own screen showed their position moving normally.
 *
 * ## Not a second sign-in
 *
 * The rider authenticates once, through the existing JWT flow, which is a
 * [LOCKED] contract and is untouched here. `POST /auth/firebase-token` exchanges
 * that proven session for a Firebase-shaped assertion of the same identity, so
 * the security rules can check who is asking. No password is typed twice and
 * there is no second user store.
 *
 * ## Why the session is not persisted
 *
 * `config.ts` pins in-memory persistence, so this Firebase session dies with the
 * process. That is the correct lifetime: the app always restores its own JWT
 * session on launch and can mint a fresh token from it in one round trip. A
 * persisted Firebase credential would be able to outlive the session that
 * justified it, which is the failure mode that made stale RTDB records report
 * long-dead riders as online.
 */

let inFlight: Promise<boolean> | null = null;

export type RealtimeAuthState = 'signed-in' | 'signed-out' | 'unavailable';

let lastState: RealtimeAuthState = 'signed-out';
const listeners = new Set<(state: RealtimeAuthState) => void>();

function publish(state: RealtimeAuthState) {
  lastState = state;
  listeners.forEach((listener) => listener(state));
}

export function onRealtimeAuthChange(listener: (state: RealtimeAuthState) => void): () => void {
  listeners.add(listener);
  listener(lastState);
  return () => {
    listeners.delete(listener);
  };
}

export function realtimeAuthState(): RealtimeAuthState {
  return lastState;
}

/**
 * Ensures this device has a Firebase session, minting one if it does not.
 *
 * Resolves false rather than throwing. Losing real-time must degrade the live
 * map and the chat thread, never break the app: placing and tracking an errand
 * runs over the REST API and is unaffected by anything in this file.
 *
 * Single-flighted, because several screens can ask at once on a cold start and
 * each extra exchange would churn a token for nothing.
 */
export async function ensureRealtimeSession(): Promise<boolean> {
  if (!isFirebaseAuthConfigured) {
    publish('unavailable');
    return false;
  }

  if (auth.currentUser) {
    publish('signed-in');
    return true;
  }

  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await apiClient.post('/auth/firebase-token');
      const token = res.data?.token;
      if (!token) throw new Error('No token in response');

      await signInWithCustomToken(auth, token);
      publish('signed-in');
      return true;
    } catch {
      // Includes the 503 returned when the server has no service account
      // configured. Same handling as any other failure: from here both mean
      // "no real-time identity", and the operator-facing reason is server-side.
      publish('unavailable');
      return false;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Waits for the Firebase session to settle, but never for long.
 *
 * Every Realtime Database subscription in this app has to open AFTER sign-in, not
 * before, and the reason is specific rather than defensive: the SDK's
 * `refreshAuthToken` re-authenticates the connection but does NOT re-send
 * outstanding listens — only a reconnect does, via `restoreState_`. So a listener
 * opened one tick too early is refused and then stays refused for the life of the
 * screen, with no retry and, until this change, no error either.
 *
 * Bounded because it sits on the app's startup path. If the mint is slow the app
 * proceeds without waiting; the session still arrives on its own and the next
 * screen to mount gets it. Blocking a customer out of their errand list because a
 * chat credential was slow would be a worse bug than the one this prevents.
 */
export async function settleRealtimeSession(timeoutMs = 4000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      ensureRealtimeSession(),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Drops the Firebase session, so it cannot outlive the account that owns it. */
export async function endRealtimeSession(): Promise<void> {
  if (!isFirebaseAuthConfigured) return;
  try {
    await signOut(auth);
  } catch {
    // Must never block the app's own sign-out, which has already cleared the
    // session that matters.
  }
  publish('signed-out');
}

// Keeps `lastState` honest when the SDK ends a session on its own.
if (isFirebaseAuthConfigured) {
  onAuthStateChanged(auth, (user) => {
    if (!user && lastState === 'signed-in') publish('signed-out');
  });
}
