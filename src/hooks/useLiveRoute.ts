import { useEffect, useRef, useState } from 'react';
import { MapCoordinate } from '../utils/coords';
import { fetchDrivingRoute, RouteLeg, RouteStep } from '../services/directionsService';

const REFRESH_INTERVAL_MS = 30000;

/**
 * How soon to try again after a failed fetch.
 *
 * The ordinary refresh is half a minute, which is the right cadence for a route
 * that is already correct. It is far too long to sit on a failure: a rider in a
 * dead spot for three seconds would otherwise keep a degraded line for thirty.
 */
const RETRY_AFTER_FAILURE_MS = 5000;

export interface LiveRouteResult {
  coordinates: MapCoordinate[] | null;
  /** All store pickup legs. Rendered in Orange-Yellow. */
  pickupLegCoordinates: MapCoordinate[] | null;
  /** Customer delivery run. Rendered in Pink-Red. */
  deliveryLegCoordinates: MapCoordinate[] | null;
  /** Turn-by-turn navigation steps across the route. */
  steps: RouteStep[];
  /** Individual route legs with step-level metadata. */
  legs: RouteLeg[];
  distanceMeters: number | null;
  durationSeconds: number | null;
  isLoading: boolean;
  /**
   * True when the line is straight segments between points rather than a road
   * route. The map draws these dashed — a guessed line that looks identical to a
   * real one tells the rider to ride through a building.
   */
  isFallback: boolean;
  /** True when this is the last good route and refreshes are currently failing. */
  isStale: boolean;
  provider?: string;
  degraded?: boolean;
}

const EMPTY_RESULT: LiveRouteResult = {
  coordinates: null,
  pickupLegCoordinates: null,
  deliveryLegCoordinates: null,
  steps: [],
  legs: [],
  distanceMeters: null,
  durationSeconds: null,
  isLoading: false,
  isFallback: false,
  isStale: false,
};

/**
 * Straight lines between the points, used only when there has never been a real
 * route to show. Never used to REPLACE one — see the failure branch below.
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
      steps: [],
      legs: [],
      distanceMeters: null,
      durationSeconds: null,
      isLoading: false,
      isFallback: true,
      isStale: false,
    };
  }

  return {
    coordinates: allPoints,
    pickupLegCoordinates: null,
    deliveryLegCoordinates: allPoints,
    steps: [],
    legs: [],
    distanceMeters: null,
    durationSeconds: null,
    isLoading: false,
    isFallback: true,
    isStale: false,
  };
}

/**
 * Re-fetches a driving route (through the given waypoints, in order) on a fixed
 * interval. If rider location is not yet available, routes between store
 * waypoints and the destination.
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

    if (!effectiveOrigin || !effectiveDestination) {
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchRoute = () => {
      const liveRider = originRef.current;
      const liveOrigin = liveRider || (currentWaypoints.length > 0 ? currentWaypoints[0] : null);
      if (!liveOrigin) return;

      const liveWaypoints = liveRider ? currentWaypoints : currentWaypoints.slice(1);

      setResult((prev) => ({ ...prev, isLoading: !prev.coordinates }));

      fetchDrivingRoute(liveOrigin, effectiveDestination, liveWaypoints).then((res) => {
        if (cancelled) return;

        if (res && res.coordinates && res.coordinates.length > 0) {
          const legsKnown = Boolean(liveRider) && currentWaypoints.length > 0;
          setResult({
            coordinates: res.coordinates,
            pickupLegCoordinates: legsKnown ? res.pickupLegCoordinates : null,
            deliveryLegCoordinates: legsKnown ? res.deliveryLegCoordinates : res.coordinates,
            steps: res.steps || [],
            legs: res.legs || [],
            distanceMeters: res.distanceMeters,
            durationSeconds: res.durationSeconds,
            isLoading: false,
            isFallback: false,
            isStale: false,
            provider: res.provider,
            degraded: res.degraded,
          });
          return;
        }

        // The fetch failed. Keep previous good route or fallback
        setResult((prev) =>
          prev.coordinates && !prev.isFallback
            ? { ...prev, isLoading: false, isStale: true }
            : buildFallbackRoute(originRef.current, destination, currentWaypoints)
        );

        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(fetchRoute, RETRY_AFTER_FAILURE_MS);
      });
    };

    fetchRoute();
    const interval = setInterval(fetchRoute, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (retryTimer) clearTimeout(retryTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination?.latitude, destination?.longitude, waypointsKey, originLat, originLng]);

  return result;
}
