import { describe, expect, it } from 'vitest';
import {
  alongDistance,
  cumulativeLengths,
  followRouteProgress,
  metresBetween,
  pathFromDistance,
  pathLength,
  projectionAtDistance,
  projectOntoPath,
  type RouteProgress,
} from '../src/utils/routeGeometry';
import type { MapCoordinate } from '../src/utils/coords';

/**
 * Where the drawn route line starts, fix after fix.
 *
 * It was cut at the plain nearest-point projection of every fix, so the head
 * of the line jumped about under a rider riding steadily: backwards whenever
 * GPS drift pulled a fix back along the road (constantly, when stopped or
 * crawling), and over to another pass of the route wherever it runs close to
 * itself. Tested against drifting error, AR(1) with rho 0.9, which is what GPS
 * error actually does; white noise hides both faults.
 */

const M_PER_DEG_LAT = 111_195;
const LAT0 = 6.68;
const LNG0 = 124.67;
const M_PER_DEG_LNG = M_PER_DEG_LAT * Math.cos((LAT0 * Math.PI) / 180);

/** A point `east` and `north` metres from the origin. */
const at = (east: number, north: number): MapCoordinate => ({
  latitude: LAT0 + north / M_PER_DEG_LAT,
  longitude: LNG0 + east / M_PER_DEG_LNG,
});

/** Densified like a real road route: a vertex every 10 m. */
function polyline(corners: [number, number][]): MapCoordinate[] {
  const out: MapCoordinate[] = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const [e0, n0] = corners[i];
    const [e1, n1] = corners[i + 1];
    const len = Math.hypot(e1 - e0, n1 - n0);
    const parts = Math.max(1, Math.round(len / 10));
    for (let k = 0; k < parts; k++) out.push(at(e0 + ((e1 - e0) * k) / parts, n0 + ((n1 - n0) * k) / parts));
  }
  const [el, nl] = corners[corners.length - 1];
  out.push(at(el, nl));
  return out;
}

/** Deterministic noise, so a failure reproduces. */
function rng(seed: number) {
  let a = seed >>> 0;
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gaussian = () => Math.sqrt(-2 * Math.log(uniform() + 1e-12)) * Math.cos(2 * Math.PI * uniform());
  return gaussian;
}

/** Drifting GPS error: each second's error is 0.9 of the last plus a fresh bit. */
function drift(seconds: number, sigma: number, seed: number): [number, number][] {
  const gaussian = rng(seed);
  const rho = 0.9;
  const step = sigma * Math.sqrt(1 - rho * rho);
  let e = gaussian() * sigma;
  let n = gaussian() * sigma;
  const out: [number, number][] = [];
  for (let s = 0; s < seconds; s++) {
    e = rho * e + step * gaussian();
    n = rho * n + step * gaussian();
    out.push([e, n]);
  }
  return out;
}

/** Point `metres` along a path. */
function pointAlong(path: MapCoordinate[], metres: number): MapCoordinate {
  const cum = cumulativeLengths(path);
  const line = pathFromDistance(path, cum, metres);
  return line[0];
}

describe('the helpers', () => {
  const route = polyline([[0, 0], [300, 0], [300, 300]]);
  const cum = cumulativeLengths(route);

  it('measures distance along the route', () => {
    expect(cum[0]).toBe(0);
    expect(cum[cum.length - 1]).toBeCloseTo(pathLength(route), 6);
    const projection = projectOntoPath(at(150, 3), route)!;
    expect(alongDistance(route, cum, projection)).toBeCloseTo(150, 0);
  });

  it('cuts the line at an exact distance', () => {
    const rest = pathFromDistance(route, cum, 305);
    expect(metresBetween(rest[0], at(300, 5))).toBeLessThan(0.5);
    expect(rest[rest.length - 1]).toEqual(route[route.length - 1]);
    // Nothing left past the end: one point, which no polyline draws.
    expect(pathFromDistance(route, cum, 10_000)).toHaveLength(1);
    expect(pathFromDistance(route, cum, 0)).toBe(route);
  });

  it('finds the point at a distance along the route', () => {
    const p = projectionAtDistance(route, cum, 305);
    expect(metresBetween(p.point, at(300, 5))).toBeLessThan(0.5);
    expect(alongDistance(route, cum, p)).toBeCloseTo(305, 0);
    expect(p.distanceMeters).toBe(0);
  });
});

describe('followRouteProgress, riding with drifting GPS error', () => {
  // 400 m east, a stop at the lights, then 300 m north.
  const route = polyline([[0, 0], [400, 0], [400, 300]]);
  const cum = cumulativeLengths(route);

  /** True distance along the route, second by second: ride, stop 40 s, crawl, ride. */
  function trip(): number[] {
    const s: number[] = [];
    let d = 0;
    for (let t = 0; t < 45; t++) s.push((d += 8));
    for (let t = 0; t < 40; t++) s.push(d);
    for (let t = 0; t < 20; t++) s.push((d += 0.8));
    for (let t = 0; t < 30; t++) s.push((d = Math.min(d + 8, pathLength(route))));
    return s;
  }

  function lineStarts(seed: number, method: 'old' | 'new'): number[] {
    const truth = trip();
    const noise = drift(truth.length, 6, seed);
    let progress: RouteProgress | null = null;
    return truth.map((d, i) => {
      const p = pointAlong(route, d);
      const fix = {
        latitude: p.latitude + noise[i][1] / M_PER_DEG_LAT,
        longitude: p.longitude + noise[i][0] / M_PER_DEG_LNG,
        // What the map is handed: the steadier's speed estimate, 0 when stopped.
        speed: i === 0 ? 8 : Math.max(0, d - truth[i - 1]),
      };
      if (method === 'old') return alongDistance(route, cum, projectOntoPath(fix, route)!);
      progress = followRouteProgress(fix, route, cum, progress);
      return progress!.alongMeters;
    });
  }

  const backwardSteps = (starts: number[]) =>
    starts.slice(1).filter((s, i) => s < starts[i] - 0.5).length;

  it('never moves the head of the line backwards over 20 rides', () => {
    let oldBack = 0;
    let newBack = 0;
    for (let seed = 1; seed <= 20; seed++) {
      oldBack += backwardSteps(lineStarts(seed, 'old'));
      newBack += backwardSteps(lineStarts(seed, 'new'));
    }
    // What the rider used to see: the line regrowing behind them, again and
    // again, most of all while stopped at the lights.
    expect(oldBack).toBeGreaterThan(200);
    expect(newBack).toBe(0);
  });

  it('still follows the rider forward, within the GPS error', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const truth = trip();
      const starts = lineStarts(seed, 'new');
      const worst = Math.max(...starts.map((s, i) => Math.abs(s - truth[i])));
      // The drift itself is ~6 m; a hold of up to 25 m backwards is the most
      // it can lag a rider who really did roll back.
      expect(worst).toBeLessThan(30);
    }
  });
});

describe('followRouteProgress where the route passes close to itself', () => {
  // Out along one street and back along the next one over, 14 m north:
  // a U-shaped detour to a store, as short errands often are.
  const route = polyline([[0, 0], [300, 0], [300, 14], [0, 14]]);
  const cum = cumulativeLengths(route);

  it('keeps the rider on the pass they are riding', () => {
    let hops = 0;
    let oldHops = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const noise = drift(35, 6, seed);
      let progress: RouteProgress | null = null;
      for (let t = 0; t < 35; t++) {
        const truth = 8 * t; // along the outbound leg
        const p = pointAlong(route, truth);
        const fix = {
          latitude: p.latitude + noise[t][1] / M_PER_DEG_LAT,
          longitude: p.longitude + noise[t][0] / M_PER_DEG_LNG,
          speed: 8,
        };
        progress = followRouteProgress(fix, route, cum, progress);
        if (Math.abs(progress!.alongMeters - truth) > 100) hops++;
        const global = alongDistance(route, cum, projectOntoPath(fix, route)!);
        if (Math.abs(global - truth) > 100) oldHops++;
      }
    }
    // The plain projection put the head of the line on the way back, cutting
    // off everything between, every time the drift leaned north.
    expect(oldHops).toBeGreaterThan(20);
    expect(hops).toBe(0);
  });

  it('follows a rider who really is somewhere else now', () => {
    const start = followRouteProgress(at(20, 0), route, cum, null)!;
    // A fix far along the route and well away from the start: a shortcut, or
    // the phone catching up after a tunnel.
    const later = followRouteProgress(at(150, 60), route, cum, start)!;
    expect(later.alongMeters).toBeGreaterThan(start.alongMeters);
  });
});
