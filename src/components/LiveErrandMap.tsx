import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Circle, Marker, Polyline, PROVIDER_GOOGLE, UrlTile } from 'react-native-maps';
import { Clock, Navigation, Maximize2, MapPin, LocateFixed, ChevronLeft } from 'lucide-react-native';
import { Colors, BorderRadius, FontSizes, FontWeights, FontFamily, Spacing, Elevation } from '../config/theme';
import { MapCoordinate, toRegion } from '../utils/coords';
import GlidingRiderMarker, { GLIDE_MS } from './GlidingRiderMarker';
import {
  cumulativeLengths,
  followRouteProgress,
  metresBetween,
  pathFromDistance,
  type RouteProgress,
} from '../utils/routeGeometry';
import {
  followCameraDurationMs,
  lineTrailMeters,
  markerSnapMeters,
  navigationCamera,
  navigationTopPadding,
  steadyNavigationZoom,
  headingDelta,
  HEADING_DEADBAND_DEG,
} from '../utils/navigationCamera';
import type { ErrandPinpoint } from '../types/rider';
import type { RoutePhase } from '../services/routePhase';
import type { RouteStep } from '../services/directionsService';
import { haversineDistanceKm } from '../utils/geo';
import { TurnByTurnHUD } from './TurnByTurnHUD';
import { useTurnByTurnNavigation } from '../hooks/useTurnByTurnNavigation';
import { useDeviceHeading } from '../hooks/useDeviceHeading';
import { chooseMapHeading, type MapHeadingChoice } from '../utils/compass';
import { CompassButton } from './CompassButton';
import {
  OSM_ATTRIBUTION,
  OSM_MAX_NATIVE_ZOOM,
  OSM_MAX_ZOOM,
  OSM_TILE_CACHE_MAX_AGE_SECONDS,
  OSM_TILE_CACHE_PATH,
  OSM_TILE_URL,
} from '../config/mapTiles';

/** Fallback center for Tacurong City when coordinates are uninitialized */
const DEFAULT_CENTER: MapCoordinate = {
  latitude: 6.6975,
  longitude: 124.6750,
};

/** For a stop the server sent no radius for. Mirrors the server's default. */
const DEFAULT_ARRIVAL_RADIUS_METERS = 75;

/**
 * The dashed links: rider to the road, and road to the pin. Shorter than this
 * is GPS scatter, not a walk. Longer than MAX_LINK_METERS the rider is nowhere
 * near this route, and a dashed line across town would only mislead.
 */
const MIN_LINK_METERS = 8;
const MAX_LINK_METERS = 1500;

/** Formats seconds into "X min" or "X hr Y min". */
function formatDuration(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}

/** Formats meters into "X.X km" or "X m". */
function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

export interface LiveErrandMapProps {
  riderLocation: (MapCoordinate & { speed?: number | null; heading?: number | null }) | null;
  destination: MapCoordinate | null;
  pinpoints: ErrandPinpoint[];
  /** Full overview polyline — shown as fallback when leg arrays are unavailable. */
  routeCoordinates: MapCoordinate[] | null;
  /** The run out to the next outstanding store. Drawn orange-yellow while shopping. */
  pickupLegCoordinates?: MapCoordinate[] | null;
  /** The run in to the customer. Drawn in brand pink-red once items are bought. */
  deliveryLegCoordinates?: MapCoordinate[] | null;
  /** Turn-by-turn navigation steps. */
  steps?: RouteStep[];
  /** ETA data for floating badge — rendered when both values are non-null. */
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  /** Current store or stop name for target pill. */
  targetStoreName?: string;
  /**
   * Which half of the errand this is, and therefore which line is active.
   * See services/routePhase.ts.
   */
  phase?: RoutePhase;
  /**
   * True when the line is straight segments between points rather than a road route.
   */
  isFallback?: boolean;
  /**
   * The pin the active line is heading for: the store, or the customer. The
   * route ends where the road is nearest to it, and a store usually sits back
   * from the road, so a dashed link covers the last stretch on foot.
   */
  targetCoordinate?: MapCoordinate | null;
  /**
   * How much of the bottom of the map is covered (the errand sheet), in dp.
   * The navigation camera keeps the rider above it.
   */
  bottomInset?: number;
  /**
   * How much of the top is covered by floating layers (the back bar, the
   * navigation panel, the fee capsules), in dp. The whole-route view is fitted
   * below it, and the chase camera places the rider below it too, so on a tall
   * phone neither the route nor the rider ends up behind the panel.
   */
  topInset?: number;
  /** True while a new route is being fetched because the rider left the old one. */
  isRerouting?: boolean;
  /**
   * Whose route won on ETA (then distance) when both engines were compared:
   * 'osrm' or 'google'. Shown on the ETA badge so the rider knows the line is
   * the faster of the two. Null when no comparison was made.
   */
  routeChosenBy?: string | null;
  /**
   * Which map to draw under the line, decided by the server rather than the
   * rider: the map of the engine whose route won, so the line and the roads
   * beneath it come from the same data (see TaskScreen). 'osm' needs our tile
   * server; TaskScreen only passes it while the tiles are loading.
   *
   * Null while the server has not said yet: no map is drawn until it has, and
   * the one drawn is then kept (config/mapChoice.ts). The native map is created
   * with this type and never switched, because a Huawei phone's Petal map
   * ignores being switched to 'none' and stays drawn under OpenStreetMap.
   */
  mapStyle?: 'google' | 'osm' | null;
  /**
   * Whether floating navigation map controls, ETA badge, and attribution are visible.
   * Defaults to true; hidden when errand sheet is expanded to eliminate collisions.
   */
  controlsVisible?: boolean;
  /**
   * Whether the turn-by-turn panel ("In 170 m, turn right") is drawn. False
   * while the Task tab shows an errand's task in full, which the panel would
   * otherwise sit on top of. Navigation keeps running underneath, so the panel
   * comes back on the right step.
   */
  directionsVisible?: boolean;
  /**
   * Whether the map is on screen. The Task tab stays mounted behind the other
   * tabs, and the compass is only read while this is true.
   */
  active?: boolean;
  /**
   * Where the turn-by-turn panel ends, in dp from the top of the map, or 0
   * when there is none. The Task tab stacks the fee capsules and banners below
   * it instead of at a fixed offset the panel outgrows when it adds a line.
   */
  onHudLayout?: (bottom: number) => void;
}

/** How long the camera takes to follow a turn of the phone: quick, but not a jolt. */
const COMPASS_CAMERA_MS = 300;

/** Every base map feature hidden, roads and labels included: OpenStreetMap only. */
const BLANK_BASE_MAP_STYLE = [{ stylers: [{ visibility: 'off' }] }];

/** How the camera is framed: 3D Third-Person Chase, 2D Flat Plane, or Full Route Overview. */
export type MapCameraMode = '3d' | '2d' | 'overview';

/** A lean like Google Maps navigation: the road runs away up the screen. */
const CHASE_3D_PITCH = 60;

const PLANE_2D_ZOOM = 16.5;
const PLANE_2D_PITCH = 0;

// Full-screen, always-inline live map — deliberately rendered outside any
// ScrollView/FlatList per the project's "MapView never inside a ScrollView" rule.
export function LiveErrandMap({
  riderLocation,
  destination,
  pinpoints,
  routeCoordinates,
  pickupLegCoordinates,
  deliveryLegCoordinates,
  steps = [],
  distanceMeters,
  durationSeconds,
  targetStoreName,
  phase = 'shopping',
  isFallback = false,
  targetCoordinate = null,
  bottomInset = 0,
  topInset = 0,
  isRerouting = false,
  routeChosenBy = null,
  mapStyle = 'google',
  controlsVisible = true,
  directionsVisible = true,
  active = true,
  onHudLayout,
}: LiveErrandMapProps) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const effectiveBottomInset = Math.max(bottomInset ?? 0, insets.bottom);

  // Defaults to 3D Third-Person Perspective for immersive Grab/Google Maps navigation.
  const [cameraMode, setCameraMode] = useState<MapCameraMode>('3d');
  // False once the rider drags the map: the camera stops chasing them so they
  // can look around, and a Re-center button brings it back. It used to keep
  // snapping back on every fix, a second after each drag.
  const [following, setFollowing] = useState(true);
  const [mapHeight, setMapHeight] = useState(0);
  // Whether the native Google map exists yet. See the MapView props below.
  // Held as the style that reported ready, so a map created afresh for another
  // style (only ever a dead tile server, see mapChoice) starts not ready.
  const [readyStyle, setReadyStyle] = useState<'google' | 'osm' | null>(null);
  const mapReady = mapStyle != null && readyStyle === mapStyle;

  const showOsm = mapStyle === 'osm';

  const firstDrawable = (...candidates: (MapCoordinate[] | null | undefined)[]) =>
    candidates.find((line) => (line?.length ?? 0) > 1) ?? [];

  const activeRouteLine =
    phase === 'delivering'
      ? firstDrawable(deliveryLegCoordinates, routeCoordinates, pickupLegCoordinates)
      : firstDrawable(pickupLegCoordinates, routeCoordinates);

  // Active leg colors (Orange-Yellow for Store runs, Pink-Red for Customer delivery)
  const activeRouteColor = phase === 'delivering' ? Colors.routeToCustomer : Colors.routeToStore;

  // Turn-by-Turn Navigation State
  const maneuverState = useTurnByTurnNavigation(riderLocation, steps, activeRouteLine);

  // Where the rider is along the line, once per fix, carried forward from the
  // last fix (routeGeometry.followRouteProgress): searched near where they
  // were, and never stepped backwards by a few metres of GPS scatter. Shared
  // by the trimming, the dashed link, the dot and the camera so all four agree.
  const routeCumulative = useMemo(() => cumulativeLengths(activeRouteLine), [activeRouteLine]);
  const progressRef = useRef<{ line: MapCoordinate[] | null; progress: RouteProgress | null }>({
    line: null,
    progress: null,
  });
  const routeProgress = useMemo(() => {
    if (!riderLocation || activeRouteLine.length < 2) return null;
    // A new route starts from nothing: progress along the old one means nothing on it.
    const previous = progressRef.current.line === activeRouteLine ? progressRef.current.progress : null;
    const next = followRouteProgress(riderLocation, activeRouteLine, routeCumulative, previous);
    progressRef.current = { line: activeRouteLine, progress: next };
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riderLocation?.latitude, riderLocation?.longitude, activeRouteLine, routeCumulative]);
  const riderProjection = routeProgress?.projection ?? null;

  const riderOffRoad =
    riderProjection != null && riderProjection.distanceMeters > markerSnapMeters(riderLocation?.speed);

  // Only the road still ahead, cut a little behind the rider so the dot, which
  // glides a second behind each fix, always sits on its own line
  // (navigationCamera.lineTrailMeters). Off the road the cut is exactly where
  // they will join it, which is where the dashed link below meets the line.
  // Rounded to 2 m steps so the polyline is not re-sent to the native map for
  // centimetres.
  const farFromLine = riderProjection == null || riderProjection.distanceMeters > 60;
  const trimAtMeters =
    routeProgress && !farFromLine
      ? Math.max(
          0,
          Math.floor((routeProgress.alongMeters - (riderOffRoad ? 0 : lineTrailMeters(riderLocation?.speed))) / 2) * 2
        )
      : 0;
  const drawnActiveLine = useMemo(() => {
    if (activeRouteLine.length < 2 || isFallback || farFromLine) return activeRouteLine;
    return pathFromDistance(activeRouteLine, routeCumulative, trimAtMeters);
  }, [activeRouteLine, routeCumulative, isFallback, farFromLine, trimAtMeters]);

  // The dot is drawn at the same steadied point on the road the line is cut
  // from, whenever it is close enough to the road to be drawn on it at all.
  const markerTarget = useMemo(() => {
    if (!riderLocation) return null;
    if (isFallback || !riderProjection || riderOffRoad) return riderLocation;
    return { ...riderLocation, ...riderProjection.point };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riderLocation, isFallback, riderProjection?.point.latitude, riderProjection?.point.longitude, riderOffRoad]);

  // The line is drawn only along roads. Where the rider is not on it (inside a
  // store, a parking lot, a yard), a dashed link joins where they are to where
  // it starts: the way out to the road. The marker is drawn on the road
  // whenever it is within markerSnapMeters, so the link appears exactly when
  // the dot sits off the line.
  const lineStart = drawnActiveLine.length > 1 ? drawnActiveLine[0] : null;
  const startLinkGap = riderLocation && lineStart ? metresBetween(riderLocation, lineStart) : 0;
  const showStartLink =
    !isFallback && riderOffRoad && startLinkGap >= MIN_LINK_METERS && startLinkGap <= MAX_LINK_METERS;

  // And from where the road ends to the pin itself.
  const lineEnd = drawnActiveLine.length > 1 ? drawnActiveLine[drawnActiveLine.length - 1] : null;
  const endLinkGap = lineEnd && targetCoordinate ? metresBetween(lineEnd, targetCoordinate) : 0;
  const showEndLink = !isFallback && endLinkGap >= MIN_LINK_METERS && endLinkGap <= MAX_LINK_METERS;

  const fitAllPoints = useCallback(() => {
    const points = [
      ...(destination ? [destination] : []),
      ...(riderLocation ? [riderLocation] : []),
      ...pinpoints,
      ...(routeCoordinates ?? []),
    ];
    if (points.length < 2) return;
    // A margin only. On Android react-native-maps adds edgePadding to the map
    // padding (MapView.appendMapPadding), which already keeps the fit clear of
    // the sheet below and, now, of the floating layers above. The top used to
    // be a fixed 140 dp over no map padding at all, while the back bar, the
    // navigation panel and the fee capsules reach 230 dp or more: the far end
    // of the route was fitted underneath them.
    mapRef.current?.fitToCoordinates(points, {
      edgePadding: { top: 32, right: 40, bottom: 32, left: 40 },
      animated: true,
    });
  }, [destination, pinpoints, routeCoordinates]);

  // Re-frame only when overview mode is active and route changes.
  useEffect(() => {
    if (cameraMode === 'overview') {
      fitAllPoints();
    }
  }, [cameraMode, fitAllPoints]);

  // Camera tracking engine for 3D Third-Person and 2D Plane
  const headingRef = useRef(0);
  // The chase zoom, held inside its speed band (navigationCamera.steadyNavigationZoom).
  const zoomRef = useRef<number | null>(null);

  // Where the camera looks and which way the road runs, once per fix. Shared
  // with the rider's arrow, so the arrow and the map always agree.
  const camera = useMemo(
    () =>
      riderLocation
        ? navigationCamera(riderLocation, isFallback ? null : activeRouteLine, isFallback ? null : riderProjection)
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [riderLocation?.latitude, riderLocation?.longitude, riderLocation?.speed, riderLocation?.heading, activeRouteLine, isFallback, riderProjection]
  );

  // The arrow faces forward along the route line: the road ahead while on it,
  // the road they will join while standing off it. The last good heading is
  // kept rather than dropping back to north when a fix gives none.
  const arrowHeadingRef = useRef<number | null>(null);
  if (camera?.heading != null) arrowHeadingRef.current = camera.heading;
  const roadHeading = arrowHeadingRef.current ?? riderLocation?.heading ?? null;

  // The phone's compass (hooks/useDeviceHeading), read only while this map is
  // on screen and not in the whole-route overview. Stopped or walking, the map
  // and the rider's arrow turn with the phone, as in Google Maps; riding, they
  // follow the road, which a magnetometer beside an engine cannot be trusted
  // to do (utils/compass.chooseMapHeading).
  const device = useDeviceHeading(active && cameraMode !== 'overview');
  const ridingRef = useRef(false);
  const headingChoice: MapHeadingChoice = chooseMapHeading({
    speedMps: riderLocation?.speed,
    roadHeading,
    compassHeading: device.heading,
    compassAccuracy: device.accuracy,
    wasRiding: ridingRef.current,
  });
  ridingRef.current = headingChoice.riding;
  const headingChoiceRef = useRef(headingChoice);
  headingChoiceRef.current = headingChoice;
  const arrowHeading = headingChoice.source === 'compass' ? headingChoice.heading : roadHeading;

  // Which way the map itself is turned, for the compass rose.
  const [mapBearing, setMapBearing] = useState(0);
  const noteBearing = useCallback((bearing: number) => {
    setMapBearing((prev) => (Math.abs(prev - bearing) < 1 ? prev : bearing));
  }, []);

  // Zero means at once: setCamera, not animateCamera, whose JS side turns a
  // zero duration into its 500 ms default (react-native-maps MapView.tsx).
  const placeCamera = useCallback(
    (target: { center: MapCoordinate; heading: number; pitch: number; zoom: number }, durationMs: number) => {
      if (durationMs <= 0) mapRef.current?.setCamera(target);
      else mapRef.current?.animateCamera(target, { duration: durationMs });
    },
    []
  );

  // True when a move was sent: not before the first fix, nor in the overview.
  const moveCamera = useCallback(
    (immediate = false, durationMs?: number): boolean => {
      if (!riderLocation || !camera) return false;

      if (cameraMode === '3d') {
        // Like Google Maps navigation: the road ahead points up the screen, the
        // rider sits low with the route running away in front of them, and the
        // view widens with speed. The glide duration matches the rider marker's,
        // so dot and map move together.
        //
        // Re-center (immediate) takes the road's heading exactly. Following,
        // small changes are ignored so the map does not shiver.
        // The heading is the road's while riding and the phone's while
        // stopped (headingChoice above).
        const target = headingChoiceRef.current.heading;
        if (immediate) {
          headingRef.current = target ?? arrowHeadingRef.current ?? headingRef.current;
        } else if (target != null) {
          const delta = headingDelta(headingRef.current, target);
          if (Math.abs(delta) >= HEADING_DEADBAND_DEG) {
            // Continuous angle unwrapping: prevents 360-degree reverse spin across North
            headingRef.current = headingRef.current + delta;
          }
        }
        zoomRef.current = steadyNavigationZoom(zoomRef.current, riderLocation.speed);
        placeCamera(
          {
            center: camera.center,
            heading: headingRef.current,
            pitch: CHASE_3D_PITCH,
            zoom: zoomRef.current,
          },
          // Following, each move spans the dot's own glide, so a turn is one
          // continuous swing rather than a 400 ms jerk then a pause every fix.
          durationMs ?? (immediate ? 400 : followCameraDurationMs(GLIDE_MS, headingChoiceRef.current.source))
        );
        noteBearing(headingRef.current);
        return true;
      } else if (cameraMode === '2d') {
        // 2D Plane: Flat top-down, North-up
        placeCamera(
          {
            center: camera.center,
            heading: 0,
            pitch: PLANE_2D_PITCH,
            zoom: PLANE_2D_ZOOM,
          },
          durationMs ?? (immediate ? 500 : GLIDE_MS)
        );
        noteBearing(0);
        return true;
      }
      return false;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [camera, riderLocation?.speed, cameraMode, noteBearing, placeCamera]
  );

  // The camera centres its target in whatever the padding leaves, so padding
  // the top puts the rider low on screen with the road ahead above them. The
  // bottom is always padded by the sheet, which covers that part of the map.
  //
  // 2D and the whole-route view pad the top by what floats over it, so the
  // rider is centred in the map that is actually visible and the fitted route
  // is not drawn underneath the navigation panel and the fee capsules.
  const mapPadding = useMemo(
    () => ({
      top: cameraMode === '3d' ? navigationTopPadding(mapHeight, bottomInset, topInset) : topInset,
      right: 0,
      bottom: bottomInset,
      left: 0,
    }),
    [cameraMode, mapHeight, bottomInset, topInset]
  );

  // mapReady included so the camera takes up its position, with the padding,
  // the moment the map exists rather than at the next fix.
  //
  // And put there instantly, not animated, the first time and whenever its
  // padding has changed since. On Android, react-native-maps applies a padding
  // change by re-setting the camera where it stands
  // (MapView.applyBaseMapPadding: map.moveCamera), and that cancels any
  // animation in flight. The padding arrives with the ready map, again as the
  // sheet and the directions panel are measured, and on every switch between
  // 3D and 2D, each time beside an animated camera move. When the padding
  // landed second, the 3D tilt stopped a few degrees in: the map stayed flat,
  // north up, until the next GPS fix moved it, and for a rider standing still
  // none did. Which lands first is the phone's timing, which fits 3D showing
  // on one phone and not another with the same account. A camera set
  // instantly is already in place whichever comes first, and re-setting it
  // for the padding keeps its tilt and heading.
  const paddingKey = `${mapPadding.top}|${mapPadding.bottom}`;
  const lastModeRef = useRef(cameraMode);
  const placedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!mapReady) {
      // A map created afresh (another style) must be placed again.
      placedRef.current = null;
      return;
    }
    if (!following) return;
    // Switching into a mode snaps straight to it; after that the camera glides
    // with each fix.
    const modeChanged = lastModeRef.current !== cameraMode;
    lastModeRef.current = cameraMode;
    if (placedRef.current !== paddingKey) {
      if (moveCamera(true, 0)) placedRef.current = paddingKey;
    } else {
      moveCamera(modeChanged);
    }
  }, [moveCamera, following, mapReady, cameraMode, paddingKey]);

  // Between GPS fixes, turning the phone turns the map. Keyed on 3-degree
  // steps so a hand's tremor does not animate the camera.
  const compassKey =
    headingChoice.source === 'compass' && headingChoice.heading != null ? Math.round(headingChoice.heading / 3) : null;
  useEffect(() => {
    if (!following || !mapReady || cameraMode !== '3d' || compassKey === null) return;
    moveCamera(false, COMPASS_CAMERA_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compassKey]);

  // The panel's bottom edge, for the Task tab's stacking. 0 without a panel.
  const hasHud = steps.length > 0;
  useEffect(() => {
    if (!hasHud) onHudLayout?.(0);
  }, [hasHud, onHudLayout]);

  const select3DMode = useCallback(() => {
    setCameraMode('3d');
    setFollowing(true);
  }, []);

  const select2DMode = useCallback(() => {
    setCameraMode('2d');
    setFollowing(true);
  }, []);

  const selectOverviewMode = useCallback(() => {
    setCameraMode('overview');
    mapRef.current?.animateCamera({ heading: 0, pitch: 0 }, { duration: 400 });
    noteBearing(0);
  }, [noteBearing]);

  // Collapsible camera mode state & leftward slide animation
  const [modesExpanded, setModesExpanded] = useState(false);
  const modeSlideAnim = useRef(new Animated.Value(0)).current;

  const toggleModes = useCallback(() => {
    const next = !modesExpanded;
    setModesExpanded(next);
    Animated.spring(modeSlideAnim, {
      toValue: next ? 1 : 0,
      friction: 8,
      tension: 60,
      useNativeDriver: false,
    }).start();
  }, [modesExpanded, modeSlideAnim]);

  const handleSelectMode = useCallback(
    (mode: MapCameraMode) => {
      if (mode === '3d') select3DMode();
      else if (mode === '2d') select2DMode();
      else if (mode === 'overview') selectOverviewMode();

      setModesExpanded(false);
      Animated.timing(modeSlideAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: false,
      }).start();
    },
    [select3DMode, select2DMode, selectOverviewMode, modeSlideAnim]
  );

  // The compass: heading up (3D, turning with the rider) or north up (2D).
  const toggleOrientation = useCallback(() => {
    if (cameraMode === '3d') {
      setCameraMode('2d');
    } else {
      setCameraMode('3d');
    }
    setFollowing(true);
  }, [cameraMode]);

  const recenter = useCallback(() => {
    setFollowing(true);
    moveCamera(true);
  }, [moveCamera]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setMapHeight(event.nativeEvent.layout.height);
  }, []);

  // Counted down on the phone as the rider moves along a route that is no
  // longer re-fetched just to refresh it. The server's figures are the
  // fallback before the first fix, and for a straight-line guess.
  const liveEta =
    !isFallback && steps.length > 0 && riderLocation && maneuverState.totalRemainingSeconds != null
      ? { seconds: maneuverState.totalRemainingSeconds, meters: maneuverState.totalRemainingMeters }
      : distanceMeters != null && durationSeconds != null
        ? { seconds: durationSeconds, meters: distanceMeters }
        : null;

  const initialCenter = destination || riderLocation || pinpoints[0] || DEFAULT_CENTER;
  const targetLabel = phase === 'delivering' ? 'Customer' : targetStoreName || 'Store';

  return (
    <View style={styles.wrapper} onLayout={onLayout}>
      {/* Top Floating Grab/Google Maps-Style Navigation HUD. "Recalculating"
          means a new route is actually on its way, nothing else: a rider
          standing in a store off the road is not recalculating. */}
      {steps.length > 0 && directionsVisible && (
        <TurnByTurnHUD
          maneuver={{ ...maneuverState, isOffRoute: isRerouting }}
          phase={phase}
          targetName={targetLabel}
          onLayout={(event) => onHudLayout?.(event.nativeEvent.layout.y + event.nativeEvent.layout.height)}
        />
      )}

      {mapStyle == null ? (
        // The server has not said which map yet. A plain surface, not a
        // default map: whatever was drawn here would be the wrong one half the
        // time, and switching it is what left Petal under OpenStreetMap.
        <View
          style={[StyleSheet.absoluteFill, styles.mapPending]}
          testID="map-pending"
          accessible
          accessibilityLabel="Loading the map"
        >
          <MapPin size={22} color={Colors.textLight} />
          <Text style={styles.mapPendingText} maxFontSizeMultiplier={1.2}>
            Loading the map
          </Text>
        </View>
      ) : (
      <MapView
        // One native map per base map, never switched in place. The key only
        // changes if a chosen OpenStreetMap loses its tile server, and then a
        // new map is created rather than the old one asked to change.
        key={mapStyle}
        ref={mapRef}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        googleRenderer={Platform.OS === 'android' ? 'LATEST' : undefined}
        style={StyleSheet.absoluteFill}
        initialRegion={toRegion(initialCenter)}
        // On the first render, so the native map is CREATED with it
        // (react-native-maps passes it into GoogleMapOptions on Android) and
        // no other base map is ever drawn in it. It used to be set only after
        // onMapReady, i.e. after a standard map had already drawn: Google
        // drops its base map when told to, but a Huawei phone's Petal map did
        // not, and stayed drawn under the OpenStreetMap tiles.
        //
        // The setter react-native-maps also calls with it before ready is a
        // no-op there (map is still null), not a crash.
        mapType={showOsm ? 'none' : 'standard'}
        // Belt and braces for a map that does not honour 'none': every base
        // map feature switched off. Stored by react-native-maps and applied on
        // ready, so it is safe from the first render too.
        customMapStyle={showOsm ? BLANK_BASE_MAP_STYLE : undefined}
        onMapReady={() => setReadyStyle(mapStyle)}
        // Withheld until the native map exists, and this is not optional.
        //
        // react-native-maps (1.27, new architecture) forwards it to Android at
        // once, ready or not. Its padding setter then calls map.setPadding()
        // and map.getCameraPosition() on a GoogleMap that is still null, and
        // the app dies with a native NullPointerException the moment the Task
        // tab opens (MapView.applyBaseMapPadding / updateExtraData).
        {...(mapReady ? { mapPadding } : {})}
        onPanDrag={() => {
          // The rider is looking around. Stop chasing them until they ask.
          if (cameraMode !== 'overview') setFollowing(false);
        }}
        onRegionChangeComplete={() => {
          // A two-finger twist turns the map without the camera code knowing:
          // read the heading back so the compass rose stays true.
          if (following && cameraMode !== 'overview') return;
          mapRef.current
            ?.getCamera()
            .then((cam) => noteBearing(typeof cam?.heading === 'number' ? cam.heading : 0))
            .catch(() => {});
        }}
      >
        {showOsm && (
          <UrlTile
            urlTemplate={OSM_TILE_URL}
            maximumZ={OSM_MAX_ZOOM}
            maximumNativeZ={OSM_MAX_NATIVE_ZOOM}
            tileCachePath={OSM_TILE_CACHE_PATH ?? undefined}
            tileCacheMaxAge={OSM_TILE_CACHE_MAX_AGE_SECONDS}
            shouldReplaceMapContent
            zIndex={-1}
            testID="osm-tiles"
          />
        )}

        {/* Customer Delivery Address Marker & Arrival Radius */}
        {destination && (
          <>
            <Circle
              center={destination}
              radius={DEFAULT_ARRIVAL_RADIUS_METERS}
              strokeWidth={phase === 'delivering' ? 2.5 : 1.5}
              strokeColor={phase === 'delivering' ? 'rgba(2,132,199,0.85)' : 'rgba(2,132,199,0.35)'}
              fillColor={phase === 'delivering' ? 'rgba(2,132,199,0.18)' : 'rgba(2,132,199,0.06)'}
            />
            <Marker coordinate={destination} title="Customer Delivery Address">
              <View style={[styles.pinBadge, styles.customerPinBadge]}>
                <MapPin size={13} color={Colors.textWhite} strokeWidth={2.5} />
              </View>
            </Marker>
          </>
        )}

        {/* Store Arrival Geofence Radii */}
        {pinpoints.map((pin, idx) => {
          const radius = pin.geofenceRadiusMeters ?? DEFAULT_ARRIVAL_RADIUS_METERS;
          const inside =
            riderLocation != null && haversineDistanceKm(riderLocation, pin) * 1000 <= radius;

          return (
            <Circle
              key={`radius-${pin.id ?? idx}`}
              center={pin}
              radius={radius}
              strokeWidth={inside ? 2.5 : 1.5}
              strokeColor={inside ? 'rgba(5,150,105,0.85)' : 'rgba(245,158,11,0.55)'}
              fillColor={inside ? 'rgba(5,150,105,0.18)' : 'rgba(245,158,11,0.10)'}
            />
          );
        })}

        {/* Store Pinpoint Badges (Yellow-Gold) */}
        {pinpoints.map((pin, idx) => (
          <Marker key={pin.id} coordinate={pin} title={`Store #${idx + 1}: ${pin.storeName}`}>
            <View style={[styles.pinBadge, { backgroundColor: Colors.routeToStore }]}>
              <Text style={styles.pinBadgeText}>{idx + 1}</Text>
            </View>
          </Marker>
        ))}

        {/* Active Route Leg Only (Double-Stroke Casing: Dark Outer + Vibrant Core) */}
        {drawnActiveLine.length > 1 && (
          <>
            {/* Outer Casing */}
            {!isFallback && (
              <Polyline
                coordinates={drawnActiveLine}
                strokeColor="rgba(15, 23, 42, 0.40)"
                strokeWidth={8}
                lineCap="round"
                lineJoin="round"
              />
            )}
            {/* Vibrant Core (Yellow-Gold for Stores, Blue-Light for Customer) */}
            <Polyline
              coordinates={drawnActiveLine}
              strokeColor={activeRouteColor}
              strokeWidth={5}
              lineDashPattern={isFallback ? [10, 8] : undefined}
              lineCap="round"
              lineJoin="round"
              testID={phase === 'delivering' ? 'route-line-delivering' : 'route-line-shopping'}
            />
          </>
        )}

        {/* Off the road: the way out to the line, and from the line to the pin. */}
        {showStartLink && riderLocation && lineStart && (
          <Polyline
            coordinates={[riderLocation, lineStart]}
            strokeColor={activeRouteColor}
            strokeWidth={4}
            lineDashPattern={[2, 8]}
            lineCap="round"
            testID="route-link-start"
          />
        )}
        {showEndLink && lineEnd && targetCoordinate && (
          <Polyline
            coordinates={[lineEnd, targetCoordinate]}
            strokeColor={activeRouteColor}
            strokeWidth={4}
            lineDashPattern={[2, 8]}
            lineCap="round"
            testID="route-link-end"
          />
        )}

        {/* Smooth Gliding Rider Pin with Heading Rotation */}
        <GlidingRiderMarker
          target={markerTarget}
          route={isFallback ? null : activeRouteLine}
          headingDeg={arrowHeading}
          speedMps={riderLocation?.speed ?? null}
        />
      </MapView>
      )}

      {/* The OpenStreetMap licence requires this wherever its map is shown. */}
      {showOsm && controlsVisible && (
        <Text
          style={[styles.attribution, { bottom: effectiveBottomInset + 4, left: 8 }]}
          maxFontSizeMultiplier={1}
          pointerEvents="none"
        >
          {OSM_ATTRIBUTION}
        </Text>
      )}

      {/* Floating ETA Badge (Positioned safely at bottom-left above sheet and OSM label) */}
      {liveEta && controlsVisible && (
        <View
          style={[styles.bottomEtaBadge, { bottom: showOsm ? effectiveBottomInset + 22 : effectiveBottomInset + 14 }]}
          testID="eta-badge"
          pointerEvents="box-none"
        >
          <Clock size={12} color={Colors.textWhite} />
          <Text style={styles.bottomEtaText} maxFontSizeMultiplier={1.15}>
            {/* Marked approximate when the line is. On a degraded route these
                numbers are not measured along any road — they are a straight-line
                distance multiplied by a detour factor and divided by an assumed
                average speed. Reading as precisely as a real ETA is the same
                overstatement the dashed line exists to correct. */}
            {isFallback ? '~' : ''}
            {formatDuration(liveEta.seconds)} • {formatDistance(liveEta.meters)}
            {!isFallback && routeChosenBy ? ` · via ${routeChosenBy === 'google' ? 'Google' : 'OSM'}` : ''}
          </Text>
        </View>
      )}

      {/* Floating Camera Perspective Controls (3D Chase / 2D Plane / Fit Overview) */}
      {controlsVisible && (
        <View
          style={[styles.cameraControlsContainer, { bottom: effectiveBottomInset + 14 }]}
          pointerEvents="box-none"
        >
          <View style={styles.sideButtons}>
            {headingChoice.compassNeedsCalibration && (
              <View style={styles.calibrationHint} testID="compass-calibration-hint">
                <Text style={styles.calibrationHintText} maxFontSizeMultiplier={1.1}>
                  Compass unsure. Move the phone in a figure 8.
                </Text>
              </View>
            )}
            {cameraMode !== 'overview' && (
              <CompassButton
                mapBearing={mapBearing}
                facingHeading={arrowHeading}
                orientation={cameraMode === '3d' ? 'heading-up' : 'north-up'}
                onPress={toggleOrientation}
                needsCalibration={headingChoice.compassNeedsCalibration}
              />
            )}
            {/* Re-center appears only when the map is not following/oriented on the rider */}
            {!following && cameraMode !== 'overview' && (
              <TouchableOpacity
                activeOpacity={0.85}
                style={[styles.roundBtn, styles.recenterBtn]}
                onPress={recenter}
                accessibilityRole="button"
                accessibilityLabel="Re-center on your position"
                testID="rider-map-recenter"
              >
                <LocateFixed size={16} color={Colors.textWhite} strokeWidth={2.4} />
                <Text style={[styles.roundBtnText, styles.recenterText]} maxFontSizeMultiplier={1.1}>
                  Re-center
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Morphing Dark Navy Camera Mode Switcher (Zero Gray Background, Zero Duplicates) */}
          <Animated.View
            style={[
              styles.morphingPillContainer,
              {
                width: modeSlideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [72, 196],
                }),
              },
            ]}
          >
            {/* Collapsed Active View */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.morphingPillCollapsedBtn,
                modesExpanded && { display: 'none' },
              ]}
              onPress={toggleModes}
              accessibilityRole="button"
              accessibilityLabel="Open camera view switcher"
              testID="rider-map-mode-trigger"
            >
              {cameraMode === '3d' ? (
                <Navigation size={14} color={Colors.textWhite} strokeWidth={2.4} />
              ) : cameraMode === 'overview' ? (
                <Maximize2 size={13} color={Colors.textWhite} strokeWidth={2.2} />
              ) : null}
              <Text style={styles.morphingPillText} maxFontSizeMultiplier={1.1}>
                {cameraMode === '3d' ? '3D' : cameraMode === '2d' ? '2D' : 'Fit'}
              </Text>
              <ChevronLeft size={13} color={Colors.textWhite} strokeWidth={2.4} />
            </TouchableOpacity>

            {/* Expanded 3D / 2D / Fit row - always in tree for test accessibility, shown when expanded */}
            <View
              style={[
                styles.morphingPillExpandedRow,
                !modesExpanded && { opacity: 0, position: 'absolute', width: 196 },
              ]}
              pointerEvents={modesExpanded ? 'auto' : 'none'}
            >
              {/* 3D */}
              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  styles.morphingPillSegmentBtn,
                  cameraMode === '3d' && styles.morphingPillSegmentBtnActive,
                ]}
                onPress={() => handleSelectMode('3d')}
                accessibilityRole="button"
                accessibilityLabel="Switch to 3D Navigation View"
                testID="rider-map-mode-3d"
              >
                <Navigation size={13} color={Colors.textWhite} strokeWidth={2.4} />
                <Text
                  style={[
                    styles.morphingPillSegmentText,
                    cameraMode === '3d' && styles.morphingPillSegmentTextActive,
                  ]}
                  maxFontSizeMultiplier={1.1}
                >
                  3D
                </Text>
              </TouchableOpacity>

              {/* 2D */}
              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  styles.morphingPillSegmentBtn,
                  cameraMode === '2d' && styles.morphingPillSegmentBtnActive,
                ]}
                onPress={() => handleSelectMode('2d')}
                accessibilityRole="button"
                accessibilityLabel="Switch to 2D Top-Down View"
                testID="rider-map-mode-2d"
              >
                <Text
                  style={[
                    styles.morphingPillSegmentText,
                    cameraMode === '2d' && styles.morphingPillSegmentTextActive,
                  ]}
                  maxFontSizeMultiplier={1.1}
                >
                  2D
                </Text>
              </TouchableOpacity>

              {/* Fit */}
              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  styles.morphingPillSegmentBtn,
                  cameraMode === 'overview' && styles.morphingPillSegmentBtnActive,
                ]}
                onPress={() => handleSelectMode('overview')}
                accessibilityRole="button"
                accessibilityLabel="Fit entire route on screen"
                testID="rider-map-mode-overview"
              >
                <Maximize2 size={12} color={Colors.textWhite} strokeWidth={2.2} />
                <Text
                  style={[
                    styles.morphingPillSegmentText,
                    cameraMode === 'overview' && styles.morphingPillSegmentTextActive,
                  ]}
                  maxFontSizeMultiplier={1.1}
                >
                  Fit
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    // No borderRadius/overflow:'hidden' here, deliberately. The Google map draws
    // into its own SurfaceView, and clipping that to a rounded rect pushes the
    // compositor down a path that paints the whole map area solid black on a
    // range of Android devices. It bought nothing: the map is full-bleed under
    // the bottom sheet, so the rounded corners were never visible anyway.
  },
  pinBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.primary,
    borderWidth: 2,
    borderColor: Colors.textWhite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerPinBadge: {
    backgroundColor: Colors.routeToCustomer,
  },
  pinBadgeText: {
    color: Colors.textWhite,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold as any,
  },
  mapPending: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.bgGray,
  },
  mapPendingText: {
    fontSize: FontSizes.sm,
    color: Colors.textLight,
  },
  attribution: {
    position: 'absolute',
    left: 8,
    fontSize: 10,
    color: Colors.textDark,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    zIndex: 5,
  },
  bottomEtaBadge: {
    position: 'absolute',
    left: 12,
    bottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    elevation: 4,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    zIndex: 15,
  },
  bottomEtaText: {
    flexShrink: 1,
    color: Colors.textWhite,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold as any,
  },
  cameraControlsContainer: {
    position: 'absolute',
    right: 12,
    bottom: 18,
    zIndex: 15,
    alignItems: 'flex-end',
    gap: Spacing.sm,
    elevation: Elevation.floatingControls,
  },
  sideButtons: {
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  roundBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: 14,
    backgroundColor: Colors.bgWhite,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    elevation: Elevation.floatingControls,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  roundBtnText: {
    color: Colors.textDark,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold as any,
  },
  recenterBtn: {
    backgroundColor: Colors.navy,
    borderColor: Colors.navy,
  },
  calibrationHint: {
    maxWidth: 190,
    backgroundColor: Colors.warningBg,
    borderColor: Colors.maneuverAlert,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    elevation: Elevation.floatingControls,
  },
  calibrationHintText: {
    color: Colors.warning,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold as any,
  },
  recenterText: {
    color: Colors.textWhite,
  },
  morphingPillContainer: {
    height: 48,
    minHeight: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.navy,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    elevation: Elevation.floatingControls,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  morphingPillCollapsedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    width: '100%',
    paddingHorizontal: 12,
    gap: 5,
  },
  morphingPillText: {
    fontFamily: FontFamily.bold,
    color: Colors.textWhite,
    fontSize: FontSizes.xs,
  },
  morphingPillExpandedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    height: 48,
    width: '100%',
    paddingHorizontal: 4,
  },
  morphingPillSegmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  morphingPillSegmentBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.20)',
  },
  morphingPillSegmentText: {
    fontFamily: FontFamily.semibold,
    color: 'rgba(255, 255, 255, 0.70)',
    fontSize: FontSizes.xs,
  },
  morphingPillSegmentTextActive: {
    fontFamily: FontFamily.bold,
    color: Colors.textWhite,
  },
});
