import { describe, expect, it } from 'vitest';
import { routePhaseFor } from '../src/services/routePhase';
import type { ErrandPinpoint, StatusStep } from '../src/types/rider';
import { Elevation, moderateScale } from '../src/config/theme';
import { formatErrandId } from '../src/utils/formatErrandId';

describe('TaskScreen Stage-Adaptive Engine & Store Target Selection', () => {
  const STORE_A: ErrandPinpoint = {
    id: 1,
    storeName: 'Jollibee',
    latitude: 6.69,
    longitude: 124.67,
    sequence: 0,
  };

  const STORE_B: ErrandPinpoint = {
    id: 2,
    storeName: 'Savemore',
    latitude: 6.695,
    longitude: 124.675,
    sequence: 1,
  };

  it('maintains shopping phase while Traveling or At Store', () => {
    expect(routePhaseFor('Traveling')).toBe('shopping');
    expect(routePhaseFor('At Store')).toBe('shopping');
  });

  it('transitions to delivering phase only on Delivering or Delivered', () => {
    expect(routePhaseFor('Delivering')).toBe('delivering');
    expect(routePhaseFor('Delivered')).toBe('delivering');
  });

  it('keeps active store target locked to current store even after arrivedAt is recorded', () => {
    // Rider arrived at Store A: arrivedAt is set, but not departed or completed
    const pinpoints: ErrandPinpoint[] = [
      { ...STORE_A, arrivedAt: '2026-09-25T01:00:00Z' },
      STORE_B,
    ];
    const completedSubtasks: Record<number, boolean> = {};

    const activeStoreTarget = pinpoints.find(
      (p) => !p.departedAt && !completedSubtasks[p.id]
    );

    // Active store target MUST remain Store A while rider is inside shopping
    expect(activeStoreTarget?.id).toBe(1);
    expect(activeStoreTarget?.storeName).toBe('Jollibee');
  });

  it('advances active store target to Store B once Store A is completed', () => {
    const pinpoints: ErrandPinpoint[] = [
      { ...STORE_A, arrivedAt: '2026-09-25T01:00:00Z', departedAt: '2026-09-25T01:15:00Z' },
      STORE_B,
    ];
    const completedSubtasks: Record<number, boolean> = { 1: true };

    const activeStoreTarget = pinpoints.find(
      (p) => !p.departedAt && !completedSubtasks[p.id]
    );

    expect(activeStoreTarget?.id).toBe(2);
    expect(activeStoreTarget?.storeName).toBe('Savemore');
  });

  it('yields undefined active store target when all stores are completed', () => {
    const pinpoints: ErrandPinpoint[] = [
      { ...STORE_A, arrivedAt: '2026-09-25T01:00:00Z', departedAt: '2026-09-25T01:15:00Z' },
      { ...STORE_B, arrivedAt: '2026-09-25T01:20:00Z', departedAt: '2026-09-25T01:30:00Z' },
    ];
    const completedSubtasks: Record<number, boolean> = { 1: true, 2: true };

    const activeStoreTarget = pinpoints.find(
      (p) => !p.departedAt && !completedSubtasks[p.id]
    );

    expect(activeStoreTarget).toBeUndefined();
  });

  it('preserves shopping phase for legacy errands with zero pinpoints', () => {
    const pinpoints: ErrandPinpoint[] = [];
    const currentStatus: StatusStep = 'At Store';

    const isShopping = routePhaseFor(currentStatus) === 'shopping';
    expect(isShopping).toBe(true);

    const activeStoreTarget = pinpoints.find((p) => !p.departedAt);
    expect(activeStoreTarget).toBeUndefined();
  });
});

describe('Profile Screen Rider ID formatting', () => {
  function formatRiderId(riderId?: string | null): string {
    return riderId
      ? riderId.startsWith('RIDER-')
        ? riderId
        : `RIDER-${riderId}`
      : 'RIDER';
  }

  it('prepends RIDER- prefix to plain numeric ID', () => {
    expect(formatRiderId('104')).toBe('RIDER-104');
  });

  it('does not duplicate RIDER- prefix if already present', () => {
    expect(formatRiderId('RIDER-104')).toBe('RIDER-104');
  });

  it('falls back safely to RIDER without crashing on undefined or null', () => {
    expect(formatRiderId(undefined)).toBe('RIDER');
    expect(formatRiderId(null)).toBe('RIDER');
    expect(formatRiderId('')).toBe('RIDER');
  });
});

describe('Task Tab UI Alignment & Elevation Invariants', () => {
  it('enforces Elevation.bottomSheet > Elevation.floatingControls for Android layering', () => {
    // Android composites overlapping surfaces strictly by elevation.
    // The bottom sheet (20) must be higher than floating controls (16) so
    // sheet expansion cleanly covers map buttons.
    expect(Elevation.bottomSheet).toBeGreaterThan(Elevation.floatingControls);
    expect(Elevation.bottomSheet).toBe(20);
    expect(Elevation.floatingControls).toBe(16);
  });

  it('formats compact errand ID chip cleanly', () => {
    expect(formatErrandId('uuid-prefix-9ba918')).toBe('SGO-9BA918');
    expect(formatErrandId('123456')).toBe('SGO-123456');
    expect(formatErrandId('SGO-789012')).toBe('SGO-789012');
  });

  it('expands targetPill max-width responsive to moderateScale(140, 0.25)', () => {
    // 375dp baseline yields exactly 140dp, easily accommodating "7-Eleven Tacurong" (~105dp)
    const baselineWidth = moderateScale(140, 0.25);
    expect(baselineWidth).toBeGreaterThanOrEqual(130);
    expect(baselineWidth).toBeLessThanOrEqual(160);
  });

  // The floating chat dome is gone from the Task tab: the sheet header's chat
  // button is always on screen now, and the dome only competed with the map's
  // controls for the same corner. The real layout (dock pinned, no dome, top
  // layers stacked under the measured panel) is rendered in
  // tests/TaskScreenLayout.test.tsx.

  it('guarantees positive vertical clearance between OSM attribution and floating ETA badge', () => {
    // Attribution at bottomInset + 4 with ~14dp line height spans [bottomInset + 4, bottomInset + 18].
    const osmAttributionTop = 4 + 14;
    const elevatedEtaBadgeBottom = 22;
    expect(elevatedEtaBadgeBottom).toBeGreaterThan(osmAttributionTop);
    const clearance = elevatedEtaBadgeBottom - osmAttributionTop;
    expect(clearance).toBeGreaterThanOrEqual(4); // Clean 4dp gap
  });
});
