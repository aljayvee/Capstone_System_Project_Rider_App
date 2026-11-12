import type { MapCoordinate } from './coords';
import { alongDistance, cumulativeLengths, followRouteProgress, metresBetween, projectOntoPath } from './routeGeometry';
import type { RouteProgress } from './routeGeometry';
import { markerSnapMeters } from './navigationCamera';

/**
 * The rider's icon, ridden continuously along the road line.
 *
 * Visual only; never use these positions for telemetry or geofences.
 *
 * There is no per-fix animation and no duration to tune. The drawn rider is a
 * small vehicle with a place on the route line and a speed. Every frame it
 * rides on at the speed the phone reports, closing on where the latest fix says
 * the rider is by now. A fix only changes where it is heading, never where it
 * is or how fast it is going, so fixes that come early, late or in bursts leave
 * no step, stop or surge on screen. Away from any road it rides the same way in
 * open ground.
 */

/** Metres behind where the rider is by now, per extra m/s asked of the drawn rider. */
const CATCH_UP_S = 1.0;
/** Catching up never asks for more than this over the rider's own speed. */
const MAX_CATCH_UP_MPS = 6;
/** Past a rider who has stopped, the icon rolls back onto them no faster than this. */
const ROLL_BACK_MPS = 3;
/** How closely the drawn speed follows the asked speed. With CATCH_UP_S, just overdamped: no rocking. */
const SPEED_RESPONSE_S = 0.2;
export const MAX_ACCEL_MPS2 = 5;
export const MAX_BRAKE_MPS2 = 7;
const MAX_SPEED_MPS = 35;
/** A fix is ridden on from for this long at most; with no newer one, the rider settles where it put them. */
export const MAX_DEAD_RECKONING_MS = 3000;
export const MAX_LEAD_METERS = 30;
/** Ahead of the rider by less than this, the drawn rider waits for them instead of riding backwards. */
export const HOLD_AHEAD_METERS = 25;
/** Fixed simulation step: the same fixes draw the same path at 30, 60 or 90 Hz, and through dropped frames. */
const STEP_MS = 1000 / 120;
/** How quickly the drawn rider slides from where it was onto a newly joined road. */
const JOIN_S = 0.35;
/** Further than this from where the rider is by now (a GPS leap, a jump off the road), it slides straight there. */
const LEAP_METERS = 60;
const SETTLE_METERS = 0.15;
const SETTLE_MPS = 0.15;
/** A rider already this fast when first seen starts riding at their speed, not from a standstill. */
const ROLLING_START_MPS = 1.5;
const RESET_METERS = 500;
const RESUME_GAP_MS = 10_000;
const MAX_TICKS_PER_SAMPLE = 12_000;
const METERS_PER_DEGREE = 111_195;
/**
 * How far ahead of the drawn rider its heading is read from the road: about a
 * second's travel, so it leans into a bend as it reaches it instead of
 * snapping round at the corner. Short at walking pace, where a long reach
 * would have it pointing across a junction it is still metres from.
 */
const HEADING_AHEAD_S = 1.2;
const MIN_HEADING_AHEAD_METERS = 6;
const MAX_HEADING_AHEAD_METERS = 24;

/** East and north, in metres or metres per second. */
interface Vec { x: number; y: number }
const vec = (x: number, y: number): Vec => ({ x, y });
const add = (a: Vec, b: Vec) => vec(a.x + b.x, a.y + b.y);
const sub = (a: Vec, b: Vec) => vec(a.x - b.x, a.y - b.y);
const scale = (a: Vec, k: number) => vec(a.x * k, a.y * k);
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
const size = (a: Vec) => Math.hypot(a.x, a.y);
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const clampSize = (a: Vec, max: number) => { const length = size(a); return length > max ? scale(a, max / length) : a; };

const lonScale = (latitude: number) => Math.max(0.01, Math.cos(latitude * Math.PI / 180));
const offsetBy = (from: MapCoordinate, by: Vec): MapCoordinate => ({
  latitude: from.latitude + by.y / METERS_PER_DEGREE,
  longitude: from.longitude + by.x / (METERS_PER_DEGREE * lonScale(from.latitude)),
});
const metresFrom = (from: MapCoordinate, to: MapCoordinate): Vec => vec(
  (to.longitude - from.longitude) * METERS_PER_DEGREE * lonScale(from.latitude),
  (to.latitude - from.latitude) * METERS_PER_DEGREE,
);
const degreesPerSecond = (at: MapCoordinate, velocity: Vec): MapCoordinate => ({
  latitude: velocity.y / METERS_PER_DEGREE,
  longitude: velocity.x / (METERS_PER_DEGREE * lonScale(at.latitude)),
});
const metresPerSecond = (at: MapCoordinate, velocity: MapCoordinate): Vec => vec(
  velocity.longitude * METERS_PER_DEGREE * lonScale(at.latitude),
  velocity.latitude * METERS_PER_DEGREE,
);

/** Speeding up is gentler than braking, as on a real motorcycle. */
function limitAcceleration(velocity: number, wanted: number) {
  const cap = velocity * wanted > 0 || velocity === 0 ? MAX_ACCEL_MPS2 : MAX_BRAKE_MPS2;
  return clamp(wanted, -cap, cap);
}

/** Extra speed asked of the drawn rider to close a gap: gentle for a few metres, quicker for a long way. */
function catchUp(gap: number) {
  const cap = Math.max(MAX_CATCH_UP_MPS, Math.abs(gap) / 3);
  return clamp(gap / CATCH_UP_S, -cap, cap);
}

/** How far the fix says the rider has come by `now`, and how fast they are going there. */
function deadReckon(speed: number, at: number, now: number) {
  const elapsed = clamp(now - at, 0, MAX_DEAD_RECKONING_MS) / 1000;
  const lead = clamp(speed * elapsed, -MAX_LEAD_METERS, MAX_LEAD_METERS);
  const riding = now - at < MAX_DEAD_RECKONING_MS && Math.abs(lead) < MAX_LEAD_METERS;
  return { lead, speed: riding ? speed : 0 };
}

export interface RiderMotionFrame {
  coordinate: MapCoordinate;
  /** Coordinate degrees per second. Continuous: a fix never makes it jump. */
  velocity: MapCoordinate;
  moving: boolean;
  /**
   * Compass bearing of the road just ahead of where the rider is drawn, forward
   * along the route. It turns with the drawn position, frame by frame, so the
   * arrow and the map sweep through a bend instead of stepping once per fix.
   * Null off the road, where there is no line to read it from.
   */
  roadHeading: number | null;
}

interface Fix { coordinate: MapCoordinate; recordedAt: number | undefined; receivedAt: number }
interface Road { path: MapCoordinate[]; lengths: number[]; total: number }
/** Sliding from where the rider was drawn onto its new line, critically damped so it starts at the speed it had. */
interface Join { at: number; offset: Vec; velocity: Vec }
interface RideBase {
  /** Start of the current simulation step (monotonic ms); acceleration is fixed for the step. */
  tickAt: number;
  settled: boolean;
  join: Join | null;
}
type RoadTarget = { s: number; speed: number; at: number };
type FreeTarget = { p: Vec; velocity: Vec; at: number };
interface RoadRide extends RideBase {
  kind: 'road';
  road: Road;
  /** Metres along the road, its speed along it (m/s, negative backwards), and acceleration. */
  s: number; v: number; a: number;
  direction: 1 | -1;
  target: RoadTarget;
}
interface FreeRide extends RideBase {
  kind: 'free';
  origin: MapCoordinate;
  p: Vec; v: Vec; a: Vec;
  target: FreeTarget;
}
type Ride = RoadRide | FreeRide;

function roadPoint(road: Road, meters: number) {
  const { path, lengths } = road;
  let low = 0, high = path.length - 2;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (lengths[mid] <= meters) low = mid; else high = mid - 1;
  }
  const a = path[low], b = path[low + 1];
  const length = lengths[low + 1] - lengths[low];
  const t = length > 0 ? clamp((meters - lengths[low]) / length, 0, 1) : 0;
  const segment = metresFrom(a, b);
  const unit = length > 0 ? scale(segment, 1 / Math.max(1e-9, size(segment))) : vec(0, 0);
  return { coordinate: offsetBy(a, scale(segment, t)), unit };
}

/** Which way the road runs from `here`, `meters` along it, towards the point a little further on. */
function headingAlong(road: Road, meters: number, speed: number, here: { coordinate: MapCoordinate; unit: Vec }): number | null {
  const reach = clamp(Math.abs(speed) * HEADING_AHEAD_S, MIN_HEADING_AHEAD_METERS, MAX_HEADING_AHEAD_METERS);
  const chord = metresFrom(here.coordinate, roadPoint(road, Math.min(road.total, meters + reach)).coordinate);
  // At the end of the road nothing lies ahead: the last stretch's own direction.
  const direction = size(chord) > 0.5 ? chord : here.unit;
  if (size(direction) === 0) return null;
  return (Math.atan2(direction.x, direction.y) * 180 / Math.PI + 360) % 360;
}

function joinOffset(join: Join | null, now: number) {
  if (!join) return { offset: vec(0, 0), velocity: vec(0, 0), done: true };
  const tau = Math.max(0, now - join.at) / 1000;
  const decay = Math.exp(-tau / JOIN_S);
  const b = add(join.velocity, scale(join.offset, 1 / JOIN_S));
  const offset = scale(add(join.offset, scale(b, tau)), decay);
  const velocity = scale(sub(b, scale(add(join.offset, scale(b, tau)), 1 / JOIN_S)), decay);
  return { offset, velocity, done: size(offset) < 0.01 && size(velocity) < 0.01 };
}

function reckonRoad(target: RoadTarget, total: number, now: number) {
  const reckoned = deadReckon(target.speed, target.at, now);
  const s = target.s + reckoned.lead;
  // The known route ends here; nothing is drawn past it.
  if (s >= total) return { s: total, speed: 0 };
  if (s <= 0) return { s: 0, speed: 0 };
  return { s, speed: reckoned.speed };
}
const roadTarget = (ride: RoadRide, now: number) => reckonRoad(ride.target, ride.road.total, now);

function reckonFree(target: FreeTarget, now: number) {
  const speed = size(target.velocity);
  const reckoned = deadReckon(speed, target.at, now);
  const heading = speed > 0 ? scale(target.velocity, 1 / speed) : vec(0, 0);
  return { p: add(target.p, scale(heading, reckoned.lead)), velocity: scale(heading, reckoned.speed) };
}
const freeTarget = (ride: FreeRide, now: number) => reckonFree(ride.target, now);

/** Choose the acceleration for the step that starts now. */
function steer(ride: Ride) {
  if (ride.kind === 'road') {
    const target = roadTarget(ride, ride.tickAt);
    const error = target.s - ride.s;
    let wanted = target.speed + catchUp(error);
    // A little ahead of a rider still riding (GPS scatter along the road):
    // wait for them, never ride backwards. Past one who has stopped: roll
    // gently back onto them rather than sit in the junction they stopped short of.
    if (ride.direction * error < 0 && Math.abs(error) < HOLD_AHEAD_METERS) {
      wanted = target.speed !== 0
        ? ride.direction * Math.max(0, ride.direction * wanted)
        : clamp(wanted, -ROLL_BACK_MPS, ROLL_BACK_MPS);
    }
    wanted = clamp(wanted, -MAX_SPEED_MPS, MAX_SPEED_MPS);
    ride.a = limitAcceleration(ride.v, (wanted - ride.v) / SPEED_RESPONSE_S);
  } else {
    const target = freeTarget(ride, ride.tickAt);
    const gap = sub(target.p, ride.p);
    const closing = size(gap) > 0 ? scale(gap, catchUp(size(gap)) / size(gap)) : vec(0, 0);
    const wanted = clampSize(add(target.velocity, closing), MAX_SPEED_MPS);
    const change = scale(sub(wanted, ride.v), 1 / SPEED_RESPONSE_S);
    ride.a = clampSize(change, dot(ride.v, change) > 0 || size(ride.v) === 0 ? MAX_ACCEL_MPS2 : MAX_BRAKE_MPS2);
  }
}

/** Stop the loop once the rider is at rest where the fix put them. */
function settleIfStill(ride: Ride) {
  if (ride.kind === 'road') {
    const target = roadTarget(ride, ride.tickAt);
    if (target.speed !== 0 || Math.abs(ride.v) >= SETTLE_MPS || Math.abs(target.s - ride.s) >= SETTLE_METERS) return;
    if (!joinOffset(ride.join, ride.tickAt).done) return;
    ride.s = target.s; ride.v = 0; ride.a = 0; ride.join = null; ride.settled = true;
  } else {
    const target = freeTarget(ride, ride.tickAt);
    if (size(target.velocity) !== 0 || size(ride.v) >= SETTLE_MPS || size(sub(target.p, ride.p)) >= SETTLE_METERS) return;
    if (!joinOffset(ride.join, ride.tickAt).done) return;
    ride.p = target.p; ride.v = vec(0, 0); ride.a = vec(0, 0); ride.join = null; ride.settled = true;
  }
}

function tick(ride: Ride) {
  const h = STEP_MS / 1000;
  if (ride.kind === 'road') {
    ride.s += ride.v * h + ride.a * h * h / 2;
    ride.v += ride.a * h;
    if (ride.s <= 0) { ride.s = 0; ride.v = Math.max(0, ride.v); }
    if (ride.s >= ride.road.total) { ride.s = ride.road.total; ride.v = Math.min(0, ride.v); }
  } else {
    ride.p = add(ride.p, add(scale(ride.v, h), scale(ride.a, h * h / 2)));
    ride.v = add(ride.v, scale(ride.a, h));
  }
  ride.tickAt += STEP_MS;
  settleIfStill(ride);
  if (!ride.settled) steer(ride);
}

function frameOf(ride: Ride, now: number): RiderMotionFrame {
  const tau = ride.settled ? 0 : Math.max(0, now - ride.tickAt) / 1000;
  if (ride.kind === 'road') {
    const raw = ride.s + ride.v * tau + ride.a * tau * tau / 2;
    const s = clamp(raw, 0, ride.road.total);
    const speed = s === raw ? ride.v + ride.a * tau : 0;
    const point = roadPoint(ride.road, s);
    const join = joinOffset(ride.join, now);
    const coordinate = offsetBy(point.coordinate, join.offset);
    return {
      coordinate,
      velocity: degreesPerSecond(coordinate, add(scale(point.unit, speed), join.velocity)),
      moving: !ride.settled,
      roadHeading: headingAlong(ride.road, s, speed, point),
    };
  }
  const p = add(ride.p, add(scale(ride.v, tau), scale(ride.a, tau * tau / 2)));
  const join = joinOffset(ride.join, now);
  const coordinate = offsetBy(ride.origin, add(p, join.offset));
  return {
    coordinate,
    velocity: degreesPerSecond(coordinate, add(add(ride.v, scale(ride.a, tau)), join.velocity)),
    moving: !ride.settled,
    roadHeading: null,
  };
}

/** Accepted GPS timestamps say when the rider was where; drawing runs on a monotonic clock. */
export class RiderMotion {
  private fix: Fix | null = null;
  private ride: Ride | null = null;
  private resting: RiderMotionFrame | null = null;
  /** The speed the rider had when the icon was placed, so a rider seen mid-ride does not start from a standstill. */
  private restingSpeed = 0;
  private roadCache: Road | null = null;
  private progress: { route: MapCoordinate[]; value: RouteProgress } | null = null;

  clear() { this.fix = null; this.ride = null; this.resting = null; this.progress = null; this.restingSpeed = 0; }

  sample(now: number): RiderMotionFrame | null {
    const ride = this.ride;
    if (!ride) return this.resting;
    let ticks = 0;
    while (!ride.settled && ride.tickAt + STEP_MS <= now) {
      tick(ride);
      // Never replay minutes of riding after a long sleep: carry on from now.
      if (++ticks > MAX_TICKS_PER_SAMPLE) { ride.tickAt = now; break; }
    }
    return frameOf(ride, now);
  }

  push(coordinate: MapCoordinate, options: {
    now: number; wallNow: number; recordedAt?: number; speedMps?: number | null;
    stationary?: boolean; route: MapCoordinate[] | null;
  }): boolean {
    const { now, wallNow, speedMps, stationary, route } = options;
    if (!Number.isFinite(coordinate.latitude) || !Number.isFinite(coordinate.longitude)) return false;
    const recordedAt = Number.isFinite(options.recordedAt) ? options.recordedAt : undefined;
    const previous = this.fix;
    if (recordedAt !== undefined && previous?.recordedAt !== undefined && recordedAt <= previous.recordedAt) return false;
    const drawn = this.sample(now);
    this.fix = { coordinate, recordedAt, receivedAt: now };

    const interval = previous && recordedAt !== undefined && previous.recordedAt !== undefined
      ? recordedAt - previous.recordedAt : previous ? now - previous.receivedAt : 0;
    const distance = previous ? metresBetween(previous.coordinate, coordinate) : 0;
    const reportedSpeed = typeof speedMps === 'number' && Number.isFinite(speedMps) && speedMps >= 0 ? speedMps : null;
    let speed = stationary || (reportedSpeed !== null && reportedSpeed < 0.5) || (previous && distance < 0.05)
      ? 0 : Math.min(MAX_SPEED_MPS, reportedSpeed ?? (previous ? distance / (Math.max(1, interval) / 1000) : 0));
    // A fix already older than the ride-on window says where the rider was, not where they are going.
    const age = recordedAt === undefined ? 0 : Math.max(0, wallNow - recordedAt);
    if (age >= MAX_DEAD_RECKONING_MS) speed = 0;
    const at = now - Math.min(age, MAX_DEAD_RECKONING_MS);

    if (!drawn || !previous || metresBetween(drawn.coordinate, coordinate) > RESET_METERS || now - previous.receivedAt > RESUME_GAP_MS) {
      this.ride = null;
      this.progress = null;
      this.resting = { coordinate, velocity: { latitude: 0, longitude: 0 }, moving: false, roadHeading: null };
      this.restingSpeed = speed;
      return true;
    }
    const startSpeed = this.ride ? null : (this.restingSpeed >= ROLLING_START_MPS && speed > 0 ? Math.min(this.restingSpeed, speed) : 0);

    const road = route && route.length > 1 ? this.roadFor(route) : null;
    const previousProgress = road && this.progress?.route === route ? this.progress.value : null;
    const progress = road ? followRouteProgress({ ...coordinate, speed: speedMps }, road.path, road.lengths, previousProgress) : null;
    this.progress = road && progress ? { route: road.path, value: progress } : null;

    if (road && progress && progress.projection.distanceMeters <= markerSnapMeters(speedMps)) {
      const ride = this.ride;
      const sameRoad = ride?.kind === 'road' && ride.road === road;
      const moved = previousProgress ? progress.alongMeters - previousProgress.alongMeters : 0;
      const direction: 1 | -1 = Math.abs(moved) > 0.5 ? (moved > 0 ? 1 : -1) : sameRoad ? ride.direction : 1;
      const target: RoadTarget = { s: progress.alongMeters, speed: direction * speed, at };
      const near = metresBetween(drawn.coordinate, roadPoint(road, reckonRoad(target, road.total, now).s).coordinate) <= LEAP_METERS;
      if (sameRoad && near) {
        ride.target = target;
        ride.direction = direction;
        this.wake(ride, now);
      } else {
        this.ride = this.joinRoad(drawn, road, target, direction, now, startSpeed);
      }
      return true;
    }

    const heading = previous && distance >= 1 ? scale(metresFrom(previous.coordinate, coordinate), 1 / distance) : vec(0, 0);
    const ride = this.ride;
    const target: FreeTarget = { p: metresFrom(drawn.coordinate, coordinate), velocity: scale(heading, speed), at };
    if (ride?.kind === 'free' && size(reckonFree(target, now).p) <= LEAP_METERS) {
      ride.target = { ...target, p: metresFrom(ride.origin, coordinate) };
      this.wake(ride, now);
    } else {
      this.ride = this.leaveRoad(drawn, target, now, startSpeed === null ? null : scale(heading, startSpeed));
    }
    return true;
  }

  private roadFor(route: MapCoordinate[]): Road | null {
    if (this.roadCache?.path !== route) {
      const lengths = cumulativeLengths(route);
      this.roadCache = { path: route, lengths, total: lengths[lengths.length - 1] };
    }
    return this.roadCache.total > 0 ? this.roadCache : null;
  }

  /** A settled rider starts its next ride from now, never by replaying the time it stood still. */
  private wake(ride: Ride, now: number) {
    if (!ride.settled) return;
    ride.settled = false;
    ride.tickAt = now;
    steer(ride);
  }

  /** Onto the road from wherever the icon is: no sideways jump, no change of speed. */
  private joinRoad(drawn: RiderMotionFrame, road: Road, target: RoadTarget, direction: 1 | -1, now: number, startSpeed: number | null): RoadRide {
    const projection = projectOntoPath(drawn.coordinate, road.path)!;
    let s = alongDistance(road.path, road.lengths, projection);
    const reckoned = reckonRoad(target, road.total, now);
    // The nearest stretch is another pass of the route, or the rider has leapt
    // ahead: slide straight to where they are by now.
    const leap = Math.abs(s - reckoned.s) > LEAP_METERS;
    if (leap) s = reckoned.s;
    const point = roadPoint(road, s);
    const velocity = startSpeed === null ? metresPerSecond(drawn.coordinate, drawn.velocity) : scale(point.unit, direction * startSpeed);
    const along = leap ? reckoned.speed : dot(velocity, point.unit);
    const ride: RoadRide = {
      kind: 'road', road, s, v: along, a: 0, direction, target, tickAt: now, settled: false,
      join: { at: now, offset: metresFrom(point.coordinate, drawn.coordinate), velocity: sub(velocity, scale(point.unit, along)) },
    };
    steer(ride);
    return ride;
  }

  /** Off the road: carry on from exactly where and how fast the icon was going, or slide straight to a far fix. */
  private leaveRoad(drawn: RiderMotionFrame, target: FreeTarget, now: number, startVelocity: Vec | null): FreeRide {
    const velocity = startVelocity ?? metresPerSecond(drawn.coordinate, drawn.velocity);
    const reckoned = reckonFree(target, now);
    const leap = size(reckoned.p) > LEAP_METERS;
    const p = leap ? reckoned.p : vec(0, 0);
    const v = leap ? reckoned.velocity : velocity;
    const ride: FreeRide = {
      kind: 'free', origin: drawn.coordinate, p, v, a: vec(0, 0), tickAt: now, settled: false, target,
      join: leap ? { at: now, offset: scale(p, -1), velocity: sub(velocity, v) } : null,
    };
    steer(ride);
    return ride;
  }
}
