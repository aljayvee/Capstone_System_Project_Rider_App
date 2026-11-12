import type { ErrandPinpoint } from '../types/rider';
import { metersBetween } from '../utils/geo';
import { radiusOf } from './storeArrival';

/**
 * Deciding when a rider who is still "riding" probably needs the task sheet
 * back, although their GPS has not placed them inside the stop's circle.
 *
 * While riding, the sheet and its action dock are off the screen so the whole
 * map is the directions (TaskScreen, map mode). They used to come back only
 * once a fix landed inside the stop's circle (storeArrival.observeFix). So the
 * one button written for a GPS that is not detecting the store, "GPS not
 * detecting? Confirm Arrival", was itself hidden until the GPS detected the
 * store. A rider at the counter with a drifting, coarse or frozen fix was left
 * on a bare map with no sign of what to press.
 *
 * This never moves the errand's step. It only says "show them the sheet"; the
 * step still moves by the circle (auto-arrival) or by the rider's own tap.
 *
 * Pure, so the rule is tested without a device (tests/arrivalAssist.test.ts).
 */

/** Within this many times the stop's own radius, the rider may well be there. */
export const APPROACH_RADIUS_FACTOR = 2;

/**
 * Stopped within this distance of the stop counts as possibly there: the pin
 * can be on the wrong side of a mall, and a pin held still while the rider
 * walks the last stretch (utils/gpsStabilizer) stays where they parked.
 */
export const STOPPED_NEAR_METERS = 400;

/** No fix for this long and the map is not guiding anyone; the manual button has to be in reach. */
export const GPS_LOST_MS = 30_000;

export type ArrivalAssistReason =
  /** Close to the stop, just not inside its circle. */
  | 'close'
  /** Standing still not far from it. */
  | 'stopped-nearby'
  /** The fix is too coarse to prove presence in the circle, so auto-arrival cannot fire. */
  | 'gps-imprecise'
  /** No position at all, or none recently. */
  | 'gps-lost';

export interface ArrivalAssistInput {
  /** The stop this leg ends at: a store, or the customer's door with its own radius. */
  target: (Pick<ErrandPinpoint, 'latitude' | 'longitude'> & Pick<Partial<ErrandPinpoint>, 'geofenceRadiusMeters'>) | null | undefined;
  location:
    | {
        latitude: number;
        longitude: number;
        accuracyMeters?: number | null;
        /** True while the steadied pin is held because the phone is not moving. */
        stationary?: boolean;
        /** Epoch ms of the fix. 0 or missing means unknown, and is never read as old. */
        updatedAt?: number;
      }
    | null
    | undefined;
  now: number;
  /** When this leg began, so a phone still finding its first fix is given time. */
  legStartedAt?: number;
}

/** Why the sheet should come back while riding, or null when it should stay away. */
export function arrivalAssist({ target, location, now, legStartedAt }: ArrivalAssistInput): ArrivalAssistReason | null {
  if (!target) return null;

  if (!location) {
    return typeof legStartedAt === 'number' && now - legStartedAt > GPS_LOST_MS ? 'gps-lost' : null;
  }
  if (typeof location.updatedAt === 'number' && location.updatedAt > 0 && now - location.updatedAt > GPS_LOST_MS) {
    return 'gps-lost';
  }

  const radius = radiusOf(target);
  const distance = metersBetween(location, target);
  const accuracy = typeof location.accuracyMeters === 'number' && location.accuracyMeters > 0 ? location.accuracyMeters : 0;

  // observeFix ignores a fix coarser than the circle, so from here the circle
  // can never say "arrived" however long the rider stands at the counter.
  if (accuracy > radius && distance <= radius + accuracy) return 'gps-imprecise';
  if (distance <= radius * APPROACH_RADIUS_FACTOR) return 'close';
  if (location.stationary && distance <= STOPPED_NEAR_METERS) return 'stopped-nearby';
  return null;
}
