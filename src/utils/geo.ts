import type { MapCoordinate } from './coords';

const EARTH_RADIUS_KM = 6371;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance between two points, in kilometres.
 *
 * Mirrors server/src/lib/geo.ts and CustomerApp/src/utils/geo.ts. The rider app
 * needs it to decide whether it is inside a store's arrival radius, and that
 * decision must agree with the server's geofence — which measures the same way.
 */
export function haversineDistanceKm(a: MapCoordinate, b: MapCoordinate): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(h));
}

/** The same distance in metres, which is the unit every geofence here is in. */
export function metersBetween(a: MapCoordinate, b: MapCoordinate): number {
  return haversineDistanceKm(a, b) * 1000;
}

/**
 * Initial bearing from `a` to `b`, in degrees clockwise from north.
 *
 * Drives the heading-up camera in Focus mode. The device's own `heading` is
 * preferred where it exists, but it is frequently null — a stationary phone has
 * no course to report, and mock-location apps generally omit it entirely — so
 * the direction of travel is derived from consecutive fixes instead.
 *
 * Mirrors CustomerApp/src/utils/geo.ts.
 */
export function bearingBetween(a: MapCoordinate, b: MapCoordinate): number {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const dLon = toRadians(b.longitude - a.longitude);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}
