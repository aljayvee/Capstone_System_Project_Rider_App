import { describe, expect, it } from 'vitest';
import {
  MAX_ACCEL_MPS2, MAX_BRAKE_MPS2, MAX_LEAD_METERS, RiderMotion, type RiderMotionFrame,
} from '../src/utils/riderMotion';
import { metresBetween, projectOntoPath } from '../src/utils/routeGeometry';
import type { MapCoordinate } from '../src/utils/coords';

const epoch = 1_000_000;
const M = 111195;
const origin = { latitude: 6.68, longitude: 124.66 };
const COS = Math.cos(origin.latitude * Math.PI / 180);
const east = (meters: number, from: MapCoordinate = origin) => ({ latitude: from.latitude, longitude: from.longitude + meters / (M * COS) });
const north = (meters: number, from: MapCoordinate = origin) => ({ latitude: from.latitude + meters / M, longitude: from.longitude });
/** Metres east of the origin, and the eastward speed of a frame. */
const eastOf = (c: MapCoordinate) => (c.longitude - origin.longitude) * M * COS;
const speedEast = (f: RiderMotionFrame) => f.velocity.longitude * M * COS;
const road = [origin, east(400)];

type Extra = Partial<Parameters<RiderMotion['push']>[1]>;
interface Fix { at: number; coordinate: MapCoordinate; extra?: Extra }
const push = (motion: RiderMotion, coordinate: MapCoordinate, now: number, extra: Extra = {}) =>
  motion.push(coordinate, { now, wallNow: epoch + now, recordedAt: epoch + now, route: null, speedMps: 10, ...extra });

/** A rider at a steady speed, one fix at each arrival time. */
const steady = (arrivals: number[], where: (t: number) => MapCoordinate, extra: Extra = {}): Fix[] =>
  arrivals.map((at) => ({ at, coordinate: where(at), extra }));

/** Plays fixes in time order, drawing a frame every `step` ms like the marker's loop does. */
function play(motion: RiderMotion, fixes: Fix[], until: number, step = 16) {
  const frames: { t: number; frame: RiderMotionFrame }[] = [];
  let next = 0;
  for (let t = 0; t <= until; t += step) {
    while (next < fixes.length && fixes[next].at <= t) {
      push(motion, fixes[next].coordinate, fixes[next].at, fixes[next].extra);
      next++;
    }
    frames.push({ t, frame: motion.sample(t)! });
  }
  return frames;
}

describe('riding the icon along the road line', () => {
  it('rides on between fixes, however irregular, and never stops at one', () => {
    const motion = new RiderMotion();
    const fixes = steady([0, 1000, 2300, 4100, 5400, 7400, 8600], (t) => east(t / 100), { route: road });
    const riding = play(motion, fixes, 8600).filter(({ t }) => t > 1000);
    for (let i = 1; i < riding.length; i++) {
      const speed = (eastOf(riding[i].frame.coordinate) - eastOf(riding[i - 1].frame.coordinate)) / ((riding[i].t - riding[i - 1].t) / 1000);
      expect(speed).toBeGreaterThan(6);
      expect(speed).toBeLessThan(18);
      expect(riding[i].frame.moving).toBe(true);
    }
  });

  it('stays exactly on the road line through a bend instead of cutting the corner', () => {
    const corner = east(30);
    const route = [origin, corner, north(60, corner)];
    const along = (m: number) => (m <= 30 ? east(m) : north(m - 30, corner));
    const motion = new RiderMotion();
    const frames = play(motion, steady([0, 1000, 2000, 3000, 4000, 5000, 6000], (t) => along(t / 100), { route }), 6500);
    for (const { frame } of frames) expect(projectOntoPath(frame.coordinate, route)!.distanceMeters).toBeLessThan(0.01);
    expect(frames.at(-1)!.frame.coordinate.latitude).toBeGreaterThan(north(20, corner).latitude);
  });

  it.each([null, road])('never moves the icon or changes its speed when a fix lands (route=%s)', (route) => {
    const motion = new RiderMotion();
    push(motion, origin, 0, { route });
    push(motion, east(10), 1000, { route });
    const step = motion.sample(1799)!;
    const before = motion.sample(1800)!;
    push(motion, east(20), 1800, { route });
    const after = motion.sample(1800)!;
    const next = motion.sample(1801)!;
    expect(metresBetween(before.coordinate, after.coordinate)).toBeLessThan(1e-6);
    expect(after.velocity.longitude).toBeCloseTo(before.velocity.longitude, 12);
    const ratio = (next.coordinate.longitude - after.coordinate.longitude) / (before.coordinate.longitude - step.coordinate.longitude);
    expect(ratio).toBeCloseTo(1, 2);
  });

  it('speeds up and brakes within what a motorcycle can do', () => {
    const motion = new RiderMotion();
    const fixes: Fix[] = [
      { at: 0, coordinate: origin, extra: { route: road, speedMps: 0 } },
      ...steady([1000, 2000, 3000, 4000, 5000], (t) => east(t / 100), { route: road }),
      { at: 6000, coordinate: east(52), extra: { route: road, speedMps: 0, stationary: true } },
    ];
    const frames = play(motion, fixes, 12000);
    for (let i = 1; i < frames.length; i++) {
      const accel = (speedEast(frames[i].frame) - speedEast(frames[i - 1].frame)) / ((frames[i].t - frames[i - 1].t) / 1000);
      expect(accel).toBeLessThanOrEqual(MAX_ACCEL_MPS2 + 1e-6);
      expect(accel).toBeGreaterThanOrEqual(-MAX_BRAKE_MPS2 - 1e-6);
    }
  });

  it('settles where the last fix put the rider when fixes stop, never riding on forever', () => {
    const motion = new RiderMotion();
    play(motion, steady([0, 1000, 2000, 3000], (t) => east(t / 100), { route: road }), 20000);
    const stopped = motion.sample(20000)!;
    expect(stopped.moving).toBe(false);
    expect(eastOf(stopped.coordinate) - 30).toBeGreaterThanOrEqual(0);
    expect(eastOf(stopped.coordinate) - 30).toBeLessThanOrEqual(MAX_LEAD_METERS + 0.01);
    expect(stopped.velocity.longitude).toBe(0);
    expect(motion.sample(60000)).toEqual(stopped);
  });

  it('does not ride on from a stopped, stationary or stale fix', () => {
    for (const extra of [{ speedMps: 0 }, { stationary: true }, { wallNow: epoch + 11000 }]) {
      const motion = new RiderMotion();
      const frames = play(motion, [{ at: 0, coordinate: origin }, { at: 1000, coordinate: east(10), extra }], 10000);
      for (const { frame } of frames) expect(eastOf(frame.coordinate)).toBeLessThanOrEqual(10.01);
      expect(metresBetween(motion.sample(10000)!.coordinate, east(10))).toBeLessThan(0.001);
      expect(motion.sample(10000)!.moving).toBe(false);
    }
  });

  it('brakes for a rider who stops and settles on them, not past them', () => {
    const motion = new RiderMotion();
    const fixes = [
      ...steady([0, 1000, 2000, 3000, 4000], (t) => east(t / 100), { route: road }),
      { at: 5000, coordinate: east(46), extra: { route: road, speedMps: 4 } },
      { at: 6000, coordinate: east(48), extra: { route: road, speedMps: 0, stationary: true } },
    ];
    const frames = play(motion, fixes, 20000);
    // Past them by no more than the one second it took to learn they were braking.
    for (const { frame } of frames) expect(eastOf(frame.coordinate)).toBeLessThan(48 + 10);
    expect(metresBetween(motion.sample(20000)!.coordinate, east(48))).toBeLessThan(0.001);
    expect(motion.sample(20000)!.moving).toBe(false);
  });

  it('waits for the rider instead of backing up for GPS scatter along the road', () => {
    const motion = new RiderMotion();
    const fixes = steady([0, 1000, 2000, 3000, 4000, 5000], (t) => east(t === 3000 ? 22 : t / 100), { route: road });
    const frames = play(motion, fixes, 6000).filter(({ t }) => t >= 1000);
    for (let i = 1; i < frames.length; i++) {
      expect(eastOf(frames[i].frame.coordinate)).toBeGreaterThanOrEqual(eastOf(frames[i - 1].frame.coordinate) - 1e-9);
    }
  });

  it('turns back for a real U-turn', () => {
    const motion = new RiderMotion();
    const metres = [0, 10, 20, 30, 40, 50, 40, 30, 20, 10];
    play(motion, metres.map((m, i) => ({ at: i * 1000, coordinate: east(m), extra: { route: road } })), 16000);
    expect(eastOf(motion.sample(16000)!.coordinate)).toBeLessThan(15);
  });

  it('places a late-arriving fix where the rider is by now', () => {
    const motion = new RiderMotion();
    const fixes = [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000].map((recorded) => ({
      at: recorded + 600,
      coordinate: east(recorded / 100),
      extra: { route: road, recordedAt: epoch + recorded, wallNow: epoch + recorded + 600 },
    }));
    for (const { t, frame } of play(motion, fixes, 8600)) {
      if (t >= 5000) expect(Math.abs(eastOf(frame.coordinate) - t / 100)).toBeLessThan(1.5);
    }
  });

  it('never rides past the end of the known route', () => {
    const motion = new RiderMotion();
    const route = [origin, east(10)];
    const frames = play(motion, steady([0, 1000], (t) => east(t / 100), { route }), 8000);
    for (const { frame } of frames) expect(eastOf(frame.coordinate)).toBeLessThanOrEqual(10 + 1e-6);
    expect(motion.sample(8000)!.velocity.longitude).toBe(0);
    expect(motion.sample(8000)!.moving).toBe(false);
  });

  it('keeps a genuinely off-road fix off the road', () => {
    const motion = new RiderMotion();
    const offRoad = north(100, east(10));
    push(motion, origin, 0, { route: road });
    push(motion, offRoad, 1000, { route: road, speedMps: 0 });
    play(motion, [], 9000);
    expect(metresBetween(motion.sample(9000)!.coordinate, offRoad)).toBeLessThan(0.001);
  });

  it('slides onto a replacement road from where it is drawn, without a sideways jump', () => {
    const motion = new RiderMotion();
    push(motion, origin, 0, { route: road });
    push(motion, east(10), 1000, { route: road });
    const step = motion.sample(1699)!;
    const before = motion.sample(1700)!;
    const newRoute = road.map((p) => north(20, p));
    push(motion, north(20, east(20)), 1700, { route: newRoute });
    const after = motion.sample(1700)!;
    const next = motion.sample(1701)!;
    expect(metresBetween(before.coordinate, after.coordinate)).toBeLessThan(1e-6);
    expect(after.velocity.latitude).toBeCloseTo(before.velocity.latitude, 12);
    expect((next.coordinate.longitude - after.coordinate.longitude) / (before.coordinate.longitude - step.coordinate.longitude)).toBeCloseTo(1, 2);
    expect(projectOntoPath(motion.sample(5000)!.coordinate, newRoute)!.distanceMeters).toBeLessThan(0.05);
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

  it('draws the same ride at any frame rate and through dropped frames', () => {
    const start = () => {
      const motion = new RiderMotion();
      push(motion, origin, 0, { route: road });
      push(motion, east(10), 1000, { route: road });
      return motion;
    };
    const direct = start().sample(2500);
    for (const step of [16, 33, 8.3, 250]) {
      const motion = start();
      for (let time = 1000; time < 2500; time += step) motion.sample(time);
      expect(motion.sample(2500)).toEqual(direct);
    }
  });

  it('ignores out-of-order and duplicate samples', () => {
    const motion = new RiderMotion();
    push(motion, origin, 0);
    push(motion, east(10), 1000);
    const before = motion.sample(1800);
    expect(push(motion, east(-10), 1500, { recordedAt: epoch + 500 })).toBe(false);
    expect(push(motion, east(-10), 1600, { recordedAt: epoch + 1000 })).toBe(false);
    expect(motion.sample(1800)).toEqual(before);
  });
});

describe('the heading of the road under the drawn rider', () => {
  // 60 m east, then a right-angle turn north.
  const corner = east(60);
  const route = [origin, corner, north(120, corner)];
  const along = (m: number) => (m <= 60 ? east(m) : north(m - 60, corner));
  const seconds = Array.from({ length: 13 }, (_, i) => i * 1000);
  const ride = () => play(new RiderMotion(), steady(seconds, (t) => along(t / 100), { route }), 12500);
  /** The shortest turn between two compass headings, in degrees. */
  const turn = (from: number, to: number) => Math.abs(((to - from) % 360 + 540) % 360 - 180);

  it('points along the road on each straight, and has none off the road', () => {
    const frames = ride();
    expect(frames.find(({ t }) => t >= 2000)!.frame.roadHeading).toBeCloseTo(90, 3);
    expect(turn(frames.at(-1)!.frame.roadHeading!, 0)).toBeLessThan(0.01);

    const openGround = new RiderMotion();
    push(openGround, origin, 0);
    push(openGround, east(10), 1000);
    expect(openGround.sample(1500)!.roadHeading).toBeNull();
  });

  it('sweeps through a bend frame by frame, between fixes, never in one step', () => {
    const headings = ride().map(({ frame }) => frame.roadHeading).filter((h): h is number => h != null);
    let biggest = 0;
    let framesTurning = 0;
    for (let i = 1; i < headings.length; i++) {
      const change = turn(headings[i - 1], headings[i]);
      biggest = Math.max(biggest, change);
      if (change > 0.01) framesTurning++;
      // East round to north, the short way, never past either.
      expect(headings[i]).toBeLessThanOrEqual(90.001);
      expect(headings[i]).toBeGreaterThanOrEqual(-0.001);
      expect(headings[i]).toBeLessThanOrEqual(headings[i - 1] + 0.001);
    }
    // A 90 degree corner taken at 10 m/s: about a second of turning, a degree or two a frame.
    expect(biggest).toBeLessThan(3);
    expect(framesTurning).toBeGreaterThan(40);
  });

  it.each([120, 240])('gives every frame its own place and heading at %i frames a second', (fps) => {
    const step = 1000 / fps;
    const frames = play(new RiderMotion(), steady(seconds, (t) => along(t / 100), { route }), 12000, step);

    // On the straight, riding steadily: each frame a little further on, evenly
    // spaced. Nothing is held for two frames or made up in the next, which is
    // what a simulation stepping slower than the screen would show.
    const straight = frames.filter(({ t }) => t > 2000 && t < 5000);
    let previousGap = 0;
    for (let i = 1; i < straight.length; i++) {
      const gap = metresBetween(straight[i - 1].frame.coordinate, straight[i].frame.coordinate);
      expect(gap).toBeGreaterThan(0);
      if (previousGap > 0) expect(Math.abs(gap - previousGap) / previousGap).toBeLessThan(0.05);
      previousGap = gap;
    }

    // Through the bend the heading moves on every single frame.
    const bend = frames.map(({ frame }) => frame.roadHeading).filter((h): h is number => h != null && h > 1 && h < 89);
    for (let i = 1; i < bend.length; i++) expect(bend[i]).toBeLessThan(bend[i - 1]);
    // About 1.1 s of turning at this speed, so about that many frames of it.
    expect(bend.length).toBeGreaterThan(fps * 0.9);
  });

  it('reaches a shorter way ahead at walking pace than at road speed', () => {
    /** The heading read when the drawn rider is 8 m short of the corner, at a steady speed. */
    const headingEightShort = (speedMps: number) => {
      const until = Math.ceil(60 / speedMps) * 1000;
      const fixes = steady(
        Array.from({ length: until / 1000 + 1 }, (_, i) => i * 1000),
        (t) => along((t / 1000) * speedMps),
        { route, speedMps }
      );
      const frames = play(new RiderMotion(), fixes, until);
      return frames.find(({ frame }) => frame.roadHeading != null && eastOf(frame.coordinate) >= 52)!.frame.roadHeading!;
    };
    // Walking, the arrow still faces along the road it is on.
    expect(headingEightShort(1.4)).toBeCloseTo(90, 3);
    // Riding, it has begun to lean into the turn 8 m ahead.
    const riding = headingEightShort(10);
    expect(riding).toBeLessThan(80);
    expect(riding).toBeGreaterThan(30);
  });
});
