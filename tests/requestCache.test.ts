import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetRequestCacheForTests,
  forgetAll,
  freshFlight,
  hasPending,
  inFlightCount,
  optimistic,
  recall,
  remember,
  retrying,
  singleFlight,
  trackPending,
  whenSettled,
} from '../src/services/requestCache';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  __resetRequestCacheForTests();
});

describe('request deduplication', () => {
  it('sends one request for identical calls in flight together', async () => {
    const answer = deferred<string>();
    const run = vi.fn(() => answer.promise);

    const a = singleFlight('GET /errands/rider/7', run);
    const b = singleFlight('GET /errands/rider/7', run);
    const c = singleFlight('GET /errands/rider/7', run);
    answer.resolve('waybill');

    await expect(Promise.all([a, b, c])).resolves.toEqual(['waybill', 'waybill', 'waybill']);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('keeps calls with different keys apart', async () => {
    const run = vi.fn(async () => 'ok');
    await Promise.all([singleFlight('a', run), singleFlight('b', run)]);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('asks again once the first call has finished', async () => {
    const run = vi.fn(async () => 'ok');
    await singleFlight('a', run);
    await singleFlight('a', run);
    expect(run).toHaveBeenCalledTimes(2);
    expect(inFlightCount()).toBe(0);
  });

  it('shares a failure with every caller, then lets the next call try again', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('ok');
    const a = singleFlight('a', run);
    const b = singleFlight('a', run);
    await expect(a).rejects.toThrow('offline');
    await expect(b).rejects.toThrow('offline');
    await expect(singleFlight('a', run)).resolves.toBe('ok');
  });

  it('turns a call that throws before it starts into a rejection', async () => {
    await expect(
      singleFlight('a', () => {
        throw new Error('bad input');
      })
    ).rejects.toThrow('bad input');
    expect(inFlightCount()).toBe(0);
  });
});

describe('deduplicating reads that something made stale', () => {
  it('answers a call made mid-flight with a request that starts after it', async () => {
    // The waybill fetch is out; a socket event says the errand changed. The
    // answer to the event must not be the fetch that left before it.
    const first = deferred<string>();
    const second = deferred<string>();
    const run = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const before = freshFlight('GET /errands/rider/7', run);
    const afterEvent = freshFlight('GET /errands/rider/7', run);
    expect(run).toHaveBeenCalledTimes(1);

    first.resolve('old');
    await expect(before).resolves.toBe('old');
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));

    second.resolve('new');
    await expect(afterEvent).resolves.toBe('new');
  });

  it('collapses a burst of events into one follow-up request', async () => {
    const first = deferred<string>();
    const run = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue('new');

    void freshFlight('k', run);
    const burst = [freshFlight('k', run), freshFlight('k', run), freshFlight('k', run)];
    first.resolve('old');

    await expect(Promise.all(burst)).resolves.toEqual(['new', 'new', 'new']);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('still follows up when the request in flight failed', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('new');
    const failed = freshFlight('k', run);
    const followUp = freshFlight('k', run);
    await expect(failed).rejects.toThrow('offline');
    await expect(followUp).resolves.toBe('new');
  });

  it('is a plain request when nothing is in flight', async () => {
    const run = vi.fn(async () => 'ok');
    await expect(freshFlight('k', run)).resolves.toBe('ok');
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('stale while revalidate', () => {
  it('remembers the last answer, and when', () => {
    expect(recall('notifications')).toBeNull();
    remember('notifications', [1, 2], 1000);
    expect(recall('notifications')).toEqual({ value: [1, 2], at: 1000 });
  });

  it('forgets everything at sign-out', () => {
    remember('notifications', [1]);
    forgetAll();
    expect(recall('notifications')).toBeNull();
  });
});

describe('optimistic updates', () => {
  it('shows the change first and keeps it when the server agrees', async () => {
    const order: string[] = [];
    const result = await optimistic(
      () => order.push('apply'),
      async () => {
        order.push('commit');
        return 'saved';
      },
      () => order.push('rollback')
    );
    expect(result).toBe('saved');
    expect(order).toEqual(['apply', 'commit']);
  });

  it('undoes the change when the server refuses, without throwing', async () => {
    const rollback = vi.fn();
    const refused = new Error('403');
    await expect(
      optimistic(
        () => {},
        () => Promise.reject(refused),
        rollback
      )
    ).resolves.toBeUndefined();
    expect(rollback).toHaveBeenCalledWith(refused);
  });
});

describe('work shown as done before it is', () => {
  it('lets the next step wait for an upload still going', async () => {
    const upload = deferred<void>();
    trackPending('ERR-1', upload.promise);
    expect(hasPending('ERR-1')).toBe(true);

    let settled: boolean | null = null;
    const waiting = whenSettled('ERR-1').then((ok) => (settled = ok));
    await Promise.resolve();
    expect(settled).toBeNull();

    upload.resolve();
    await waiting;
    expect(settled).toBe(true);
    expect(hasPending('ERR-1')).toBe(false);
  });

  it('reports a failed upload, so what rested on it is not sent', async () => {
    const upload = deferred<void>();
    trackPending('ERR-1', upload.promise);
    upload.reject(new Error('410'));
    await expect(whenSettled('ERR-1')).resolves.toBe(false);
  });

  it('has nothing to wait for on an errand with no uploads', async () => {
    await expect(whenSettled('ERR-2')).resolves.toBe(true);
  });

  it('keeps errands apart', async () => {
    trackPending('ERR-1', new Promise(() => {}));
    await expect(whenSettled('ERR-2')).resolves.toBe(true);
  });
});

describe('retrying a save nobody is watching', () => {
  const noWait = () => Promise.resolve();

  it('tries again after a dropped line, and succeeds', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ id: 9 });
    await expect(retrying(run, [10, 20], () => true, noWait)).resolves.toEqual({ id: 9 });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('gives up after the last wait', async () => {
    const run = vi.fn().mockRejectedValue(new Error('timeout'));
    await expect(retrying(run, [10, 20], () => true, noWait)).rejects.toThrow('timeout');
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('does not try again a failure that cannot change', async () => {
    const run = vi.fn().mockRejectedValue(new Error('gone'));
    await expect(retrying(run, [10, 20], () => false, noWait)).rejects.toThrow('gone');
    expect(run).toHaveBeenCalledTimes(1);
  });
});
