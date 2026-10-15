// Turns the phone's raw GPS fixes into a pin that holds still while the rider
// is still and moves smoothly while they ride.
//
// Why this exists. A phone GPS fix is a guess with an error circle around it,
// and a new guess arrives every second. Standing still, successive guesses land
// anywhere in that circle, 5 m apart under open sky, 20 to 40 m apart beside
// buildings or indoors. Drawn raw, the pin walks around the car park all the
// time the rider is inside a store; ridden raw, it zig-zags across the road and
// wanders far enough off the route that the route is recalculated from a
// neighbouring street.
//
// The earlier gate (utils/locationQuality.evaluateFix) held a fix only while it
// stayed within a fixed 15 m of the last one AND the phone reported under
// 0.5 m/s. Budget phones report 0.5 to 1.5 m/s of speed noise standing still,
// and indoor fixes wander past 15 m, so the hold broke every few seconds and
// each broken hold moved the anchor to wherever the noise had got to.
//
// Two modes, the way navigation apps do it:
//
// - Still (locked): the pin is pinned to one spot and does not move at all. It
//   unlocks only on real evidence of travel: fixes landing outside the
//   phone's own error circle, or the satellites' Doppler speed saying the
//   phone is moving, on consecutive fixes. One wild fix is not travel.
//
// - Moving: a Kalman filter, one per axis, that tracks position and velocity.
//   Each fix is weighed by the accuracy the phone reports for it, so a 5 m fix
//   pulls hard and a 40 m fix barely nudges. Doppler speed and heading, which
//   the GNSS chip measures independently of position and which multipath
//   corrupts far less, are fed in as a velocity reading, which is what keeps
//   the filter from lagging behind a rider who is really moving.
//
// Pure: no timers, no storage, no React. The hook and the background task each
// feed it one fix at a time. Tested in tests/gpsStabilizer.test.ts.

import {
  distanceMeters,
  MAX_ACCURACY_METERS,
  MAX_PLAUSIBLE_SPEED_MPS,
  type Fix,
} from './locationQuality';

/** How far a still phone's fixes may wander before it counts as moving, before any GPS check has been run. */
export const DEFAULT_LOCK_RADIUS_METERS = 12;
/** Bounds on a measured lock radius. Below 8 m, noise unlocks it; above 35 m, a rider walking into a store never shows it. */
export const MIN_LOCK_RADIUS_METERS = 8;
export const MAX_LOCK_RADIUS_METERS = 35;

/** Estimated speed under which the phone is treated as stopped. Above walking-in-a-shop, below pulling away. */
export const STILL_SPEED_MPS = 0.8;
/** Reported (Doppler) speed under which a fix can count toward stopping. Allows for budget-phone speed noise. */
export const STILL_REPORTED_SPEED_MPS = 1.2;
/** Consecutive still fixes before the pin locks: about three seconds at the one-second rate. */
export const LOCK_AFTER_FIXES = 3;

/** Doppler speed that counts as evidence of travel while locked. */
export const MOVING_SPEED_MPS = 2;
/**
 * Consecutive Doppler-backed fixes before the pin unlocks. The satellites'
 * speed reading is the reliable signal that a rider has pulled away, so two in
 * a row are enough.
 */
export const UNLOCK_AFTER_FIXES = 2;
/**
 * Consecutive fixes outside the circle, with no Doppler speed to back them,
 * before the pin unlocks. More than for Doppler: a still phone's error drifts
 * slowly rather than jumping about, so a couple of fixes outside in a row is
 * something a still phone does.
 */
export const UNLOCK_BY_POSITION_FIXES = 3;
/**
 * How many times the phone's own accuracy figure a fix must land from the spot
 * to count as outside. The figure is a 68% radius; twice it holds about 99% of
 * a still phone's fixes.
 */
const OUTSIDE_ACCURACY_FACTOR = 2;
/** A locked fix must also have moved at least this far for Doppler speed alone to count. */
const MIN_DOPPLER_DISPLACEMENT_METERS = 3;
/**
 * A fix this many times further out than the ordinary "outside" distance
 * counts as travel whatever the phone says its speed is. The fallback for a
 * phone that reports a speed of 0 whether or not it is moving, which would
 * otherwise freeze the pin for a whole ride.
 */
const FAR_OUTSIDE_FACTOR = 3;
/** Seconds without a fix after which one far-off fix is taken as the rider having moved (the app was asleep). */
const GAP_SECONDS = 5;

/**
 * While locked, the spot is corrected once the average of the still fixes is
 * confidently this far from it: at least this far, and further than three
 * times that average's own uncertainty. A first lock taken from a rough fix
 * would otherwise sit metres off for as long as the rider stands there. The
 * average keeps growing after a correction, so it only gets surer, and a
 * second correction is rare.
 */
export const RESETTLE_METERS = 6;
/** Still fixes averaged before a correction is considered. */
const RESETTLE_AFTER_FIXES = 10;

/**
 * Speed noise the filter expects: how hard a motorcycle in town can speed up
 * or brake, in m/s². Higher follows turns faster and lets more jitter through.
 */
const ACCEL_NOISE = 2.5;
/** Error of a Doppler speed reading, per axis, in m/s. */
const DOPPLER_SIGMA_MPS = 1;
/** Doppler heading is noise below this speed, so it is not used as a velocity reading. */
const DOPPLER_MIN_SPEED_MPS = 1;
/** Speed above which a heading is trusted, from the phone or from the filter. */
const HEADING_MIN_SPEED_MPS = 1.5;
/** Used when a fix carries no accuracy at all. Deliberately pessimistic. */
const UNKNOWN_ACCURACY_METERS = 25;
/**
 * Android's accuracy is the radius holding 68% of fixes. For a round 2-D error
 * that radius is about 1.5 standard deviations of each axis.
 */
const RADIUS68_PER_SIGMA = 1.515;
/**
 * Consecutive "impossibly fast" rejections after which the filter itself is
 * assumed wrong (it started from a wild network fix) and restarts on the new
 * fixes, rather than rejecting the truth forever.
 */
const MAX_IMPOSSIBLE_STREAK = 5;

const METERS_PER_DEGREE = 111_320;

export interface StableFix extends Fix {
  /** True while the pin is locked in place because the phone is not moving. */
  locked: boolean;
}

export type StabilizerVerdict =
  | { kind: 'moving'; fix: StableFix }
  | { kind: 'still'; fix: StableFix }
  | { kind: 'reject'; reason: 'inaccurate' | 'out_of_order' | 'implausible_speed' };

export interface StabilizerSettings {
  /** How far a still phone's fixes wander; from the GPS check on this phone when one has been run. */
  lockRadiusMeters?: number;
}

/** One axis of a constant-velocity Kalman filter: position p (m), velocity v (m/s), covariance P. */
interface Axis {
  p: number;
  v: number;
  pp: number;
  pv: number;
  vv: number;
}

function newAxis(position: number, velocity: number, positionVariance: number, velocityVariance: number): Axis {
  return { p: position, v: velocity, pp: positionVariance, pv: 0, vv: velocityVariance };
}

function predict(axis: Axis, dt: number): void {
  const q = ACCEL_NOISE * ACCEL_NOISE;
  const dt2 = dt * dt;
  axis.p += axis.v * dt;
  // P = F P F' + Q, F = [[1, dt], [0, 1]], Q for white acceleration noise.
  const pp = axis.pp + 2 * dt * axis.pv + dt2 * axis.vv + (q * dt2 * dt2) / 4;
  const pv = axis.pv + dt * axis.vv + (q * dt2 * dt) / 2;
  const vv = axis.vv + q * dt2;
  axis.pp = pp;
  axis.pv = pv;
  axis.vv = vv;
}

function observePosition(axis: Axis, z: number, variance: number): void {
  const s = axis.pp + variance;
  const kp = axis.pp / s;
  const kv = axis.pv / s;
  const innovation = z - axis.p;
  axis.p += kp * innovation;
  axis.v += kv * innovation;
  const pp = (1 - kp) * axis.pp;
  const pv = (1 - kp) * axis.pv;
  const vv = axis.vv - kv * axis.pv;
  axis.pp = pp;
  axis.pv = pv;
  axis.vv = vv;
}

function observeVelocity(axis: Axis, z: number, variance: number): void {
  const s = axis.vv + variance;
  const kp = axis.pv / s;
  const kv = axis.vv / s;
  const innovation = z - axis.v;
  axis.p += kp * innovation;
  axis.v += kv * innovation;
  const pp = axis.pp - kp * axis.pv;
  const pv = axis.pv - kp * axis.vv;
  const vv = (1 - kv) * axis.vv;
  axis.pp = pp;
  axis.pv = pv;
  axis.vv = vv;
}

function clampLockRadius(meters: number | undefined): number {
  if (typeof meters !== 'number' || !Number.isFinite(meters)) return DEFAULT_LOCK_RADIUS_METERS;
  return Math.min(MAX_LOCK_RADIUS_METERS, Math.max(MIN_LOCK_RADIUS_METERS, meters));
}

const validHeading = (heading: number | null | undefined): heading is number =>
  typeof heading === 'number' && Number.isFinite(heading) && heading >= 0;

const validSpeed = (speed: number | null | undefined): speed is number =>
  typeof speed === 'number' && Number.isFinite(speed) && speed >= 0;

export class GpsStabilizer {
  private lockRadius: number;

  // Local flat frame, in metres east (x) and north (y) of a reference point.
  // Accurate to centimetres across a town, and re-centred on long trips.
  private refLat = 0;
  private refLon = 0;
  private metersPerDegLon = METERS_PER_DEGREE;

  private x: Axis | null = null;
  private y: Axis | null = null;
  private lastRaw: Fix | null = null;
  private output: StableFix | null = null;

  private locked = false;
  private anchor: { x: number; y: number } | null = null;
  private stillStreak = 0;
  private dopplerStreak = 0;
  private outsideStreak = 0;
  private impossibleStreak = 0;
  private heading: number | null = null;

  // Accuracy-weighted average of the fixes seen while locked.
  private settleSumX = 0;
  private settleSumY = 0;
  private settleWeight = 0;
  private settleCount = 0;

  constructor(settings: StabilizerSettings = {}) {
    this.lockRadius = clampLockRadius(settings.lockRadiusMeters);
  }

  /** Changes the lock radius, e.g. after the GPS check has measured this phone. Keeps the current state. */
  configure(settings: StabilizerSettings): void {
    if (settings.lockRadiusMeters !== undefined) this.lockRadius = clampLockRadius(settings.lockRadiusMeters);
  }

  get lockRadiusMeters(): number {
    return this.lockRadius;
  }

  /** The latest steadied fix, or null before the first. */
  current(): StableFix | null {
    return this.output;
  }

  /** Forgets everything; the next fix starts afresh. */
  reset(): void {
    this.x = null;
    this.y = null;
    this.lastRaw = null;
    this.output = null;
    this.locked = false;
    this.anchor = null;
    this.stillStreak = 0;
    this.dopplerStreak = 0;
    this.outsideStreak = 0;
    this.impossibleStreak = 0;
    this.heading = null;
    this.clearSettle();
  }

  push(raw: Fix): StabilizerVerdict {
    if (raw.accuracyMeters != null && raw.accuracyMeters > MAX_ACCURACY_METERS) {
      return { kind: 'reject', reason: 'inaccurate' };
    }

    const previous = this.lastRaw;
    if (!previous || !this.x || !this.y) {
      this.start(raw);
      return this.emit(raw);
    }

    const dt = (raw.timestamp - previous.timestamp) / 1000;
    if (dt <= 0) return { kind: 'reject', reason: 'out_of_order' };

    if (distanceMeters(raw, previous) / dt > MAX_PLAUSIBLE_SPEED_MPS) {
      this.impossibleStreak += 1;
      if (this.impossibleStreak < MAX_IMPOSSIBLE_STREAK) {
        return { kind: 'reject', reason: 'implausible_speed' };
      }
      // Five "impossible" fixes in a row that agree with each other are the
      // truth; the fix everything was measured against was the glitch.
      this.start(raw);
      return this.emit(raw);
    }
    this.impossibleStreak = 0;
    this.lastRaw = raw;

    // Re-centre the flat frame on long trips so it stays accurate.
    if (Math.abs(raw.latitude - this.refLat) > 0.2 || Math.abs(raw.longitude - this.refLon) > 0.2) {
      this.start(raw);
      return this.emit(raw);
    }

    const accuracy = raw.accuracyMeters ?? UNKNOWN_ACCURACY_METERS;
    const sigma = Math.max(2, accuracy / RADIUS68_PER_SIGMA);
    const { x: zx, y: zy } = this.toLocal(raw.latitude, raw.longitude);
    const doppler = validSpeed(raw.speedMps) ? raw.speedMps : null;

    if (this.locked && this.anchor) {
      const fromAnchor = Math.hypot(zx - this.anchor.x, zy - this.anchor.y);
      // Outside the phone's own error circle, or the lock radius, whichever is
      // wider: a 30 m fix landing 25 m away says nothing about travel.
      const gate = Math.max(this.lockRadius, OUTSIDE_ACCURACY_FACTOR * accuracy);
      // But a still phone's position drifts, slowly and for tens of seconds at
      // a time, while its Doppler speed stays near zero: the speed comes from
      // the carrier's frequency shift, which reflections off buildings bend far
      // less than they bend the position. So while the phone reports it is
      // barely moving, drift outside the circle does not count as travel.
      // Measured on simulated drifting phones (tests/gpsStabilizer.test.ts),
      // counting it anyway unlocked a still pin more than once per stop.
      const dopplerSaysStill = doppler !== null && doppler < STILL_REPORTED_SPEED_MPS;
      const outside =
        fromAnchor > FAR_OUTSIDE_FACTOR * gate || (!dopplerSaysStill && fromAnchor > gate);
      // Doppler speed with some real displacement behind it. The displacement
      // keeps a budget phone's indoor speed noise from unlocking on its own.
      const dopplerSaysMoving =
        doppler !== null &&
        doppler >= MOVING_SPEED_MPS &&
        fromAnchor >= Math.max(MIN_DOPPLER_DISPLACEMENT_METERS, this.lockRadius / 2);
      // A good fix far away after a gap (the app was asleep while the rider
      // rode off) needs no second opinion. Only after a gap: a single far fix
      // a second after the last is a reflection, not a journey.
      const leapt = dt >= GAP_SECONDS && accuracy <= 20 && fromAnchor > Math.max(50, 3 * accuracy);

      this.dopplerStreak = dopplerSaysMoving ? this.dopplerStreak + 1 : 0;
      this.outsideStreak = outside ? this.outsideStreak + 1 : 0;

      if (
        leapt ||
        this.dopplerStreak >= UNLOCK_AFTER_FIXES ||
        this.outsideStreak >= UNLOCK_BY_POSITION_FIXES
      ) {
        this.unlock(zx, zy, sigma, raw);
        return this.emit(raw);
      }

      // The heading stays whatever it was when the rider stopped: a still
      // phone's course is noise, and the arrow should not spin at a red light.
      this.settle(zx, zy, accuracy);
      return this.emit(raw);
    }

    // Moving: predict to now, then take in the position and the Doppler velocity.
    predict(this.x, dt);
    predict(this.y, dt);
    observePosition(this.x, zx, sigma * sigma);
    observePosition(this.y, zy, sigma * sigma);
    if (doppler !== null && doppler >= DOPPLER_MIN_SPEED_MPS && validHeading(raw.headingDeg)) {
      const rad = (raw.headingDeg * Math.PI) / 180;
      const variance = DOPPLER_SIGMA_MPS * DOPPLER_SIGMA_MPS;
      observeVelocity(this.x, doppler * Math.sin(rad), variance);
      observeVelocity(this.y, doppler * Math.cos(rad), variance);
    } else if (doppler !== null && doppler < DOPPLER_MIN_SPEED_MPS) {
      // The phone says it is (nearly) stopped: that is a velocity reading too,
      // and it is what lets the filter stop drifting after a rider brakes.
      const variance = DOPPLER_SIGMA_MPS * DOPPLER_SIGMA_MPS;
      observeVelocity(this.x, 0, variance);
      observeVelocity(this.y, 0, variance);
    }

    const speed = Math.hypot(this.x.v, this.y.v);
    const still = speed < STILL_SPEED_MPS && (doppler === null || doppler < STILL_REPORTED_SPEED_MPS);
    this.stillStreak = still ? this.stillStreak + 1 : 0;
    if (this.stillStreak >= LOCK_AFTER_FIXES) {
      this.lock();
    } else if (validHeading(raw.headingDeg) && doppler !== null && doppler >= HEADING_MIN_SPEED_MPS) {
      this.heading = raw.headingDeg;
    } else if (speed >= HEADING_MIN_SPEED_MPS) {
      this.heading = ((Math.atan2(this.x.v, this.y.v) * 180) / Math.PI + 360) % 360;
    }

    return this.emit(raw);
  }

  private start(raw: Fix): void {
    this.refLat = raw.latitude;
    this.refLon = raw.longitude;
    this.metersPerDegLon = METERS_PER_DEGREE * Math.cos((raw.latitude * Math.PI) / 180);
    const accuracy = raw.accuracyMeters ?? UNKNOWN_ACCURACY_METERS;
    const variance = Math.max(2, accuracy / RADIUS68_PER_SIGMA) ** 2;
    const velocity = this.dopplerVelocity(raw);
    this.x = newAxis(0, velocity.x, variance, 25);
    this.y = newAxis(0, velocity.y, variance, 25);
    this.lastRaw = raw;
    this.locked = false;
    this.anchor = null;
    this.stillStreak = 0;
    this.dopplerStreak = 0;
    this.outsideStreak = 0;
    this.impossibleStreak = 0;
    if (validHeading(raw.headingDeg) && validSpeed(raw.speedMps) && raw.speedMps >= HEADING_MIN_SPEED_MPS) {
      this.heading = raw.headingDeg;
    }
    this.clearSettle();
  }

  private lock(): void {
    if (!this.x || !this.y) return;
    this.locked = true;
    this.anchor = { x: this.x.p, y: this.y.p };
    this.x.v = 0;
    this.y.v = 0;
    this.dopplerStreak = 0;
    this.outsideStreak = 0;
    this.clearSettle();
  }

  private unlock(zx: number, zy: number, sigma: number, raw: Fix): void {
    // Restart the filter where the rider now is, moving the way the
    // satellites say, rather than gliding out from the old spot.
    const velocity = this.dopplerVelocity(raw);
    this.x = newAxis(zx, velocity.x, sigma * sigma, 25);
    this.y = newAxis(zy, velocity.y, sigma * sigma, 25);
    this.locked = false;
    this.anchor = null;
    this.stillStreak = 0;
    this.dopplerStreak = 0;
    this.outsideStreak = 0;
    this.clearSettle();
    if (validHeading(raw.headingDeg) && validSpeed(raw.speedMps) && raw.speedMps >= HEADING_MIN_SPEED_MPS) {
      this.heading = raw.headingDeg;
    }
  }

  private settle(zx: number, zy: number, accuracy: number): void {
    if (!this.anchor) return;
    const weight = 1 / Math.max(4, accuracy * accuracy);
    this.settleSumX += zx * weight;
    this.settleSumY += zy * weight;
    this.settleWeight += weight;
    this.settleCount += 1;
    if (this.settleCount < RESETTLE_AFTER_FIXES) return;

    const meanX = this.settleSumX / this.settleWeight;
    const meanY = this.settleSumY / this.settleWeight;
    // Weights are 1/accuracy squared, so the average's own error per axis is this.
    const meanSigma = 1 / (RADIUS68_PER_SIGMA * Math.sqrt(this.settleWeight));
    const threshold = Math.max(RESETTLE_METERS, 3 * meanSigma);
    if (Math.hypot(meanX - this.anchor.x, meanY - this.anchor.y) > threshold) {
      // One deliberate correction, then hold again. Never a slow creep: the
      // average is kept, so each correction needs more evidence than the last.
      this.anchor = { x: meanX, y: meanY };
      if (this.x && this.y) {
        this.x.p = meanX;
        this.y.p = meanY;
      }
    }
  }

  private clearSettle(): void {
    this.settleSumX = 0;
    this.settleSumY = 0;
    this.settleWeight = 0;
    this.settleCount = 0;
  }

  private dopplerVelocity(raw: Fix): { x: number; y: number } {
    if (!validSpeed(raw.speedMps) || raw.speedMps < DOPPLER_MIN_SPEED_MPS || !validHeading(raw.headingDeg)) {
      return { x: 0, y: 0 };
    }
    const rad = (raw.headingDeg * Math.PI) / 180;
    return { x: raw.speedMps * Math.sin(rad), y: raw.speedMps * Math.cos(rad) };
  }

  private toLocal(latitude: number, longitude: number): { x: number; y: number } {
    return {
      x: (longitude - this.refLon) * this.metersPerDegLon,
      y: (latitude - this.refLat) * METERS_PER_DEGREE,
    };
  }

  private toGeo(x: number, y: number): { latitude: number; longitude: number } {
    return {
      latitude: this.refLat + y / METERS_PER_DEGREE,
      longitude: this.refLon + x / this.metersPerDegLon,
    };
  }

  private emit(raw: Fix): StabilizerVerdict {
    const at = this.locked && this.anchor ? this.anchor : { x: this.x!.p, y: this.y!.p };
    const speed = this.locked ? 0 : Math.hypot(this.x!.v, this.y!.v);
    const fix: StableFix = {
      ...this.toGeo(at.x, at.y),
      // The phone's own figure for this fix, not the filter's tighter one:
      // store arrival must not be told a fix is better than the phone says.
      accuracyMeters: raw.accuracyMeters,
      speedMps: speed,
      headingDeg: this.heading,
      timestamp: raw.timestamp,
      locked: this.locked,
    };
    this.output = fix;
    return { kind: this.locked ? 'still' : 'moving', fix };
  }
}
