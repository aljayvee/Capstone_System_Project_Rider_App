import { apiClient } from './apiClient';
import { MapCoordinate } from '../utils/coords';

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
}

/**
 * Fetches a driving route via the proxy, optionally routed
 * through an ordered list of waypoints (the dispatcher's pinned stores) before
 * the destination. Returns per-leg coordinate arrays and turn-by-turn steps.
 * Fails soft to null on any error.
 */
export async function fetchDrivingRoute(
  origin: MapCoordinate,
  destination: MapCoordinate,
  waypoints?: MapCoordinate[]
): Promise<DirectionsResult | null> {
  try {
    const payload: any = { origin, destination };
    if (waypoints && waypoints.length > 0) {
      payload.waypoints = waypoints;
    }
    
    const response = await apiClient.post('/routing/directions', payload);
    const data = response.data;
    
    return {
      coordinates: data.coordinates || [],
      pickupLegCoordinates: data.pickupLegCoordinates || null,
      deliveryLegCoordinates: data.deliveryLegCoordinates || null,
      steps: data.steps || [],
      legs: data.legs || [],
      distanceMeters: data.distanceMeters || 0,
      durationSeconds: data.durationSeconds || 0,
      provider: data.provider,
      degraded: data.degraded,
    };
  } catch (err) {
    console.warn('[Directions API Proxy] Failed to fetch route:', err);
    return null;
  }
}
