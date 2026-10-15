import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateRiderDutyStatus, saveRiderLocation } from '../firebase/location';
import { emitLiveLocation } from '../services/liveLocationSocket';
import {
  BEACON_INTERVAL_ACTIVE_MS,
  BEACON_INTERVAL_IDLE_MS,
  beaconDue,
  endShiftAtMidnight,
  getDutySince,
  noteBeaconSent,
} from '../services/riderShift';
import BackgroundLocationModal from '../components/BackgroundLocationModal';
import {
  LOCATION_TRACKING_TASK,
  RIDER_ID_STORAGE_KEY,
  ACTIVE_ERRAND_STORAGE_KEY,
} from '../tasks/locationTrackingTask';
import { distanceMeters, type Fix } from '../utils/locationQuality';
import {
  claimLivePublish,
  liveStabilizer,
  loadGpsCalibration,
  resetLiveSteadying,
} from '../services/gpsSteadying';
import { createClientPointId, enqueuePoint } from '../services/locationQueue';
import * as Notifications from 'expo-notifications';
import * as Battery from 'expo-battery';
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
  /**
   * Ground speed in m/s, as the GPS steadier estimates it (utils/gpsStabilizer),
   * 0 while the pin is held still. The map reads it to decide whether a fix
   * belongs on the road (riding) or where it is (standing in a store); it was
   * never filled in before, so the map always assumed the rider was standing.
   */
  speed?: number | null;
  /** True while the pin is held in place because the phone is not moving. */
  stationary?: boolean;
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
// BEACON_INTERVAL_IDLE_MS / BEACON_INTERVAL_ACTIVE_MS now live in
// services/riderShift, shared with the background task, which beacons too.

// How often the heartbeat wakes to ask whether a beacon is due. Shorter than
// either cadence above so the same timer serves both, and so the answer is never
// late by more than a tick when a delivery starts and the cadence tightens.
const BEACON_HEARTBEAT_TICK_MS = 5000;

// Idle cadence (on-duty, no active delivery) trades precision for battery —
// riders can stay on-duty for a whole shift. Active-delivery cadence matches
// the original foreground-only implementation's values.
// distanceInterval 0 in both profiles: the background task is also the
// presence heartbeat once the app is closed, and any distance threshold means
// Android delivers nothing to a rider standing still, so a rider waiting for
// work would stop beaconing and show as "signal lost" while ready. timeInterval
// alone paces it.
const IDLE_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.High,
  timeInterval: 10000,
  distanceInterval: 0,
  pausesUpdatesAutomatically: false,
  foregroundService: {
    notificationTitle: 'Sugo Rider',
    notificationBody: 'Tracking your location while on duty',
    notificationColor: '#DC2626',
  },
};

const ACTIVE_DELIVERY_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.High,
  timeInterval: 2000,
  distanceInterval: 0,
  pausesUpdatesAutomatically: false,
  foregroundService: {
    notificationTitle: 'Sugo Rider',
    notificationBody: 'Tracking your location for an active delivery',
    notificationColor: '#DC2626',
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
  // The newest steadied fix already shown on this phone's own map.
  const lastShownAtRef = useRef(0);

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

      // Granted AND running. The permission alone is not evidence the OS let
      // the task survive, and this whole mechanism exists because Android kills
      // things that look permitted.
      //
      // Except in development, where applyMode deliberately never starts the
      // background task (it fights Metro's HMR loader). Reporting task-liveness
      // there sends `false` on every beacon however the device is configured, so
      // the server marks the rider NEEDS_PERMISSIONS and auto-assign answers "no
      // rider can take this errand" for a fleet that is on duty, beaconing, and
      // holding "Allow all the time". Dev falls back to the permission itself;
      // production keeps the stricter test.
      let backgroundLocation = backgroundTaskActiveRef.current;
      if (__DEV__ && !backgroundLocation) {
        try {
          backgroundLocation = (await Location.getBackgroundPermissionsAsync()).granted;
        } catch {
          // A permissions probe that throws is not a granted permission.
        }
      }

      const result = await riderApiService.sendBeacon({
        latitude: fix?.latitude ?? null,
        longitude: fix?.longitude ?? null,
        accuracyMeters: fix?.accuracyMeters ?? null,
        headingDeg: fix?.headingDeg ?? null,
        recordedAt: fix ? new Date(fix.timestamp).toISOString() : null,
        onDuty: isOnDutyRef.current,
        backgroundLocation,
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
        // Lets the server end the shift at 12:00 AM if this phone misses it.
        dutySince: isOnDutyRef.current ? await getDutySince() : null,
      });
      await noteBeaconSent();

      // The server ended this shift at midnight. Going offline here flips the
      // duty switch, which stops tracking through the effect below.
      if (result?.forcedOffline && riderIdRef.current) {
        await endShiftAtMidnight(riderIdRef.current);
      }
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

  const batteryLevelRef = useRef<number | null>(null);
  useEffect(() => {
    let mounted = true;
    const sampleBattery = async () => {
      try {
        const level = await Battery.getBatteryLevelAsync();
        if (mounted && level != null && level >= 0) {
          batteryLevelRef.current = level;
        }
      } catch {
        // Battery read is best-effort
      }
    };
    void sampleBattery();
    const timer = setInterval(sampleBattery, 30_000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  // Heartbeat: a beacon on a timer, not on movement.
  //
  // The beacon in the watcher below is sent from inside the GPS fix callback, so
  // it can only fire when a fix arrives — and both watcher configs carry a
  // distanceInterval, which on Android means a phone that is not moving produces
  // no updates at all. A rider parked waiting for work therefore stopped
  // beaconing, aged past the server's signal-lost window (2.5x the cadence they
  // themselves reported) and dropped out of auto-assign: undispatchable
  // precisely because they were idle, which is the state dispatch exists to
  // serve. Measured gaps of 82s, 148s and 1033s against a declared 30s cadence.
  //
  // Ticks faster than either cadence and lets lastBeaconAtRef decide, so the
  // interval survives a delivery starting or ending without being rebuilt. Both
  // paths share that marker, so a rider who IS moving is not beaconed twice.
  useEffect(() => {
    if (!riderId || !isOnDuty) return;

    const timer = setInterval(() => {
      const beaconEvery = isActiveDeliveryRef.current
        ? BEACON_INTERVAL_ACTIVE_MS
        : BEACON_INTERVAL_IDLE_MS;
      if (Date.now() - lastBeaconAtRef.current < beaconEvery) return;
      lastBeaconAtRef.current = Date.now();
      // The last good fix, which may be null before the first one lands. The
      // server takes a positionless beacon as presence without a location
      // rather than as absence, and ranks that rider by load instead.
      //
      // Skipped when the background task beaconed moments ago; one is enough.
      void beaconDue(isActiveDeliveryRef.current).then((due) => {
        if (due) void sendBeacon(lastAcceptedFixRef.current);
      });
    }, BEACON_HEARTBEAT_TICK_MS);

    return () => clearInterval(timer);
  }, [riderId, isOnDuty, sendBeacon]);

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
    // The next shift starts from fresh fixes, not from where this one stopped.
    resetLiveSteadying();
    lastShownAtRef.current = 0;
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

        // This phone's measured GPS noise, from the Profile GPS check, if it
        // has been run: it sets how far the pin may wander before it moves.
        await loadGpsCalibration();
        if (isCancelled) return;

        // 2. Stream continuous high-accuracy live GPS ticks
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            // One fix a second while the app is open, streamed over the
            // socket to the dispatcher, owner and customer maps (the server
            // relays at most one per rider per second). No distance
            // threshold: a stationary rider still reports, so their pin reads
            // as live rather than frozen. The quality gate below still holds
            // a parked rider's pin still against GPS jitter.
            timeInterval: 1000,
            distanceInterval: 0,
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

            // Steadied before it reaches the map, Firebase, or the trail
            // (utils/gpsStabilizer): held in place while the phone is still,
            // Kalman-smoothed while it moves, junk fixes dropped.
            const verdict = liveStabilizer.push(candidate);
            // 'out_of_order': the background task, in this same JS context,
            // fed this fix first. Show what it produced rather than nothing.
            const steadied =
              verdict.kind === 'reject'
                ? verdict.reason === 'out_of_order'
                  ? liveStabilizer.current()
                  : null
                : verdict.fix;
            if (!steadied || steadied.timestamp <= lastShownAtRef.current) return;
            lastShownAtRef.current = steadied.timestamp;

            const fix: Fix = {
              latitude: steadied.latitude,
              longitude: steadied.longitude,
              accuracyMeters: steadied.accuracyMeters,
              speedMps: steadied.speedMps,
              headingDeg: steadied.headingDeg,
              timestamp: steadied.timestamp,
            };
            lastAcceptedFixRef.current = fix;

            // Adaptive cadence. A rider queueing inside a store is stationary
            // for many minutes at a stretch — on an errand that is the job
            // working correctly, not a stall — and there is nothing to learn
            // from polling GPS every 5 s while their position is not changing.
            // Downshift to the idle profile, and restore the active one the
            // moment they move off again.
            if (riderIdRef.current) {
              const moving = !steadied.locked;
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
              speed: fix.speedMps,
              stationary: steadied.locked,
            });

            // Live pin for the customer's and dispatcher's maps.
            // Stream directly to Firebase RTDB every 2s (active) or 10s (idle) when foregrounded
            // to bypass background task sleep delays on test hardware.
            // claimLivePublish is shared with the background task, so the two
            // never write the same node with different positions.
            const minRtdbGap = !backgroundTaskActiveRef.current
              ? 0
              : isActiveDeliveryRef.current
                ? 2000
                : 10000;

            if (claimLivePublish(fix.timestamp, minRtdbGap)) {
              void saveRiderLocation(riderId, {
                latitude: fix.latitude,
                longitude: fix.longitude,
                heading: fix.headingDeg,
                onDuty: true,
                online: true,
                status: isActiveDeliveryRef.current ? 'BUSY' : 'AVAILABLE',
                activeErrandId: activeErrandIdRef.current ?? null,
                batteryLevel: batteryLevelRef.current ?? undefined,
              }).catch(() => {});
            }

            // The same fix over Socket.IO, so viewers have a second live path
            // when RTDB is slow or refused. Sent even while the background task
            // owns the RTDB node: it is a separate channel, and the server
            // drops anything older than what it has already relayed.
            emitLiveLocation({
              latitude: fix.latitude,
              longitude: fix.longitude,
              heading: fix.headingDeg,
              accuracyMeters: fix.accuracyMeters,
              speedMps: fix.speedMps,
              recordedAt: fix.timestamp,
            });

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
