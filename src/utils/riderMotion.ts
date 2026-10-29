import type { MapCoordinate } from './coords';
import { alongDistance, bearingBetween, cumulativeLengths, lerpCoordinate, metresBetween, projectOntoPath } from './routeGeometry';
import { markerSnapMeters } from './navigationCamera';

/** Visual prediction only; never use these positions for telemetry/geofences. */
export const MAX_PREDICTION_MS = 2000;
const MAX_PREDICTION_METERS = 25;
const MAX_SPEED_MPS = 35;

interface Axis { from: number; to: number; startVelocity: number; endVelocity: number }

/** Hermite interpolation retains the derivative when an in-flight plan changes. */
function sampleAxis(axis: Axis, elapsedMs: number, durationMs: number, predictionMs: number) {
  const duration = durationMs / 1000;
  const t = Math.max(0, Math.min(1, elapsedMs / durationMs));
  if (elapsedMs <= durationMs) {
    const t2 = t * t, t3 = t2 * t;
    return {
      value: (2 * t3 - 3 * t2 + 1) * axis.from + (t3 - 2 * t2 + t) * duration * axis.startVelocity
        + (-2 * t3 + 3 * t2) * axis.to + (t3 - t2) * duration * axis.endVelocity,
      velocity: (6 * t2 - 6 * t) * (axis.from - axis.to) / duration
        + (3 * t2 - 4 * t + 1) * axis.startVelocity + (3 * t2 - 2 * t) * axis.endVelocity,
    };
  }
  // Coast briefly, slowing to zero, then hold. The integrated taper bounds
  // travel to speed * horizon / 2 and joins the tween with matching velocity.
  const horizon = predictionMs / 1000;
  const seconds = Math.max(0, Math.min(horizon, (elapsedMs - durationMs) / 1000));
  return {
    value: axis.to + axis.endVelocity * (horizon > 0 ? seconds - seconds * seconds / (2 * horizon) : 0),
    velocity: horizon > 0 ? axis.endVelocity * (1 - seconds / horizon) : 0,
  };
}

export interface RiderMotionFrame {
  coordinate: MapCoordinate;
  /** Coordinate degrees per second, retained across interrupted animations. */
  velocity: MapCoordinate;
  moving: boolean;
}
interface Fix { coordinate: MapCoordinate; recordedAt: number | undefined; receivedAt: number }
interface Plan {
  startedAt: number;
  durationMs: number;
  predictionMs: number;
  sample: (elapsed: number) => Omit<RiderMotionFrame, 'moving'>;
}

/** Accepted GPS timestamps define cadence; animation uses a monotonic clock. */
export class RiderMotion {
  private fix: Fix | null = null;
  private plan: Plan | null = null;
  private resting: RiderMotionFrame | null = null;
  private pathCache: { path: MapCoordinate[]; lengths: number[] } | null = null;

  clear() { this.fix = null; this.plan = null; this.resting = null; }

  sample(now: number): RiderMotionFrame | null {
    if (!this.plan) return this.resting;
    const elapsed = Math.max(0, now - this.plan.startedAt);
    return { ...this.plan.sample(elapsed), moving: elapsed < this.plan.durationMs + this.plan.predictionMs };
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
    if (!drawn || !previous || metresBetween(drawn.coordinate, coordinate) > 500 || now - previous.receivedAt > 10_000) {
      this.plan = null;
      this.resting = { coordinate, velocity: { latitude: 0, longitude: 0 }, moving: false };
      return true;
    }
    const interval = recordedAt !== undefined && previous.recordedAt !== undefined
      ? recordedAt - previous.recordedAt : now - previous.receivedAt;
    const durationMs = Math.max(400, Math.min(2000, interval > 0 ? interval : 1000));
    const distance = metresBetween(previous.coordinate, coordinate);
    const reportedSpeed = typeof speedMps === 'number' && Number.isFinite(speedMps) && speedMps >= 0 ? speedMps : null;
    const speed = stationary || (reportedSpeed !== null && reportedSpeed < 0.5) || distance < 0.05
      ? 0 : Math.min(MAX_SPEED_MPS, reportedSpeed ?? distance / (Math.max(1, interval) / 1000));
    const age = recordedAt === undefined ? 0 : Math.max(0, wallNow - recordedAt);
    const predictionMs = speed > 0
      ? Math.max(0, Math.min(MAX_PREDICTION_MS, 2 * MAX_PREDICTION_METERS / speed * 1000, 4000 - age - durationMs)) : 0;
    const endSpeed = predictionMs > 0 ? speed : 0;
    const start = drawn.coordinate;
    let destination = coordinate;
    const endProjection = route && route.length > 1 ? projectOntoPath(coordinate, route) : null;
    if (endProjection && endProjection.distanceMeters <= markerSnapMeters(speedMps)) destination = endProjection.point;
    const startProjection = route && endProjection ? projectOntoPath(start, route) : null;
    if (metresBetween(start, destination) < 0.05 && speed === 0 &&
        Math.hypot(drawn.velocity.latitude, drawn.velocity.longitude) < 1e-10) {
      this.plan = null;
      this.resting = { coordinate: start, velocity: { latitude: 0, longitude: 0 }, moving: false };
      return true;
    }

    let sample: Plan['sample'];
    // A new route must not teleport a puck sideways onto another road.
    if (route && startProjection && endProjection && startProjection.distanceMeters < 0.1 &&
        endProjection.distanceMeters <= markerSnapMeters(speedMps)) {
      if (this.pathCache?.path !== route) this.pathCache = { path: route, lengths: cumulativeLengths(route) };
      const lengths = this.pathCache.lengths;
      const total = lengths[lengths.length - 1];
      // Precompute lengths per route, then binary-search per frame.
      const pointAt = (meters: number) => {
        let low = 0, high = route.length - 2;
        while (low < high) {
          const mid = Math.ceil((low + high) / 2);
          if (lengths[mid] <= meters) low = mid; else high = mid - 1;
        }
        const length = lengths[low + 1] - lengths[low];
        const tangent = length > 0 ? {
          latitude: (route[low + 1].latitude - route[low].latitude) / length,
          longitude: (route[low + 1].longitude - route[low].longitude) / length,
        } : { latitude: 0, longitude: 0 };
        return {
          coordinate: lerpCoordinate(route[low], route[low + 1], length > 0 ? Math.max(0, Math.min(1, (meters - lengths[low]) / length)) : 0),
          tangent,
        };
      };
      const from = alongDistance(route, lengths, startProjection);
      const to = alongDistance(route, lengths, endProjection);
      const tangent = pointAt(from).tangent;
      const lonScale = Math.cos(start.latitude * Math.PI / 180);
      const norm = tangent.latitude ** 2 + (tangent.longitude * lonScale) ** 2;
      const startVelocity = norm > 0
        ? (drawn.velocity.latitude * tangent.latitude + drawn.velocity.longitude * tangent.longitude * lonScale ** 2) / norm : 0;
      const oldProjection = projectOntoPath(previous.coordinate, route);
      const direction = Math.sign(to - (oldProjection ? alongDistance(route, lengths, oldProjection) : from)) || 1;
      const axis = { from, to, startVelocity, endVelocity: direction * endSpeed };
      sample = (elapsed) => {
        const step = sampleAxis(axis, elapsed, durationMs, predictionMs);
        const point = pointAt(Math.max(0, Math.min(total, step.value)));
        const velocity = (step.value <= 0 && step.velocity < 0) || (step.value >= total && step.velocity > 0) ? 0 : step.velocity;
        return { coordinate: point.coordinate, velocity: {
          latitude: point.tangent.latitude * velocity, longitude: point.tangent.longitude * velocity,
        } };
      };
    } else {
      const bearing = bearingBetween(previous.coordinate, destination) * Math.PI / 180;
      const metersPerDegree = 111_195;
      const endVelocity = {
        latitude: Math.cos(bearing) * endSpeed / metersPerDegree,
        longitude: Math.sin(bearing) * endSpeed / (metersPerDegree * Math.max(0.01, Math.cos(destination.latitude * Math.PI / 180))),
      };
      const latitude = { from: start.latitude, to: destination.latitude, startVelocity: drawn.velocity.latitude, endVelocity: endVelocity.latitude };
      const longitude = { from: start.longitude, to: destination.longitude, startVelocity: drawn.velocity.longitude, endVelocity: endVelocity.longitude };
      sample = (elapsed) => {
        const lat = sampleAxis(latitude, elapsed, durationMs, predictionMs);
        const lon = sampleAxis(longitude, elapsed, durationMs, predictionMs);
        return { coordinate: { latitude: lat.value, longitude: lon.value }, velocity: { latitude: lat.velocity, longitude: lon.velocity } };
      };
    }
    this.plan = { startedAt: now, durationMs, predictionMs, sample };
    return true;
  }
}
