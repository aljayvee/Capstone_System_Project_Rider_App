import { useRiderNotifications } from '../context/RiderNotificationContext';

export type { RiderNotification } from '../utils/riderNotifications';

/**
 * The rider's notifications, from the one shared feed
 * (context/RiderNotificationContext). Kept under this name and shape for the
 * bell and its tests; it used to fetch and poll on every mount, so two bells
 * meant two pollers and two lists that could disagree.
 */
export function useNotifications() {
  const { notifications, unreadCount, isLoading, error, markRead, markAllRead, refresh } = useRiderNotifications();
  return { notifications, unreadCount, isLoading, error, markRead, markAllRead, refresh };
}
