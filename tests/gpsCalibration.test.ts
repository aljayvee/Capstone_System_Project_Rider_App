import { describe, expect, it } from 'vitest';
import {
  analyzeCalibration,
  parseSavedCalibration,
  toSavedCalibration,
  type CalibrationSample,
} from '../src/utils/gpsCalibration';
import { MAX_LOCK_RADIUS_METERS, MIN_LOCK_RADIUS_METERS } from '../src/utils/gpsStabilizer';

const BASE = { latitude: 6.6906, longitude: 124.6772 };
const M_PER_DEG = 111_320;
const M_PER_DEG_LON = M_PER_DEG * Math.cos((BASE.latitude * Math.PI) / 180);
const START = 1_000_000;

/** A ring of still fixes `radius` metres around BASE, one a second from `delay` seconds after the start. */
function ring(count: number, radius: number, extra: Partial<CalibrationSample> = {}, delay = 2): CalibrationSample[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * 2 * Math.PI;
    return {
      latitude: BASE.latitude + (Math.sin(angle) * radius) / M_PER_DEG,
      longitude: BASE.longitude + (Math.cos(angle) * radius) / M_PER_DEG_LON,
      accuracyMeters: 5,
      speedMps: 0.2,
      timestamp: START + (delay + i) * 1000,
      ...extra,
    };
  });
}

const provider = { locationServicesEnabled: true, gpsAvailable: true, networkAvailable: true };
const still = [BASE, BASE, BASE];

function analyze(samples: CalibrationSample[], overrides: Partial<Parameters<typeof analyzeCalibration>[0]> = {}) {
  return analyzeCalibration({
    samples,
    steadied: still,
    startedAt: START,
    endedAt: START + 30_000,
    provider,
    ...overrides,
  });
}

describe('analyzeCalibration', () => {
  it('rates a steady open-sky phone good, with nothing to change', () => {
    const report = analyze(ring(28, 4));
    expect(report.grade).toBe('good');
    expect(report.spreadP95Meters).toBeCloseTo(4, 0);
    expect(report.medianAccuracyMeters).toBe(5);
    expect(report.firstFixSeconds).toBe(2);
    expect(report.pinMovedMeters).toBe(0);
    expect(report.advice).toEqual(['Your GPS is working well here. Nothing to change.']);
  });

  it('turns the measured scatter into the lock radius, within bounds', () => {
    expect(analyze(ring(28, 4)).lockRadiusMeters).toBe(MIN_LOCK_RADIUS_METERS);
    expect(analyze(ring(28, 16, { accuracyMeters: 18 })).lockRadiusMeters).toBe(20);
    expect(analyze(ring(28, 80, { accuracyMeters: 40 })).lockRadiusMeters).toBe(MAX_LOCK_RADIUS_METERS);
  });

  it('rates a wandering fix fair or poor and says why', () => {
    const fair = analyze(ring(28, 16, { accuracyMeters: 18 }));
    expect(fair.grade).toBe('fair');
    expect(fair.advice.join(' ')).toMatch(/signal is weak here/);

    const poor = analyze(ring(28, 40, { accuracyMeters: 35 }));
    expect(poor.grade).toBe('poor');
  });

  it('refuses a verdict, and any retuning, when the phone was carried', () => {
    const carried = analyze(ring(28, 6, { speedMps: 3 }));
    expect(carried.grade).toBe('moved');
    expect(carried.lockRadiusMeters).toBeNull();
    expect(toSavedCalibration(carried, START)).toBeNull();
    expect(carried.advice.join(' ')).toMatch(/phone moved/);
  });

  it('says so when no position arrived at all', () => {
    const none = analyze([]);
    expect(none.grade).toBe('no_fix');
    expect(none.firstFixSeconds).toBeNull();
    expect(none.lockRadiusMeters).toBeNull();
    expect(none.advice.join(' ')).toMatch(/No position arrived/);
  });

  it('flags a fake-location app', () => {
    const report = analyze(ring(28, 3, { mocked: true }));
    expect(report.mocked).toBe(true);
    expect(report.advice[0]).toMatch(/fake-location app/);
  });

  it('asks for Google Location Accuracy and GPS when they are off', () => {
    const report = analyze(ring(28, 4), {
      provider: { locationServicesEnabled: true, gpsAvailable: false, networkAvailable: false },
    });
    const advice = report.advice.join(' ');
    expect(advice).toMatch(/Satellite GPS is off/);
    expect(advice).toMatch(/Google Location Accuracy/);
  });

  it('notices a phone that sends fewer positions than asked, and a slow first fix', () => {
    const sparse = analyze(ring(12, 4, {}, 25).map((s, i) => ({ ...s, timestamp: START + 25_000 + i * 400 })), {
      endedAt: START + 60_000,
    });
    const advice = sparse.advice.join(' ');
    expect(advice).toMatch(/battery saver/);
    expect(advice).toMatch(/first position took a long time/);
  });

  it('reports how far the steadied pin moved', () => {
    const report = analyze(ring(28, 4), {
      steadied: [BASE, { latitude: BASE.latitude + 5 / M_PER_DEG, longitude: BASE.longitude }],
    });
    expect(report.pinMovedMeters).toBeCloseTo(5, 0);
  });
});

describe('saved calibration', () => {
  it('round-trips, and survives storage it cannot read', () => {
    const saved = toSavedCalibration(analyze(ring(28, 16, { accuracyMeters: 18 })), START)!;
    expect(parseSavedCalibration(JSON.stringify(saved))).toEqual(saved);
    expect(parseSavedCalibration(null)).toBeNull();
    expect(parseSavedCalibration('not json')).toBeNull();
    expect(parseSavedCalibration(JSON.stringify({ lockRadiusMeters: 'wide' }))).toBeNull();
  });

  it('clamps a stored radius from an older build into bounds', () => {
    const raw = JSON.stringify({ lockRadiusMeters: 400, spreadP95Meters: 300, measuredAt: START, grade: 'poor' });
    expect(parseSavedCalibration(raw)!.lockRadiusMeters).toBe(MAX_LOCK_RADIUS_METERS);
  });
});
