import type { ErrandPinpoint } from '../types/rider';
import { metersBetween } from '../utils/geo';

/**
 * Deciding, from the rider's own GPS, when they have reached a pinned store.
 *
 * The server already works this out from uploaded breadcrumbs, but that answer
 * arrives a batch late and needs signal. The rider standing at the counter needs
 * their screen to move now, so the same rule runs here too. Kept as a pure
 * function rather than living inside the hook, because the interesting part is
 * the rule and the rule should be testable without a device.
 */

/** For a stop the server sent no radius for. Mirrors GEOFENCE_RADIUS_METERS. */
export const DEFAULT_ARRIVAL_RADIUS_METERS = 75;

/**
 * The customer's door, which is not a shop.
 *
 * Tighter than any store radius on purpose: a supermarket's circle has to reach
 * across its car park, while a house is a house. Too generous here would arrive
 * the rider while they are still two streets away.
 */
export const DELIVERY_ARRIVAL_RADIUS_METERS = 50;

/**
 * How long the rider must stay inside the circle before it counts.
 *
 * Crossing the boundary is not arriving. Downtown Tacurong has stores 25-110 m
 * apart, so a rider riding to the second stop passes clean through the first
 * one's circle — without this they would be marked arrived at a shop they never
 * entered, and then have to walk the flow backwards.
 *
 * Shorter than the server's 60 s equivalent on purpose: the server is reading a
 * breadcrumb after the fact and can afford to be sure, while this is the rider
 * waiting at the door for their screen to catch up.
 */
export const REQUIRED_PRESENCE_MS = 20_000;

export interface ArrivalFix {
  latitude: number;
  longitude: number;
  /** GPS error, when the device reports one. */
  accuracyMeters?: number | null;
  /** Epoch milliseconds. */
  at: number;
}

/** What the detector remembers between fixes. */
export interface ArrivalWatch {
  stopId: number | null;
  insideSince: number | null;
}

export const IDLE_WATCH: ArrivalWatch = { stopId: null, insideSince: null };

export function radiusOf(stop: Pick<ErrandPinpoint, 'geofenceRadiusMeters'>): number {
  const radius = stop.geofenceRadiusMeters;
  return typeof radius === 'number' && radius > 0 ? radius : DEFAULT_ARRIVAL_RADIUS_METERS;
}

export const STORE_DELAY_THRESHOLD_MS = 12 * 60 * 1000; // 12 minutes

/**
 * Supermarket & Grocery stores are exempt from the dwell delay timeout
 * because riders take time browsing aisles and lining up at checkout.
 */
export function isStoreExemptFromDelay(category?: string | null): boolean {
  if (!category) return false;
  const lower = category.toLowerCase();
  return lower.includes('supermarket') || lower.includes('grocery');
}

/**
 * Pharmacy, Cafe & Restaurant, and other stores have a 12-minute threshold
 * where the rider is prompted to switch to another store if service is taking too long.
 */
export function isStoreEligibleForDelay(category?: string | null): boolean {
  return !isStoreExemptFromDelay(category);
}

/**
 * The stop the rider is currently heading for.
 *
 * Dynamically picks the store pin that is nearest to the rider's current location,
 * replacing static chronological sequence (0, 1, 2...).
 *
 * Supports deferring delayed stores (e.g. Cafe/Pharmacy taking >12m).
 * If non-deferred candidates exist, deferred stops are skipped; if all
 * remaining stops are deferred, it falls back to the deferred pool so the
 * rider routes back to them.
 */
export function nearestOutstandingStop(
  stops: ErrandPinpoint[] | undefined,
  currentLocation?: { latitude: number; longitude: number } | null,
  deferredStopIds?: Set<number> | number[],
  completedStopIds?: Set<number> | number[],
  options: { includeArrived?: boolean } = {}
): ErrandPinpoint | null {
  if (!stops || stops.length === 0) return null;

  const deferredSet =
    deferredStopIds instanceof Set
      ? deferredStopIds
      : new Set(deferredStopIds ?? []);

  const completedSet =
    completedStopIds instanceof Set
      ? completedStopIds
      : new Set(completedStopIds ?? []);

  const outstanding = stops.filter(
    (s) =>
      (!s.arrivedAt || deferredSet.has(s.id) || options.includeArrived) &&
      !s.departedAt &&
      !completedSet.has(s.id)
  );
  if (outstanding.length === 0) return null;

  const nonDeferred = outstanding.filter((s) => !deferredSet.has(s.id));
  const pool = nonDeferred.length > 0 ? nonDeferred : outstanding;

  if (!currentLocation) {
    return (
      [...pool].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))[0] ?? null
    );
  }

  return pool.reduce((closest, s) => {
    const distS = metersBetween(currentLocation, {
      latitude: s.latitude,
      longitude: s.longitude,
    });
    const distClosest = metersBetween(currentLocation, {
      latitude: closest.latitude,
      longitude: closest.longitude,
    });
    return distS < distClosest ? s : closest;
  }, pool[0]);
}

/**
 * Backwards-compatible delegating function for nearestOutstandingStop.
 */
export function nextOutstandingStop(
  stops: ErrandPinpoint[] | undefined,
  currentLocation?: { latitude: number; longitude: number } | null,
  deferredStopIds?: Set<number> | number[],
  completedStopIds?: Set<number> | number[],
  options: { includeArrived?: boolean } = {}
): ErrandPinpoint | null {
  return nearestOutstandingStop(stops, currentLocation, deferredStopIds, completedStopIds, options);
}

/**
 * The one place the rider is heading for — a shop while any remain, otherwise
 * the customer's door.
 *
 * The delivery address is the final waypoint rather than a separate detector.
 * Modelling it as one more stop means the dwell rule, the accuracy gate and the
 * sequence rule all apply to it unchanged, and there is no second copy of any of
 * them to drift.
 */
export function nextWaypoint(
  stops: ErrandPinpoint[] | undefined,
  destination: { latitude: number; longitude: number } | null | undefined,
  currentLocation?: { latitude: number; longitude: number } | null,
  deferredStopIds?: Set<number> | number[],
  completedStopIds?: Set<number> | number[],
  options: { includeArrived?: boolean } = {}
): ErrandPinpoint | null {
  const stop = nearestOutstandingStop(stops, currentLocation, deferredStopIds, completedStopIds, options);
  if (stop) return stop;
  if (!destination) return null;

  // A synthetic stop standing in for the customer. The negative id cannot
  // collide with a real pinpoint, which is what keeps the watch from thinking
  // the door is a shop it already visited.
  return {
    id: -1,
    storeName: 'the delivery address',
    latitude: destination.latitude,
    longitude: destination.longitude,
    sequence: Number.MAX_SAFE_INTEGER,
    geofenceRadiusMeters: DELIVERY_ARRIVAL_RADIUS_METERS,
  };
}

/** True for the synthetic waypoint that stands for the customer's door. */
export function isDeliveryWaypoint(stop: ErrandPinpoint | null): boolean {
  return stop?.id === -1;
}

export interface ArrivalResult {
  watch: ArrivalWatch;
  /** True on the single fix that completes the required presence. */
  arrived: boolean;
}

/**
 * Folds one GPS fix into the watch.
 *
 * Returns `arrived: true` exactly once per stop — the caller clears the watch by
 * advancing, and the stop then drops out of `nextOutstandingStop`.
 */
export function observeFix(
  watch: ArrivalWatch,
  stop: ErrandPinpoint | null,
  fix: ArrivalFix | null
): ArrivalResult {
  if (!stop || !fix) return { watch: IDLE_WATCH, arrived: false };

  const radius = radiusOf(stop);

  // A fix that could be anywhere within 200 m cannot prove presence in a 75 m
  // circle. Treated as no information rather than as being outside, so a single
  // bad sample does not reset a rider who has been standing there for 15 s.
  const accuracy = fix.accuracyMeters;
  if (typeof accuracy === 'number' && accuracy > radius) {
    return { watch, arrived: false };
  }

  const inside = metersBetween(fix, stop) <= radius;
  if (!inside) return { watch: IDLE_WATCH, arrived: false };

  // Entering, or entering a different stop than the one being watched.
  if (watch.stopId !== stop.id || watch.insideSince === null) {
    return { watch: { stopId: stop.id, insideSince: fix.at }, arrived: false };
  }

  const held = fix.at - watch.insideSince;
  if (held < REQUIRED_PRESENCE_MS) return { watch, arrived: false };

  return { watch: IDLE_WATCH, arrived: true };
}
