import { database } from './config';
import { ref, set, update } from 'firebase/database';

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
export async function saveRiderLocation(riderId: number, data: SaveRiderLocationInput): Promise<void> {
  try {
    const locationRef = ref(database, `riders/${riderId}`);
    const status: RiderStatusEnum =
      data.status ?? (data.onDuty ? (data.activeErrandId ? 'BUSY' : 'AVAILABLE') : 'OFF_DUTY');

    await update(locationRef, {
      latitude: data.latitude,
      longitude: data.longitude,
      heading: data.heading ?? null,
      onDuty: data.onDuty,
      online: data.online ?? true,
      status,
      activeErrandId: data.activeErrandId ?? null,
      batteryLevel: data.batteryLevel ?? null,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error('[Firebase RTDB] Error saving rider location:', err);
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
): Promise<void> {
  try {
    const locationRef = ref(database, `riders/${riderId}`);
    await update(locationRef, {
      onDuty,
      online: onDuty,
      status,
      activeErrandId: null,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error('[Firebase RTDB] Error updating rider duty status:', err);
  }
}
