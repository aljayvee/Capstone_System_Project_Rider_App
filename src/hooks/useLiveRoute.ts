import { useEffect, useRef, useState } from 'react';
import { MapCoordinate } from '../utils/coords';
import {
  fetchDrivingRoute,
  RouteLeg,
  RouteProvider,
  RouteSelection,
  RouteStep,
} from '../services/directionsService';
import {
  mapDirectionsToRoute,
  nextRetryDelayMs,
  ROUTE_MIN_FETCH_INTERVAL_MS,
  ROUTE_REFRESH_INTERVAL_MS,
  type RouteFailureReason,
} from '../services/routeRetry';
import { evaluateDeviation } from '../services/reroutePolicy';
import { metresBetween, projectOntoPath } from '../utils/routeGeometry';

// Only for a straight-line guess, which is worth replacing with a real route as
// soon as one can be had. A real route is never refreshed on a timer; see
// services/reroutePolicy.ts.
const FALLBACK_RETRY_INTERVAL_MS = ROUTE_REFRESH_INTERVAL_MS;

// Switching maps is a tap, and the rider is looking for the new line at once,
// so it is not held to the full request floor. It still cannot be tapped into
// a request storm.
const PROVIDER_SWITCH_MIN_FETCH_MS = 1500;

// Road routes kept per provider and stops, so switching back to a map whose
// line was already fetched is instant and costs no request. Small: the key
// changes with every stop, and only the current stops are ever reused.
const ROUTE_CACHE_SIZE = 6;

interface CachedRoute {
  result: LiveRouteResult;
  fetchOrigin: MapCoordinate | null;
  distanceAtFetch: number | null;
}

export interface LiveRouteResult {
  coordinates: MapCoordinate[] | null;
  /**
   * The same route along the road exactly, corners unrounded (see
   * routeRetry.MappedRoute). What the rider's map draws.
   */
  roadCoordinates: MapCoordinate[] | null;
  /**
   * True from the moment the rider is judged to have left the route until the
   * new one arrives. What the "Recalculating" banner shows, and nothing else:
   * standing inside a store off the road is not recalculating.
   */
  isRerouting: boolean;
  /**
   * Which engine's path won, and both candidates, when the fastest of both
   * was asked for (`choose: 'fastest'`). Null otherwise.
   */
  selection: RouteSelection | null;
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
  /**
   * Why the last attempt failed, or null while routing is working.
   *
   * Surfaced so the screen can say something useful in development. The service
   * logs the same thing, but under Hermes that only reaches Metro's terminal —
   * which is exactly why this bug was hard to see on a device.
   */
  lastFailure: RouteFailureReason | null;
  /**
   * The engine of the map on screen, when it could not draw this route on
   * its own roads even when asked for nothing else (its server breaker open,
   * a missing Google key). Null while it can. The line is then never the
   * other engine's (see `provider` below); the Task tab may move to the map
   * that engine can draw on (config/mapChoice.ts).
   */
  unroutable: RouteProvider | null;
}

const EMPTY_RESULT: LiveRouteResult = {
  coordinates: null,
  roadCoordinates: null,
  isRerouting: false,
  selection: null,
  pickupLegCoordinates: null,
  deliveryLegCoordinates: null,
  steps: [],
  legs: [],
  distanceMeters: null,
  durationSeconds: null,
  isLoading: false,
  isFallback: false,
  isStale: false,
  lastFailure: null,
  unroutable: null,
};

/** Whose roads a route's line follows: the engine it was drawn with, or 'haversine' for a guess. */
export function lineEngineOf(route: {
  selection?: RouteSelection | null;
  provider?: string;
}): string | undefined {
  return route.selection?.drawnWith ?? route.provider;
}

/**
 * Straight lines between the points, used only when there has never been a real
 * route to show. Never used to REPLACE one — see the failure branch below.
 */
function buildFallbackRoute(
  origin: MapCoordinate | null,
  destination: MapCoordinate | null,
  waypoints: MapCoordinate[],
  lastFailure: RouteFailureReason | null = null
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
      ...EMPTY_RESULT,
      coordinates: allPoints,
      roadCoordinates: allPoints,
      pickupLegCoordinates: pickupLeg,
      deliveryLegCoordinates: deliveryLeg.length >= 2 ? deliveryLeg : null,
      steps: [],
      legs: [],
      distanceMeters: null,
      durationSeconds: null,
      isLoading: false,
      isFallback: true,
      isStale: false,
      lastFailure,
    };
  }

  return {
    ...EMPTY_RESULT,
    coordinates: allPoints,
    roadCoordinates: allPoints,
    pickupLegCoordinates: null,
    deliveryLegCoordinates: allPoints,
    steps: [],
    legs: [],
    distanceMeters: null,
    durationSeconds: null,
    isLoading: false,
    isFallback: true,
    isStale: false,
    lastFailure,
  };
}

/**
 * A driving route (through the given waypoints, in order) that stays put while
 * the rider follows it. If rider location is not yet available, routes between
 * store waypoints and the destination.
 *
 * Fetched when the stops change, when the first GPS fix arrives, and when the
 * rider leaves the route for another street (services/reroutePolicy.ts). Not on
 * a timer and not on every few metres of movement, as it used to be: each of
 * those answers redrew the line under the rider and restarted the turn
 * instructions, for a route that had not changed.
 */
export function useLiveRoute(
  origin:
    | (MapCoordinate & { speed?: number | null; heading?: number | null; accuracyMeters?: number | null })
    | null,
  destination: MapCoordinate | null,
  waypoints: MapCoordinate[] = [],
  /**
   * `provider`: whose roads to follow, the map on screen's. On OpenStreetMap
   * the line is OSRM's, drawn from the same roads as the tiles; on Google it
   * is Google's, following the roads Google paints. Each draws its own lines.
   *
   * Named, it is binding. The server may still answer with the other engine's
   * line: with 'fastest', when the winning path cannot be redrawn on this
   * map's roads, and always when this map's engine has no answer. That line
   * sits beside the painted roads, so it is never shown: the hook asks again
   * for this engine's own route (`keep` = provider), and failing that reports
   * `unroutable` and keeps the other line aside for that engine's map.
   */
  options: { provider?: RouteProvider; choose?: 'fastest' } = {}
): LiveRouteResult {
  const { provider, choose } = options;
  const waypointsKey = JSON.stringify(waypoints.map((w) => [w.latitude, w.longitude]));
  // Whether there is a rider fix at all, not where it is: the first fix turns a
  // store-to-customer preview into the rider's own route, and after that
  // movement alone never asks again.
  const hasOrigin = Boolean(origin);

  const [result, setResult] = useState<LiveRouteResult>(EMPTY_RESULT);
  // Bumped to ask for a new route from where the rider is now.
  const [rerouteNonce, setRerouteNonce] = useState(0);

  const originRef = useRef(origin);
  originRef.current = origin;

  // Refs, not effect-local state, and that is the whole point.
  //
  // The fetch effect below re-runs whenever the stops change or a reroute is
  // asked for, so a counter or timestamp living inside it would reset each time
  // — which is the same hole the backoff exists to close, wearing a different
  // hat. These survive the effect being torn down and rebuilt.
  const failuresRef = useRef(0);
  const lastFetchAtRef = useRef(0);

  // Where the rider was when the route on screen was asked for, and how far
  // from its line they stood. The reroute rule measures against both.
  const fetchOriginRef = useRef<MapCoordinate | null>(null);
  const distanceAtFetchRef = useRef<number | null>(null);
  const offRouteFixesRef = useRef(0);
  // Read by the fallback timer, which must not capture a stale result.
  const isFallbackRef = useRef(false);
  isFallbackRef.current = result.isFallback;

  // The route on screen, read when the rider switches maps: its winning
  // engine is kept, so the switch redraws the same road.
  const resultRef = useRef(result);
  resultRef.current = result;
  const targetKeyRef = useRef<string | null>(null);

  const routeCacheRef = useRef(new Map<string, CachedRoute>());
  const lastProviderRef = useRef<RouteProvider | undefined>(provider);
  const lastNonceRef = useRef(rerouteNonce);

  useEffect(() => {
    const currentWaypoints: MapCoordinate[] = JSON.parse(waypointsKey).map(
      ([latitude, longitude]: [number, number]) => ({ latitude, longitude })
    );

    const effectiveOrigin = originRef.current ?? (currentWaypoints.length > 0 ? currentWaypoints[0] : null);
    const effectiveDestination = destination ?? (currentWaypoints.length > 0 ? currentWaypoints[currentWaypoints.length - 1] : null);

    if (!effectiveOrigin || !effectiveDestination) {
      return;
    }

    const rerouteAsked = lastNonceRef.current !== rerouteNonce;
    lastNonceRef.current = rerouteNonce;
    const providerSwitched = lastProviderRef.current !== provider;
    lastProviderRef.current = provider;

    const targetKey = `${effectiveDestination.latitude},${effectiveDestination.longitude}|${waypointsKey}`;
    const routeKey = `${provider ?? ''}|${targetKey}`;
    // A switch of maps with the same stops: the road stays, only its drawing
    // changes. Anything else (new stops, first fix, a reroute) is a new route.
    const mapSwitchOnly = providerSwitched && !rerouteAsked && targetKeyRef.current === targetKey;
    const keep =
      mapSwitchOnly && resultRef.current.selection
        ? (resultRef.current.selection.chosen as RouteProvider)
        : undefined;
    targetKeyRef.current = targetKey;

    // Back on a map whose line for these stops is already held: show it,
    // ask nothing. Not after a reroute (the held line is the one the rider
    // left), and not for a line drawn before the rider had a fix.
    const held = routeCacheRef.current.get(routeKey);
    if (held && held.fetchOrigin && originRef.current && !rerouteAsked) {
      fetchOriginRef.current = held.fetchOrigin;
      distanceAtFetchRef.current = held.distanceAtFetch;
      offRouteFixesRef.current = 0;
      setResult({ ...held.result, isRerouting: false });
      return;
    }

    // The map has only been named after the line already on screen. The first
    // route is asked for with no map named and comes back drawn on, say,
    // OpenStreetMap; the Task tab then keeps OpenStreetMap and names it in
    // every request (config/mapChoice.ts). Asking again here would fetch the
    // very same road a second time, so the line on screen is the answer.
    const onScreen = resultRef.current;
    if (
      mapSwitchOnly &&
      provider &&
      (onScreen.selection?.drawnWith ?? onScreen.provider) === provider &&
      !onScreen.isFallback &&
      onScreen.coordinates &&
      fetchOriginRef.current
    ) {
      routeCacheRef.current.set(routeKey, {
        result: onScreen,
        fetchOrigin: fetchOriginRef.current,
        distanceAtFetch: distanceAtFetchRef.current,
      });
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let minInterval = providerSwitched ? PROVIDER_SWITCH_MIN_FETCH_MS : ROUTE_MIN_FETCH_INTERVAL_MS;
    // What is kept, request by request. Turns to the map's own engine once an
    // answer came back on the other engine's roads (see the options above).
    let keepFor = keep;

    const fetchRoute = () => {
      const liveRider = originRef.current;
      const liveOrigin = liveRider || (currentWaypoints.length > 0 ? currentWaypoints[0] : null);
      if (!liveOrigin) return;

      const liveWaypoints = liveRider ? currentWaypoints : currentWaypoints.slice(1);

      // A floor under the request rate, whatever asked for this one.
      //
      // Defer rather than drop: a rider who has left the route still gets a
      // new one, just not faster than the server's limiter allows.
      const sinceLastFetch = Date.now() - lastFetchAtRef.current;
      if (sinceLastFetch < minInterval) {
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(fetchRoute, minInterval - sinceLastFetch);
        return;
      }
      lastFetchAtRef.current = Date.now();
      const askedFrom = liveRider ? { latitude: liveRider.latitude, longitude: liveRider.longitude } : null;
      // Which way the rider is going, so the server starts the route on the
      // road they are riding rather than the nearest one, which at a junction
      // or between two parallel streets is often a different road.
      const motion = liveRider
        ? {
            headingDeg: liveRider.heading ?? null,
            speedMps: liveRider.speed ?? null,
            accuracyMeters: liveRider.accuracyMeters ?? null,
          }
        : undefined;

      setResult((prev) => ({ ...prev, isLoading: !prev.coordinates }));

      fetchDrivingRoute(liveOrigin, effectiveDestination, liveWaypoints, provider, choose, keepFor, motion).then((res) => {
        if (cancelled) return;

        if (res.ok && res.data.coordinates.length > 0) {
          const legsKnown = Boolean(liveRider) && currentWaypoints.length > 0;
          const mapped = mapDirectionsToRoute(res.data, { legsKnown });

          // Drawn on the other engine's roads. A straight-line guess
          // (degraded) follows no roads at all and is drawn dashed, so it may
          // stand on either map.
          const lineEngine = lineEngineOf(res.data);
          if (provider && !mapped.isFallback && lineEngine !== provider) {
            // A real road route all the same: held for its own engine's map,
            // so a move to that map shows it at once and asks nothing.
            if (lineEngine === 'osrm' || lineEngine === 'google') {
              routeCacheRef.current.set(`${lineEngine}|${targetKey}`, {
                result: { ...EMPTY_RESULT, ...mapped },
                fetchOrigin: askedFrom,
                distanceAtFetch: askedFrom ? projectOntoPath(askedFrom, mapped.roadCoordinates)?.distanceMeters ?? null : null,
              });
            }

            if (keepFor !== provider) {
              // Ask once more for this map's engine alone. The server has
              // just routed with it for the comparison and caches that, so
              // this usually costs it no new engine request.
              keepFor = provider;
              minInterval = PROVIDER_SWITCH_MIN_FETCH_MS;
              fetchRoute();
              return;
            }

            // This map's engine has no route of its own: keep the last line
            // drawn on it for these stops, else a dashed guess, never the
            // other engine's line. Retried with the usual backoff.
            setResult((prev) =>
              prev.coordinates && !prev.isFallback && lineEngineOf(prev) === provider
                ?{ ...prev, isLoading: false, isStale: true, isRerouting: false, lastFailure: 'server', unroutable: provider }
                : { ...buildFallbackRoute(originRef.current, destination, currentWaypoints, 'server'), unroutable: provider }
            );
            failuresRef.current += 1;
            const delay = nextRetryDelayMs('server', failuresRef.current);
            if (retryTimer) clearTimeout(retryTimer);
            retryTimer = delay === null ? null : setTimeout(fetchRoute, delay);
            return;
          }

          failuresRef.current = 0;
          // A retry scheduled by an earlier failure would otherwise still fire
          // after this success, spending a request nothing was waiting for.
          if (retryTimer) {
            clearTimeout(retryTimer);
            retryTimer = null;
          }

          // The baseline the reroute rule compares against. A rider inside a
          // store starts some way off the road; that distance is theirs, not a
          // deviation.
          fetchOriginRef.current = askedFrom;
          offRouteFixesRef.current = 0;
          const projection = askedFrom ? projectOntoPath(askedFrom, mapped.roadCoordinates) : null;
          distanceAtFetchRef.current = projection ? projection.distanceMeters : null;

          const fresh: LiveRouteResult = {
            ...mapped,
            isLoading: false,
            isStale: false,
            isRerouting: false,
            lastFailure: null,
            unroutable: null,
          };
          setResult(fresh);

          // Road routes only: a straight-line guess is never worth keeping.
          if (!mapped.isFallback) {
            const cache = routeCacheRef.current;
            // A new route makes the other map's held copy a different road:
            // forget it, so switching maps can never bring back an old path.
            if (!mapSwitchOnly) cache.clear();
            cache.delete(routeKey);
            cache.set(routeKey, {
              result: fresh,
              fetchOrigin: askedFrom,
              distanceAtFetch: distanceAtFetchRef.current,
            });
            while (cache.size > ROUTE_CACHE_SIZE) {
              const oldest = cache.keys().next().value;
              if (oldest === undefined) break;
              cache.delete(oldest);
            }
          }
          return;
        }

        // The fetch failed. Keep a previous ROAD route rather than replacing it
        // with a guess; replace a previous guess with one drawn from where the
        // rider is now.
        const reason: RouteFailureReason = res.ok ? 'server' : res.reason;
        setResult((prev) =>
          prev.coordinates && !prev.isFallback
            ? { ...prev, isLoading: false, isStale: true, isRerouting: false, lastFailure: reason }
            : buildFallbackRoute(originRef.current, destination, currentWaypoints, reason)
        );

        failuresRef.current += 1;
        const delay = nextRetryDelayMs(reason, failuresRef.current);
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = delay === null ? null : setTimeout(fetchRoute, delay);
      });
    };

    fetchRoute();
    // A straight-line guess (the server answered from its haversine fallback)
    // is replaced as soon as a road route can be had. A road route is left
    // alone.
    const fallbackTimer = setInterval(() => {
      if (isFallbackRef.current) fetchRoute();
    }, FALLBACK_RETRY_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(fallbackTimer);
      if (retryTimer) clearTimeout(retryTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination?.latitude, destination?.longitude, waypointsKey, hasOrigin, rerouteNonce, provider]);

  // Watches each fix for the rider leaving the route. See reroutePolicy.ts for
  // why "off the line" alone is not enough.
  useEffect(() => {
    if (!origin || result.isFallback || result.isRerouting) return;
    const line = result.roadCoordinates;
    if (!line || line.length < 2) return;

    const projection = projectOntoPath(origin, line);
    const from = fetchOriginRef.current;
    const verdict = evaluateDeviation({
      distanceFromRoute: projection ? projection.distanceMeters : null,
      distanceFromRouteAtFetch: distanceAtFetchRef.current,
      // A route first drawn before any fix (store to customer) has no origin
      // to measure from, so any movement counts.
      travelledSinceFetch: from ? metresBetween(from, origin) : Number.POSITIVE_INFINITY,
      offRouteFixes: offRouteFixesRef.current,
      accuracyMeters: origin.accuracyMeters ?? null,
    });
    offRouteFixesRef.current = verdict.offRouteFixes;

    if (verdict.reroute) {
      setResult((prev) => ({ ...prev, isRerouting: true }));
      setRerouteNonce((n) => n + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin?.latitude, origin?.longitude, result.roadCoordinates, result.isFallback, result.isRerouting]);

  return result;
}
