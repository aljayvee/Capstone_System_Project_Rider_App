import type { MapCoordinate } from './coords';

/**
 * Geometry for drawing a rider onto a route line.
 *
 * All of it works in a locally-flattened plane: longitude is scaled by
 * cos(latitude) so a degree east covers the same ground as a degree north. Over
 * the few hundred metres any of this is asked about, the error is millimetres,
 * and it keeps the maths cheap enough to run every animation frame.
 */

const EARTH_RADIUS_M = 6371000;
const DEG = Math.PI / 180;

export interface PathProjection {
  /** The point on the path closest to the input. */
  point: MapCoordinate;
  /** Index of the segment it landed on (the segment from [index] to [index+1]). */
  segmentIndex: number;
  /** How far along that segment, 0..1. */
  t: number;
  /** Perpendicular distance from the input to the path, in metres. */
  distanceMeters: number;
}

/** Metres between two coordinates. Equirectangular — fine at city scale. */
export function metresBetween(a: MapCoordinate, b: MapCoordinate): number {
  const scale = Math.cos(((a.latitude + b.latitude) / 2) * DEG);
  const dx = (b.longitude - a.longitude) * scale * DEG * EARTH_RADIUS_M;
  const dy = (b.latitude - a.latitude) * DEG * EARTH_RADIUS_M;
  return Math.hypot(dx, dy);
}

/** Linear blend between two coordinates. */
export function lerpCoordinate(a: MapCoordinate, b: MapCoordinate, t: number): MapCoordinate {
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * t,
    longitude: a.longitude + (b.longitude - a.longitude) * t,
  };
}

/** Compass bearing from a to b, in degrees clockwise from north. */
export function bearingBetween(a: MapCoordinate, b: MapCoordinate): number {
  const scale = Math.cos(((a.latitude + b.latitude) / 2) * DEG);
  const dx = (b.longitude - a.longitude) * scale;
  const dy = b.latitude - a.latitude;
  if (dx === 0 && dy === 0) return 0;
  return (Math.atan2(dx, dy) * (180 / Math.PI) + 360) % 360;
}

/**
 * The closest point on `path` to `point`.
 *
 * This is what turns a scatter of GPS fixes into a dot that sits on the road.
 * A raw fix is routinely 5-15 m off the carriageway, and a marker drawn at it
 * wanders into the buildings either side while the rider is going straight down
 * the middle of the street.
 */
export function projectOntoPath(
  point: MapCoordinate,
  path: MapCoordinate[]
): PathProjection | null {
  if (path.length === 0) return null;
  if (path.length === 1) {
    return { point: path[0], segmentIndex: 0, t: 0, distanceMeters: metresBetween(point, path[0]) };
  }

  const scale = Math.cos(point.latitude * DEG);
  let best: PathProjection | null = null;

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];

    const ax = a.longitude * scale, ay = a.latitude;
    const bx = b.longitude * scale, by = b.latitude;
    const px = point.longitude * scale, py = point.latitude;

    const vx = bx - ax, vy = by - ay;
    const lengthSq = vx * vx + vy * vy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / lengthSq));

    const candidate = lerpCoordinate(a, b, t);
    const distanceMeters = metresBetween(point, candidate);

    if (!best || distanceMeters < best.distanceMeters) {
      best = { point: candidate, segmentIndex: i, t, distanceMeters };
    }
  }

  return best;
}

/**
 * The part of `path` still ahead of a projection.
 *
 * Drawing the whole route including the stretch already ridden is what makes a
 * delivery map look static. Trimming behind the rider is the movement the eye
 * actually reads as progress.
 */
export function pathAhead(path: MapCoordinate[], projection: PathProjection | null): MapCoordinate[] {
  if (!projection || path.length < 2) return path;
  return [projection.point, ...path.slice(projection.segmentIndex + 1)];
}

/**
 * Walks `metres` forward along the path from a projection, returning where that
 * lands. Used to advance the dot smoothly ALONG THE ROAD between fixes rather
 * than sliding it in a straight line across the block.
 */
export function advanceAlongPath(
  path: MapCoordinate[],
  projection: PathProjection,
  metres: number
): { point: MapCoordinate; projection: PathProjection } {
  if (metres <= 0 || path.length < 2) return { point: projection.point, projection };

  let remaining = metres;
  let index = projection.segmentIndex;
  let current = projection.point;

  while (index < path.length - 1) {
    const next = path[index + 1];
    const segmentRemaining = metresBetween(current, next);

    if (segmentRemaining >= remaining) {
      const t = segmentRemaining === 0 ? 0 : remaining / segmentRemaining;
      const point = lerpCoordinate(current, next, t);
      return { point, projection: { point, segmentIndex: index, t, distanceMeters: 0 } };
    }

    remaining -= segmentRemaining;
    index += 1;
    current = next;
  }

  // Ran off the end of the route — the rider is past the last known point.
  const last = path[path.length - 1];
  return {
    point: last,
    projection: { point: last, segmentIndex: path.length - 2, t: 1, distanceMeters: 0 },
  };
}

/** Total length of a path in metres. */
export function pathLength(path: MapCoordinate[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += metresBetween(path[i - 1], path[i]);
  return total;
}

/** Distance from the start of `path` to each of its vertices, in metres. */
export function cumulativeLengths(path: MapCoordinate[]): number[] {
  const out = new Array<number>(path.length);
  let total = 0;
  for (let i = 0; i < path.length; i++) {
    if (i > 0) total += metresBetween(path[i - 1], path[i]);
    out[i] = total;
  }
  return out;
}

/** How far along `path` a projection lies, in metres from its start. */
export function alongDistance(path: MapCoordinate[], cumulative: number[], projection: PathProjection): number {
  const start = path[projection.segmentIndex];
  if (!start) return 0;
  return cumulative[projection.segmentIndex] + metresBetween(start, projection.point);
}

/** The point `metres` along `path` from its start, as a projection with no offset. */
export function projectionAtDistance(path: MapCoordinate[], cumulative: number[], metres: number): PathProjection {
  const last = Math.max(0, path.length - 2);
  let i = 0;
  while (i < last && cumulative[i + 1] <= metres) i++;
  const segment = (cumulative[i + 1] ?? cumulative[i]) - cumulative[i];
  const t = segment > 0 ? Math.max(0, Math.min(1, (metres - cumulative[i]) / segment)) : 0;
  const point = path.length > 1 ? lerpCoordinate(path[i], path[i + 1], t) : path[0];
  return { point, segmentIndex: i, t, distanceMeters: 0 };
}

/**
 * The part of `path` from `metres` along it to its end. The line drawn ahead
 * of the rider, trimmed at an exact distance rather than at a projection.
 */
export function pathFromDistance(path: MapCoordinate[], cumulative: number[], metres: number): MapCoordinate[] {
  if (path.length < 2 || metres <= 0) return path;
  const total = cumulative[cumulative.length - 1];
  // Past the end: nothing left to draw. One point, which no polyline draws.
  if (metres >= total) return [path[path.length - 1]];

  let i = 0;
  while (i < path.length - 2 && cumulative[i + 1] <= metres) i++;
  const segment = cumulative[i + 1] - cumulative[i];
  const t = segment > 0 ? (metres - cumulative[i]) / segment : 0;
  return [lerpCoordinate(path[i], path[i + 1], t), ...path.slice(i + 1)];
}

/** Where the rider is along the route, as the line trimming understands it. */
export interface RouteProgress {
  projection: PathProjection;
  /** Metres from the route's start to the projection. */
  alongMeters: number;
}

/** How far behind the last position a fix is searched for. */
const PROGRESS_BACK_WINDOW_METERS = 60;
/**
 * Metres of along-route distance that cost as much as one metre off the road,
 * when choosing where on the route a fix belongs. At a corner, or where the
 * route runs back beside itself, two stretches can be equally near a scattered
 * fix; the one that does not ask the rider to have leapt along the route wins.
 */
const PROGRESS_CONTINUITY_WEIGHT = 0.25;
/** Only a fix this much nearer elsewhere on the route beats continuity: the rider is really there. */
const PROGRESS_ELSEWHERE_MARGIN_METERS = 25;
/**
 * A step back smaller than this is GPS scatter along the road, not the rider
 * reversing, and is held rather than drawn. Held, the line never regrows behind
 * the rider every other second. Wider for a rider who is not moving, whose
 * every apparent step is drift.
 */
export const PROGRESS_BACKTRACK_TOLERANCE_METERS = 25;
const PROGRESS_BACKTRACK_TOLERANCE_STILL_METERS = 60;
/** Doppler speed below this is a rider standing still, whatever the fix says. */
const STILL_SPEED_MPS = 0.5;
/** How far a standing rider's progress may creep forward per fix. */
const STILL_CREEP_METERS = 3;

/**
 * The rider's progress along the route for a new fix, given the last one.
 *
 * Two things the plain nearest-point projection did wrong, both visible as a
 * line whose start jumped about under a rider riding steadily:
 *   - it chose the nearest stretch of the whole route, so at a corner, or where
 *     the route passes near itself, scatter flipped it to the other stretch and
 *     back;
 *   - it followed every fix, so along-track scatter moved the start of the line
 *     backwards as often as forwards.
 * So a fix is placed where it is near the road AND near where the rider was a
 * moment ago, unless they are plainly elsewhere now, small steps backwards are
 * held, and a rider whose own speed says they are standing does not drift.
 */
export function followRouteProgress(
  point: MapCoordinate & { speed?: number | null },
  path: MapCoordinate[],
  cumulative: number[],
  previous: RouteProgress | null
): RouteProgress | null {
  const global = projectOntoPath(point, path);
  if (!global) return null;
  const globalAlong = alongDistance(path, cumulative, global);
  if (path.length < 2) return { projection: global, alongMeters: globalAlong };

  const speed = typeof point.speed === 'number' && point.speed >= 0 ? point.speed : null;
  const still = speed != null && speed < STILL_SPEED_MPS;
  // Where the rider should be about now, and how far ahead to look for them.
  // With no history, the start: every route is asked for from the rider's own
  // position, so a fix that could be on the way out or the way back is on the
  // way out. The rule below still moves them if they are plainly elsewhere.
  const expected = previous ? previous.alongMeters + (speed ?? 0) : 0;
  const from = previous ? previous.alongMeters - PROGRESS_BACK_WINDOW_METERS : -Infinity;
  const to = previous ? previous.alongMeters + 60 + (speed ?? 8) * 6 : Infinity;

  let best: { projection: PathProjection; along: number; score: number } | null = null;
  const scale = Math.cos(point.latitude * (Math.PI / 180));
  for (let i = 0; i < path.length - 1; i++) {
    if (cumulative[i + 1] < from) continue;
    if (cumulative[i] > to) break;
    const a = path[i];
    const b = path[i + 1];
    const vx = (b.longitude - a.longitude) * scale;
    const vy = b.latitude - a.latitude;
    const lengthSq = vx * vx + vy * vy;
    const t =
      lengthSq === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((point.longitude - a.longitude) * scale * vx + (point.latitude - a.latitude) * vy) / lengthSq)
          );
    const candidate = lerpCoordinate(a, b, t);
    const distanceMeters = metresBetween(point, candidate);
    const along = cumulative[i] + metresBetween(a, candidate);
    const score = distanceMeters + PROGRESS_CONTINUITY_WEIGHT * Math.abs(along - expected);
    if (!best || score < best.score) {
      best = { projection: { point: candidate, segmentIndex: i, t, distanceMeters }, along, score };
    }
  }

  // Nothing nearby, or the route elsewhere is plainly where the rider is now
  // (a shortcut, a fix catching up after a tunnel).
  const elsewhere =
    !best || best.projection.distanceMeters > global.distanceMeters + PROGRESS_ELSEWHERE_MARGIN_METERS;
  let projection = elsewhere ? global : best!.projection;
  let alongMeters = elsewhere ? globalAlong : best!.along;
  if (!previous) return { projection, alongMeters };

  if (!elsewhere && still && alongMeters - previous.alongMeters > STILL_CREEP_METERS) {
    // Standing, by the phone's own Doppler speed: forward "movement" is drift.
    alongMeters = previous.alongMeters + STILL_CREEP_METERS;
    projection = { ...projectionAtDistance(path, cumulative, alongMeters), distanceMeters: projection.distanceMeters };
  }

  const backwards = previous.alongMeters - alongMeters;
  const tolerance = still ? PROGRESS_BACKTRACK_TOLERANCE_STILL_METERS : PROGRESS_BACKTRACK_TOLERANCE_METERS;
  if (!elsewhere && backwards > 0 && backwards < tolerance) {
    // Held where it was along the road, but still reporting how far off the
    // road this fix is, which the caller uses to decide whether to trim at all.
    return {
      projection: { ...previous.projection, distanceMeters: projection.distanceMeters },
      alongMeters: previous.alongMeters,
    };
  }
  return { projection, alongMeters };
}
