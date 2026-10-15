import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { riderApiService, type RiderBeaconResult } from '../config/apiConfig';
import { updateRiderDutyStatus } from '../firebase/location';

/**
 * The rider's shift, as the three statuses the dispatcher sees define it:
 *
 * - **Available Online**: on duty, signed in, with "Allow all the time"
 *   location, so the app keeps reporting in the background even when closed.
 * - **Available Signal Lost**: on duty, but the server has stopped hearing
 *   from this phone.
 * - **Offline**: signed out, gone offline, or the shift ended at 12:00 AM.
 *
 * Shared by the foreground screens and the headless background task, which is
 * the one thing still running once the rider closes the app. Everything here
 * is safe to call without React: it reads and writes storage, never state.
 */

/** When the rider went on duty, epoch ms. Sent with every beacon. */
export const DUTY_SINCE_KEY = '@sugo_rider_duty_since';
/** When any path last sent a beacon, so the foreground and background never double up. */
export const LAST_BEACON_AT_KEY = '@sugo_rider_last_beacon_at';
/** Mirrors RiderAuthContext's STORAGE_KEY_USER, which carries the duty flag across launches. */
const USER_STORAGE_KEY = '@sugo_rider_user';

export const BEACON_INTERVAL_IDLE_MS = 10000;
export const BEACON_INTERVAL_ACTIVE_MS = 5000;

/** Manila is UTC+8 all year. Kept identical to the server's rule. */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function mostRecentManilaMidnight(now: number = Date.now()): number {
  return Math.floor((now + MANILA_OFFSET_MS) / DAY_MS) * DAY_MS - MANILA_OFFSET_MS;
}

export async function getDutySince(): Promise<number | null> {
  const raw = await AsyncStorage.getItem(DUTY_SINCE_KEY).catch(() => null);
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Marks the start of a shift. `fresh` overwrites (the rider just tapped Go
 * Online); otherwise an existing start is kept (a relaunch mid-shift), which
 * is what lets a shift that began yesterday be recognised as expired.
 */
export async function startShift(fresh: boolean, now: number = Date.now()): Promise<void> {
  if (!fresh && (await getDutySince()) !== null) return;
  await AsyncStorage.setItem(DUTY_SINCE_KEY, String(now)).catch(() => {});
}

export async function clearShift(): Promise<void> {
  await AsyncStorage.removeItem(DUTY_SINCE_KEY).catch(() => {});
}

/** True once the shift started before the most recent 12:00 AM. */
export async function shiftExpired(now: number = Date.now()): Promise<boolean> {
  const since = await getDutySince();
  return since !== null && since < mostRecentManilaMidnight(now);
}

type ShiftEndedListener = () => void;
const listeners = new Set<ShiftEndedListener>();

/** The signed-in screens subscribe, to flip the duty switch and say why. */
export function onShiftEnded(listener: ShiftEndedListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Ends the shift at midnight: off duty in storage, in Firebase, and in the
 * next beacon. `stopTracking` is passed by the background task, which has no
 * screen to stop it; the screens stop tracking themselves when duty flips off.
 */
export async function endShiftAtMidnight(
  riderId: number | null,
  stopTracking?: () => Promise<void>
): Promise<void> {
  await clearShift();
  try {
    const raw = await AsyncStorage.getItem(USER_STORAGE_KEY);
    if (raw) {
      const user = JSON.parse(raw);
      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify({ ...user, isOnline: false }));
    }
  } catch {
    // A corrupt user record is not worth failing the shift end over.
  }
  if (riderId) await updateRiderDutyStatus(riderId, false).catch(() => {});
  if (stopTracking) await stopTracking().catch(() => {});
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // One bad listener must not stop the others.
    }
  });
}

/** Whether a beacon is due, counting beacons from either path. */
export async function beaconDue(activeDelivery: boolean, now: number = Date.now()): Promise<boolean> {
  const raw = await AsyncStorage.getItem(LAST_BEACON_AT_KEY).catch(() => null);
  const last = raw ? Number(raw) : 0;
  return now - last >= (activeDelivery ? BEACON_INTERVAL_ACTIVE_MS : BEACON_INTERVAL_IDLE_MS);
}

export async function noteBeaconSent(now: number = Date.now()): Promise<void> {
  await AsyncStorage.setItem(LAST_BEACON_AT_KEY, String(now)).catch(() => {});
}

export interface BeaconFix {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  headingDeg: number | null;
  timestamp: number;
}

/**
 * The background task's beacon. It runs only while the rider is on duty and
 * the OS is letting it run, which is exactly what "background location" means
 * to the server, so both are reported true.
 */
export async function sendBackgroundBeacon(fix: BeaconFix, activeDelivery: boolean): Promise<RiderBeaconResult | null> {
  let notifications = false;
  try {
    notifications = (await Notifications.getPermissionsAsync()).granted;
  } catch {
    // A permissions probe that throws is not a granted permission.
  }
  const result = await riderApiService.sendBeacon({
    latitude: fix.latitude,
    longitude: fix.longitude,
    accuracyMeters: fix.accuracyMeters,
    headingDeg: fix.headingDeg,
    recordedAt: new Date(fix.timestamp).toISOString(),
    onDuty: true,
    backgroundLocation: true,
    notifications,
    // Same placeholder as the foreground beacon; see useRiderLocationBroadcast.
    exactAlarms: true,
    beaconIntervalMs: activeDelivery ? BEACON_INTERVAL_ACTIVE_MS : BEACON_INTERVAL_IDLE_MS,
    connectivity: null,
    dutySince: await getDutySince(),
  });
  await noteBeaconSent();
  return result;
}
