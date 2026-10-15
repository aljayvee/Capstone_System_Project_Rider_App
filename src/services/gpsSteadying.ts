import AsyncStorage from '@react-native-async-storage/async-storage';
import { GpsStabilizer } from '../utils/gpsStabilizer';
import { parseSavedCalibration, type SavedCalibration } from '../utils/gpsCalibration';

/**
 * The one GPS steadier the whole app shares, and the one "last written" mark
 * for the live pin.
 *
 * Shared because two things feed the live pin. The foreground watcher
 * (hooks/useRiderLocationBroadcast) and, in production builds, the background
 * task (tasks/locationTrackingTask) both receive fixes, and both wrote
 * riders/{id} in Firebase. The foreground wrote a held, filtered position; the
 * background task wrote every raw fix. With the app open both ran, so the pin
 * the dispatcher and the customer watch flipped between the two every couple
 * of seconds: the "location unstable every second" the riders reported.
 *
 * Now both push their fixes through this one steadier, in whatever order they
 * arrive. A fix the other path already handled comes back 'out_of_order' and
 * is ignored, and claimLivePublish lets only the newest steadied fix be written.
 * The background task runs in the app's own JS context while the app is alive,
 * so this module state is genuinely shared then. When the app has been closed
 * the task gets a fresh context, a fresh steadier, and is the only writer.
 */
export const liveStabilizer = new GpsStabilizer();

export const GPS_CALIBRATION_STORAGE_KEY = '@sugo_rider_gps_calibration';

let calibrationLoad: Promise<SavedCalibration | null> | null = null;

/**
 * Applies the last GPS check's lock radius to the live steadier. Once per JS
 * context; cheap to await on every fix after the first.
 */
export function loadGpsCalibration(): Promise<SavedCalibration | null> {
  if (!calibrationLoad) {
    calibrationLoad = AsyncStorage.getItem(GPS_CALIBRATION_STORAGE_KEY)
      .then(parseSavedCalibration)
      .catch(() => null)
      .then((saved) => {
        if (saved) liveStabilizer.configure({ lockRadiusMeters: saved.lockRadiusMeters });
        return saved;
      });
  }
  return calibrationLoad;
}

/** Keeps a finished GPS check and applies it to the live pin at once. */
export async function saveGpsCalibration(saved: SavedCalibration): Promise<void> {
  liveStabilizer.configure({ lockRadiusMeters: saved.lockRadiusMeters });
  calibrationLoad = Promise.resolve(saved);
  await AsyncStorage.setItem(GPS_CALIBRATION_STORAGE_KEY, JSON.stringify(saved));
}

let lastPublishedAt = 0;

/**
 * Whether a steadied fix should be written to the live pin now. True at most
 * once per fix, only for a fix newer than the last one written, and only when
 * `minGapMs` has passed since that one.
 */
export function claimLivePublish(timestamp: number, minGapMs: number): boolean {
  if (timestamp <= lastPublishedAt) return false;
  if (timestamp - lastPublishedAt < minGapMs) return false;
  lastPublishedAt = timestamp;
  return true;
}

/** Forgets the steadier's state and the publish mark: the rider went off duty. */
export function resetLiveSteadying(): void {
  liveStabilizer.reset();
  lastPublishedAt = 0;
}
