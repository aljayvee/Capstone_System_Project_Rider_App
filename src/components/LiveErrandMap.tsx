import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Circle, Marker, Polyline } from 'react-native-maps';
import { Clock, Navigation, Maximize2, Target } from 'lucide-react-native';
import { Colors, BorderRadius, FontSizes, FontWeights } from '../config/theme';
import { MapCoordinate, toRegion } from '../utils/coords';
import RiderDotMarker from './RiderDotMarker';
import type { ErrandPinpoint } from '../types/rider';
import type { RoutePhase } from '../services/routePhase';
import { bearingBetween, haversineDistanceKm } from '../utils/geo';

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
  riderLocation: (MapCoordinate & { heading?: number | null }) | null;
  destination: MapCoordinate | null;
  pinpoints: ErrandPinpoint[];
  /** Full overview polyline — shown as fallback when leg arrays are unavailable. */
  routeCoordinates: MapCoordinate[] | null;
  /** The run out to the next outstanding store. Drawn orange while shopping. */
  pickupLegCoordinates?: MapCoordinate[] | null;
  /** The run in to the customer. Drawn in primary once the items are bought. */
  deliveryLegCoordinates?: MapCoordinate[] | null;
  /** ETA data for floating badge — rendered when both values are non-null. */
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  /**
   * Which half of the errand this is, and therefore which single line is drawn.
   * See services/routePhase.ts.
   */
  phase?: RoutePhase;
}

/** How the camera is framed. */
type MapMode = 'full' | 'focus';

const FOCUS_ZOOM = 17;
const FOCUS_PITCH = 45;

// Full-screen, always-inline live map — deliberately rendered outside any
// ScrollView/FlatList per the project's "MapView never inside a ScrollView"
// rule (a fixed top-level View / full-screen modal only).
export function LiveErrandMap({
  riderLocation,
  destination,
  pinpoints,
  routeCoordinates,
  pickupLegCoordinates,
  deliveryLegCoordinates,
  distanceMeters,
  durationSeconds,
  phase = 'shopping',
}: LiveErrandMapProps) {
  const mapRef = useRef<MapView>(null);
  const hasEta = distanceMeters != null && durationSeconds != null;

  // Full frames the whole route; Focus follows the rider, heading-up. Opens in
  // Full so the rider sees the shape of the run before being dropped into it.
  const [mode, setMode] = useState<MapMode>('full');

  // One line, coloured by phase — never by which array the coordinates arrived
  // in. Once every store is done this screen routes with no waypoints, so the
  // whole delivery run comes back as leg 0, which the server calls "pickup".
  // Whichever line actually arrived, preferring the one that matches the phase.
  //
  // The delivering fallback has to include the PICKUP array, which reads wrong
  // until you know why: once every store is done the route is fetched with no
  // waypoints at all, so the whole delivery run comes back as a single leg —
  // and the server calls leg 0 "pickup". Without this the map draws nothing at
  // exactly the moment the rider sets off for the customer.
  const firstDrawable = (...candidates: (MapCoordinate[] | null | undefined)[]) =>
    candidates.find((line) => (line?.length ?? 0) > 1) ?? [];

  const routeLine =
    phase === 'delivering'
      ? firstDrawable(deliveryLegCoordinates, routeCoordinates, pickupLegCoordinates)
      : firstDrawable(pickupLegCoordinates, routeCoordinates);

  const routeColor = phase === 'delivering' ? Colors.primary : '#F97316';

  const fitAllPoints = useCallback(() => {
    const points = [
      ...(destination ? [destination] : []),
      ...(riderLocation ? [riderLocation] : []),
      ...pinpoints,
      ...(routeCoordinates ?? []),
    ];
    if (points.length < 2) return;
    mapRef.current?.fitToCoordinates(points, {
      edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
      animated: true,
    });
    // riderLocation is deliberately read but not depended on — see below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, pinpoints, routeCoordinates]);

  // Re-frame only when the ROUTE changes, not on every GPS tick.
  //
  // This effect used to list riderLocation among its dependencies, so the camera
  // re-fitted roughly every two seconds while the rider moved: the map visibly
  // jumped, and any attempt to pan or zoom was undone before they could look at
  // it. The customer's map fixed this long ago; this one did not.
  useEffect(() => {
    if (mode !== 'full') return;
    fitAllPoints();
  }, [mode, fitAllPoints]);

  // Follow the rider, turning the map with their direction of travel. The
  // device's own heading is preferred; a bearing off the last two fixes stands
  // in when it reports none, which is the normal case with a mock-location app.
  const previousFixRef = useRef<MapCoordinate | null>(null);
  const headingRef = useRef(0);

  useEffect(() => {
    if (!riderLocation) return;

    const previous = previousFixRef.current;
    if (previous && haversineDistanceKm(previous, riderLocation) * 1000 >= 5) {
      headingRef.current = bearingBetween(previous, riderLocation);
    }
    if (typeof riderLocation.heading === 'number' && riderLocation.heading >= 0) {
      headingRef.current = riderLocation.heading;
    }
    previousFixRef.current = { latitude: riderLocation.latitude, longitude: riderLocation.longitude };

    if (mode !== 'focus') return;
    mapRef.current?.animateCamera(
      {
        center: riderLocation,
        heading: headingRef.current,
        pitch: FOCUS_PITCH,
        zoom: FOCUS_ZOOM,
      },
      { duration: 900 }
    );
  }, [riderLocation?.latitude, riderLocation?.longitude, mode]);

  const enterFocus = useCallback(() => setMode('focus'), []);

  const enterFull = useCallback(() => {
    setMode('full');
    // Level the camera, or a route framed while tilted reads as a perspective
    // view of somewhere else.
    mapRef.current?.animateCamera({ heading: 0, pitch: 0 }, { duration: 400 });
  }, []);

  const initialCenter = destination || riderLocation || pinpoints[0];

  return (
    <View style={styles.wrapper}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialCenter ? toRegion(initialCenter) : undefined}
        onPanDrag={() => {
          if (mode === 'focus') enterFull();
        }}
      >
        {destination && <Marker coordinate={destination} title="Delivery Address" pinColor={Colors.primary} />}

        {/* The circle the rider has to be inside for this stop to count as
            reached. Filled more strongly once they are in it, so the rider can
            see they are close enough BEFORE the status moves — a step that
            advances with no visible cause is the thing to avoid. */}
        {pinpoints.map((pin, idx) => {
          const radius = pin.geofenceRadiusMeters ?? DEFAULT_ARRIVAL_RADIUS_METERS;
          const inside =
            riderLocation != null &&
            haversineDistanceKm(riderLocation, pin) * 1000 <= radius;

          return (
            <Circle
              key={`radius-${pin.id ?? idx}`}
              center={pin}
              radius={radius}
              strokeWidth={inside ? 2.5 : 1.5}
              strokeColor={inside ? 'rgba(5,150,105,0.85)' : 'rgba(37,99,235,0.45)'}
              fillColor={inside ? 'rgba(5,150,105,0.18)' : 'rgba(37,99,235,0.10)'}
            />
          );
        })}

        {pinpoints.map((pin, idx) => (
          <Marker key={pin.id} coordinate={pin} title={`Store #${idx + 1}: ${pin.storeName}`}>
            <View style={styles.pinBadge}>
              <Text style={styles.pinBadgeText}>{idx + 1}</Text>
            </View>
          </Marker>
        ))}

        {riderLocation && (
          <Marker
            coordinate={riderLocation}
            title="You"
            rotation={riderLocation.heading ?? 0}
            flat
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <RiderDotMarker />
          </Marker>
        )}

        {/* One line: orange out to the next store, primary in to the customer.
            Never both at once — the shopping run is finished work and drawing it
            alongside the delivery run shows the rider a route they have already
            ridden as though it were still ahead of them. */}
        {routeLine.length > 1 && (
          <Polyline
            coordinates={routeLine}
            strokeColor={routeColor}
            strokeWidth={4}
            testID={phase === 'delivering' ? 'route-line-delivering' : 'route-line-shopping'}
          />
        )}
      </MapView>

      {/* ETA / distance floating badge */}
      {hasEta && (
        <View style={styles.etaBadge}>
          <Clock size={12} color="#FFFFFF" />
          <Text style={styles.etaText}>
            {formatDuration(durationSeconds!)} • {formatDistance(distanceMeters!)}
          </Text>
        </View>
      )}

      {/* This map had no controls at all: it framed the whole route and stayed
          there, which is the least useful view for the person actually riding it. */}
      <View style={styles.controls}>
        <TouchableOpacity
          activeOpacity={0.85}
          style={[styles.controlBtn, mode === 'focus' && styles.controlBtnActive]}
          onPress={mode === 'focus' ? enterFull : enterFocus}
          accessibilityLabel={mode === 'focus' ? 'Show the whole route' : 'Follow my route'}
          testID="rider-map-mode-toggle"
        >
          {mode === 'focus' ? (
            <Maximize2 size={18} color={Colors.textWhite} strokeWidth={2.2} />
          ) : (
            <Navigation size={18} color={Colors.textDark} strokeWidth={2.2} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.controlBtn}
          onPress={() => {
            enterFull();
            fitAllPoints();
          }}
          accessibilityLabel="Re-frame the route"
          testID="rider-map-recenter"
        >
          <Target size={18} color={Colors.textDark} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  controls: {
    position: 'absolute',
    right: 12,
    bottom: 20,
    gap: 8,
  },
  controlBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bgWhite,
    borderWidth: 1,
    borderColor: Colors.border,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  controlBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
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
  pinBadgeText: {
    color: Colors.textWhite,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold as any,
  },
  etaBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  etaText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});

