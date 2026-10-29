import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../services/apiClient';
import { optimistic, recall, remember, singleFlight } from '../services/requestCache';
import { fingerprint } from '../services/pollSchedule';
import { notificationArrived } from '../services/notificationEvents';
import { useSmartPolling } from '../hooks/useSmartPolling';
import type { RiderNotification } from '../utils/riderNotifications';

/** While notifications keep arriving. */
const POLL_BASE_MS = 30000;
/** While nothing new arrives: backs off to this, doubling from the base. */
const POLL_MAX_MS = 5 * 60 * 1000;

const CACHE_KEY = 'notifications';

export interface RiderNotificationContextValue {
  notifications: RiderNotification[];
  /** Derived from the list, so a repeated or bumped event can never inflate it. */
  unreadCount: number;
  /** Only true before there is anything to show. */
  isLoading: boolean;
  /** The last load failed; the list shown is the last good one. */
  error: boolean;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  refresh: () => Promise<void>;
}

const RiderNotificationContext = createContext<RiderNotificationContextValue | null>(null);

/**
 * One notification feed for the signed-in rider: the bell's badge and the
 * Notifications screen read the same list. Polled as a safety net; the mission
 * socket's `notification:new` adds a row the moment it is saved.
 */
export function RiderNotificationProvider({ children }: { children: React.ReactNode }) {
  // Stale while revalidate: the list last seen this session, at once, while
  // the first poll asks again.
  const [notifications, setNotifications] = useState<RiderNotification[]>(
    () => recall<RiderNotification[]>(CACHE_KEY)?.value ?? []
  );
  const [isLoading, setIsLoading] = useState(() => recall(CACHE_KEY) === null);
  const [error, setError] = useState(false);

  const store = useCallback((next: RiderNotification[]) => {
    remember(CACHE_KEY, next);
    setNotifications(next);
  }, []);

  const load = useCallback(async (): Promise<'changed' | 'unchanged' | 'failed'> => {
    try {
      // One request however many screens ask at once.
      const list = await singleFlight(CACHE_KEY, async () => {
        const res = await apiClient.get<RiderNotification[]>('/notifications');
        return Array.isArray(res.data) ? res.data : [];
      });
      const before = recall<RiderNotification[]>(CACHE_KEY);
      const changed = before === null || fingerprint(before.value) !== fingerprint(list);
      remember(CACHE_KEY, list);
      if (changed) setNotifications(list);
      setError(false);
      return changed ? 'changed' : 'unchanged';
    } catch (err) {
      console.warn('[RiderNotifications] Failed to load:', err);
      setError(true);
      return 'failed';
    } finally {
      setIsLoading(false);
    }
  }, []);

  useSmartPolling(load, { baseMs: POLL_BASE_MS, maxMs: POLL_MAX_MS });

  // A saved notification arriving live. A known id (a chat row bumped with its
  // newest line) replaces its row and moves to the top: still one row.
  useEffect(
    () =>
      notificationArrived.subscribe((payload) => {
        const id = Number(payload.id);
        if (!Number.isFinite(id) || id <= 0) return;
        const row = { ...(payload as unknown as RiderNotification), id, isRead: Boolean(payload.isRead) };
        const current = recall<RiderNotification[]>(CACHE_KEY)?.value ?? [];
        store([row, ...current.filter((n) => n.id !== id)]);
      }),
    [store]
  );

  const markRead = useCallback(
    async (id: number) => {
      const setRead = (isRead: boolean) => {
        const current = recall<RiderNotification[]>(CACHE_KEY)?.value ?? [];
        store(current.map((n) => (n.id === id ? { ...n, isRead, actionNeeded: isRead ? false : n.actionNeeded } : n)));
      };
      if (recall<RiderNotification[]>(CACHE_KEY)?.value.find((n) => n.id === id)?.isRead) return;
      await optimistic(
        () => setRead(true),
        // Keyed per id, so a double tap sends one request.
        () => singleFlight(`notifications/${id}/read`, () => apiClient.patch(`/notifications/${id}/read`)),
        (err) => {
          console.warn('[RiderNotifications] Failed to mark read:', err);
          setRead(false);
        }
      );
    },
    [store]
  );

  const markAllRead = useCallback(async () => {
    const before = recall<RiderNotification[]>(CACHE_KEY)?.value ?? [];
    if (!before.some((n) => !n.isRead)) return;
    await optimistic(
      () => store(before.map((n) => ({ ...n, isRead: true, actionNeeded: false }))),
      () => singleFlight('notifications/read-all', () => apiClient.patch('/notifications/read-all')),
      (err) => {
        console.warn('[RiderNotifications] Failed to mark all read:', err);
        store(before);
      }
    );
  }, [store]);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications]);

  const value = useMemo(
    () => ({ notifications, unreadCount, isLoading, error, markRead, markAllRead, refresh }),
    [notifications, unreadCount, isLoading, error, markRead, markAllRead, refresh]
  );

  return <RiderNotificationContext.Provider value={value}>{children}</RiderNotificationContext.Provider>;
}

export function useRiderNotifications(): RiderNotificationContextValue {
  const context = useContext(RiderNotificationContext);
  if (!context) {
    throw new Error('useRiderNotifications must be used within a RiderNotificationProvider');
  }
  return context;
}
