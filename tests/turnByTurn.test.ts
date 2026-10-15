import { describe, expect, it } from 'vitest';
import {
  displayedStepIndex,
  formatManeuverDistance,
  formatTotalRemaining,
  hasReachedStepEnd,
  remainingStepDistance,
  remainingRouteSeconds,
  setOffHint,
} from '../src/hooks/useTurnByTurnNavigation';
import type { MapCoordinate } from '../src/utils/coords';
import type { PathProjection } from '../src/utils/routeGeometry';

describe('TurnByTurnNavigation Engine', () => {
  describe('formatManeuverDistance', () => {
    it('returns "Turn Now" when under 15 meters for normal turns', () => {
      expect(formatManeuverDistance(14, 'turn')).toBe('Turn Now');
      expect(formatManeuverDistance(0, 'turn')).toBe('Turn Now');
    });

    it('returns "Arrive Now" when under 15 meters for arrival steps', () => {
      expect(formatManeuverDistance(10, 'arrive')).toBe('Arrive Now');
    });

    it('rounds to nearest 5m when under 100 meters', () => {
      expect(formatManeuverDistance(23, 'turn')).toBe('In 25 m');
      expect(formatManeuverDistance(48, 'turn')).toBe('In 50 m');
      expect(formatManeuverDistance(92, 'turn')).toBe('In 90 m');
    });

    it('rounds to nearest 10m when between 100m and 999m', () => {
      expect(formatManeuverDistance(153, 'turn')).toBe('In 150 m');
      expect(formatManeuverDistance(388, 'turn')).toBe('In 390 m');
      expect(formatManeuverDistance(950, 'turn')).toBe('In 950 m');
    });

    it('formats in kilometers when 1000 meters or more', () => {
      expect(formatManeuverDistance(1200, 'turn')).toBe('In 1.2 km');
      expect(formatManeuverDistance(2450, 'turn')).toBe('In 2.5 km');
    });
  });

  describe('formatTotalRemaining', () => {
    it('formats meters and kilometers cleanly', () => {
      expect(formatTotalRemaining(350)).toBe('350 m');
      expect(formatTotalRemaining(1400)).toBe('1.4 km');
    });
  });

  describe('remainingStepDistance', () => {
    it('computes distance along multi-segment step accurately', () => {
      const stepCoords: MapCoordinate[] = [
        { latitude: 6.6900, longitude: 124.6000 },
        { latitude: 6.6910, longitude: 124.6000 }, // ~111m north
        { latitude: 6.6920, longitude: 124.6000 }, // ~111m north
      ];

      const projection: PathProjection = {
        point: { latitude: 6.6905, longitude: 124.6000 },
        segmentIndex: 0,
        t: 0.5,
        distanceMeters: 0,
      };

      const remaining = remainingStepDistance(stepCoords, projection);
      // Distance from 6.6905 to 6.6920 is ~166m
      expect(remaining).toBeGreaterThan(150);
      expect(remaining).toBeLessThan(180);
    });

    it('returns 0 when projection is at the end of the step', () => {
      const stepCoords: MapCoordinate[] = [
        { latitude: 6.6900, longitude: 124.6000 },
        { latitude: 6.6910, longitude: 124.6000 },
      ];

      const projection: PathProjection = {
        point: { latitude: 6.6910, longitude: 124.6000 },
        segmentIndex: 1,
        t: 1,
        distanceMeters: 0,
      };

      expect(remainingStepDistance(stepCoords, projection)).toBe(0);
    });
  });

  describe("remainingRouteSeconds", () => {
    const steps = [
      { distanceMeters: 1000, durationSeconds: 120 },
      { distanceMeters: 500, durationSeconds: 60 },
      { distanceMeters: 200, durationSeconds: 40 },
    ];

    it("counts the unfinished share of the current step plus every later one", () => {
      // Halfway along the first step: 60 + 60 + 40.
      expect(remainingRouteSeconds(steps, 0, 500)).toBe(160);
    });

    it("counts down as the rider moves, with no new route needed", () => {
      expect(remainingRouteSeconds(steps, 1, 100)).toBe(52);
      expect(remainingRouteSeconds(steps, 2, 0)).toBe(0);
    });

    it("has nothing to say without steps", () => {
      expect(remainingRouteSeconds([], 0, 100)).toBeNull();
    });
  });

  describe('displayedStepIndex', () => {
    // As OSRM sends them: each step's maneuver is at its START.
    const steps = [
      { maneuverType: 'depart' },
      { maneuverType: 'turn' }, // turn left, then ride this street
      { maneuverType: 'turn' }, // turn right, then ride this street
      { maneuverType: 'arrive' },
    ];

    it('announces the turn at the END of the step being ridden, not the one already made', () => {
      // From the very start: "In 55 m, turn right", not "Head west".
      expect(displayedStepIndex(steps, 0)).toBe(1);
      expect(displayedStepIndex(steps, 1)).toBe(2);
      expect(displayedStepIndex(steps, 2)).toBe(3);
    });

    it('stays on the arrival once it is reached', () => {
      expect(displayedStepIndex(steps, 3)).toBe(3);
    });

    it('points past the end of a route with no arrival step, which is the destination', () => {
      const google = [{ maneuverType: 'depart' }, { maneuverType: 'turn' }];
      expect(displayedStepIndex(google, 1)).toBe(2);
    });
  });

  describe('setOffHint', () => {
    const steps = [
      { maneuverType: 'depart', bearingAfter: 270, streetName: 'Alunan Avenue', instruction: 'Head out on Alunan Avenue' },
      { maneuverType: 'turn', streetName: 'Rizal Street', instruction: 'Turn right onto Rizal Street' },
    ];

    it('gives the way out for the first few metres, under the turn ahead', () => {
      expect(setOffHint(steps, 0, 5, 3)).toMatchObject({ bearingAfter: 270, streetName: 'Alunan Avenue' });
    });

    it('keeps giving it while the rider is still off the road, in a store or a yard', () => {
      expect(setOffHint(steps, 0, 40, 60)).not.toBeNull();
    });

    it('drops it once they are riding the route', () => {
      expect(setOffHint(steps, 0, 40, 3)).toBeNull();
      expect(setOffHint(steps, 1, 0, 3)).toBeNull();
    });
  });

  describe('hasReachedStepEnd', () => {
    it('moves on at the junction, not 15 m before it', () => {
      // At 15 m the old rule moved on, taking "Turn left" off the screen just
      // as the rider started to turn.
      expect(hasReachedStepEnd(15, 2, null)).toBe(false);
      expect(hasReachedStepEnd(10, 2, null)).toBe(false);
      expect(hasReachedStepEnd(3, 2, null)).toBe(true);
    });

    it('counts a cut corner once the rider is on the next road', () => {
      // 12 m short of the step's end, but 10 m along the next street and on it.
      expect(hasReachedStepEnd(12, 14, { distanceMeters: 3, alongMeters: 10 })).toBe(true);
    });

    it('does not count a hairpin road running back beside the current one', () => {
      // Near the next step's line, and "along" it, but still on the current road.
      expect(hasReachedStepEnd(20, 2, { distanceMeters: 9, alongMeters: 15 })).toBe(false);
    });
  });
});
