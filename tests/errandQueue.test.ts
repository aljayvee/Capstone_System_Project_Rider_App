import { describe, expect, it } from 'vitest';
import {
  acceptanceTime,
  canSwitchWorkingErrand,
  orderErrandQueue,
  queuePositionLabel,
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
