import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { nextPollDelay } from '../services/pollSchedule';

export interface SmartPollingOptions {
  /** The rate while answers keep changing, in ms. */
  baseMs: number;
  /** The slowest it backs off to while nothing changes, in ms. */
  maxMs: number;
  /** False stops polling altogether (no rider signed in, say). */
  enabled?: boolean;
}

/**
 * Polls only as often as there is reason to.
 *
 * - Not at all while the app is in the background: nobody is looking, and a
 *   fixed timer there spent the rider's battery and data on answers nobody
 *   read. Coming back to the app asks at once, at the base rate.
 * - Not at all while the phone has no connection; asks at once when it
 *   returns.
 * - Slower and slower while the answer stays the same (doubling, up to
 *   `maxMs`), and back to `baseMs` the moment it changes.
 *
 * `poll` reports what happened: 'changed', 'unchanged' or 'failed'. It is read
 * through a ref, so it may be a fresh closure on every render.
 */
export function useSmartPolling(
  poll: () => Promise<'changed' | 'unchanged' | 'failed'>,
  { baseMs, maxMs, enabled = true }: SmartPollingOptions
): void {
  const pollRef = useRef(poll);
  pollRef.current = poll;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let delay = baseMs;
    let running = false;
    let disposed = false;
    let foreground = AppState.currentState !== 'background';
    let online = true;

    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const schedule = () => {
      clear();
      if (disposed || !foreground || !online) return;
      timer = setTimeout(tick, delay);
    };

    const tick = async () => {
      timer = null;
      if (running || disposed || !foreground || !online) return;
      running = true;
      let outcome: 'changed' | 'unchanged' | 'failed' = 'failed';
      try {
        outcome = await pollRef.current();
      } catch {
        outcome = 'failed';
      } finally {
        running = false;
      }
      delay = nextPollDelay(delay, outcome, baseMs, maxMs);
      schedule();
    };

    // Back on screen, or back online: whatever was missed is asked for now.
    const resume = () => {
      delay = baseMs;
      clear();
      void tick();
    };

    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        const wasAway = !foreground;
        foreground = true;
        if (wasAway) resume();
      } else if (state === 'background') {
        foreground = false;
        clear();
      }
    });

    const netUnsub = NetInfo.addEventListener((state) => {
      const nowOnline = state.isConnected !== false;
      const wasOffline = !online;
      online = nowOnline;
      if (!online) clear();
      else if (wasOffline) resume();
    });

    void tick();

    return () => {
      disposed = true;
      clear();
      appSub.remove();
      netUnsub();
    };
  }, [baseMs, maxMs, enabled]);
}
