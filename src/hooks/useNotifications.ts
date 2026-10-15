import { useCallback, useState } from 'react';
import { apiClient } from '../services/apiClient';
import { optimistic, recall, remember, singleFlight } from '../services/requestCache';
import { fingerprint } from '../services/pollSchedule';
import { useSmartPolling } from './useSmartPolling';

export interface RiderNotification {
  id: number;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

/** While notifications keep arriving. */
const POLL_BASE_MS = 30000;
/** While nothing new arrives: backs off to this, doubling from the base. */
const POLL_MAX_MS = 5 * 60 * 1000;

const CACHE_KEY = 'notifications';

export function useNotifications() {
  // Stale while revalidate: the list last seen this session, at once, while
  // the first poll below asks again. A bell that opens empty and fills a
  // second later reads as "you have no notifications" for that second.
  const [notifications, setNotifications] = useState<RiderNotification[]>(
    () => recall<RiderNotification[]>(CACHE_KEY)?.value ?? []
  );
  // Only true before there is anything to show: a refresh behind a list
  // already on screen is quiet.
  const [isLoading, setIsLoading] = useState(() => recall(CACHE_KEY) === null);

  const load = useCallback(async (): Promise<'changed' | 'unchanged' | 'failed'> => {
    try {
      // One request however many bells are mounted or taps arrive at once.
      const list = await singleFlight(CACHE_KEY, async () => {
        const res = await apiClient.get<RiderNotification[]>('/notifications');
        return res.data ?? [];
      });
      const before = recall<RiderNotification[]>(CACHE_KEY);
      const changed = before === null || fingerprint(before.value) !== fingerprint(list);
      remember(CACHE_KEY, list);
      if (changed) setNotifications(list);
      return changed ? 'changed' : 'unchanged';
    } catch (err) {
      console.warn('[useNotifications] Failed to load:', err);
      return 'failed';
    } finally {
      setIsLoading(false);
    }
  }, []);

  useSmartPolling(load, { baseMs: POLL_BASE_MS, maxMs: POLL_MAX_MS });

  const markRead = useCallback(async (id: number) => {
    const setRead = (isRead: boolean) => {
      const apply = (list: RiderNotification[]) => list.map((n) => (n.id === id ? { ...n, isRead } : n));
      setNotifications(apply);
      remember(CACHE_KEY, apply(recall<RiderNotification[]>(CACHE_KEY)?.value ?? []));
    };
    // Already read: nothing to show and nothing to send.
    if (recall<RiderNotification[]>(CACHE_KEY)?.value.find((n) => n.id === id)?.isRead) return;

    await optimistic(
      () => setRead(true),
      // Keyed per id, so a double tap sends one request.
      () => singleFlight(`notifications/${id}/read`, () => apiClient.patch(`/notifications/${id}/read`)),
      (err) => {
        // The dot comes back: the server still counts it unread, and a dot
        // reappearing on the next poll for no visible reason would be worse.
        console.warn('[useNotifications] Failed to mark read:', err);
        setRead(false);
      }
    );
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  return { notifications, unreadCount, isLoading, markRead, refresh };
}
