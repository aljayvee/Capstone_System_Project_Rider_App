import type { MapCoordinate } from './coords';
import {
  advanceAlongPath,
  bearingBetween,
  metresBetween,
  projectOntoPath,
  type PathProjection,
} from './routeGeometry';

/**
 * Where the navigation camera looks, the way Google Maps navigation does it:
 * the map turns so the road AHEAD points up the screen, and the rider sits in
 * the lower part of it with the route running away in front of them.
 *
 * The heading comes from the route, not the phone. A phone's compass swings as
 * it is carried, and its course is noise below walking pace, so a camera driven
 * by either spins at every stop. The road ahead does not.
 *
 * Pure, so the rules are tested without a map.
 */

/** How far along the road the camera aims. Far enough to see through a bend. */
export const LOOK_AHEAD_METERS = 40;

/** Beyond this the rider is not on the route, and the route cannot aim the camera. */
export const ON_ROUTE_METERS = 35;

/** Below this change the heading is left alone, so the map does not shiver. */
export const HEADING_DEADBAND_DEG = 4;

export interface NavigationCamera {
  /** Where the camera centres: on the road when the rider is on the route. */
  center: MapCoordinate;
  /** Compass heading for the camera, or null to keep the current one. */
  heading: number | null;
  /** True when the rider is on the route and the view follows it. */
  onRoute: boolean;
}

/**
 * The camera for one fix.
 *
 * On the route: centred on the rider's point on the road, turned toward the
 * point LOOK_AHEAD_METERS further along it. Off it (inside a store, a side
 * street the route does not use): centred on the rider. Turned by their own
 * travel heading while they are moving somewhere of their own; standing still,
 * turned the way the route runs from where they will join it, so the map and
 * the rider's arrow already face the road ahead rather than north or wherever
 * the phone's compass swung.
 */
export function navigationCamera(
  rider: MapCoordinate & { heading?: number | null; speed?: number | null },
  route: MapCoordinate[] | null,
  /**
   * Where the rider already is on the route, when the caller tracks it
   * (routeGeometry.followRouteProgress). The camera then centres on the same
   * steadied point the drawn line starts from, instead of re-projecting a raw
   * fix that can land on another pass of the route.
   */
  knownProjection?: PathProjection | null
): NavigationCamera {
  const projection =
    route && route.length > 1 ? knownProjection ?? projectOntoPath(rider, route) : null;
  const routeHeading = projection && route ? headingAhead(route, projection) : null;

  if (projection && projection.distanceMeters <= ON_ROUTE_METERS) {
    return { center: projection.point, heading: routeHeading, onRoute: true };
  }

  const moving = typeof rider.speed === 'number' && rider.speed >= 1.5;
  const ownHeading = moving && typeof rider.heading === 'number' && rider.heading >= 0 ? rider.heading : null;
  return {
    center: { latitude: rider.latitude, longitude: rider.longitude },
    heading: ownHeading ?? routeHeading,
    onRoute: false,
  };
}

/** Compass bearing of the road LOOK_AHEAD_METERS on from a point on the route. */
function headingAhead(route: MapCoordinate[], projection: PathProjection): number | null {
  const ahead = advanceAlongPath(route, projection, LOOK_AHEAD_METERS).point;
  // At the very end of the route there is nothing ahead to aim at; use the
  // last stretch of road instead of spinning to face north.
  const atEnd = metresBetween(projection.point, ahead) < 3;
  const from = atEnd ? route[route.length - 2] : projection.point;
  const to = atEnd ? route[route.length - 1] : ahead;
  return metresBetween(from, to) > 0.5 ? bearingBetween(from, to) : null;
}

/** The shortest signed turn from `from` to `to`, in degrees (-180..180]. */
export function headingDelta(from: number, to: number): number {
  const delta = ((to - from) % 360 + 540) % 360 - 180;
  return delta === -180 ? 180 : delta;
}

/** Keeps the current heading unless the new one differs by more than the deadband. */
export function settleHeading(current: number, next: number | null): number {
  if (next == null) return current;
  return Math.abs(headingDelta(current, next)) < HEADING_DEADBAND_DEG ? current : next;
}

/**
 * How far off the route a fix may be and still be drawn on the road.
 *
 * Riding, GPS scatter of 10 to 40 m is the phone, not the rider, so the dot is
 * put back on the road. Standing still, a fix 20 m off is usually the truth: the
 * rider is inside a store. Drawing them on the road then would hide exactly
 * what the dashed link to the road exists to show.
 */
export function markerSnapMeters(speedMps: number | null | undefined): number {
  return typeof speedMps === 'number' && speedMps >= 1.5 ? 40 : 12;
}

/**
 * Closer at walking pace, wider at road speed, as navigation apps do: at 50
 * km/h the next junction arrives in seconds and has to be on screen already.
 */
export function navigationZoom(speedMps: number | null | undefined): number {
  const speed = typeof speedMps === 'number' && speedMps >= 0 ? speedMps : 0;
  if (speed < 4) return 18.5; // under ~15 km/h: walking, pulling out, traffic
  if (speed < 11) return 18; // under ~40 km/h: town riding
  return 17.5;
}

/**
 * How far behind the rider the drawn line starts, in metres.
 *
 * The line was cut exactly at the newest fix, while the dot, riding on along
 * the road (riderMotion), can trail it when the rider speeds up, so it sat on
 * bare map behind the start of its own line, and the gap snapped shut when the
 * next fix landed: the flicker at the head of the route. Starting the line
 * about a second's travel behind the fix keeps it running under the dot the
 * whole time. The arrow covers this much of it at navigation zoom.
 */
export function lineTrailMeters(speedMps: number | null | undefined): number {
  const speed = typeof speedMps === 'number' && speedMps > 0 ? speedMps : 0;
  return Math.min(25, 6 + speed * 1.2);
}

/** Zoom bands, fastest last, with the speed each is entered and left at. */
const ZOOM_BANDS: { zoom: number; enterAbove: number; leaveBelow: number }[] = [
  { zoom: 18.5, enterAbove: -Infinity, leaveBelow: -Infinity },
  { zoom: 18, enterAbove: 4.5, leaveBelow: 3.5 },
  { zoom: 17.5, enterAbove: 11.5, leaveBelow: 10.5 },
];

/**
 * navigationZoom, with a margin either side of each step so a speed hovering
 * at a boundary does not flip the zoom every fix.
 *
 * Riding at 15 km/h in town sits right on the first step, and speed noise of a
 * metre a second made the map zoom in and out once a second: the "breathing"
 * that read as jitter. A band is entered a little above its threshold and left
 * a little below it.
 */
export function steadyNavigationZoom(previousZoom: number | null, speedMps: number | null | undefined): number {
  const target = navigationZoom(speedMps);
  if (previousZoom == null) return target;
  const speed = typeof speedMps === 'number' && speedMps >= 0 ? speedMps : 0;
  const currentBand = ZOOM_BANDS.findIndex((band) => band.zoom === previousZoom);
  if (currentBand < 0) return target;

  let band = currentBand;
  while (band + 1 < ZOOM_BANDS.length && speed > ZOOM_BANDS[band + 1].enterAbove) band++;
  while (band > 0 && speed < ZOOM_BANDS[band].leaveBelow) band--;
  return ZOOM_BANDS[band].zoom;
}

/** Zoom levels per second the chase camera moves at between speed bands: half a level in about a second. */
export const ZOOM_GLIDE_PER_SECOND = 0.4;

/**
 * The chase zoom one frame on, moving toward its band's zoom at a steady rate.
 *
 * The bands are half a zoom level apart, and the camera used to take the new
 * one outright on the frame the speed crossed into it: the whole map jumped a
 * size as the rider pulled away or slowed for a junction. It now eases there
 * over about a second, as a navigation camera does.
 */
export function glideZoom(current: number | null, target: number, dtSeconds: number): number {
  if (current == null) return target;
  if (!(dtSeconds > 0)) return current;
  const step = ZOOM_GLIDE_PER_SECOND * dtSeconds;
  const gap = target - current;
  return Math.abs(gap) <= step ? target : current + Math.sign(gap) * step;
}

/**
 * Top padding that puts the rider in the lower part of the visible map.
 *
 * The camera centres its target in the middle of whatever the padding leaves,
 * so padding the top pushes the rider down. The target lands about a quarter of
 * the usable height above whatever covers the bottom (the errand sheet).
 */
export function navigationTopPadding(mapHeight: number, bottomCovered: number, topCovered = 0): number {
  if (!(mapHeight > 0)) return 0;
  // Measured from below whatever floats at the top (the navigation panel, the
  // fee capsules), so on a tall phone the rider is not placed behind them.
  const top = Math.max(0, Math.min(topCovered, mapHeight - bottomCovered));
  const usable = Math.max(0, mapHeight - bottomCovered - top);
  return Math.round(top + usable * 0.45);
}
