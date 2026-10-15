import { headingDelta } from './navigationCamera';

/**
 * The phone's compass, and which heading turns the map.
 *
 * Like Google Maps driving directions, the map turns so "ahead" is up the
 * screen. Which "ahead" depends on what the rider is doing:
 *
 *   - Stopped or walking: where the PHONE faces. A rider at a junction, or
 *     walking out of a store, turns the phone to find their way; the map turns
 *     with it, and the compass rose shows where north is.
 *   - Riding: where the ROAD runs. A phone on a motorcycle sits beside the
 *     engine, the battery and a steel frame, all of which bend a magnetometer
 *     by tens of degrees; the direction of travel does not.
 *
 * Switching between the two has hysteresis (enter "riding" at 3 m/s, leave it
 * below 1.5 m/s), so a rider creeping in traffic does not flip the map between
 * the compass and the road every second.
 *
 * Pure: no sensors, no React. hooks/useDeviceHeading.ts feeds it.
 */

/** Riding from here up (about 11 km/h): the road turns the map. */
export const RIDING_ENTER_MPS = 3;
/** Stopped again below this (about 5 km/h): the phone turns the map. */
export const RIDING_EXIT_MPS = 1.5;

/**
 * The phone's own calibration level, as expo-location reports it on both
 * platforms: 3 high, 2 medium, 1 low, 0 unreliable. Below 2 the reading can
 * be 35 degrees or more out, which on a map is the wrong street.
 */
export const MIN_COMPASS_ACCURACY = 2;

/** How much each new reading counts in the smoothed heading (0 to 1). */
export const COMPASS_SMOOTHING = 0.25;

/** A new heading is passed on only if it moved this far, or this long has passed. */
export const COMPASS_MIN_CHANGE_DEG = 2;
export const COMPASS_MIN_INTERVAL_MS = 150;

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
const CARDINAL_NAMES = [
  'north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west',
] as const;

export type Cardinal = (typeof CARDINALS)[number];

/** 0-360, whatever came in. */
export function normalizeDegrees(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function sector(deg: number): number {
  return Math.round(normalizeDegrees(deg) / 45) % 8;
}

/** 42 -> "NE". The eight points a rider can act on; sixteen is too fine to read at speed. */
export function cardinal(deg: number): Cardinal {
  return CARDINALS[sector(deg)];
}

/** 42 -> "north-east", for sentences: "Head north-east on J. C. Avenue". */
export function cardinalName(deg: number): string {
  return CARDINAL_NAMES[sector(deg)];
}

/** A heading as a unit vector, so averaging 350 and 10 gives 0, not 180. */
export interface HeadingVector {
  x: number;
  y: number;
}

/**
 * Exponential smoothing on the circle. Averaging raw degrees breaks at north:
 * the mean of 359 and 1 is 180. Averaging the sine and cosine does not.
 */
export function smoothHeading(previous: HeadingVector | null, deg: number, weight = COMPASS_SMOOTHING): HeadingVector {
  const rad = (normalizeDegrees(deg) * Math.PI) / 180;
  const next = { x: Math.sin(rad), y: Math.cos(rad) };
  if (!previous) return next;
  return {
    x: previous.x * (1 - weight) + next.x * weight,
    y: previous.y * (1 - weight) + next.y * weight,
  };
}

export function vectorHeading(v: HeadingVector): number {
  return normalizeDegrees((Math.atan2(v.x, v.y) * 180) / Math.PI);
}

/** Whether a smoothed heading is worth a re-render: moved enough, or long enough since the last. */
export function shouldEmitHeading(last: number | null, next: number, msSinceLast: number): boolean {
  if (last === null) return true;
  const moved = Math.abs(headingDelta(last, next));
  return moved >= COMPASS_MIN_CHANGE_DEG && msSinceLast >= COMPASS_MIN_INTERVAL_MS;
}

export function compassUsable(heading: number | null | undefined, accuracy: number | null | undefined): heading is number {
  return (
    typeof heading === 'number' &&
    Number.isFinite(heading) &&
    heading >= 0 &&
    (accuracy == null || accuracy >= MIN_COMPASS_ACCURACY)
  );
}

export type MapHeadingSource = 'compass' | 'road' | 'none';

export interface MapHeadingInput {
  /** Ground speed from the GPS steadier, m/s. */
  speedMps: number | null | undefined;
  /** Which way the road ahead runs (navigationCamera), or the rider's course off it. */
  roadHeading: number | null | undefined;
  /** The phone's smoothed compass heading. */
  compassHeading: number | null | undefined;
  compassAccuracy: number | null | undefined;
  /** Whether the last decision was "riding", for the hysteresis. */
  wasRiding: boolean;
}

export interface MapHeadingChoice {
  heading: number | null;
  source: MapHeadingSource;
  riding: boolean;
  /** True when the compass would be in charge but cannot be trusted: ask for a figure 8. */
  compassNeedsCalibration: boolean;
}

/** Which heading turns the map and the rider's arrow now. */
export function chooseMapHeading(input: MapHeadingInput): MapHeadingChoice {
  const speed = typeof input.speedMps === 'number' && input.speedMps >= 0 ? input.speedMps : 0;
  const riding = input.wasRiding ? speed >= RIDING_EXIT_MPS : speed >= RIDING_ENTER_MPS;
  const road = typeof input.roadHeading === 'number' && Number.isFinite(input.roadHeading) ? input.roadHeading : null;
  const hasCompassReading = typeof input.compassHeading === 'number' && input.compassHeading >= 0;
  const compassOk = compassUsable(input.compassHeading, input.compassAccuracy);

  if (!riding && compassOk) {
    return { heading: input.compassHeading as number, source: 'compass', riding, compassNeedsCalibration: false };
  }
  return {
    heading: road,
    source: road !== null ? 'road' : 'none',
    riding,
    compassNeedsCalibration: !riding && hasCompassReading && !compassOk,
  };
}

/**
 * The first instruction of a route, with a compass point: "Head north-east on
 * J. C. Avenue". The engine's own words are "Head out on J. C. Avenue", which
 * does not say which way out, the one thing a rider standing at a gate needs.
 */
export function departInstruction(bearingAfter: number | null | undefined, streetName: string | null | undefined): string | null {
  if (typeof bearingAfter !== 'number' || !Number.isFinite(bearingAfter)) return null;
  const street = (streetName ?? '').trim();
  return street ? `Head ${cardinalName(bearingAfter)} on ${street}` : `Head ${cardinalName(bearingAfter)}`;
}
