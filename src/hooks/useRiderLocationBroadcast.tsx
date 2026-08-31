import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateRiderDutyStatus, saveRiderLocation } from '../firebase/location';
import BackgroundLocationModal from '../components/BackgroundLocationModal';
import {
  LOCATION_TRACKING_TASK,
  RIDER_ID_STORAGE_KEY,
  ACTIVE_ERRAND_STORAGE_KEY,
} from '../tasks/locationTrackingTask';
import { evaluateFix, distanceMeters, type Fix } from '../utils/locationQuality';
import { createClientPointId, enqueuePoint } from '../services/locationQueue';
import * as Notifications from 'expo-notifications';
import { riderApiService } from '../config/apiConfig';

export interface RiderOwnLocation {
  latitude: number;
  longitude: number;
  heading: number | null;
  updatedAt: number;
  /**
   * GPS error in metres, when the device reports one.
   *
   * Carried through because store-arrival detection has to know it: a fix that
   * could be anywhere within 200 m cannot prove the rider is inside a 75 m
   * circle, and treating it as proof would advance the errand from across town.
   */
  accuracyMeters: number | null;
}

type TrackingMode = 'idle' | 'active';

/**
 * How often the presence beacon goes up.
 *
 * Slower than the live Firebase pin and completely separate from it. The pin is
 * for watching a rider move; this is for answering "can I dispatch to them", and
 * that question does not need a coordinate every two seconds.
 *
 * Roughly 120 requests an hour while idle, at about a kilobyte a minute, and no
 * extra GPS draw at all — the location task is already running. That is the whole
 * price of making an idle rider visible to dispatch.
 */
const BEACON_INTERVAL_IDLE_MS = 30000;
const BEACON_INTERVAL_ACTIVE_MS = 10000;

// Idle cadence (on-duty, no active delivery) trades precision for battery —
// riders can stay on-duty for a whole shift. Active-delivery cadence matches
// the original foreground-only implementation's values.
const IDLE_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: 30000,
  distanceInterval: 50,
  foregroundService: {
    notificationTitle: 'RiderMobileApp',
    notificationBody: 'Tracking your location while on duty',
  },
};

const ACTIVE_DELIVERY_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.High,
  timeInterval: 5000,
  distanceInterval: 15,
  foregroundService: {
    notificationTitle: 'RiderMobileApp',
    notificationBody: 'Tracking your location for an active delivery',
  },
};

// How often a fix is added to the durable breadcrumb uploaded to the backend.
// Far slower than the live Firebase stream on purpose: the trail exists for ETA
// learning, dispute replay, and dispatch, none of which need second-by-second
// resolution, and a rider on mobile data should not pay for it.
const TRAIL_MIN_INTERVAL_MS = 60000;
const TRAIL_MIN_DISTANCE_M = 100;

// A rider standing still for this long is queueing inside a store, not riding.
// Dropping to the idle cadence there is a real battery saving across a shift,
// and costs nothing: their position is not changing.
const STATIONARY_DOWNSHIFT_MS = 60000;

/**
 * Runs the rider's GPS as a background task for production, and uses
 * foreground watchPositionAsync for high-accuracy live updates without
 * triggering Metro HMR re-bundling loops in development.
 */
export function useRiderLocationBroadcast(
  riderId: number | undefined,
  isOnDuty: boolean,
  isActiveDelivery: boolean,
  activeErrandId?: string | null
): {
  location: RiderOwnLocation | null;
  ModalElement: React.ReactElement | null;
} {
  const [location, setLocation] = useState<RiderOwnLocation | null>(null);
  const [showBgModal, setShowBgModal] = useState(false);

  // Tracks whether the rider has already answered the background-location
  // prompt for this session — prevents re-showing it on every re-render.
  const bgPermissionAnsweredRef = useRef(false);
  const currentModeRef = useRef<TrackingMode | null>(null);

  // The live-GPS effect below intentionally does NOT re-subscribe when the
  // delivery state changes (restarting watchPositionAsync on every change would
  // drop fixes), so it reads these through refs instead. Previously it closed
  // over the values directly with a [riderId, isOnDuty] dependency list, which
  // meant a rider who started a delivery kept broadcasting status 'AVAILABLE'
  // and a null activeErrandId until they toggled duty off and on again.
  const isActiveDeliveryRef = useRef(isActiveDelivery);
  const activeErrandIdRef = useRef(activeErrandId);
  // Read through a ref for the same reason: the beacon is sent from inside the
  // long-lived GPS subscription, which must not be torn down and rebuilt every
  // time the rider toggles duty.
  const isOnDutyRef = useRef(isOnDuty);
  isActiveDeliveryRef.current = isActiveDelivery;
  activeErrandIdRef.current = activeErrandId;
  isOnDutyRef.current = isOnDuty;

  // The background task runs headless, outside React, so it cannot read this
  // from props — it reads the current errand from storage instead.
  useEffect(() => {
    if (activeErrandId) {
      void AsyncStorage.setItem(ACTIVE_ERRAND_STORAGE_KEY, activeErrandId).catch(() => {});
    } else {
      void AsyncStorage.removeItem(ACTIVE_ERRAND_STORAGE_KEY).catch(() => {});
    }
  }, [activeErrandId]);

  // Quality-gate and breadcrumb-cadence state.
  const lastAcceptedFixRef = useRef<Fix | null>(null);
  const lastTrailPointRef = useRef<Fix | null>(null);
  const stationarySinceRef = useRef<number | null>(null);

  // True while the OS background task owns the Firebase writes, so the
  // foreground watcher stands down rather than writing the same node twice.
  const backgroundTaskActiveRef = useRef(false);

  // The watcher effect is intentionally not re-created when these change, so it
  // reaches them through refs (same reason as isActiveDeliveryRef above).
  const riderIdRef = useRef(riderId);
  riderIdRef.current = riderId;
  const applyModeRef = useRef<((mode: TrackingMode, id: number) => Promise<void>) | null>(null);

  // Records whether each buffered point was captured during an outage. Purely
  // informational on the server side, but it is what makes an offline stretch
  // visible in a dispute replay instead of looking like a gap.
  /**
   * Builds and sends one presence beacon.
   *
   * Reports conditions rather than asserting readiness: the server decides what
   * the rider counts as, so the device and the dispatcher can never hold two
   * different opinions about who is available.
   */
  const sendBeacon = useCallback(
    async (fix: Fix | null, shuttingDown = false) => {
      if (!riderIdRef.current) return;

      let notifications = false;
      try {
        notifications = (await Notifications.getPermissionsAsync()).granted;
      } catch {
        // A permissions probe that throws is not a granted permission.
      }

      await riderApiService.sendBeacon({
        latitude: fix?.latitude ?? null,
        longitude: fix?.longitude ?? null,
        accuracyMeters: fix?.accuracyMeters ?? null,
        headingDeg: fix?.headingDeg ?? null,
        recordedAt: fix ? new Date(fix.timestamp).toISOString() : null,
        onDuty: isOnDutyRef.current,
        // Granted AND running. The permission alone is not evidence the OS let
        // the task survive, and this whole mechanism exists because Android kills
        // things that look permitted.
        backgroundLocation: backgroundTaskActiveRef.current,
        notifications,
        // PLACEHOLDER, and knowingly so: Expo exposes no API to query
        // SCHEDULE_EXACT_ALARM, so this cannot yet be measured. Sent as true so
        // it never silently blocks dispatch on a value nobody checked. It must
        // become a real probe — a small native module — before the server can
        // honestly gate on it.
        exactAlarms: true,
        // Reported so the server can size its staleness window to the cadence
        // actually in use. Fixed at 10s while the server assumed nothing, an idle
        // rider beaconing every 30s counted as out of contact between every pair
        // of beacons, and auto-assign answered "no available riders" for a fleet
        // that was working.
        beaconIntervalMs: isActiveDeliveryRef.current
          ? BEACON_INTERVAL_ACTIVE_MS
          : BEACON_INTERVAL_IDLE_MS,
        connectivity: connectivityRef.current,
        shuttingDown,
      });
    },
    []
  );

  useEffect(() => {
    sendBeaconRef.current = (fix: Fix) => sendBeacon(fix);
  }, [sendBeacon]);

  // One beacon the moment duty changes, without waiting for the next GPS fix.
  //
  // Going off duty is the case that matters: silence alone would leave the rider
  // looking AVAILABLE for the full ten-second window and could win them an errand
  // they have just declared themselves unavailable for.
  useEffect(() => {
    if (!riderId) return;
    void sendBeacon(lastAcceptedFixRef.current);
  }, [riderId, isOnDuty, sendBeacon]);

  const lastBeaconAtRef = useRef(0);
  const sendBeaconRef = useRef<((fix: Fix) => Promise<void>) | null>(null);
  const connectivityRef = useRef<'wifi' | 'cellular' | 'none'>('none');
  const isConnectedRef = useRef(true);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      isConnectedRef.current = Boolean(state.isConnected && state.isInternetReachable !== false);
      // Reported for diagnosis only. Eligibility never turns on connection
      // quality — the spec counts slow, medium and fast all as available, and a
      // beacon that arrived is proof enough that the rider is reachable.
      connectivityRef.current = !isConnectedRef.current
        ? 'none'
        : state.type === 'wifi'
          ? 'wifi'
          : 'cellular';
    });
    return () => unsubscribe();
  }, []);

  const applyMode = useCallback(async (mode: TrackingMode, currentRiderId: number) => {
    await AsyncStorage.setItem(RIDER_ID_STORAGE_KEY, String(currentRiderId));

    // In development mode (__DEV__), avoid starting background headless tasks while foregrounded
    // to prevent Metro's HMR bundle loader from triggering continuous reload loops.
    if (__DEV__) {
      // The background task is deliberately not started in development (it
      // fights Metro's HMR loader), so the foreground watcher keeps ownership
      // of the Firebase writes here.
      currentModeRef.current = mode;
      backgroundTaskActiveRef.current = false;
      return;
    }

    const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK).catch(
      () => false
    );
    if (alreadyRunning) {
      await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK).catch(() => {});
    }
    await Location.startLocationUpdatesAsync(
      LOCATION_TRACKING_TASK,
      mode === 'active' ? ACTIVE_DELIVERY_OPTIONS : IDLE_OPTIONS
    );
    currentModeRef.current = mode;
    backgroundTaskActiveRef.current = true;
  }, []);

  applyModeRef.current = applyMode;

  const stopAll = useCallback(async (currentRiderId: number | undefined) => {
    currentModeRef.current = null;
    backgroundTaskActiveRef.current = false;
    const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK).catch(() => false);
    if (running) {
      await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK).catch(() => {});
    }
    if (currentRiderId) {
      await updateRiderDutyStatus(currentRiderId, false).catch(() => {});
    }
    setLocation(null);
  }, []);

  const beginTracking = useCallback(
    async (backgroundGranted: boolean) => {
      if (!riderId) return;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        // Only request background permission if the rider agreed via our modal.
        if (backgroundGranted) {
          await Location.requestBackgroundPermissionsAsync();
        }

        await applyMode(isActiveDelivery ? 'active' : 'idle', riderId);
      } catch (err) {
        console.error('[useRiderLocationBroadcast] Could not start background location task:', err);
      }
    },
    [riderId, isActiveDelivery, applyMode]
  );

  // In development mode, clean up any leftover zombie background task registered on the device
  useEffect(() => {
    if (__DEV__) {
      Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK)
        .then((running) => {
          if (running) {
            return Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK);
          }
        })
        .catch(() => {});
    }
  }, []);

  // Starts/stops the whole background task based on duty status, and
  // switches cadence when an active delivery starts or ends without
  // re-triggering the permission modal (only the first on-duty transition
  // per session does that).
  useEffect(() => {
    if (!riderId || !isOnDuty) {
      if (currentModeRef.current !== null) {
        void stopAll(riderId);
      }
      return;
    }

    if (currentModeRef.current === null) {
      if (!bgPermissionAnsweredRef.current) {
        setShowBgModal(true);
        return;
      }
      void beginTracking(true);
      return;
    }

    const desiredMode: TrackingMode = isActiveDelivery ? 'active' : 'idle';
    if (currentModeRef.current !== desiredMode) {
      void applyMode(desiredMode, riderId);
    }
  }, [riderId, isOnDuty, isActiveDelivery, beginTracking, applyMode, stopAll]);

  // High-accuracy live GPS stream for the rider's active UI and map.
  // Uses watchPositionAsync with Accuracy.High to get exact GPS hardware coordinates
  // (identical to what is broadcasted to Firebase and displayed to the customer).
  useEffect(() => {
    if (!riderId || !isOnDuty) {
      setLocation(null);
      return;
    }

    let subscription: Location.LocationSubscription | null = null;
    let isCancelled = false;

    const startWatching = async () => {
      try {
        // 1. Get cached last known GPS position immediately on mount (safe, non-blocking)
        const initial = await Location.getLastKnownPositionAsync().catch(() => null);

        if (!isCancelled && initial) {
          const heading =
            initial.coords.heading != null && initial.coords.heading >= 0
              ? initial.coords.heading
              : null;
          setLocation({
            latitude: initial.coords.latitude,
            longitude: initial.coords.longitude,
            heading,
            updatedAt: initial.timestamp,
            accuracyMeters: initial.coords.accuracy ?? null,
          });
        }

        // 2. Stream continuous high-accuracy live GPS ticks
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 2000,
            distanceInterval: 3,
          },
          (loc) => {
            if (isCancelled) return;
            const heading =
              loc.coords.heading != null && loc.coords.heading >= 0
                ? loc.coords.heading
                : null;

            const candidate: Fix = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              accuracyMeters: loc.coords.accuracy ?? null,
              speedMps: loc.coords.speed ?? null,
              headingDeg: heading,
              timestamp: loc.timestamp,
            };

            // Drop junk fixes before they reach the map, Firebase, or the trail.
            // 'hold' means the device has not really moved: keep the previous
            // coordinate so the customer does not watch the pin twitch around a
            // car park for the whole time the rider is inside a store.
            const verdict = evaluateFix(candidate, lastAcceptedFixRef.current);
            if (verdict.kind === 'reject') return;

            const fix = verdict.fix;
            lastAcceptedFixRef.current = fix;

            // Adaptive cadence. A rider queueing inside a store is stationary
            // for many minutes at a stretch — on an errand that is the job
            // working correctly, not a stall — and there is nothing to learn
            // from polling GPS every 5 s while their position is not changing.
            // Downshift to the idle profile, and restore the active one the
            // moment they move off again.
            if (riderIdRef.current) {
              const moving = verdict.kind === 'accept';
              if (moving) {
                stationarySinceRef.current = null;
                if (isActiveDeliveryRef.current && currentModeRef.current === 'idle') {
                  void applyModeRef.current?.('active', riderIdRef.current);
                }
              } else {
                if (stationarySinceRef.current === null) {
                  stationarySinceRef.current = fix.timestamp;
                } else if (
                  fix.timestamp - stationarySinceRef.current >= STATIONARY_DOWNSHIFT_MS &&
                  currentModeRef.current === 'active'
                ) {
                  void applyModeRef.current?.('idle', riderIdRef.current);
                }
              }
            }

            setLocation({
              latitude: fix.latitude,
              longitude: fix.longitude,
              heading: fix.headingDeg,
              updatedAt: fix.timestamp,
              accuracyMeters: fix.accuracyMeters,
            });

            // Live pin for the customer's and dispatcher's maps. Skipped while
            // the background task is running, which writes the same node — two
            // concurrent writers to riders/{id} was producing an interleaved,
            // partly stale stream.
            if (!backgroundTaskActiveRef.current) {
              void saveRiderLocation(riderId, {
                latitude: fix.latitude,
                longitude: fix.longitude,
                heading: fix.headingDeg,
                onDuty: true,
                online: true,
                status: isActiveDeliveryRef.current ? 'BUSY' : 'AVAILABLE',
                activeErrandId: activeErrandIdRef.current ?? null,
              }).catch(() => {});
            }

            // Presence beacon: sent whether or not an errand exists.
            //
            // This is the line that closes the gap. Everything below it is
            // errand-scoped and returns early when idle, which is exactly why an
            // idle rider used to be invisible to dispatch — they streamed
            // coordinates to Firebase all shift and told the backend nothing.
            const beaconGap = fix.timestamp - lastBeaconAtRef.current;
            const beaconEvery = isActiveDeliveryRef.current
              ? BEACON_INTERVAL_ACTIVE_MS
              : BEACON_INTERVAL_IDLE_MS;
            if (beaconGap >= beaconEvery) {
              lastBeaconAtRef.current = fix.timestamp;
              void sendBeaconRef.current?.(fix);
            }

            // Durable breadcrumb: buffered locally and uploaded in batches, so a
            // signal blackout costs nothing. Only while there is an errand to
            // attach it to, and far slower than the live stream.
            const errandId = activeErrandIdRef.current;
            if (!errandId) return;

            const previousTrail = lastTrailPointRef.current;
            const elapsed = previousTrail ? fix.timestamp - previousTrail.timestamp : Infinity;
            const movedFar =
              !previousTrail ||
              distanceMeters(fix, previousTrail) >= TRAIL_MIN_DISTANCE_M;

            if (elapsed >= TRAIL_MIN_INTERVAL_MS || movedFar) {
              lastTrailPointRef.current = fix;
              void enqueuePoint({
                clientPointId: createClientPointId(),
                errandId,
                latitude: fix.latitude,
                longitude: fix.longitude,
                accuracyMeters: fix.accuracyMeters,
                speedMps: fix.speedMps,
                headingDeg: fix.headingDeg,
                recordedAt: new Date(fix.timestamp).toISOString(),
                // Marked at enqueue time; the flush may happen much later.
                wasOffline: !isConnectedRef.current,
              }).catch(() => {});
            }
          }
        );
      } catch (err) {
        console.warn('[useRiderLocationBroadcast] Could not start live GPS watcher:', err);
      }
    };

    void startWatching();

    return () => {
      isCancelled = true;
      if (subscription) {
        subscription.remove();
      }
    };
  }, [riderId, isOnDuty]);

  const handleAllow = useCallback(() => {
    bgPermissionAnsweredRef.current = true;
    setShowBgModal(false);
    void beginTracking(true);
  }, [beginTracking]);

  const handleSkip = useCallback(() => {
    bgPermissionAnsweredRef.current = true;
    setShowBgModal(false);
    void beginTracking(false);
  }, [beginTracking]);

  const ModalElement = showBgModal ? (
    <BackgroundLocationModal
      visible={showBgModal}
      onAllow={handleAllow}
      onSkip={handleSkip}
    />
  ) : null;

  return { location, ModalElement };
}
