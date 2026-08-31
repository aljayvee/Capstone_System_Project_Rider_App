import { describe, expect, it } from 'vitest';
import {
  formatManeuverDistance,
  formatTotalRemaining,
  remainingStepDistance,
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
});
