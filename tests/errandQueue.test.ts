import { describe, expect, it } from 'vitest';
import {
  acceptanceTime,
  applyDeliveryHolds,
  canSwitchWorkingErrand,
  deliveryHolds,
  orderErrandQueue,
  queuePositionLabel,
  sameDropOff,
} from '../src/services/errandQueue';

/**
 * The order a rider runs the errands they hold. The bug: the server lists a
 * rider's errands newest first, the app worked index 0, so accepting a second
 * errand mid-run made the NEW one the errand in hand and shelved the one being
 * shopped for.
 */

const errand = (id: string, createdAt: string, acceptedAt?: string | null, assignedAt?: string | null) => ({
  id,
  createdAt,
  acceptedAt: acceptedAt ?? null,
  assignedAt: assignedAt ?? null,
});

describe('orderErrandQueue', () => {
  it('runs the first accepted first, whatever order the server sends', () => {
    // As GET /errands/rider/:id sends them: createdAt desc.
    const fromServer = [
      errand('second', '2026-10-01T02:00:00Z', '2026-10-01T02:05:00Z'),
      errand('first', '2026-10-01T01:00:00Z', '2026-10-01T01:10:00Z'),
    ];
    expect(orderErrandQueue(fromServer, null).map((e) => e.id)).toEqual(['first', 'second']);
  });

  it('orders by acceptance, not creation: an older errand accepted later waits', () => {
    const list = [
      errand('created-early-accepted-late', '2026-10-01T00:00:00Z', '2026-10-01T03:00:00Z'),
      errand('created-late-accepted-early', '2026-10-01T01:00:00Z', '2026-10-01T01:30:00Z'),
    ];
    expect(orderErrandQueue(list, null)[0].id).toBe('created-late-accepted-early');
  });

  it('falls back to when it was offered, then created', () => {
    const list = [
      errand('b', '2026-10-01T00:00:00Z', null, '2026-10-01T02:00:00Z'),
      errand('a', '2026-10-01T01:00:00Z', null, '2026-10-01T01:00:00Z'),
      errand('c', '2026-10-01T00:30:00Z'),
    ];
    expect(orderErrandQueue(list, null).map((e) => e.id)).toEqual(['c', 'a', 'b']);
  });

  it('puts the errand the rider chose to start first at the front, keeping the rest in order', () => {
    const list = [
      errand('one', '2026-10-01T01:00:00Z', '2026-10-01T01:00:00Z'),
      errand('two', '2026-10-01T02:00:00Z', '2026-10-01T02:00:00Z'),
      errand('three', '2026-10-01T03:00:00Z', '2026-10-01T03:00:00Z'),
    ];
    expect(orderErrandQueue(list, 'three').map((e) => e.id)).toEqual(['three', 'one', 'two']);
  });

  it('ignores a chosen errand that is no longer in hand', () => {
    const list = [errand('one', '2026-10-01T01:00:00Z'), errand('two', '2026-10-01T02:00:00Z')];
    expect(orderErrandQueue(list, 'delivered-yesterday').map((e) => e.id)).toEqual(['one', 'two']);
  });

  it('is stable between two fetches of the same data', () => {
    const same = '2026-10-01T01:00:00Z';
    const a = [errand('y', same, same), errand('x', same, same)];
    const b = [errand('x', same, same), errand('y', same, same)];
    expect(orderErrandQueue(a, null).map((e) => e.id)).toEqual(orderErrandQueue(b, null).map((e) => e.id));
  });

  it('never lets an undated errand jump the queue', () => {
    const list = [errand('undated', ''), errand('dated', '2026-10-01T01:00:00Z')];
    expect(acceptanceTime(list[0])).toBe(Number.POSITIVE_INFINITY);
    expect(orderErrandQueue(list, null)[0].id).toBe('dated');
  });

  it('does not mutate what it was given', () => {
    const list = [errand('b', '2026-10-01T02:00:00Z'), errand('a', '2026-10-01T01:00:00Z')];
    orderErrandQueue(list, null);
    expect(list.map((e) => e.id)).toEqual(['b', 'a']);
  });
});

describe('canSwitchWorkingErrand', () => {
  it('allows setting an errand aside only while it is still being shopped for', () => {
    expect(canSwitchWorkingErrand('Traveling')).toBe(true);
    expect(canSwitchWorkingErrand('At Store')).toBe(true);
    // Carrying someone's goods: their door comes next.
    expect(canSwitchWorkingErrand('Delivering')).toBe(false);
    expect(canSwitchWorkingErrand('Delivered')).toBe(false);
  });
});

describe('queuePositionLabel', () => {
  it('reads the way a rider says it', () => {
    expect(queuePositionLabel(0)).toBe('Now');
    expect(queuePositionLabel(1)).toBe('2nd');
    expect(queuePositionLabel(2)).toBe('3rd');
    expect(queuePositionLabel(3)).toBe('4th');
    expect(queuePositionLabel(10)).toBe('11th');
    expect(queuePositionLabel(11)).toBe('12th');
  });
});

describe('delivery holds: one trip to the same door', () => {
  // A rider on the way with Ana's order (A) accepts Ana's second order (B).
  const at = (id: string, acceptedAt: string, overrides: Record<string, unknown> = {}) => ({
    ...errand(id, '2026-10-20T07:00:00Z', acceptedAt),
    customerId: 42,
    address: 'Purok 5, Tacurong',
    deliveryLatitude: 6.6915,
    deliveryLongitude: 124.6772,
    ...overrides,
  });
  const A = at('A', '2026-10-20T08:00:00Z');
  const B = at('B', '2026-10-20T08:35:00Z');
  const bought = (ids: string[]) => (e: { id: string }) => ids.includes(e.id);

  it("holds the bought order for the same customer's order still being shopped", () => {
    const holds = deliveryHolds([A, B], bought(['A']));
    expect(holds.get('A')?.id).toBe('B');
    expect(holds.has('B')).toBe(false);
  });

  it('puts the order being shopped in front, so the rider shops it next', () => {
    const holds = deliveryHolds([A, B], bought(['A']));
    expect(applyDeliveryHolds([A, B], holds).map((e) => e.id)).toEqual(['B', 'A']);
  });

  it('moves nothing else: another customer queued behind keeps its place', () => {
    const C = at('C', '2026-10-20T08:20:00Z', { customerId: 77, address: 'Elsewhere', deliveryLatitude: 6.7 });
    const holds = deliveryHolds([A, C, B], bought(['A']));
    expect(applyDeliveryHolds([A, C, B], holds).map((e) => e.id)).toEqual(['B', 'A', 'C']);
  });

  it('lets go once both are bought, back to first accepted, first delivered', () => {
    const holds = deliveryHolds([A, B], bought(['A', 'B']));
    expect(holds.size).toBe(0);
    expect(applyDeliveryHolds([A, B], holds).map((e) => e.id)).toEqual(['A', 'B']);
  });

  it('does not hold for a different customer', () => {
    expect(deliveryHolds([A, { ...B, customerId: 43 }], bought(['A'])).size).toBe(0);
  });

  it('does not hold for the same customer at a different door', () => {
    expect(deliveryHolds([A, { ...B, deliveryLatitude: 6.7015 }], bought(['A'])).size).toBe(0);
  });

  it('never guesses for an errand with no known customer', () => {
    expect(deliveryHolds([{ ...A, customerId: null }, { ...B, customerId: null }], bought(['A'])).size).toBe(0);
  });

  it('holds every bought order of that customer for the first one still being shopped', () => {
    const A2 = at('A2', '2026-10-20T08:10:00Z');
    const holds = deliveryHolds([A, A2, B], bought(['A', 'A2']));
    expect(holds.get('A')?.id).toBe('B');
    expect(holds.get('A2')?.id).toBe('B');
    expect(applyDeliveryHolds([A, A2, B], holds).map((e) => e.id)).toEqual(['B', 'A', 'A2']);
  });

  it('treats a missing pin as the same door only for the same written address', () => {
    const unpinned = { ...B, deliveryLatitude: null, deliveryLongitude: null };
    expect(sameDropOff(A, { ...unpinned, address: ' purok 5, TACURONG ' })).toBe(true);
    expect(sameDropOff(A, { ...unpinned, address: 'Purok 6, Tacurong' })).toBe(false);
  });
});
