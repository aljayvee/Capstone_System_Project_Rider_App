import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveRiderLocation } from '../firebase/location';
import { createClientPointId, enqueuePoint } from '../services/locationQueue';

export const LOCATION_TRACKING_TASK = 'rider-location-tracking-task';
export const RIDER_ID_STORAGE_KEY = '@sugo_rider_location_task_rider_id';
// Written by the mission hook so the headless task knows which errand the
// points it receives belong to. The task runs outside React and cannot read
// component state.
export const ACTIVE_ERRAND_STORAGE_KEY = '@sugo_rider_location_task_errand_id';

// Same threshold as the client-side quality gate (utils/locationQuality.ts).
// Duplicated as a literal rather than imported because this module is loaded in
// a headless JS context where keeping the import graph minimal matters.
const MAX_ACCURACY_METERS = 50;

interface LocationTaskEventData {
  locations: Array<{
    coords: {
      latitude: number;
      longitude: number;
      heading: number | null;
      accuracy?: number | null;
      speed?: number | null;
    };
    timestamp: number;
  }>;
}

// Defined at module scope so the OS can invoke it in a headless JS context.
// Wrapped in try/catch to ensure headless execution never crashes the host process.
TaskManager.defineTask(LOCATION_TRACKING_TASK, async ({ data, error }) => {
  try {
    if (error) {
      return;
    }

    const { locations } = (data as LocationTaskEventData) || {};
    if (!locations || locations.length === 0) return;
    const latest = locations[locations.length - 1];
    if (!latest || !latest.coords) return;

    const riderIdRaw = await AsyncStorage.getItem(RIDER_ID_STORAGE_KEY).catch(() => null);
    const riderId = riderIdRaw ? Number(riderIdRaw) : null;
    if (!riderId) return;

    const heading =
      latest.coords.heading != null && latest.coords.heading >= 0 ? latest.coords.heading : null;
    const batteryLevel = await Battery.getBatteryLevelAsync().catch(() => -1);

    await saveRiderLocation(riderId, {
      latitude: latest.coords.latitude,
      longitude: latest.coords.longitude,
      heading,
      onDuty: true,
      batteryLevel: batteryLevel != null && batteryLevel >= 0 ? batteryLevel : null,
    }).catch(() => {});

    // The live pin above only needs the newest fix, but the OS hands us the
    // whole batch it accumulated — previously the rest was discarded. Those
    // points are exactly the breadcrumb the ETA, dwell learning, and dispute
    // replay are built from, and they have already been paid for in battery.
    // Buffering them locally also means a blackout costs nothing: the queue is
    // flushed on reconnect (see services/locationQueue.ts).
    const errandId = await AsyncStorage.getItem(ACTIVE_ERRAND_STORAGE_KEY).catch(() => null);
    if (!errandId) return;

    for (const location of locations) {
      const accuracy = location.coords.accuracy ?? null;
      if (accuracy != null && accuracy > MAX_ACCURACY_METERS) continue;

      await enqueuePoint({
        clientPointId: createClientPointId(),
        errandId,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracyMeters: accuracy,
        speedMps: location.coords.speed ?? null,
        headingDeg:
          location.coords.heading != null && location.coords.heading >= 0
            ? location.coords.heading
            : null,
        recordedAt: new Date(location.timestamp).toISOString(),
        // The task only runs when the OS delivers locations, which it does
        // regardless of connectivity — assume offline and let the server's
        // receivedAt tell the true story.
        wasOffline: true,
      }).catch(() => {});
    }
  } catch (e) {
    // Ignore background location task exceptions
  }
});
