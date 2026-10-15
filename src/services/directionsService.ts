import { apiClient } from './apiClient';
import { MapCoordinate } from '../utils/coords';
import { classifyRouteFailure, type RouteFailureReason } from './routeRetry';

/** The routing engines the server can be asked to prefer. */
export type RouteProvider = 'osrm' | 'google';

/**
 * How the server chose between the engines, when asked for the fastest
 * (server/src/lib/routing/bestRoute.ts). `chosen` is whose path won on ETA
 * (then distance); `drawnWith` is whose roads the line follows.
 */
export interface RouteSelection {
  strategy: 'fastest';
  chosen: string;
  drawnWith: string;
  candidates: { provider: string; durationSeconds: number; distanceMeters: number }[];
}

export interface RouteStep {
  instruction: string;
  streetName: string;
  maneuverType: string;
  modifier?: string;
  distanceMeters: number;
  durationSeconds: number;
  location: MapCoordinate;
  bearingBefore?: number;
  bearingAfter?: number;
  coordinates: MapCoordinate[];
}

export interface RouteLeg {
  distanceMeters: number;
  durationSeconds: number;
  coordinates: MapCoordinate[];
  steps: RouteStep[];
  targetType?: 'STORE' | 'CUSTOMER';
  targetIndex?: number;
}

export interface DirectionsResult {
  /** Full overview polyline — use when no leg-splitting is needed. */
  coordinates: MapCoordinate[];
  /**
   * Coordinates for all store pickup legs. Rendered in Orange-Yellow.
   */
  pickupLegCoordinates: MapCoordinate[] | null;
  /**
   * Coordinates for the customer delivery run. Rendered in Pink-Red.
   */
  deliveryLegCoordinates: MapCoordinate[] | null;
  /** Detailed turn-by-turn navigation steps across all legs. */
  steps: RouteStep[];
  /** Individual route legs with step-level metadata. */
  legs?: RouteLeg[];
  distanceMeters: number;
  durationSeconds: number;
  provider?: string;
  degraded?: boolean;
  selection?: RouteSelection | null;
}

/**
 * The outcome of one route request.
 *
 * A discriminated result rather than `DirectionsResult | null`, because the
 * caller has to act differently depending on WHY it failed: a 429 must be waited
 * out, an expired session must not be retried at all, and a dead signal should
 * be tried again shortly. Collapsing all three to null is what let the hook
 * hammer a rate limiter that was already refusing it.
 */
export type RouteFetchResult =
  | { ok: true; data: DirectionsResult }
  | { ok: false; reason: RouteFailureReason; status: number | null; message: string };

/**
 * Fetches a driving route via the proxy, optionally routed
 * through an ordered list of waypoints (the dispatcher's pinned stores) before
 * the destination. Returns per-leg coordinate arrays and turn-by-turn steps.
 */
export async function fetchDrivingRoute(
  origin: MapCoordinate,
  destination: MapCoordinate,
  waypoints?: MapCoordinate[],
  /**
   * Whose roads the line should follow: the map on screen's. "osrm" for
   * OpenStreetMap, "google" for Google. The server falls back to the other
   * when the one asked for has no answer.
   */
  provider?: RouteProvider,
  /**
   * 'fastest': the server asks both engines and returns the lower ETA (the
   * shorter road when the two are within a minute), drawn on `provider`'s
   * roads where they can follow it.
   */
  choose?: 'fastest',
  /**
   * With 'fastest': the engine whose path already won. Sent when the rider
   * only switched maps, so the same road is redrawn instead of chosen again.
   */
  keep?: RouteProvider,
  /**
   * The rider's own motion at `origin`. Sent so the server can start the
   * route on the road the rider is riding, in the direction they are riding
   * it, instead of on whichever road is nearest the fix. The server uses the
   * heading only above walking pace, where it means something. Additive: an
   * older server ignores the fields.
   */
  motion?: { headingDeg: number | null; speedMps: number | null; accuracyMeters: number | null }
): Promise<RouteFetchResult> {
  try {
    const payload: any = { origin: { latitude: origin.latitude, longitude: origin.longitude }, destination };
    if (motion) {
      const { headingDeg, speedMps, accuracyMeters } = motion;
      if (typeof headingDeg === 'number' && Number.isFinite(headingDeg) && headingDeg >= 0) {
        payload.originHeading = headingDeg % 360;
      }
      if (typeof speedMps === 'number' && Number.isFinite(speedMps) && speedMps >= 0) {
        payload.originSpeedMps = speedMps;
      }
      if (typeof accuracyMeters === 'number' && Number.isFinite(accuracyMeters) && accuracyMeters >= 0) {
        payload.originAccuracyMeters = accuracyMeters;
      }
    }
    if (waypoints && waypoints.length > 0) {
      payload.waypoints = waypoints;
    }
    if (provider) {
      payload.provider = provider;
    }
    if (choose) {
      payload.choose = choose;
    }
    if (keep) {
      payload.keep = keep;
    }

    const response = await apiClient.post('/routing/directions', payload);
    const data = response.data;

    return {
      ok: true,
      data: {
        coordinates: data.coordinates || [],
        pickupLegCoordinates: data.pickupLegCoordinates || null,
        deliveryLegCoordinates: data.deliveryLegCoordinates || null,
        steps: data.steps || [],
        legs: data.legs || [],
        distanceMeters: data.distanceMeters || 0,
        durationSeconds: data.durationSeconds || 0,
        provider: data.provider,
        // Coerced, not passed through: an older server omits the field, and
        // `undefined` must read as "not degraded" rather than as unknown.
        degraded: data.degraded === true,
        selection: data.selection ?? null,
      },
    };
  } catch (err: any) {
    const status: number | null = typeof err?.status === 'number' ? err.status : null;
    const reason = classifyRouteFailure(status);
    // Under Hermes this reaches Metro's terminal and nowhere else, which is why
    // the reason is also surfaced on screen in development — see RouteQualityBanner.
    console.warn(`[routing] ${reason} (${status ?? 'no response'}): ${err?.message}`);
    return {
      ok: false,
      reason,
      status,
      message: String(err?.message ?? 'Route request failed'),
    };
  }
}
