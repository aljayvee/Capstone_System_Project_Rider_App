// What the GPS check (modules/profile/GpsCalibrationScreen) measures, and what
// it concludes. Pure, so every verdict and every piece of advice is tested
// without a phone (tests/gpsCalibration.test.ts).
//
// The check asks the rider to keep the phone still for a short while and
// records every fix. A still phone's fixes should all be the same point; how
// far they scatter is this phone's GPS noise, here, today. That number is used
// twice: it is shown to the rider with advice when it is poor, and it becomes
// the radius the live pin holds still within (utils/gpsStabilizer), so a phone
// that wanders 25 m is not unlocked by its own wandering.

import { distanceMeters } from './locationQuality';
import { MAX_LOCK_RADIUS_METERS, MIN_LOCK_RADIUS_METERS } from './gpsStabilizer';

/** How long the check listens, in seconds. Long enough to see the scatter settle, short enough to stand still for. */
export const CALIBRATION_SECONDS = 30;
/** Fewer fixes than this and no verdict is honest. */
export const MIN_CALIBRATION_FIXES = 10;
/** The lock radius is the scatter plus this share of it, so the pin never unlocks on the phone's ordinary noise. */
const LOCK_RADIUS_MARGIN = 1.25;
/** Doppler speed that means the phone was carried, not left still. */
const CARRIED_SPEED_MPS = 1.5;
/** Fixes at that speed before the check is called spoiled by movement. */
const CARRIED_FIXES = 3;

export interface CalibrationSample {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  speedMps: number | null;
  timestamp: number;
  /** Android flags fixes from a mock-location app. */
  mocked?: boolean;
}

export interface ProviderState {
  locationServicesEnabled: boolean;
  /** Satellite positioning is switched on. */
  gpsAvailable?: boolean;
  /** Wi-Fi and cell assistance ("Google Location Accuracy") is switched on. */
  networkAvailable?: boolean;
}

export type CalibrationGrade = 'good' | 'fair' | 'poor' | 'moved' | 'no_fix';

export interface CalibrationReport {
  grade: CalibrationGrade;
  fixes: number;
  /** Fixes per second actually delivered. */
  fixesPerSecond: number;
  /** Seconds from starting the check to the first fix, or null when none came. */
  firstFixSeconds: number | null;
  /** The phone's own typical (median) accuracy figure, in metres. */
  medianAccuracyMeters: number | null;
  /** Half the fixes landed within this distance of the phone's real spot. */
  spreadP50Meters: number | null;
  /** 95% of the fixes landed within this distance. The raw pin's wander. */
  spreadP95Meters: number | null;
  /** How far the steadied pin moved during the check; zero is the goal. */
  pinMovedMeters: number | null;
  /** The lock radius this phone should use, or null when the check cannot say. */
  lockRadiusMeters: number | null;
  mocked: boolean;
  /** Plain-language fixes for the rider, most important first. */
  advice: string[];
}

/** The part of a report kept on the phone and applied to the live pin. */
export interface SavedCalibration {
  lockRadiusMeters: number;
  spreadP95Meters: number;
  medianAccuracyMeters: number | null;
  grade: CalibrationGrade;
  measuredAt: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * The phone's best estimate of where it really was: every fix averaged, each
 * weighted by how precise the phone said it was.
 */
export function weightedCenter(samples: CalibrationSample[]): { latitude: number; longitude: number } | null {
  if (samples.length === 0) return null;
  let lat = 0;
  let lon = 0;
  let total = 0;
  for (const s of samples) {
    const accuracy = s.accuracyMeters && s.accuracyMeters > 0 ? s.accuracyMeters : 25;
    const weight = 1 / (accuracy * accuracy);
    lat += s.latitude * weight;
    lon += s.longitude * weight;
    total += weight;
  }
  return { latitude: lat / total, longitude: lon / total };
}

/** Largest distance of any point from the first one: how far a pin drawn from these points travelled. */
export function maxDisplacement(points: Array<{ latitude: number; longitude: number }>): number | null {
  if (points.length === 0) return null;
  const first = points[0];
  return points.reduce((max, p) => Math.max(max, distanceMeters(first, p)), 0);
}

export function analyzeCalibration(input: {
  samples: CalibrationSample[];
  /** The steadied pin's positions over the same check (utils/gpsStabilizer). */
  steadied: Array<{ latitude: number; longitude: number }>;
  startedAt: number;
  endedAt: number;
  provider: ProviderState | null;
}): CalibrationReport {
  const { samples, steadied, startedAt, endedAt, provider } = input;
  const seconds = Math.max(1, (endedAt - startedAt) / 1000);
  const mocked = samples.some((s) => s.mocked === true);
  const firstFixSeconds = samples.length > 0 ? round1(Math.max(0, (samples[0].timestamp - startedAt) / 1000)) : null;

  const accuracies = samples
    .map((s) => s.accuracyMeters)
    .filter((a): a is number => typeof a === 'number' && a >= 0)
    .sort((a, b) => a - b);
  const medianAccuracyMeters = accuracies.length > 0 ? round1(percentile(accuracies, 0.5)) : null;

  const center = weightedCenter(samples);
  const spreads = center ? samples.map((s) => distanceMeters(center, s)).sort((a, b) => a - b) : [];
  const spreadP50Meters = spreads.length > 0 ? round1(percentile(spreads, 0.5)) : null;
  const spreadP95Meters = spreads.length > 0 ? round1(percentile(spreads, 0.95)) : null;
  const pinMoved = maxDisplacement(steadied);
  const pinMovedMeters = pinMoved === null ? null : round1(pinMoved);
  const fixesPerSecond = round1(samples.length / seconds);

  const carried = samples.filter((s) => typeof s.speedMps === 'number' && s.speedMps >= CARRIED_SPEED_MPS).length;

  let grade: CalibrationGrade;
  if (samples.length === 0) grade = 'no_fix';
  else if (carried >= CARRIED_FIXES) grade = 'moved';
  else if (samples.length < MIN_CALIBRATION_FIXES) grade = 'poor';
  else if ((medianAccuracyMeters ?? Infinity) <= 10 && (spreadP95Meters ?? Infinity) <= 15 && fixesPerSecond >= 0.6)
    grade = 'good';
  else if ((medianAccuracyMeters ?? Infinity) <= 25 && (spreadP95Meters ?? Infinity) <= 35) grade = 'fair';
  else grade = 'poor';

  // Only a check that saw a still phone for long enough may retune the pin.
  const lockRadiusMeters =
    grade === 'good' || grade === 'fair' || (grade === 'poor' && samples.length >= MIN_CALIBRATION_FIXES)
      ? round1(
          Math.min(
            MAX_LOCK_RADIUS_METERS,
            Math.max(MIN_LOCK_RADIUS_METERS, (spreadP95Meters ?? 0) * LOCK_RADIUS_MARGIN)
          )
        )
      : null;

  const advice: string[] = [];
  if (provider && !provider.locationServicesEnabled) {
    advice.push('Location is switched off on this phone. Turn it on in Settings, then run the check again.');
  }
  if (provider && provider.gpsAvailable === false) {
    advice.push('Satellite GPS is off. Set Location mode to use GPS so the phone can hear the satellites.');
  }
  if (mocked) {
    advice.push(
      'A fake-location app is supplying your position. Turn it off in Developer options. Dispatch cannot trust a faked position.'
    );
  }
  if (grade === 'no_fix') {
    advice.push('No position arrived. Step outside under open sky and try again. The first fix can take up to a minute.');
  }
  if (grade === 'moved') {
    advice.push('The phone moved during the check. Set it down or hold it still for the whole 30 seconds.');
  }
  if (provider && provider.networkAvailable === false) {
    advice.push(
      'Turn on Google Location Accuracy. Wi-Fi and cell towers help the phone find the satellites faster and keep the fix steady between buildings.'
    );
  }
  if ((grade === 'fair' || grade === 'poor') && (medianAccuracyMeters ?? 0) > 10) {
    advice.push(
      'The signal is weak here. Roofs, walls and tall buildings bounce the satellite signal, which makes the position wander. Mount the phone where it can see the sky, not in a bag or a pocket.'
    );
  }
  if (samples.length > 0 && fixesPerSecond < 0.6 && grade !== 'moved') {
    advice.push(
      'The phone sent fewer positions than asked. Turn off battery saver and set Sugo Rider\'s battery use to Unrestricted.'
    );
  }
  if (typeof firstFixSeconds === 'number' && firstFixSeconds > 20) {
    advice.push('The first position took a long time. Keeping Location on all the time lets the phone remember where the satellites are.');
  }
  if (grade === 'good' && advice.length === 0) {
    advice.push('Your GPS is working well here. Nothing to change.');
  }

  return {
    grade,
    fixes: samples.length,
    fixesPerSecond,
    firstFixSeconds,
    medianAccuracyMeters,
    spreadP50Meters,
    spreadP95Meters,
    pinMovedMeters,
    lockRadiusMeters,
    mocked,
    advice,
  };
}

/** The part of a report to keep and apply, or null when the check cannot retune the pin. */
export function toSavedCalibration(report: CalibrationReport, measuredAt: number): SavedCalibration | null {
  if (report.lockRadiusMeters === null || report.spreadP95Meters === null) return null;
  return {
    lockRadiusMeters: report.lockRadiusMeters,
    spreadP95Meters: report.spreadP95Meters,
    medianAccuracyMeters: report.medianAccuracyMeters,
    grade: report.grade,
    measuredAt,
  };
}

/** Reads a stored calibration defensively: storage from an older build, or hand-edited, must not break tracking. */
export function parseSavedCalibration(raw: string | null): SavedCalibration | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (
      typeof value?.lockRadiusMeters !== 'number' ||
      !Number.isFinite(value.lockRadiusMeters) ||
      typeof value?.spreadP95Meters !== 'number' ||
      typeof value?.measuredAt !== 'number'
    ) {
      return null;
    }
    return {
      lockRadiusMeters: Math.min(MAX_LOCK_RADIUS_METERS, Math.max(MIN_LOCK_RADIUS_METERS, value.lockRadiusMeters)),
      spreadP95Meters: value.spreadP95Meters,
      medianAccuracyMeters: typeof value.medianAccuracyMeters === 'number' ? value.medianAccuracyMeters : null,
      grade: value.grade,
      measuredAt: value.measuredAt,
    };
  } catch {
    return null;
  }
}
