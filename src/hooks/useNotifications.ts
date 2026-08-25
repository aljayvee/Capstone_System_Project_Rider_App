import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../services/apiClient';

export interface RiderNotification {
  id: number;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

const POLL_INTERVAL_MS = 30000;

export function useNotifications() {
  const [notifications, setNotifications] = useState<RiderNotification[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get<RiderNotification[]>('/notifications');
      setNotifications(res.data ?? []);
    } catch (err) {
      console.warn('[useNotifications] Failed to load:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const markRead = useCallback(async (id: number) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    try {
      await apiClient.patch(`/notifications/${id}/read`);
    } catch (err) {
      console.warn('[useNotifications] Failed to mark read:', err);
    }
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return { notifications, unreadCount, isLoading, markRead, refresh: load };
}
