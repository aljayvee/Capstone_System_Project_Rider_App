/**
 * What a rider notification is about, whether it waits on the rider, where a
 * tap takes them, and how the list is filtered and sorted (2026-10-22).
 *
 * The server sends `topic`, `actionNeeded`, `errandId` and `dispatcherId` on
 * every rider row (C:\Capstone_Server\server\src\services\notificationCatalog.ts,
 * RIDER_NOTIFICATIONS). The table here covers rows written before that. Keep
 * the two in step.
 */

export type RiderTopic = 'OFFER' | 'ERRAND' | 'PAYMENT' | 'CHAT';

export interface RiderNotification {
  id: number;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  topic?: RiderTopic;
  actionNeeded?: boolean;
  errandId?: string;
  dispatcherId?: number;
  refKey?: string | null;
}

const TABLE: Record<string, { topic: RiderTopic; actionNeeded: boolean }> = {
  ERRAND_ASSIGNED: { topic: 'OFFER', actionNeeded: true },
  OFFER_EXPIRED: { topic: 'OFFER', actionNeeded: false },
  RIDER_ERRAND_CANCELLED: { topic: 'ERRAND', actionNeeded: true },
  ITEMS_CONFIRMED: { topic: 'ERRAND', actionNeeded: true },
  ITEMS_UPDATED: { topic: 'ERRAND', actionNeeded: true },
  SUBSTITUTE_ANSWERED: { topic: 'ERRAND', actionNeeded: true },
  DELIVERY_HELD_RIDER: { topic: 'ERRAND', actionNeeded: false },
  RIDER_PAYMENT_CONFIRMED: { topic: 'PAYMENT', actionNeeded: false },
  RIDER_EXTRA_CHARGE_SETTLED: { topic: 'PAYMENT', actionNeeded: true },
  DISPATCHER_CHAT: { topic: 'CHAT', actionNeeded: true },
};

const TOPICS: RiderTopic[] = ['OFFER', 'ERRAND', 'PAYMENT', 'CHAT'];

export const TOPIC_LABEL: Record<RiderTopic, string> = {
  OFFER: 'Offer',
  ERRAND: 'Errand',
  PAYMENT: 'Payment',
  CHAT: 'Chat',
};

export function topicOf(n: Pick<RiderNotification, 'type' | 'topic'>): RiderTopic {
  if (n.topic && TOPICS.includes(n.topic)) return n.topic;
  const type = String(n.type || '').toUpperCase();
  if (TABLE[type]) return TABLE[type].topic;
  if (type.includes('CHAT') || type.includes('MESSAGE')) return 'CHAT';
  if (type.includes('PAYMENT') || type.includes('CHARGE')) return 'PAYMENT';
  if (type.includes('OFFER') || type.includes('ASSIGNED')) return 'OFFER';
  return 'ERRAND';
}

/** Waits on the rider, and only while unread. */
export function actionNeeded(n: Pick<RiderNotification, 'type' | 'actionNeeded' | 'isRead'>): boolean {
  if (n.isRead) return false;
  if (typeof n.actionNeeded === 'boolean') return n.actionNeeded;
  return TABLE[String(n.type || '').toUpperCase()]?.actionNeeded ?? false;
}

export function errandIdOf(n: Pick<RiderNotification, 'errandId' | 'refKey'>): string | null {
  if (n.errandId) return String(n.errandId);
  const ref = n.refKey ?? '';
  return ref.startsWith('errand:') && ref.length > 7 ? ref.slice(7) : null;
}

// ── Where a tap goes ────────────────────────────────────────────────────────

export type RiderNotificationRoute =
  | { kind: 'home' }
  | { kind: 'task'; errandId: string }
  | { kind: 'details'; errandId: string }
  | { kind: 'chat' }
  | { kind: 'none' };

/**
 * One router for a row in the list and a tapped push, so the two agree.
 * - Chat: the dispatcher chat.
 * - A live offer: Home, where the offer card is. An expired one: nowhere.
 * - Anything about an errand: the task screen when it is one the rider has in
 *   hand, else its details.
 */
export function routeForRiderNotification(
  n: Pick<RiderNotification, 'type' | 'topic' | 'errandId' | 'refKey'>,
  activeErrandIds: string[] = []
): RiderNotificationRoute {
  const topic = topicOf(n);
  if (topic === 'CHAT') return { kind: 'chat' };
  const type = String(n.type || '').toUpperCase();
  if (type === 'OFFER_EXPIRED') return { kind: 'none' };
  if (topic === 'OFFER') return { kind: 'home' };
  const errandId = errandIdOf(n);
  if (!errandId) return { kind: 'none' };
  if (activeErrandIds.includes(errandId)) return { kind: 'task', errandId };
  return { kind: 'details', errandId };
}

// ── Filter and sort ─────────────────────────────────────────────────────────

/** 'ALL' is "no chip selected": there is no All chip (as in the customer app). */
export type RiderNotificationFilter = 'ALL' | 'ACTION' | RiderTopic;

export function matchesFilter(n: RiderNotification, filter: RiderNotificationFilter): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'ACTION') return actionNeeded(n);
  return topicOf(n) === filter;
}

export type RiderNotificationSort = 'NEWEST' | 'OLDEST' | 'ACTION' | 'UNREAD';

export type DayBucket = 'Today' | 'Yesterday' | 'Earlier';

export function dayBucket(iso: string, now: Date = new Date()): DayBucket {
  const time = new Date(iso).getTime();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (time >= startOfToday) return 'Today';
  if (time >= startOfToday - 24 * 60 * 60 * 1000) return 'Yesterday';
  return 'Earlier';
}

const byNewest = (a: RiderNotification, b: RiderNotification) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

/** The list as sections in the chosen order: days for date sorts, waiting first otherwise. */
export function sectionsFor(list: RiderNotification[], sort: RiderNotificationSort, now: Date = new Date()) {
  if (sort === 'ACTION' || sort === 'UNREAD') {
    const first = sort === 'ACTION' ? actionNeeded : (n: RiderNotification) => !n.isRead;
    const sorted = [...list].sort(byNewest);
    return [
      { title: sort === 'ACTION' ? 'Action needed' : 'Unread', data: sorted.filter(first) },
      { title: sort === 'ACTION' ? 'Everything else' : 'Read', data: sorted.filter((n) => !first(n)) },
    ].filter((section) => section.data.length > 0);
  }
  const oldest = sort === 'OLDEST';
  const sorted = [...list].sort((a, b) => (oldest ? -byNewest(a, b) : byNewest(a, b)));
  const days: DayBucket[] = oldest ? ['Earlier', 'Yesterday', 'Today'] : ['Today', 'Yesterday', 'Earlier'];
  return days
    .map((title) => ({ title, data: sorted.filter((n) => dayBucket(n.createdAt, now) === title) }))
    .filter((section) => section.data.length > 0);
}

export function formatNotificationTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const bucket = dayBucket(iso, now);
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (bucket === 'Today') {
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
  }
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (bucket !== 'Earlier') return time;
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
}
