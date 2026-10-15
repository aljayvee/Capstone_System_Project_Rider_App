import { database } from './config';
import { ref, set, update } from 'firebase/database';

/**
 * Why these two functions report instead of just swallowing.
 *
 * Both used to `catch` and `console.error`, and both call sites then added
 * `.catch(() => {})` on top. The result was a publisher that could fail on
 * every single fix, for an entire shift, and look identical to one that was
 * working: the rider's own screen showed their position happily, because that
 * comes from the device's GPS and never from this write.
 *
 * That is how a fleet-wide outage stayed invisible. The RTDB began refusing
 * unauthenticated writes, every `update()` here was rejected, and the only
 * trace was a console line nobody reads on a phone. A rejection at this layer
 * means the dispatcher and owner maps cannot see this rider at all, which is
 * not a detail worth hiding behind an empty catch block.
 *
 * The contract stays non-throwing on purpose — a telemetry publish must never
 * be able to crash a shift — so the outcome is returned rather than raised.
 */
export type PublishFailure = 'PERMISSION_DENIED' | 'UNKNOWN';

export interface PublishResult {
  ok: boolean;
  reason?: PublishFailure;
  message?: string;
}

/**
 * A rejected write repeats at the GPS cadence, so logging every one would bury
 * the first and only useful occurrence under thousands of duplicates. The
 * reason is logged when it changes, and counted in between.
 */
let lastLoggedReason: PublishFailure | null = null;
let suppressedSinceLastLog = 0;

function classify(err: unknown): PublishFailure {
  const code = String((err as { code?: string })?.code || '').toUpperCase();
  const message = String((err as { message?: string })?.message || '');
  return code.includes('PERMISSION_DENIED') || /permission[_ ]denied/i.test(message)
    ? 'PERMISSION_DENIED'
    : 'UNKNOWN';
}

function reportFailure(operation: string, err: unknown): PublishResult {
  const reason = classify(err);
  const message = String((err as { message?: string })?.message || 'Unknown error');

  if (reason !== lastLoggedReason) {
    if (reason === 'PERMISSION_DENIED') {
      console.error(
        `[Firebase RTDB] ${operation} REJECTED: the database refused this write. ` +
          'Dispatcher and owner tracking cannot see this rider until the Realtime ' +
          `Database security rules allow it. (${message})`
      );
    } else {
      console.error(`[Firebase RTDB] ${operation} failed: ${message}`);
    }
    lastLoggedReason = reason;
    suppressedSinceLastLog = 0;
  } else {
    suppressedSinceLastLog += 1;
    // A periodic reminder, so a long outage does not scroll out of the log
    // entirely after its first line.
    if (suppressedSinceLastLog % 50 === 0) {
      console.error(
        `[Firebase RTDB] ${operation} still failing (${reason}), ` +
          `${suppressedSinceLastLog} suppressed since the last line.`
      );
    }
  }

  return { ok: false, reason, message };
}

function reportSuccess(): PublishResult {
  // Recovery is worth exactly one line too, so a log that showed a failure is
  // not left implying the outage never ended.
  if (lastLoggedReason !== null) {
    console.info('[Firebase RTDB] rider telemetry publishing again.');
    lastLoggedReason = null;
    suppressedSinceLastLog = 0;
  }
  return { ok: true };
}

export type RiderStatusEnum = 'AVAILABLE' | 'BUSY' | 'DISCONNECTED' | 'OFF_DUTY';

export interface RiderLocationData {
  latitude: number;
  longitude: number;
  heading: number | null;
  updatedAt: number;
  onDuty: boolean;
  online: boolean;
  status: RiderStatusEnum;
  activeErrandId: string | null;
  batteryLevel: number | null;
}

export interface SaveRiderLocationInput {
  latitude: number;
  longitude: number;
  heading?: number | null;
  onDuty: boolean;
  online?: boolean;
  status?: RiderStatusEnum;
  activeErrandId?: string | null;
  batteryLevel?: number | null;
}

/**
 * Saves the rider's live GPS location and status to Firebase Realtime Database
 * at path `riders/{id}`.
 */
export async function saveRiderLocation(
  riderId: number,
  data: SaveRiderLocationInput
): Promise<PublishResult> {
  try {
    const locationRef = ref(database, `riders/${riderId}`);
    const status: RiderStatusEnum =
      data.status ?? (data.onDuty ? (data.activeErrandId ? 'BUSY' : 'AVAILABLE') : 'OFF_DUTY');

    const updatePayload: Record<string, any> = {
      latitude: data.latitude,
      longitude: data.longitude,
      heading: data.heading ?? null,
      onDuty: data.onDuty,
      online: data.online ?? true,
      status,
      activeErrandId: data.activeErrandId ?? null,
      updatedAt: Date.now(),
    };

    // Only update batteryLevel when explicitly provided. Leaving it omitted
    // preserves the existing battery level in Firebase RTDB instead of wiping it to null.
    if (data.batteryLevel !== undefined && data.batteryLevel !== null) {
      updatePayload.batteryLevel = data.batteryLevel;
    }

    await update(locationRef, updatePayload);
    return reportSuccess();
  } catch (err) {
    return reportFailure('saveRiderLocation', err);
  }
}

/**
 * Marks the rider off-duty without touching their last-known position — used
 * when tracking stops so the map immediately reflects "OFF_DUTY".
 */
export async function updateRiderDutyStatus(
  riderId: number,
  onDuty: boolean,
  status: RiderStatusEnum = onDuty ? 'AVAILABLE' : 'OFF_DUTY'
): Promise<PublishResult> {
  try {
    const locationRef = ref(database, `riders/${riderId}`);
    await update(locationRef, {
      onDuty,
      online: onDuty,
      status,
      activeErrandId: null,
      updatedAt: Date.now(),
    });
    return reportSuccess();
  } catch (err) {
    return reportFailure('updateRiderDutyStatus', err);
  }
}
