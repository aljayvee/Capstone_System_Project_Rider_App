import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Circle, Marker, Polyline } from 'react-native-maps';
import { Clock, Navigation, Maximize2, Target, MapPin } from 'lucide-react-native';
import { Colors, BorderRadius, FontSizes, FontWeights, Spacing } from '../config/theme';
import { MapCoordinate, toRegion } from '../utils/coords';
import GlidingRiderMarker from './GlidingRiderMarker';
import { pathAhead, projectOntoPath } from '../utils/routeGeometry';
import type { ErrandPinpoint } from '../types/rider';
import type { RoutePhase } from '../services/routePhase';
import type { RouteStep } from '../services/directionsService';
import { bearingBetween, haversineDistanceKm } from '../utils/geo';
import { TurnByTurnHUD } from './TurnByTurnHUD';
import { useTurnByTurnNavigation } from '../hooks/useTurnByTurnNavigation';

/** For a stop the server sent no radius for. Mirrors the server's default. */
const DEFAULT_ARRIVAL_RADIUS_METERS = 75;

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
}

/** How the camera is framed: 3D Third-Person Chase, 2D Flat Plane, or Full Route Overview. */
export type MapCameraMode = '3d' | '2d' | 'overview';

const CHASE_3D_ZOOM = 18.5;
const CHASE_3D_PITCH = 55;

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
}: LiveErrandMapProps) {
  const mapRef = useRef<MapView>(null);
  const hasEta = distanceMeters != null && durationSeconds != null;

  // Defaults to 3D Third-Person Perspective for immersive Grab/Google Maps navigation.
  const [cameraMode, setCameraMode] = useState<MapCameraMode>('3d');

  const firstDrawable = (...candidates: (MapCoordinate[] | null | undefined)[]) =>
    candidates.find((line) => (line?.length ?? 0) > 1) ?? [];

  const activeRouteLine =
    phase === 'delivering'
      ? firstDrawable(deliveryLegCoordinates, routeCoordinates, pickupLegCoordinates)
      : firstDrawable(pickupLegCoordinates, routeCoordinates);

  // Upcoming preview line (e.g. delivery leg while still shopping at stores)
  const upcomingRouteLine =
    phase === 'shopping' && deliveryLegCoordinates && deliveryLegCoordinates.length > 1
      ? deliveryLegCoordinates
      : null;

  // Active leg colors (Orange-Yellow for Store runs, Pink-Red for Customer delivery)
  const activeRouteColor = phase === 'delivering' ? Colors.routeToCustomer : Colors.routeToStore;

  // Turn-by-Turn Navigation State
  const maneuverState = useTurnByTurnNavigation(riderLocation, steps, activeRouteLine);

  // Only the road still ahead (trim traversed path)
  const drawnActiveLine = useMemo(() => {
    if (!riderLocation || activeRouteLine.length < 2 || isFallback) return activeRouteLine;
    const projection = projectOntoPath(riderLocation, activeRouteLine);
    if (!projection || projection.distanceMeters > 60) return activeRouteLine;
    return pathAhead(activeRouteLine, projection);
  }, [riderLocation?.latitude, riderLocation?.longitude, activeRouteLine, isFallback]);

  const fitAllPoints = useCallback(() => {
    const points = [
      ...(destination ? [destination] : []),
      ...(riderLocation ? [riderLocation] : []),
      ...pinpoints,
      ...(routeCoordinates ?? []),
    ];
    if (points.length < 2) return;
    mapRef.current?.fitToCoordinates(points, {
      edgePadding: { top: 140, right: 40, bottom: 90, left: 40 },
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
  const previousFixRef = useRef<MapCoordinate | null>(null);
  const headingRef = useRef(0);

  useEffect(() => {
    if (!riderLocation) return;

    const previous = previousFixRef.current;
    if (previous && haversineDistanceKm(previous, riderLocation) * 1000 >= 4) {
      headingRef.current = bearingBetween(previous, riderLocation);
    }
    if (typeof riderLocation.heading === 'number' && riderLocation.heading >= 0) {
      headingRef.current = riderLocation.heading;
    }
    previousFixRef.current = { latitude: riderLocation.latitude, longitude: riderLocation.longitude };

    if (cameraMode === '3d') {
      // Third-Person Driver/Chase Cam: Tilted pitch + heading tracking
      mapRef.current?.animateCamera(
        {
          center: riderLocation,
          heading: headingRef.current,
          pitch: CHASE_3D_PITCH,
          zoom: CHASE_3D_ZOOM,
        },
        { duration: 800 }
      );
    } else if (cameraMode === '2d') {
      // 2D Plane: Flat top-down, North-up
      mapRef.current?.animateCamera(
        {
          center: riderLocation,
          heading: 0,
          pitch: PLANE_2D_PITCH,
          zoom: PLANE_2D_ZOOM,
        },
        { duration: 600 }
      );
    }
  }, [riderLocation?.latitude, riderLocation?.longitude, cameraMode]);

  const select3DMode = useCallback(() => {
    setCameraMode('3d');
  }, []);

  const select2DMode = useCallback(() => {
    setCameraMode('2d');
  }, []);

  const selectOverviewMode = useCallback(() => {
    setCameraMode('overview');
    mapRef.current?.animateCamera({ heading: 0, pitch: 0 }, { duration: 400 });
  }, []);

  const initialCenter = destination || riderLocation || pinpoints[0];
  const targetLabel = phase === 'delivering' ? 'Customer' : targetStoreName || 'Store';

  return (
    <View style={styles.wrapper}>
      {/* Top Floating Grab/Google Maps-Style Navigation HUD */}
      {steps.length > 0 && (
        <TurnByTurnHUD maneuver={maneuverState} phase={phase} targetName={targetLabel} />
      )}

      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialCenter ? toRegion(initialCenter) : undefined}
        onPanDrag={() => {
          // If user drags the map, do not force-reset until they tap a mode button
        }}
      >
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

        {/* Smooth Gliding Rider Pin with Heading Rotation */}
        <GlidingRiderMarker
          target={riderLocation}
          route={isFallback ? null : activeRouteLine}
          headingDeg={riderLocation?.heading ?? null}
        />
      </MapView>

      {/* Floating ETA Badge (Positioned safely at bottom-left above sheet) */}
      {hasEta && (
        <View style={styles.bottomEtaBadge}>
          <Clock size={12} color={Colors.textWhite} />
          <Text style={styles.bottomEtaText} maxFontSizeMultiplier={1.15}>
            {formatDuration(durationSeconds!)} • {formatDistance(distanceMeters!)}
          </Text>
        </View>
      )}

      {/* Floating Camera Perspective Controls (3D Chase / 2D Plane / Fit Overview) */}
      <View style={styles.cameraControlsContainer} pointerEvents="box-none">
        <View style={styles.modeSegmentContainer}>
          {/* 3D Third-Person Chase Cam */}
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.modeSegmentBtn, cameraMode === '3d' && styles.modeSegmentBtnActive]}
            onPress={select3DMode}
            accessibilityRole="button"
            accessibilityLabel="Switch to 3D Third-Person Navigation View"
            testID="rider-map-mode-3d"
          >
            <Navigation
              size={14}
              color={cameraMode === '3d' ? Colors.textWhite : Colors.textDark}
              strokeWidth={2.4}
            />
            <Text
              style={[styles.modeSegmentText, cameraMode === '3d' && styles.modeSegmentTextActive]}
              maxFontSizeMultiplier={1.1}
            >
              3D
            </Text>
          </TouchableOpacity>

          {/* 2D Flat Plane */}
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.modeSegmentBtn, cameraMode === '2d' && styles.modeSegmentBtnActive]}
            onPress={select2DMode}
            accessibilityRole="button"
            accessibilityLabel="Switch to 2D Top-Down Plane View"
            testID="rider-map-mode-2d"
          >
            <Text
              style={[styles.modeSegmentText, cameraMode === '2d' && styles.modeSegmentTextActive]}
              maxFontSizeMultiplier={1.1}
            >
              2D
            </Text>
          </TouchableOpacity>

          {/* Fit Route Overview */}
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.modeSegmentBtn, cameraMode === 'overview' && styles.modeSegmentBtnActive]}
            onPress={selectOverviewMode}
            accessibilityRole="button"
            accessibilityLabel="Fit entire route on screen"
            testID="rider-map-mode-overview"
          >
            <Maximize2
              size={13}
              color={cameraMode === 'overview' ? Colors.textWhite : Colors.textDark}
              strokeWidth={2.2}
            />
            <Text
              style={[styles.modeSegmentText, cameraMode === 'overview' && styles.modeSegmentTextActive]}
              maxFontSizeMultiplier={1.1}
            >
              Fit
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
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
    color: Colors.textWhite,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold as any,
  },
  cameraControlsContainer: {
    position: 'absolute',
    right: 12,
    bottom: 18,
    zIndex: 15,
  },
  modeSegmentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgWhite,
    borderRadius: BorderRadius.full,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.border,
    elevation: 4,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    gap: 2,
  },
  modeSegmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    height: 48,
    minWidth: 48,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  modeSegmentBtnActive: {
    backgroundColor: Colors.navy,
  },
  modeSegmentText: {
    color: Colors.textDark,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold as any,
  },
  modeSegmentTextActive: {
    color: Colors.textWhite,
  },
});



