import { describe, expect, it } from 'vitest';
import { evaluateDeviation, OFF_ROUTE_FIXES, OFF_ROUTE_METERS, offRouteMeters } from '../src/services/reroutePolicy';

const onRoute = { distanceFromRoute: 4, distanceFromRouteAtFetch: 3, travelledSinceFetch: 400, offRouteFixes: 0 };

function run(fixes: Parameters<typeof evaluateDeviation>[0][]) {
  let count = 0;
  let rerouted = 0;
  for (const fix of fixes) {
    const verdict = evaluateDeviation({ ...fix, offRouteFixes: count });
    count = verdict.offRouteFixes;
    if (verdict.reroute) rerouted += 1;
  }
  return rerouted;
}

describe('evaluateDeviation', () => {
  it('never recalculates while the rider follows the route', () => {
    expect(run(Array.from({ length: 300 }, () => onRoute))).toBe(0);
  });

  it('recalculates once the rider turns onto another street', () => {
    const turnedOff = { ...onRoute, distanceFromRoute: 45 };
    expect(run([onRoute, turnedOff, turnedOff])).toBe(1);
  });

  it('waits for more than one fix, so a single GPS jump does not count', () => {
    const jump = { ...onRoute, distanceFromRoute: 80 };
    expect(run([onRoute, jump, onRoute, jump, onRoute])).toBe(0);
    expect(OFF_ROUTE_FIXES).toBeGreaterThan(1);
  });

  it('does not recalculate for a rider standing inside a store off the road', () => {
    // 50 m from the road when the route was drawn, still 50 m, drifting a little.
    const inStore = { distanceFromRoute: 52, distanceFromRouteAtFetch: 50, travelledSinceFetch: 6, offRouteFixes: 0 };
    expect(run(Array.from({ length: 120 }, () => inStore))).toBe(0);
  });

  it('does not recalculate while the rider walks out of the store toward the road', () => {
    const walkingOut = [60, 55, 48, 40, 31, 22, 12].map((d, i) => ({
      distanceFromRoute: d,
      distanceFromRouteAtFetch: 60,
      travelledSinceFetch: 10 + i * 8,
      offRouteFixes: 0,
    }));
    expect(run(walkingOut)).toBe(0);
  });

  it('does recalculate a rider who leaves the store the other way', () => {
    const leavingAway = [70, 85, 95].map((d) => ({
      distanceFromRoute: d,
      distanceFromRouteAtFetch: 50,
      travelledSinceFetch: 60,
      offRouteFixes: 0,
    }));
    expect(run(leavingAway)).toBe(1);
  });

  it('does not recalculate on fixes the phone itself says are too rough to show the rider off the road', () => {
    // 36 m off the line, twice, but each fix is only good to 35 m: that is the
    // rider on the right road with a poor fix, not on the next street.
    const rough = { ...onRoute, distanceFromRoute: 36, accuracyMeters: 35 };
    expect(run([onRoute, rough, rough, rough])).toBe(0);
    expect(offRouteMeters(35)).toBe(45);
  });

  it('still recalculates a rough fix that is far enough off to be sure', () => {
    const farOff = { ...onRoute, distanceFromRoute: 60, accuracyMeters: 35 };
    expect(run([onRoute, farOff, farOff])).toBe(1);
  });

  it('keeps 30 m for good fixes and when the phone gives no figure', () => {
    expect(offRouteMeters(5)).toBe(OFF_ROUTE_METERS);
    expect(offRouteMeters(null)).toBe(OFF_ROUTE_METERS);
    expect(offRouteMeters(undefined)).toBe(OFF_ROUTE_METERS);
  });

  it('does nothing without a route line', () => {
    expect(evaluateDeviation({ ...onRoute, distanceFromRoute: null })).toEqual({ offRouteFixes: 0, reroute: false });
  });
});
