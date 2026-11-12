import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCK_RADIUS_METERS,
  GpsStabilizer,
  MAX_LOCK_RADIUS_METERS,
  MIN_LOCK_RADIUS_METERS,
  type StableFix,
} from '../src/utils/gpsStabilizer';
import { distanceMeters, evaluateFix, type Fix } from '../src/utils/locationQuality';

// Tacurong, near the public market.
const BASE = { latitude: 6.6906, longitude: 124.6772 };
const M_PER_DEG = 111_320;
const M_PER_DEG_LON = M_PER_DEG * Math.cos((BASE.latitude * Math.PI) / 180);

/** A fix `east` and `north` metres from BASE. */
function at(east: number, north: number, extra: Partial<Fix> = {}): Fix {
  return {
    latitude: BASE.latitude + north / M_PER_DEG,
    longitude: BASE.longitude + east / M_PER_DEG_LON,
    accuracyMeters: 10,
    speedMps: 0,
    headingDeg: null,
    timestamp: 0,
    ...extra,
  };
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
  return { uniform, gaussian };
}

/** A phone lying still: fixes scattered around the true spot, with budget-phone speed noise. */
function stillPhone(seconds: number, opts: { sigma: number; accuracy: number; seed: number; start?: number }): Fix[] {
  const { gaussian, uniform } = rng(opts.seed);
  return Array.from({ length: seconds }, (_, i) =>
    at(gaussian() * opts.sigma, gaussian() * opts.sigma, {
      accuracyMeters: opts.accuracy,
      speedMps: uniform() * 1.1,
      timestamp: (opts.start ?? 0) + i * 1000,
    })
  );
}

function feed(stabilizer: GpsStabilizer, fixes: Fix[]): StableFix[] {
  const out: StableFix[] = [];
  for (const fix of fixes) {
    const verdict = stabilizer.push(fix);
    if (verdict.kind !== 'reject') out.push(verdict.fix);
  }
  return out;
}

/** How far a pin drawn from these points travels, in total. */
function pathLength(points: Array<{ latitude: number; longitude: number }>): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceMeters(points[i - 1], points[i]);
  return total;
}

describe('GpsStabilizer standing still', () => {
  it('holds the pin in one place once the phone is still', () => {
    const out = feed(new GpsStabilizer(), stillPhone(120, { sigma: 5, accuracy: 8, seed: 1 }));
    const settled = out.slice(5);
    expect(settled.every((fix) => fix.locked)).toBe(true);
    // At most one deliberate correction in two minutes, never a creep.
    expect(pathLength(settled)).toBeLessThan(10);
  });

  it('did not before: the old gate walked the pin around the same still phone', () => {
    // The same phone through the gate this replaces (utils/locationQuality.evaluateFix).
    const fixes = stillPhone(120, { sigma: 5, accuracy: 8, seed: 1 });
    const shown: Fix[] = [];
    let previous: Fix | null = null;
    for (const fix of fixes) {
      const verdict = evaluateFix(fix, previous);
      if (verdict.kind === 'reject') continue;
      previous = verdict.fix;
      shown.push(verdict.fix);
    }
    const steadied = feed(new GpsStabilizer(), fixes);
    expect(pathLength(shown)).toBeGreaterThan(100);
    expect(pathLength(steadied)).toBeLessThan(pathLength(shown) / 5);
  });

  it('holds still indoors, where fixes wander 20 m and more', () => {
    const out = feed(new GpsStabilizer(), stillPhone(180, { sigma: 12, accuracy: 30, seed: 2 }));
    const settled = out.slice(8);
    expect(settled.filter((fix) => !fix.locked).length).toBe(0);
    expect(pathLength(settled)).toBeLessThan(20);
  });

  it('is not unlocked by one wild fix', () => {
    const stabilizer = new GpsStabilizer();
    feed(stabilizer, stillPhone(10, { sigma: 3, accuracy: 6, seed: 3 }));
    const pinned = stabilizer.current()!;
    expect(pinned.locked).toBe(true);

    // A multipath bounce 40 m away, then back. Two seconds after the last
    // fix, so it is not simply rejected as impossibly fast.
    const spike = stabilizer.push(at(40, 0, { accuracyMeters: 15, speedMps: 0.4, timestamp: 11_000 }));
    expect(spike.kind).toBe('still');
    const after = feed(stabilizer, stillPhone(5, { sigma: 3, accuracy: 6, seed: 4, start: 12_000 }));
    expect(after.every((fix) => fix.locked)).toBe(true);
    expect(distanceMeters(stabilizer.current()!, pinned)).toBeLessThan(0.01);
  });

  it('holds still while the error drifts slowly, the way real GPS error does', () => {
    // Real error is not fresh noise each second: it wanders for tens of
    // seconds at a time. Counting that drift as travel unlocked a still pin
    // more than once per stop; the phone's own Doppler speed, near zero, is
    // what tells the two apart.
    for (let seed = 1; seed <= 20; seed++) {
      const { gaussian, uniform } = rng(seed);
      let ex = gaussian() * 5;
      let ey = gaussian() * 5;
      const fixes = Array.from({ length: 300 }, (_, i) => {
        ex = 0.9 * ex + Math.sqrt(1 - 0.81) * 5 * gaussian();
        ey = 0.9 * ey + Math.sqrt(1 - 0.81) * 5 * gaussian();
        return at(ex, ey, { accuracyMeters: 7, speedMps: uniform() * 1.1, timestamp: i * 1000 });
      });
      const settled = feed(new GpsStabilizer(), fixes).slice(10);
      expect(settled.filter((fix) => !fix.locked)).toHaveLength(0);
    }
  });

  it('still lets go on a phone that reports a speed of 0 even while moving', () => {
    const stabilizer = new GpsStabilizer();
    feed(stabilizer, stillPhone(15, { sigma: 3, accuracy: 6, seed: 10 }));
    expect(stabilizer.current()!.locked).toBe(true);
    const riding = Array.from({ length: 20 }, (_, i) =>
      at(0, (i + 1) * 5, { speedMps: 0, accuracyMeters: 6, timestamp: (15 + i) * 1000 })
    );
    const out = feed(stabilizer, riding);
    const firstMoving = out.findIndex((fix) => !fix.locked);
    expect(firstMoving).toBeGreaterThanOrEqual(0);
    expect(firstMoving).toBeLessThan(16);
  });

  it('keeps the heading the rider had when they stopped', () => {
    const stabilizer = new GpsStabilizer();
    // Riding east, then stopping.
    const riding = Array.from({ length: 8 }, (_, i) =>
      at(i * 6, 0, { speedMps: 6, headingDeg: 90, accuracyMeters: 5, timestamp: i * 1000 })
    );
    feed(stabilizer, riding);
    const stopped = Array.from({ length: 8 }, (_, i) =>
      at(42 + (i % 2), 0, { speedMps: 0.3, headingDeg: (i * 97) % 360, accuracyMeters: 5, timestamp: (8 + i) * 1000 })
    );
    const out = feed(stabilizer, stopped);
    expect(out[out.length - 1].locked).toBe(true);
    expect(out[out.length - 1].headingDeg).toBe(90);
    expect(out[out.length - 1].speedMps).toBe(0);
  });
});

describe('GpsStabilizer moving off and riding', () => {
  it('lets go within a few seconds of the rider pulling away', () => {
    const stabilizer = new GpsStabilizer();
    feed(stabilizer, stillPhone(15, { sigma: 3, accuracy: 6, seed: 5 }));
    expect(stabilizer.current()!.locked).toBe(true);

    const departing = Array.from({ length: 6 }, (_, i) =>
      at(0, (i + 1) * 5, { speedMps: 5, headingDeg: 0, accuracyMeters: 6, timestamp: (15 + i) * 1000 })
    );
    const out = feed(stabilizer, departing);
    const firstMoving = out.findIndex((fix) => !fix.locked);
    expect(firstMoving).toBeGreaterThanOrEqual(0);
    expect(firstMoving).toBeLessThanOrEqual(2);
    expect(out[out.length - 1].speedMps).toBeGreaterThan(3);
  });

  /** A phone locked exactly on BASE, so what releases it is the fixes that follow and nothing else. */
  function lockedOnBase(): GpsStabilizer {
    const stabilizer = new GpsStabilizer();
    feed(stabilizer, Array.from({ length: 15 }, (_, i) => at(0, 0, { accuracyMeters: 6, speedMps: 0.3, timestamp: i * 1000 })));
    expect(stabilizer.current()!.locked).toBe(true);
    return stabilizer;
  }

  it('lets go on the second moving fix, while the rider is still inside half the lock radius', () => {
    // Pulling away north at 2 m/s²: 1 m out at 2 m/s after one second, 4 m out
    // at 4 m/s after two. The pin used to wait until they were 6 m out on two
    // fixes in a row, which is the fourth second.
    const stabilizer = lockedOnBase();
    const departing = [1, 2, 3, 4].map((t) =>
      at(0, t * t, { speedMps: 2 * t, headingDeg: 0, accuracyMeters: 6, timestamp: (14 + t) * 1000 })
    );
    const out = feed(stabilizer, departing);
    expect(out.map((fix) => fix.locked)).toEqual([true, false, false, false]);
    // Let go where the rider is, already moving their way.
    expect(distanceMeters(out[1], at(0, 4))).toBeLessThan(0.5);
    expect(out[1].speedMps).toBeGreaterThan(3);
    expect(out[1].headingDeg).toBe(0);
  });

  it('is not released by one stray speed reading', () => {
    const stabilizer = lockedOnBase();
    const out = feed(stabilizer, [
      at(3, 2, { speedMps: 3.4, headingDeg: 140, accuracyMeters: 6, timestamp: 15_000 }),
      at(2, -1, { speedMps: 0.4, headingDeg: 20, accuracyMeters: 6, timestamp: 16_000 }),
      at(-1, 3, { speedMps: 0.2, headingDeg: 300, accuracyMeters: 6, timestamp: 17_000 }),
    ]);
    expect(out.every((fix) => fix.locked)).toBe(true);
  });

  it('is not released by two stray speed readings that point different ways', () => {
    // Fast enough and far enough apart to add up, but one says south-east and
    // the next north-west: not one journey.
    const stabilizer = lockedOnBase();
    const out = feed(stabilizer, [
      at(3, -2, { speedMps: 3, headingDeg: 140, accuracyMeters: 6, timestamp: 15_000 }),
      at(-3, 3, { speedMps: 3, headingDeg: 310, accuracyMeters: 6, timestamp: 16_000 }),
      at(1, 1, { speedMps: 0.3, headingDeg: 40, accuracyMeters: 6, timestamp: 17_000 }),
    ]);
    expect(out.every((fix) => fix.locked)).toBe(true);
  });

  it('is not released by two readings whose speed does not add up to real travel', () => {
    // Just over the moving speed, the same way, a second apart, 3 m from the
    // spot: 2.1 m between them, where a rider pulling away covers 3 and more.
    const stabilizer = lockedOnBase();
    const out = feed(stabilizer, [
      at(0, 3, { speedMps: 2.1, headingDeg: 0, accuracyMeters: 6, timestamp: 15_000 }),
      at(0, 3.5, { speedMps: 2.1, headingDeg: 5, accuracyMeters: 6, timestamp: 16_000 }),
    ]);
    expect(out.every((fix) => fix.locked)).toBe(true);
  });

  it('still holds a phone whose speed noise reaches just under the moving speed', () => {
    // Worse than the budget phones measured (0.5 to 1.5 m/s): up to 1.9 m/s,
    // each reading with a course of its own, while the position drifts. A good
    // fix, so only the speed could be what releases it.
    for (let seed = 1; seed <= 20; seed++) {
      const { gaussian, uniform } = rng(100 + seed);
      let ex = gaussian() * 2.5;
      let ey = gaussian() * 2.5;
      const fixes = Array.from({ length: 300 }, (_, i) => {
        ex = 0.9 * ex + Math.sqrt(1 - 0.81) * 2.5 * gaussian();
        ey = 0.9 * ey + Math.sqrt(1 - 0.81) * 2.5 * gaussian();
        return at(ex, ey, { accuracyMeters: 4, speedMps: uniform() * 1.9, headingDeg: uniform() * 360, timestamp: i * 1000 });
      });
      // Speed noise this high makes the pin slower to lock (it wants three
      // quiet readings in a row). The point here is that once locked, it holds.
      const out = feed(new GpsStabilizer(), fixes);
      const lockedAt = out.findIndex((fix) => fix.locked);
      expect(lockedAt).toBeGreaterThanOrEqual(0);
      expect(out.slice(lockedAt).filter((fix) => !fix.locked)).toHaveLength(0);
    }
  });

  it('lets a pulling-away rider go within three seconds on nine phones in ten', () => {
    // 200 phones stopped for 30 s with drifting GPS error, then away at 2 m/s².
    // Fixes a second apart, landing wherever in that second the phone happens to be.
    const delays: number[] = [];
    for (let seed = 1; seed <= 200; seed++) {
      const { gaussian, uniform } = rng(500 + seed);
      const phase = uniform();
      let ex = gaussian() * 5;
      let ey = gaussian() * 5;
      const stabilizer = new GpsStabilizer();
      let released = NaN;
      for (let i = 0; i < 45 && Number.isNaN(released); i++) {
        const sinceStart = i + phase - 30;
        const speed = Math.min(8, 2 * Math.max(0, sinceStart));
        const travelled = sinceStart <= 0 ? 0 : sinceStart < 4 ? sinceStart * sinceStart : 16 + 8 * (sinceStart - 4);
        ex = 0.9 * ex + Math.sqrt(1 - 0.81) * 5 * gaussian();
        ey = 0.9 * ey + Math.sqrt(1 - 0.81) * 5 * gaussian();
        const verdict = stabilizer.push(
          at(ex, travelled + ey, {
            accuracyMeters: 7,
            speedMps: speed < 0.3 ? uniform() * 1.1 : Math.max(0, speed + 0.3 * gaussian()),
            headingDeg: speed > 0.5 ? (8 * gaussian() + 360) % 360 : uniform() * 360,
            timestamp: Math.round((i + phase) * 1000),
          })
        );
        if (verdict.kind !== 'reject' && sinceStart > 0 && !verdict.fix.locked) released = sinceStart;
      }
      delays.push(released);
    }
    const sorted = delays.filter((d) => !Number.isNaN(d)).sort((a, b) => a - b);
    expect(sorted).toHaveLength(200);
    // Two agreeing fixes a second apart cannot come sooner than this; it was 3.5 s and 4.7 s.
    expect(sorted[100]).toBeLessThan(2.7);
    expect(sorted[180]).toBeLessThan(3.1);
  });

  it('moves at once after a long gap far away, without waiting for a second fix', () => {
    const stabilizer = new GpsStabilizer();
    feed(stabilizer, stillPhone(10, { sigma: 3, accuracy: 6, seed: 6 }));
    const verdict = stabilizer.push(at(400, 300, { accuracyMeters: 8, speedMps: 0, timestamp: 600_000 }));
    expect(verdict.kind).toBe('moving');
    if (verdict.kind === 'moving') expect(distanceMeters(verdict.fix, at(400, 300))).toBeLessThan(1);
  });

  it('keeps a riding pin closer to the road than the raw fixes', () => {
    // Riding north along a straight road (east = 0) at 8 m/s, fixes scattered sideways.
    const { gaussian } = rng(7);
    const fixes = Array.from({ length: 60 }, (_, i) =>
      at(gaussian() * 6, i * 8, { speedMps: 8 + gaussian() * 0.3, headingDeg: 0, accuracyMeters: 9, timestamp: i * 1000 })
    );
    const out = feed(new GpsStabilizer(), fixes);
    const offRoad = (points: Array<{ longitude: number }>) =>
      Math.sqrt(
        points.slice(10).reduce((sum, p) => sum + ((p.longitude - BASE.longitude) * M_PER_DEG_LON) ** 2, 0) /
          (points.length - 10)
      );
    expect(out.every((fix) => !fix.locked)).toBe(true);
    expect(offRoad(out)).toBeLessThan(offRoad(fixes) * 0.7);
  });

  it('does not lag behind a rider: the pin keeps up with the fixes along the road', () => {
    const fixes = Array.from({ length: 30 }, (_, i) =>
      at(0, i * 10, { speedMps: 10, headingDeg: 0, accuracyMeters: 6, timestamp: i * 1000 })
    );
    const out = feed(new GpsStabilizer(), fixes);
    const last = out[out.length - 1];
    expect(distanceMeters(last, fixes[fixes.length - 1])).toBeLessThan(3);
  });
});

describe('GpsStabilizer rejects', () => {
  it('drops fixes the phone itself says are poor, out of order, or impossible', () => {
    const stabilizer = new GpsStabilizer();
    expect(stabilizer.push(at(0, 0, { accuracyMeters: 80, timestamp: 0 })).kind).toBe('reject');
    expect(stabilizer.push(at(0, 0, { timestamp: 1000 })).kind).toBe('moving');
    expect(stabilizer.push(at(0, 0, { timestamp: 1000 }))).toEqual({ kind: 'reject', reason: 'out_of_order' });
    expect(stabilizer.push(at(900, 0, { timestamp: 2000 }))).toEqual({ kind: 'reject', reason: 'implausible_speed' });
  });

  it('starts over when the first fix was the glitch and every later one disagrees with it', () => {
    const stabilizer = new GpsStabilizer();
    stabilizer.push(at(0, 0, { timestamp: 0 }));
    const verdicts = Array.from({ length: 5 }, (_, i) =>
      stabilizer.push(at(2000 + i, 0, { timestamp: (i + 1) * 1000 }))
    );
    expect(verdicts.slice(0, 4).every((v) => v.kind === 'reject')).toBe(true);
    expect(verdicts[4].kind).toBe('moving');
    expect(distanceMeters(stabilizer.current()!, at(2004, 0))).toBeLessThan(1);
  });
});

describe('GpsStabilizer lock radius', () => {
  it('uses the calibrated radius, kept within sane bounds', () => {
    expect(new GpsStabilizer().lockRadiusMeters).toBe(DEFAULT_LOCK_RADIUS_METERS);
    expect(new GpsStabilizer({ lockRadiusMeters: 2 }).lockRadiusMeters).toBe(MIN_LOCK_RADIUS_METERS);
    expect(new GpsStabilizer({ lockRadiusMeters: 500 }).lockRadiusMeters).toBe(MAX_LOCK_RADIUS_METERS);
    const stabilizer = new GpsStabilizer();
    stabilizer.configure({ lockRadiusMeters: 22 });
    expect(stabilizer.lockRadiusMeters).toBe(22);
  });

  it('with a wider calibrated radius, a noisier phone stays put', () => {
    // A phone whose still fixes wander ~15 m under a good accuracy figure.
    const fixes = stillPhone(120, { sigma: 9, accuracy: 6, seed: 9 });
    const tuned = feed(new GpsStabilizer({ lockRadiusMeters: 30 }), fixes).slice(6);
    expect(tuned.every((fix) => fix.locked)).toBe(true);
  });
});
