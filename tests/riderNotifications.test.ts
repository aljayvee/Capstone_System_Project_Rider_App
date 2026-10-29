import { describe, expect, it, vi } from 'vitest';
import {
  actionNeeded,
  dayBucket,
  errandIdOf,
  matchesFilter,
  routeForRiderNotification,
  sectionsFor,
  topicOf,
  type RiderNotification,
} from '../src/utils/riderNotifications';
import { notificationArrived, notificationTapped } from '../src/services/notificationEvents';

const now = new Date('2026-10-22T04:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();
const row = (over: Partial<RiderNotification>): RiderNotification => ({
  id: 1,
  type: 'ERRAND_ASSIGNED',
  title: 't',
  body: 'b',
  isRead: false,
  createdAt: hoursAgo(0.5),
  ...over,
});

describe('topics and action needed', () => {
  it('trusts the server topic, else derives it from the type', () => {
    expect(topicOf({ type: 'X', topic: 'PAYMENT' })).toBe('PAYMENT');
    expect(topicOf({ type: 'ITEMS_UPDATED' })).toBe('ERRAND');
    expect(topicOf({ type: 'DISPATCHER_CHAT' })).toBe('CHAT');
    expect(topicOf({ type: 'ERRAND_ASSIGNED' })).toBe('OFFER');
  });

  it('needs the rider only while unread', () => {
    expect(actionNeeded({ type: 'ITEMS_CONFIRMED', isRead: false })).toBe(true);
    expect(actionNeeded({ type: 'ITEMS_CONFIRMED', isRead: true })).toBe(false);
    expect(actionNeeded({ type: 'RIDER_PAYMENT_CONFIRMED', isRead: false })).toBe(false);
  });

  it('reads the errand from errandId or refKey', () => {
    expect(errandIdOf({ errandId: 'e-1' })).toBe('e-1');
    expect(errandIdOf({ refKey: 'errand:e-2' })).toBe('e-2');
    expect(errandIdOf({ refKey: 'dispatcher:7' })).toBeNull();
  });
});

describe('routeForRiderNotification', () => {
  it('opens the chat for a dispatcher message', () => {
    expect(routeForRiderNotification({ type: 'DISPATCHER_CHAT' })).toEqual({ kind: 'chat' });
  });

  it('opens Home for a live offer, nothing for an expired one', () => {
    expect(routeForRiderNotification({ type: 'ERRAND_ASSIGNED', errandId: 'e-1' })).toEqual({ kind: 'home' });
    expect(routeForRiderNotification({ type: 'OFFER_EXPIRED', errandId: 'e-1' })).toEqual({ kind: 'none' });
  });

  it('opens the task screen for an errand in hand, its details otherwise', () => {
    expect(routeForRiderNotification({ type: 'ITEMS_UPDATED', errandId: 'e-1' }, ['e-1'])).toEqual({ kind: 'task', errandId: 'e-1' });
    expect(routeForRiderNotification({ type: 'RIDER_ERRAND_CANCELLED', errandId: 'e-9' }, ['e-1'])).toEqual({
      kind: 'details',
      errandId: 'e-9',
    });
  });

  it('goes nowhere for an errand row with no errand', () => {
    expect(routeForRiderNotification({ type: 'ITEMS_UPDATED' })).toEqual({ kind: 'none' });
  });
});

describe('filter and sort', () => {
  const list = [
    row({ id: 1, type: 'ERRAND_ASSIGNED', createdAt: hoursAgo(0.5) }),
    row({ id: 2, type: 'RIDER_PAYMENT_CONFIRMED', createdAt: hoursAgo(1) }),
    row({ id: 3, type: 'ITEMS_UPDATED', isRead: true, createdAt: hoursAgo(40) }),
  ];

  it('filters by topic and by action needed', () => {
    expect(list.filter((n) => matchesFilter(n, 'ACTION')).map((n) => n.id)).toEqual([1]);
    expect(list.filter((n) => matchesFilter(n, 'PAYMENT')).map((n) => n.id)).toEqual([2]);
    expect(list.filter((n) => matchesFilter(n, 'ALL'))).toHaveLength(3);
  });

  it('groups by day, newest or oldest first', () => {
    expect(sectionsFor(list, 'NEWEST', now).map((s) => s.title)).toEqual(['Today', 'Earlier']);
    const oldest = sectionsFor(list, 'OLDEST', now);
    expect(oldest[0].title).toBe('Earlier');
    expect(oldest[1].data.map((n) => n.id)).toEqual([2, 1]);
  });

  it('puts what needs the rider, or what is unread, first', () => {
    expect(sectionsFor(list, 'ACTION', now).map((s) => [s.title, s.data.map((n) => n.id)])).toEqual([
      ['Action needed', [1]],
      ['Everything else', [2, 3]],
    ]);
    expect(sectionsFor(list, 'UNREAD', now).map((s) => s.title)).toEqual(['Unread', 'Read']);
  });

  it('buckets yesterday', () => {
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12).toISOString();
    expect(dayBucket(yesterday, now)).toBe('Yesterday');
  });
});

describe('notification events', () => {
  it('delivers to every subscriber until it unsubscribes', () => {
    const seen = vi.fn();
    const stop = notificationArrived.subscribe(seen);
    notificationArrived.emit({ id: 1 });
    stop();
    notificationArrived.emit({ id: 2 });
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('keeps going when one listener throws', () => {
    const after = vi.fn();
    const stopBad = notificationTapped.subscribe(() => {
      throw new Error('boom');
    });
    const stopGood = notificationTapped.subscribe(after);
    notificationTapped.emit({ type: 'DISPATCHER_CHAT' });
    expect(after).toHaveBeenCalled();
    stopBad();
    stopGood();
  });
});
