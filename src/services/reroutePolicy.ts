/**
 * When a route that is already on screen gets asked for again.
 *
 * It used to be every 30 seconds, and again on roughly every 11 metres of
 * movement, whether or not anything had changed. Each answer could differ
 * slightly (a new origin snapped to the road, a different fillet at a corner),
 * so the line the rider was following kept being redrawn under them, and the
 * turn instructions restarted.
 *
 * Now a route is kept for as long as the rider follows it. It is recalculated
 * only when they leave it for another street. Leaving is judged on three
 * things together, so that a rider standing inside a store (which is off the
 * road, and so "off the route", from the moment the route is drawn) does not
 * trigger a recalculation on every fix:
 *
 * 1. They are more than OFF_ROUTE_METERS from the route line, or further
 *    when the phone says its fix is poorer than that (offRouteMeters).
 * 2. They are further from it than when the route was calculated, by
 *    MOVING_AWAY_METERS. Walking out of a shop toward the road never counts.
 * 3. They have moved MIN_TRAVEL_METERS since the route was calculated, so GPS
 *    drift while standing still cannot count either.
 *
 * All three must hold for OFF_ROUTE_FIXES fixes in a row (about two seconds at
 * the one-second GPS rate) before the route is thrown away.
 *
 * Pure: the hook that owns the route feeds it one fix at a time.
 */

export const OFF_ROUTE_METERS = 30;
/**
 * Added to the phone's own accuracy figure to give the off-route distance for
 * that fix, when that is wider than OFF_ROUTE_METERS. A fix the phone itself
 * says is only good to 35 m cannot show the rider 30 m off the road: at 30 m
 * flat, two such fixes in a row recalculated the route from a neighbouring
 * street while the rider was still on the right one.
 */
export const ACCURACY_MARGIN_METERS = 10;
export const MOVING_AWAY_METERS = 15;
export const MIN_TRAVEL_METERS = 25;
export const OFF_ROUTE_FIXES = 2;

export interface DeviationInput {
  /** The rider's distance from the route line now, in metres. Null when there is no line. */
  distanceFromRoute: number | null;
  /** Their distance from the line when the route was calculated. */
  distanceFromRouteAtFetch: number | null;
  /** How far they have moved since the route was calculated, in metres. */
  travelledSinceFetch: number;
  /** Consecutive qualifying fixes so far. */
  offRouteFixes: number;
  /** The phone's accuracy figure for this fix, in metres. Absent or null: judged at OFF_ROUTE_METERS. */
  accuracyMeters?: number | null;
}

/** How far off the line this fix must be to count as leaving it. */
export function offRouteMeters(accuracyMeters: number | null | undefined): number {
  return typeof accuracyMeters === 'number' && Number.isFinite(accuracyMeters) && accuracyMeters > 0
    ? Math.max(OFF_ROUTE_METERS, accuracyMeters + ACCURACY_MARGIN_METERS)
    : OFF_ROUTE_METERS;
}

export interface DeviationResult {
  offRouteFixes: number;
  reroute: boolean;
}

export function evaluateDeviation(input: DeviationInput): DeviationResult {
  const { distanceFromRoute, distanceFromRouteAtFetch, travelledSinceFetch, offRouteFixes, accuracyMeters } = input;
  if (distanceFromRoute == null) return { offRouteFixes: 0, reroute: false };

  const baseline = distanceFromRouteAtFetch ?? 0;
  const leaving =
    distanceFromRoute > offRouteMeters(accuracyMeters) &&
    distanceFromRoute > baseline + MOVING_AWAY_METERS &&
    travelledSinceFetch >= MIN_TRAVEL_METERS;

  if (!leaving) return { offRouteFixes: 0, reroute: false };

  const count = offRouteFixes + 1;
  return count >= OFF_ROUTE_FIXES ? { offRouteFixes: 0, reroute: true } : { offRouteFixes: count, reroute: false };
}
