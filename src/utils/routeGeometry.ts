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
