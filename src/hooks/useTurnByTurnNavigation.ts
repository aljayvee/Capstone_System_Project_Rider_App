import { useEffect, useMemo, useRef, useState } from 'react';
import type { MapCoordinate } from '../utils/coords';
import type { RouteStep } from '../services/directionsService';
import { metresBetween, projectOntoPath, pathLength, PathProjection } from '../utils/routeGeometry';

export interface NextStepPreview {
  instruction: string;
  modifier?: string;
  maneuverType: string;
}

/** The way out of the gate, while it still matters: "Head west on Alunan Avenue". */
export interface SetOffHint {
  bearingAfter?: number;
  streetName: string;
  instruction: string;
}

export interface ManeuverState {
  /** The step whose maneuver the panel is announcing (see displayedStepIndex). */
  activeStep: RouteStep | null;
  /** The step whose road the rider is on now. */
  activeStepIndex: number;
  /** Index of `activeStep`: always the maneuver ahead. */
  displayedStepIndex: number;
  /**
   * The first step's own direction, for the first few metres of the route or
   * while the rider is still off the road (in a store, a yard). Shown under the
   * turn ahead rather than instead of it: "In 55 m, turn right" / "Head west
   * on Alunan Avenue". Null once riding the route.
   */
  setOff?: SetOffHint | null;
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
  /**
   * Time left on the route, in seconds: what is left of the current step at its
   * own pace, plus every step after it. Worked out on the phone from the route
   * already held, because the route is no longer fetched again just to refresh
   * the ETA (see services/reroutePolicy.ts). Null without steps.
   */
  totalRemainingSeconds: number | null;
}

/** Below this the maneuver ahead reads "Turn Now" (in meters). */
const STEP_COMPLETION_THRESHOLD_METERS = 15;
/**
 * Metres left on the step being ridden below which its end, the junction, has
 * been reached. The panel moves on to the following maneuver only then, so it
 * still shows the turn while the rider is making it.
 */
const STEP_PASSED_METERS = 4;
/** How far into the first step its "Head north on X" stays up before the first turn takes over. */
const DEPART_SHOWN_METERS = 20;
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

/**
 * Seconds left: the unfinished share of the current step at that step's own
 * pace, plus the full duration of every later step.
 */
export function remainingRouteSeconds(
  steps: Pick<RouteStep, 'distanceMeters' | 'durationSeconds'>[],
  activeIndex: number,
  metersLeftInStep: number
): number | null {
  if (steps.length === 0) return null;
  const index = Math.max(0, Math.min(activeIndex, steps.length - 1));
  const step = steps[index];
  const share = step.distanceMeters > 0 ? Math.min(1, Math.max(0, metersLeftInStep / step.distanceMeters)) : 0;
  let seconds = step.durationSeconds * share;
  for (let i = index + 1; i < steps.length; i++) seconds += steps[i].durationSeconds;
  return Math.max(0, Math.round(seconds));
}

/**
 * Which step's maneuver to announce while riding step `activeIndex`.
 *
 * Both engines put a step's maneuver at its START: step i is "turn left onto X"
 * followed by the ride along X to where step i + 1 begins (OSRM RouteStep,
 * Google's start_location). So the turn coming up while on step i is step
 * i + 1's. The panel used to announce step i's own maneuver, which the rider
 * had already made, counting down to a junction where something else happened:
 * "In 200 m, turn left" meant the left turn just taken, and the real next turn
 * only surfaced as a "Then:" line at the junction itself.
 *
 * Setting off included: the first step's own "Head west on X" is shown under
 * the turn ahead (ManeuverState.setOff), never instead of it, so the panel
 * reads "In 55 m, turn right" from the moment the route is drawn.
 *
 * Returns steps.length on a last step that is not itself an arrival (Google
 * sends none): what is at the end of it is the destination.
 */
export function displayedStepIndex(steps: Pick<RouteStep, 'maneuverType'>[], activeIndex: number): number {
  if (steps.length === 0) return 0;
  const index = Math.max(0, Math.min(activeIndex, steps.length - 1));
  if (steps[index].maneuverType === 'arrive') return index;
  return index + 1;
}

/**
 * The first step's direction while it still helps: the first DEPART_SHOWN_METERS
 * of the route, or while the rider is off the road altogether (standing in the
 * store, leaving a yard), which is exactly when "which way do I go out" is the
 * question.
 */
export function setOffHint(
  steps: Pick<RouteStep, 'maneuverType' | 'bearingAfter' | 'streetName' | 'instruction'>[],
  activeIndex: number,
  coveredInStepMeters: number,
  offRoadMeters: number
): SetOffHint | null {
  if (activeIndex !== 0 || steps.length === 0 || steps[0].maneuverType !== 'depart') return null;
  if (coveredInStepMeters >= DEPART_SHOWN_METERS && offRoadMeters <= OFF_ROUTE_THRESHOLD_METERS) return null;
  return { bearingAfter: steps[0].bearingAfter, streetName: steps[0].streetName, instruction: steps[0].instruction };
}

/** The step to announce for a displayedStepIndex, standing in an arrival past the last one. */
function announcedStep(steps: RouteStep[], shownIndex: number): RouteStep {
  if (shownIndex < steps.length) return steps[shownIndex];
  const last = steps[steps.length - 1];
  return {
    ...last,
    instruction: 'Arrive at destination',
    streetName: '',
    maneuverType: 'arrive',
    modifier: undefined,
    distanceMeters: 0,
    durationSeconds: 0,
    location: last.coordinates[last.coordinates.length - 1] ?? last.location,
    coordinates: [],
  };
}

/**
 * Whether the rider has reached the end of the step they are on.
 *
 * Only once they are at the junction, never 15 m before it: with the panel
 * announcing the maneuver at the end of the step, moving on early would take
 * "Turn left" off the screen just as the rider starts to turn. A rider who
 * cuts the corner never gets within a few metres of the step's end, so being
 * on the next step's road, a little way along it, counts too: nearer to it
 * than to the road they were on, which a hairpin running back alongside the
 * current road does not satisfy before the turn.
 */
export function hasReachedStepEnd(
  remainingInStepMeters: number,
  offCurrentStepMeters: number,
  nextStep: { distanceMeters: number; alongMeters: number } | null
): boolean {
  if (remainingInStepMeters <= STEP_PASSED_METERS) return true;
  return (
    nextStep != null &&
    remainingInStepMeters <= 30 &&
    nextStep.distanceMeters <= 20 &&
    nextStep.distanceMeters < offCurrentStepMeters &&
    nextStep.alongMeters >= 8
  );
}

export function useTurnByTurnNavigation(
  riderLocation: (MapCoordinate & { speed?: number | null; heading?: number | null }) | null,
  steps: RouteStep[],
  routeCoordinates: MapCoordinate[] | null
): ManeuverState {
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const offRouteCountRef = useRef(0);
  const lastDistanceRef = useRef<number | null>(null);

  // Reset active step when the route changes. Keyed on the steps array itself:
  // keyed on its length, a new route with the same number of steps kept the old
  // step index and called the wrong turn.
  useEffect(() => {
    setActiveStepIndex(0);
    offRouteCountRef.current = 0;
    lastDistanceRef.current = null;
  }, [steps]);

  const state = useMemo((): ManeuverState => {
    if (!steps || steps.length === 0) {
      return {
        activeStep: null,
        activeStepIndex: 0,
        displayedStepIndex: 0,
        instruction: 'Follow route on map',
        streetName: '',
        maneuverType: 'continue',
        distanceToManeuverMeters: 0,
        formattedDistance: '',
        setOff: null,
        nextStepPreview: null,
        isNearManeuver: false,
        isOffRoute: false,
        totalRemainingMeters: 0,
        formattedTotalDistance: '',
        totalRemainingSeconds: null,
      };
    }

    const safeIndex = Math.min(activeStepIndex, steps.length - 1);
    const currentStep = steps[safeIndex];

    if (!riderLocation) {
      // No fix yet: the rider is at the start of the step, which on a first
      // step also means the way out of the gate is worth saying.
      const shownIndex = displayedStepIndex(steps, safeIndex);
      const shown = announcedStep(steps, shownIndex);
      const afterShown = shownIndex + 1 < steps.length ? steps[shownIndex + 1] : null;
      return {
        activeStep: shown,
        activeStepIndex: safeIndex,
        displayedStepIndex: shownIndex,
        setOff: setOffHint(steps, safeIndex, 0, 0),
        instruction: shown.instruction,
        streetName: shown.streetName,
        maneuverType: shown.maneuverType,
        modifier: shown.modifier,
        distanceToManeuverMeters: currentStep.distanceMeters,
        formattedDistance: formatManeuverDistance(currentStep.distanceMeters, shown.maneuverType),
        nextStepPreview:
          afterShown && currentStep.distanceMeters < 50
            ? {
                instruction: afterShown.instruction,
                modifier: afterShown.modifier,
                maneuverType: afterShown.maneuverType,
              }
            : null,
        isNearManeuver: false,
        isOffRoute: false,
        totalRemainingMeters: currentStep.distanceMeters,
        formattedTotalDistance: formatTotalRemaining(currentStep.distanceMeters),
        totalRemainingSeconds: remainingRouteSeconds(steps, safeIndex, currentStep.distanceMeters),
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

    // Moves on once the junction at the end of this step is reached, not
    // before (hasReachedStepEnd).
    if (safeIndex < steps.length - 1) {
      const nextCoords = steps[safeIndex + 1].coordinates;
      const nextProjection = nextCoords.length >= 2 ? projectOntoPath(riderLocation, nextCoords) : null;
      const onNext = nextProjection
        ? {
            distanceMeters: nextProjection.distanceMeters,
            alongMeters: Math.max(0, pathLength(nextCoords) - remainingStepDistance(nextCoords, nextProjection)),
          }
        : null;
      if (hasReachedStepEnd(distToManeuver, stepProjection?.distanceMeters ?? Infinity, onNext)) {
        setTimeout(() => {
          setActiveStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
        }, 0);
      }
    }

    // Total remaining route distance
    let remainingTotal = distToManeuver;
    for (let i = safeIndex + 1; i < steps.length; i++) {
      remainingTotal += steps[i].distanceMeters;
    }

    const isNear = distToManeuver <= NEAR_MANEUVER_THRESHOLD_METERS;

    // The maneuver at the end of this step, which is the next step's
    // (displayedStepIndex), and the one after it for the "Then:" line.
    const coveredInStep = Math.max(0, pathLength(stepCoords) - distToManeuver);
    const shownIndex = displayedStepIndex(steps, safeIndex);
    const shown = announcedStep(steps, shownIndex);
    const afterShown = shownIndex + 1 < steps.length ? steps[shownIndex + 1] : null;
    // A route of one departing step and nothing after it has no turn to name.
    const departing = shown.maneuverType === 'depart';

    return {
      activeStep: shown,
      activeStepIndex: safeIndex,
      displayedStepIndex: shownIndex,
      setOff: setOffHint(steps, safeIndex, coveredInStep, stepProjection?.distanceMeters ?? 0),
      instruction: shown.instruction,
      streetName: shown.streetName,
      maneuverType: shown.maneuverType,
      modifier: shown.modifier,
      distanceToManeuverMeters: Math.max(0, Math.round(distToManeuver)),
      formattedDistance: departing
        ? formatTotalRemaining(distToManeuver)
        : formatManeuverDistance(distToManeuver, shown.maneuverType),
      nextStepPreview:
        afterShown && (isNear || distToManeuver < 50)
          ? {
              instruction: afterShown.instruction,
              modifier: afterShown.modifier,
              maneuverType: afterShown.maneuverType,
            }
          : null,
      isNearManeuver: isNear && !departing,
      isOffRoute,
      totalRemainingMeters: Math.max(0, Math.round(remainingTotal)),
      formattedTotalDistance: formatTotalRemaining(remainingTotal),
      totalRemainingSeconds: remainingRouteSeconds(steps, safeIndex, distToManeuver),
    };
  }, [riderLocation?.latitude, riderLocation?.longitude, riderLocation?.speed, steps, activeStepIndex, routeCoordinates]);

  return state;
}
