import { useEffect, useMemo, useRef, useState } from 'react';
import type { MapCoordinate } from '../utils/coords';
import type { RouteStep } from '../services/directionsService';
import { metresBetween, projectOntoPath, pathLength, PathProjection } from '../utils/routeGeometry';

export interface NextStepPreview {
  instruction: string;
  modifier?: string;
  maneuverType: string;
}

export interface ManeuverState {
  activeStep: RouteStep | null;
  activeStepIndex: number;
  instruction: string;
  streetName: string;
  maneuverType: string;
  modifier?: string;
  /** Exact live remaining distance to the next maneuver junction in meters. */
  distanceToManeuverMeters: number;
  /** Humanized string: "In 350 m", "In 40 m", "Turn Left Now" (< 15m). */
  formattedDistance: string;
  /** Lookahead preview of the following turn: e.g. "Then turn right" */
  nextStepPreview: NextStepPreview | null;
  /** True when within 30m of the turn. */
  isNearManeuver: boolean;
  /** True when rider is off route by > 35m for 3 consecutive fixes. */
  isOffRoute: boolean;
  /** Total remaining route distance in meters. */
  totalRemainingMeters: number;
  /** Formatted total distance: "1.4 km" / "450 m" */
  formattedTotalDistance: string;
}

/** Threshold to consider a step completed and advance to the next maneuver (in meters). */
const STEP_COMPLETION_THRESHOLD_METERS = 15;
/** Threshold to trigger visual/haptic proximity alert (in meters). */
const NEAR_MANEUVER_THRESHOLD_METERS = 30;
/** Cross-track error threshold to classify as off-route (in meters). */
const OFF_ROUTE_THRESHOLD_METERS = 35;
/** Consecutive GPS fixes required to declare off-route state. */
const OFF_ROUTE_CONSECUTIVE_TICKS = 3;

/**
 * Formats meter distance into Grab/Google Maps-style navigation cues.
 */
export function formatManeuverDistance(meters: number, maneuverType = 'turn'): string {
  if (meters < STEP_COMPLETION_THRESHOLD_METERS) {
    if (maneuverType === 'arrive') return 'Arrive Now';
    return 'Turn Now';
  }
  if (meters < 100) {
    const rounded = Math.max(Math.round(meters / 5) * 5, 15);
    return `In ${rounded} m`;
  }
  if (meters < 1000) {
    const rounded = Math.round(meters / 10) * 10;
    return `In ${rounded} m`;
  }
  return `In ${(meters / 1000).toFixed(1)} km`;
}

/**
 * Formats total remaining route distance.
 */
export function formatTotalRemaining(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

/**
 * Calculates remaining distance along a step polyline from a projected point to the end.
 */
export function remainingStepDistance(
  stepCoords: MapCoordinate[],
  projection: PathProjection
): number {
  if (stepCoords.length < 2) return 0;
  const segIndex = projection.segmentIndex;
  if (segIndex >= stepCoords.length - 1) return 0;

  // Distance from projection point to end of current segment
  let dist = metresBetween(projection.point, stepCoords[segIndex + 1]);

  // Plus remaining segments in the step
  for (let i = segIndex + 1; i < stepCoords.length - 1; i++) {
    dist += metresBetween(stepCoords[i], stepCoords[i + 1]);
  }
  return dist;
}

export function useTurnByTurnNavigation(
  riderLocation: (MapCoordinate & { speed?: number | null; heading?: number | null }) | null,
  steps: RouteStep[],
  routeCoordinates: MapCoordinate[] | null
): ManeuverState {
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const offRouteCountRef = useRef(0);
  const lastDistanceRef = useRef<number | null>(null);

  // Reset active step when route/steps change
  useEffect(() => {
    setActiveStepIndex(0);
    offRouteCountRef.current = 0;
    lastDistanceRef.current = null;
  }, [steps.length]);

  const state = useMemo((): ManeuverState => {
    if (!steps || steps.length === 0) {
      return {
        activeStep: null,
        activeStepIndex: 0,
        instruction: 'Follow route on map',
        streetName: '',
        maneuverType: 'continue',
        distanceToManeuverMeters: 0,
        formattedDistance: '',
        nextStepPreview: null,
        isNearManeuver: false,
        isOffRoute: false,
        totalRemainingMeters: 0,
        formattedTotalDistance: '',
      };
    }

    const safeIndex = Math.min(activeStepIndex, steps.length - 1);
    const currentStep = steps[safeIndex];
    const nextStep = safeIndex + 1 < steps.length ? steps[safeIndex + 1] : null;

    if (!riderLocation) {
      return {
        activeStep: currentStep,
        activeStepIndex: safeIndex,
        instruction: currentStep.instruction,
        streetName: currentStep.streetName,
        maneuverType: currentStep.maneuverType,
        modifier: currentStep.modifier,
        distanceToManeuverMeters: currentStep.distanceMeters,
        formattedDistance: formatManeuverDistance(currentStep.distanceMeters, currentStep.maneuverType),
        nextStepPreview: nextStep
          ? {
              instruction: nextStep.instruction,
              modifier: nextStep.modifier,
              maneuverType: nextStep.maneuverType,
            }
          : null,
        isNearManeuver: false,
        isOffRoute: false,
        totalRemainingMeters: currentStep.distanceMeters,
        formattedTotalDistance: formatTotalRemaining(currentStep.distanceMeters),
      };
    }

    // Measure projection on active step coordinates or full route
    const stepCoords = currentStep.coordinates.length >= 2 ? currentStep.coordinates : [riderLocation, currentStep.location];
    const stepProjection = projectOntoPath(riderLocation, stepCoords);

    let distToManeuver = currentStep.distanceMeters;

    if (stepProjection) {
      distToManeuver = remainingStepDistance(stepCoords, stepProjection);
    } else {
      distToManeuver = metresBetween(riderLocation, currentStep.location);
    }

    // Velocity-based stationary damping: If stationary (< 0.5 m/s), do not allow distance to fluctuate upward
    const isStationary = typeof riderLocation.speed === 'number' && riderLocation.speed >= 0 && riderLocation.speed < 0.5;
    if (isStationary && lastDistanceRef.current != null) {
      if (Math.abs(distToManeuver - lastDistanceRef.current) < 8) {
        distToManeuver = lastDistanceRef.current;
      }
    }
    lastDistanceRef.current = distToManeuver;

    // Check off-route cross-track distance against routeCoordinates
    let isOffRoute = false;
    if (routeCoordinates && routeCoordinates.length >= 2) {
      const fullProjection = projectOntoPath(riderLocation, routeCoordinates);
      if (fullProjection && fullProjection.distanceMeters > OFF_ROUTE_THRESHOLD_METERS) {
        offRouteCountRef.current += 1;
        if (offRouteCountRef.current >= OFF_ROUTE_CONSECUTIVE_TICKS) {
          isOffRoute = true;
        }
      } else {
        offRouteCountRef.current = 0;
      }
    }

    // Step Advancement Check: If within 15m of maneuver and next step exists
    if (distToManeuver <= STEP_COMPLETION_THRESHOLD_METERS && safeIndex < steps.length - 1) {
      setTimeout(() => {
        setActiveStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
      }, 0);
    }

    // Total remaining route distance
    let remainingTotal = distToManeuver;
    for (let i = safeIndex + 1; i < steps.length; i++) {
      remainingTotal += steps[i].distanceMeters;
    }

    const isNear = distToManeuver <= NEAR_MANEUVER_THRESHOLD_METERS;

    return {
      activeStep: currentStep,
      activeStepIndex: safeIndex,
      instruction: currentStep.instruction,
      streetName: currentStep.streetName,
      maneuverType: currentStep.maneuverType,
      modifier: currentStep.modifier,
      distanceToManeuverMeters: Math.max(0, Math.round(distToManeuver)),
      formattedDistance: formatManeuverDistance(distToManeuver, currentStep.maneuverType),
      nextStepPreview:
        nextStep && (isNear || distToManeuver < 50)
          ? {
              instruction: nextStep.instruction,
              modifier: nextStep.modifier,
              maneuverType: nextStep.maneuverType,
            }
          : null,
      isNearManeuver: isNear,
      isOffRoute,
      totalRemainingMeters: Math.max(0, Math.round(remainingTotal)),
      formattedTotalDistance: formatTotalRemaining(remainingTotal),
    };
  }, [riderLocation?.latitude, riderLocation?.longitude, riderLocation?.speed, steps, activeStepIndex, routeCoordinates]);

  return state;
}
