import { apiClient } from './apiClient';
import { MapCoordinate } from '../utils/coords';

export interface DirectionsResult {
  /** Full overview polyline — use when no leg-splitting is needed. */
  coordinates: MapCoordinate[];
  /**
   * Coordinates for the first leg only (rider → first store, or rider →
   * customer when no waypoints). Decoded from each step's polyline so the
   * caller can render a separate colour for the pickup leg.
   */
  pickupLegCoordinates: MapCoordinate[] | null;
  /**
   * Coordinates for all legs after the first (stores → customer).
   * Null when no waypoints were supplied (single-leg route).
   */
  deliveryLegCoordinates: MapCoordinate[] | null;
  distanceMeters: number;
  durationSeconds: number;
}

/**
 * Fetches a driving route via the proxy, optionally routed
 * through an ordered list of waypoints (the dispatcher's pinned stores) before
 * the destination. Returns per-leg coordinate arrays for two-colour rendering.
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
      distanceMeters: data.distanceMeters || 0,
      durationSeconds: data.durationSeconds || 0,
    };
  } catch (err) {
    console.warn('[Directions API Proxy] Failed to fetch route:', err);
    return null;
  }
}
