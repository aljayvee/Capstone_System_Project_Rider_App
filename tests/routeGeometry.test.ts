import { describe, expect, it } from 'vitest';
import {
  advanceAlongPath,
  bearingBetween,
  metresBetween,
  pathAhead,
  pathLength,
  projectOntoPath,
} from '../src/utils/routeGeometry';

/**
 * The geometry behind the gliding rider dot.
 *
 * The dot used to take its coordinate straight from GPS state, so it teleported
 * every couple of seconds and sat wherever the fix landed — routinely in the
 * buildings either side of the road. These functions put it on the carriageway
 * and move it along the road between fixes.
 */

// A right-angled route: 0.002 deg east, then 0.002 deg north. Near the equator
// that is roughly 220 m per leg.
const CORNER = [
  { latitude: 6.6800, longitude: 124.6700 },
  { latitude: 6.6800, longitude: 124.6720 },
  { latitude: 6.6820, longitude: 124.6720 },
];

describe('projecting a fix onto the route', () => {
  it('puts a fix beside the road back onto it', () => {
    // 0.0002 deg north of the first leg — about 22 m off, a very ordinary GPS error.
    const off = { latitude: 6.6802, longitude: 124.6710 };
    const p = projectOntoPath(off, CORNER);

    expect(p).not.toBeNull();
    expect(p!.segmentIndex).toBe(0);
    // Lands on the leg, at the same longitude it was beside.
    expect(p!.point.latitude).toBeCloseTo(6.6800, 6);
    expect(p!.point.longitude).toBeCloseTo(124.6710, 6);
    expect(p!.distanceMeters).toBeGreaterThan(15);
    expect(p!.distanceMeters).toBeLessThan(30);
  });

  it('reports how far off the route a fix is, so a diverged rider is not faked onto it', () => {
    const wayOff = { latitude: 6.6900, longitude: 124.6700 };
    const p = projectOntoPath(wayOff, CORNER);
    expect(p!.distanceMeters).toBeGreaterThan(500);
  });

  it('clamps to the ends rather than projecting onto an imaginary extension', () => {
    const beforeStart = { latitude: 6.6800, longitude: 124.6600 };
    const p = projectOntoPath(beforeStart, CORNER);
    expect(p!.segmentIndex).toBe(0);
    expect(p!.t).toBe(0);
    expect(p!.point.longitude).toBeCloseTo(124.6700, 6);
  });

  it('returns null for an empty path rather than a NaN coordinate', () => {
    expect(projectOntoPath({ latitude: 6.68, longitude: 124.67 }, [])).toBeNull();
  });
});

describe('trimming the ridden part of the route', () => {
  it('drops the stretch behind the rider and starts at their position', () => {
    const halfway = projectOntoPath({ latitude: 6.6800, longitude: 124.6710 }, CORNER);
    const ahead = pathAhead(CORNER, halfway);

    expect(ahead[0].longitude).toBeCloseTo(124.6710, 6);
    expect(ahead).toHaveLength(3);
    expect(pathLength(ahead)).toBeLessThan(pathLength(CORNER));
  });

  it('leaves the path untouched when there is no projection', () => {
    expect(pathAhead(CORNER, null)).toEqual(CORNER);
  });
});

describe('advancing along the road between fixes', () => {
  it('follows the bend instead of cutting the corner', () => {
    const start = projectOntoPath(CORNER[0], CORNER)!;
    const legLength = metresBetween(CORNER[0], CORNER[1]);

    // Walk past the corner, into the second leg.
    const { point } = advanceAlongPath(CORNER, start, legLength + 50);

    // On the second leg: longitude held at the corner, latitude climbing.
    expect(point.longitude).toBeCloseTo(CORNER[1].longitude, 5);
    expect(point.latitude).toBeGreaterThan(CORNER[1].latitude);

    // A straight line from start to here would have cut the corner — the walked
    // point stays on the route, so it is further from the origin than the
    // diagonal shortcut would be.
    expect(metresBetween(CORNER[0], point)).toBeLessThan(legLength + 50);
  });

  it('stops at the end of the route rather than running past it', () => {
    const start = projectOntoPath(CORNER[0], CORNER)!;
    const { point } = advanceAlongPath(CORNER, start, 99999);
    expect(point).toEqual(CORNER[CORNER.length - 1]);
  });

  it('does not move for a zero-distance step', () => {
    const start = projectOntoPath(CORNER[1], CORNER)!;
    expect(advanceAlongPath(CORNER, start, 0).point).toEqual(start.point);
  });
});

describe('bearing', () => {
  it('reads due east as 90 degrees', () => {
    expect(bearingBetween(CORNER[0], CORNER[1])).toBeCloseTo(90, 0);
  });

  it('reads due north as 0 degrees', () => {
    expect(bearingBetween(CORNER[1], CORNER[2])).toBeCloseTo(0, 0);
  });
});
