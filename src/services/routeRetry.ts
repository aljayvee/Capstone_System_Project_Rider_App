/**
 * When to ask for a route again, and how to read a route we were given.
 *
 * Deliberately free of runtime imports so vitest can reach it without pulling
 * in axios, AsyncStorage and expo-secure-store. Type-only imports are erased.
 */
import type { DirectionsResult } from './directionsService';
import type { MapCoordinate } from '../utils/coords';
import type { RouteLeg, RouteSelection, RouteStep } from './directionsService';

/** Why the last attempt failed. Drives both the retry delay and what the rider is told. */
export type RouteFailureReason =
  | 'unauthorized'
  | 'rate-limited'
  | 'server'
  | 'bad-request'
  | 'network';

/** The cadence for a route that is already correct. Unchanged. */
export const ROUTE_REFRESH_INTERVAL_MS = 30_000;

/**
 * A floor under every request, whatever triggered it.
 *
 * useLiveRoute keys its effect on the rider's position at 4 decimal places —
 * about 11 metres — and fires a fetch immediately when that key changes. At a
 * two-second GPS cadence a moving rider could therefore produce roughly thirty
 * requests a minute, which is exactly the per-IP ceiling the server allows. The
 * limiter then answers 429, the hook retries, and the failure sustains itself.
 *
 * Retry backoff alone cannot fix that, because the storm does not come from the
 * retry timer: the effect tearing down also clears it. This floor is the thing
 * that actually bounds the rate.
 */
export const ROUTE_MIN_FETCH_INTERVAL_MS = 8_000;

const BASE_RETRY_MS = 5_000;
const MAX_RETRY_MS = 60_000;

/**
 * The server's routing limiter counts over a one-minute window. Retrying inside
 * that window only spends another request on the same 429.
 */
const RATE_LIMITED_RETRY_MS = 60_000;

/**
 * What kind of failure a status code represents.
 *
 * A missing status means the request never reached the server — a timeout or no
 * signal — which is worth retrying soon. That is not the same as a 5xx, and
 * neither is the same as being told to stop.
 */
export function classifyRouteFailure(status: number | null | undefined): RouteFailureReason {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 429) return 'rate-limited';
  if (status != null && status >= 500) return 'server';
  if (status != null && status >= 400) return 'bad-request';
  return 'network';
}

/**
 * How long to wait before trying again, or null to schedule nothing.
 *
 * Null on an expired session: the client has already spent its refresh token and
 * lost, so asking again cannot produce a valid one — it only burns battery and
 * rate budget until the rider signs in.
 */
export function nextRetryDelayMs(
  reason: RouteFailureReason,
  consecutiveFailures: number
): number | null {
  if (reason === 'unauthorized') return null;
  if (reason === 'rate-limited') return RATE_LIMITED_RETRY_MS;

  const attempt = Math.max(1, consecutiveFailures);
  return Math.min(BASE_RETRY_MS * 2 ** (attempt - 1), MAX_RETRY_MS);
}

/** What the map should draw, derived from one directions response. */
export interface MappedRoute {
  coordinates: MapCoordinate[];
  /**
   * The road itself: the legs' own geometry, joined, exactly as the routing
   * engine traced it. `coordinates` is the server's display copy with corners
   * rounded (smoothPath), which can cut up to 3.5 m inside a bend; at
   * navigation zoom that is the line leaving the road at every junction. The
   * rider's map draws this one. Falls back to `coordinates` when no legs came.
   */
  roadCoordinates: MapCoordinate[];
  pickupLegCoordinates: MapCoordinate[] | null;
  deliveryLegCoordinates: MapCoordinate[] | null;
  steps: RouteStep[];
  legs: RouteLeg[];
  distanceMeters: number;
  durationSeconds: number;
  isFallback: boolean;
  provider?: string;
  degraded: boolean;
  /** Which engine's path won, when the fastest of both was asked for. */
  selection: RouteSelection | null;
}

/**
 * Every leg's points in order, without the duplicate each step and leg boundary
 * repeats.
 */
export function joinLegCoordinates(legs: Pick<RouteLeg, 'coordinates'>[]): MapCoordinate[] {
  const out: MapCoordinate[] = [];
  for (const leg of legs) {
    for (const point of leg.coordinates || []) {
      const last = out[out.length - 1];
      if (last && last.latitude === point.latitude && last.longitude === point.longitude) continue;
      out.push(point);
    }
  }
  return out;
}

/**
 * Reads a directions response into what the map draws.
 *
 * The whole point is `degraded`. When every routing provider fails the server
 * answers from the haversine provider, which returns the very points it was
 * given — a straight line — and says so. That flag was being stored and then
 * ignored, so a straight line was drawn solid and casing-backed, identical to a
 * real road route. A guessed line that looks like a real one tells the rider to
 * ride through a building.
 */
export function mapDirectionsToRoute(
  data: DirectionsResult,
  options: { legsKnown: boolean }
): MappedRoute {
  const degraded = data.degraded === true;

  const legPoints = degraded ? [] : joinLegCoordinates(data.legs || []);

  return {
    coordinates: data.coordinates,
    roadCoordinates: legPoints.length > 1 ? legPoints : data.coordinates,
    pickupLegCoordinates: options.legsKnown ? data.pickupLegCoordinates : null,
    deliveryLegCoordinates: options.legsKnown ? data.deliveryLegCoordinates : data.coordinates,
    // A straight line has no turns to call. The haversine provider still emits
    // "proceed towards" and "arrive at" steps for one, and feeding those to the
    // turn-by-turn HUD puts a metre countdown over a line the rider cannot
    // follow — and pins its off-route check on, because a rider on real roads is
    // always far from the chord between two points.
    steps: degraded ? [] : data.steps || [],
    legs: degraded ? [] : data.legs || [],
    distanceMeters: data.distanceMeters,
    durationSeconds: data.durationSeconds,
    isFallback: degraded,
    provider: data.provider,
    degraded,
    selection: data.selection ?? null,
  };
}
