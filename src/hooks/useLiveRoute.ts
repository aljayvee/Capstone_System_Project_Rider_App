import { useEffect, useRef, useState } from 'react';
import { MapCoordinate } from '../utils/coords';
import { fetchDrivingRoute } from '../services/directionsService';

const REFRESH_INTERVAL_MS = 30000;

export interface LiveRouteResult {
  coordinates: MapCoordinate[] | null;
  /** First leg only: rider → first store (or rider → customer if no waypoints). */
  pickupLegCoordinates: MapCoordinate[] | null;
  /** Remaining legs: stores → customer. Null if no waypoints. */
  deliveryLegCoordinates: MapCoordinate[] | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  isLoading: boolean;
}

const EMPTY_RESULT: LiveRouteResult = {
  coordinates: null,
  pickupLegCoordinates: null,
  deliveryLegCoordinates: null,
  distanceMeters: null,
  durationSeconds: null,
  isLoading: false,
};

/**
 * Builds a direct straight-line polyline connecting the available points
 * ONLY used as a true offline / API failure fallback, never as an initial flash.
 */
function buildFallbackRoute(
  origin: MapCoordinate | null,
  destination: MapCoordinate | null,
  waypoints: MapCoordinate[]
): LiveRouteResult {
  const allPoints: MapCoordinate[] = [
    ...(origin ? [origin] : []),
    ...waypoints,
    ...(destination ? [destination] : []),
  ];

  if (allPoints.length < 2) {
    return EMPTY_RESULT;
  }

  if (origin && waypoints.length > 0) {
    const pickupLeg = [origin, waypoints[0]];
    const deliveryLeg = destination ? [...waypoints, destination] : [...waypoints];
    return {
      coordinates: allPoints,
      pickupLegCoordinates: pickupLeg,
      deliveryLegCoordinates: deliveryLeg.length >= 2 ? deliveryLeg : null,
      distanceMeters: null,
      durationSeconds: null,
      isLoading: false,
    };
  }

  return {
    coordinates: allPoints,
    pickupLegCoordinates: null,
    deliveryLegCoordinates: allPoints,
    distanceMeters: null,
    durationSeconds: null,
    isLoading: false,
  };
}

/**
 * Re-fetches a driving route (through the given waypoints, in order) on a
 * fixed interval. If rider location is not yet available, routes between store waypoints
 * and the destination.
 */
export function useLiveRoute(
  origin: MapCoordinate | null,
  destination: MapCoordinate | null,
  waypoints: MapCoordinate[] = []
): LiveRouteResult {
  const waypointsKey = JSON.stringify(waypoints.map((w) => [w.latitude, w.longitude]));
  // Re-trigger on ~10m GPS movements or when origin appears
  const originLat = origin ? origin.latitude.toFixed(4) : 'null';
  const originLng = origin ? origin.longitude.toFixed(4) : 'null';

  const [result, setResult] = useState<LiveRouteResult>(EMPTY_RESULT);

  const originRef = useRef(origin);
  originRef.current = origin;

  useEffect(() => {
    const currentWaypoints: MapCoordinate[] = JSON.parse(waypointsKey).map(
      ([latitude, longitude]: [number, number]) => ({ latitude, longitude })
    );

    const hasRider = Boolean(origin);
    const effectiveOrigin = hasRider ? origin : (currentWaypoints.length > 0 ? currentWaypoints[0] : null);
    const effectiveDestination = destination ?? (currentWaypoints.length > 0 ? currentWaypoints[currentWaypoints.length - 1] : null);
    const effectiveWaypoints = hasRider ? currentWaypoints : currentWaypoints.slice(1);

    if (!effectiveOrigin || !effectiveDestination) {
      return;
    }

    let cancelled = false;

    const fetchRoute = () => {
      const liveRider = originRef.current;
      const liveOrigin = liveRider || (currentWaypoints.length > 0 ? currentWaypoints[0] : null);
      if (!liveOrigin) return;

      const liveWaypoints = liveRider ? currentWaypoints : currentWaypoints.slice(1);

      setResult((prev) => ({ ...prev, isLoading: !prev.coordinates }));

      fetchDrivingRoute(liveOrigin, effectiveDestination, liveWaypoints).then((res) => {
        if (!cancelled) {
          if (res && res.coordinates && res.coordinates.length > 0) {
            // If rider was present with waypoints: leg 0 is pickup, leg 1+ is delivery
            if (liveRider && currentWaypoints.length > 0) {
              setResult({
                coordinates: res.coordinates,
                pickupLegCoordinates: res.pickupLegCoordinates,
                deliveryLegCoordinates: res.deliveryLegCoordinates,
                distanceMeters: res.distanceMeters,
                durationSeconds: res.durationSeconds,
                isLoading: false,
              });
            } else if (liveRider && currentWaypoints.length === 0) {
              // Direct rider → customer delivery
              setResult({
                coordinates: res.coordinates,
                pickupLegCoordinates: null,
                deliveryLegCoordinates: res.coordinates,
                distanceMeters: res.distanceMeters,
                durationSeconds: res.durationSeconds,
                isLoading: false,
              });
            } else {
              // No rider yet: route is store → customer (delivery leg only)
              setResult({
                coordinates: res.coordinates,
                pickupLegCoordinates: null,
                deliveryLegCoordinates: res.coordinates,
                distanceMeters: res.distanceMeters,
                durationSeconds: res.durationSeconds,
                isLoading: false,
              });
            }
          } else {
            setResult(buildFallbackRoute(originRef.current, destination, currentWaypoints));
          }
        }
      });
    };

    fetchRoute();
    const interval = setInterval(fetchRoute, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination?.latitude, destination?.longitude, waypointsKey, originLat, originLng]);

  return result;
}




