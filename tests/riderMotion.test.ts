import { describe, expect, it } from 'vitest';
import { RiderMotion } from '../src/utils/riderMotion';
import { metresBetween, projectOntoPath } from '../src/utils/routeGeometry';

const epoch = 1_000_000;
const origin = { latitude: 6.68, longitude: 124.66 };
const east = (meters: number) => ({ latitude: origin.latitude, longitude: origin.longitude + meters / (111195 * Math.cos(origin.latitude * Math.PI / 180)) });
const road = [origin, east(200)];
const push = (motion: RiderMotion, coordinate: typeof origin, now: number, extra: Partial<Parameters<RiderMotion['push']>[1]> = {}) =>
  motion.push(coordinate, { now, wallNow: epoch + now, recordedAt: epoch + now, route: null, speedMps: 10, ...extra });

describe('the rider visual motion timeline', () => {
  it('keeps travelling past 1100ms when the next accepted fix is delayed', () => {
    const motion = new RiderMotion();
    push(motion, origin, 0);
    push(motion, east(10), 1000);
    const at1100 = motion.sample(2100)!;
    const at1900 = motion.sample(2900)!;
    expect(at1100.moving).toBe(true);
    expect(at1900.coordinate.longitude).toBeGreaterThan(at1100.coordinate.longitude);
    expect(at1900.velocity.longitude).toBeGreaterThan(0);
  });

  it.each([null, road])('retains position and velocity through an interrupted glide (route=%s)', (route) => {
    const motion = new RiderMotion();
    push(motion, origin, 0, { route });
    push(motion, east(10), 1000, { route });
    const before = motion.sample(1800)!;
    const beforeStep = motion.sample(1799)!;
    push(motion, east(20), 1800, { route });
    const after = motion.sample(1800)!;
    const afterStep = motion.sample(1801)!;
    expect(metresBetween(before.coordinate, after.coordinate)).toBeLessThan(0.001);
    expect(after.velocity.longitude).toBeCloseTo(before.velocity.longitude, 10);
    const vBefore = before.coordinate.longitude - beforeStep.coordinate.longitude;
    const vAfter = afterStep.coordinate.longitude - after.coordinate.longitude;
    expect(vAfter / vBefore).toBeCloseTo(1, 2);
  });

  it('uses GPS sample intervals rather than the delivery burst interval', () => {
    const motion = new RiderMotion();
    push(motion, origin, 0);
    push(motion, east(20), 50, { recordedAt: epoch + 2000, wallNow: epoch + 2000 });
    expect(motion.sample(1150)!.coordinate.longitude).toBeLessThan(east(20).longitude);
    expect(metresBetween(motion.sample(2050)!.coordinate, east(20))).toBeLessThan(0.001);
  });

  it('slows to rest after a bounded prediction and never drifts indefinitely', () => {
    const motion = new RiderMotion();
    push(motion, origin, 0);
    push(motion, east(10), 1000, { speedMps: 35 });
    const stopped = motion.sample(6000)!;
    expect(stopped.moving).toBe(false);
    expect(metresBetween(stopped.coordinate, east(10))).toBeLessThanOrEqual(25.01);
    expect(stopped.velocity.longitude).toBe(0);
    expect(motion.sample(60000)).toEqual(stopped);
  });

  it('joins interpolation and prediction with continuous velocity', () => {
    const motion = new RiderMotion();
    push(motion, origin, 0);
    push(motion, east(10), 1000);
    const atBoundary = motion.sample(2000)!;
    const after = motion.sample(2000.01)!;
    expect(after.velocity.longitude / atBoundary.velocity.longitude).toBeCloseTo(1, 4);
  });

  it('does not extrapolate a stopped or already stale fix', () => {
    for (const extra of [{ speedMps: 0 }, { stationary: true }, { wallNow: epoch + 10000 }]) {
      const motion = new RiderMotion();
      push(motion, origin, 0);
      push(motion, east(10), 1000, extra);
      expect(metresBetween(motion.sample(3000)!.coordinate, east(10))).toBeLessThan(0.001);
      expect(motion.sample(3000)!.moving).toBe(false);
    }
  });

  it('ignores out-of-order and duplicate samples without altering an active glide', () => {
    const motion = new RiderMotion();
    push(motion, origin, 0);
    push(motion, east(10), 1000);
    const before = motion.sample(1800);
    expect(push(motion, east(-10), 1500, { recordedAt: epoch + 500 })).toBe(false);
    expect(push(motion, east(-10), 1600, { recordedAt: epoch + 1000 })).toBe(false);
    expect(motion.sample(1800)).toEqual(before);
  });

  it('accepts a newer stationary sample at identical coordinates and stops prediction', () => {
    const motion = new RiderMotion();
    push(motion, origin, 0);
    push(motion, east(10), 1000);
    push(motion, east(10), 2200, { stationary: true });
    expect(motion.sample(4000)!.moving).toBe(false);
    expect(metresBetween(motion.sample(4000)!.coordinate, east(10))).toBeLessThan(0.001);
  });

  it('follows road vertices through prediction and can reverse through a bend', () => {
    const corner = east(10);
    const north = { ...corner, latitude: corner.latitude + 30 / 111195 };
    const route = [origin, corner, north];
    const motion = new RiderMotion();
    push(motion, origin, 0, { route });
    push(motion, corner, 1000, { route });
    const pastCorner = motion.sample(2300)!;
    expect(pastCorner.coordinate.latitude).toBeGreaterThan(corner.latitude);
    expect(projectOntoPath(pastCorner.coordinate, route)!.distanceMeters).toBeLessThan(0.001);
    push(motion, origin, 3000, { route });
    expect(metresBetween(motion.sample(5000)!.coordinate, origin)).toBeLessThan(0.001);
  });

  it('never predicts beyond the end of the known route', () => {
    const motion = new RiderMotion();
    const route = [origin, east(10)];
    push(motion, origin, 0, { route });
    push(motion, east(10), 1000, { route });
    expect(metresBetween(motion.sample(2600)!.coordinate, east(10))).toBeLessThan(0.001);
    expect(motion.sample(2600)!.velocity.longitude).toBe(0);
  });

  it('keeps a genuinely off-route fix off the road', () => {
    const motion = new RiderMotion();
    const offRoad = { ...east(10), latitude: origin.latitude + 100 / 111195 };
    push(motion, origin, 0, { route: road });
    push(motion, offRoad, 1000, { route: road, speedMps: 0 });
    expect(metresBetween(motion.sample(2000)!.coordinate, offRoad)).toBeLessThan(0.001);
  });

  it('does not jump sideways on route replacement', () => {
    const motion = new RiderMotion();
    push(motion, origin, 0, { route: road });
    push(motion, east(10), 1000, { route: road });
    const before = motion.sample(1700)!;
    const newRoute = road.map((p) => ({ ...p, latitude: p.latitude + 20 / 111195 }));
    push(motion, east(20), 1700, { route: newRoute });
    expect(metresBetween(before.coordinate, motion.sample(1700)!.coordinate)).toBeLessThan(0.001);
  });

  it('resets immediately for a distant fix or a long resume gap', () => {
    const motion = new RiderMotion();
    push(motion, origin, 0);
    push(motion, east(1000), 1000);
    expect(motion.sample(1000)!.coordinate).toEqual(east(1000));
    push(motion, east(1010), 20000);
    expect(motion.sample(20000)!.coordinate).toEqual(east(1010));
    expect(motion.sample(20000)!.moving).toBe(false);
  });

  it('is independent of dropped frames and wall-clock changes during a glide', () => {
    const motion = new RiderMotion();
    push(motion, origin, 0);
    push(motion, east(10), 1000);
    const direct = motion.sample(2500);
    for (let time = 1000; time <= 2500; time += 16) motion.sample(time);
    expect(motion.sample(2500)).toEqual(direct);
  });
});
