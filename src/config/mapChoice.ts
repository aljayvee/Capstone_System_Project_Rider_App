import { useEffect, useState } from 'react';

/**
 * Which base map the Task tab draws, decided once and then kept.
 *
 * Huawei phones without Google Play services answer the Google Maps SDK with
 * Petal Maps. The map used to open as Google (Petal, there) before any route
 * had arrived, then turn its base map off at runtime (mapType 'none') when the
 * server's route came back drawn on OpenStreetMap. Petal ignored that: its
 * roads and labels stayed drawn under our tiles, two maps on top of each other.
 *
 * So the map is no longer switched at all:
 *  - nothing is drawn until the server has said which map its route is drawn
 *    on (`selection.drawnWith`), the map it recommends;
 *  - the native map is then created with that type from the start (see
 *    LiveErrandMap), so only one base map ever exists in it;
 *  - the choice is kept for the life of the app, so later routes, tab
 *    switches and refreshes reuse it instead of drawing the map again.
 *
 * The one exception is a dead tile server under a chosen OpenStreetMap map,
 * which would leave the rider with a blank map mid-errand. That turns the map
 * to Google, once, and never back.
 *
 * The other is a map whose own routing engine has no route at all (Google's
 * key missing, OSRM down). Its line is never borrowed from the other engine,
 * whose roads sit metres beside this map's painted ones, so the map moves
 * instead, once per session, to the one whose engine answered.
 */
export type MapStyle = 'google' | 'osm';

/** The routing engine whose roads a map paints: the only lines drawn on it. */
export function engineForMap(style: MapStyle): 'osrm' | 'google' {
  return style === 'osm' ? 'osrm' : 'google';
}

/**
 * Whether a line may be drawn on this map: Google's map takes Google
 * Directions' lines, OpenStreetMap takes OSRM's. Another engine's road sits
 * metres beside the roads painted under it. A straight-line guess (dashed)
 * follows no roads and stands on either; so does a line before any map.
 */
export function lineFitsMap(
  style: MapStyle | null,
  lineEngine: string | null | undefined,
  isFallback: boolean
): boolean {
  if (style == null || isFallback || lineEngine == null) return true;
  return lineEngine === engineForMap(style);
}

/**
 * How long the map waits for the server's word before falling back to Google.
 * Long enough for a GPS fix and a route on a slow line; short enough that a
 * rider with no signal is not left looking at an empty map.
 */
export const MAP_CHOICE_WAIT_MS = 12_000;

export interface MapChoiceInput {
  /**
   * Whether a map is to be shown at all (an errand with pins). The Task tab is
   * mounted from launch, so without this the wait below would run out with no
   * errand, no route asked for, and choose Google for the whole session.
   */
  wanted: boolean;
  /** Whose roads the server drew the route on ('osrm' | 'google'); null until one arrives. */
  drawnWith: string | null | undefined;
  /** True once the route request failed and no server answer is coming soon. */
  routeFailed: boolean;
  /** Whether our tile server answers; null while the first probe is out. */
  osmTilesUp: boolean | null;
  /** True once MAP_CHOICE_WAIT_MS has passed with no answer. */
  waitedTooLong: boolean;
  /**
   * The engine that could not route on its own roads even when asked for
   * nothing else (useLiveRoute `unroutable`), or null.
   */
  unroutable?: 'osrm' | 'google' | null;
  /** True once the map has already moved because its engine could not route. */
  leftForRouting?: boolean;
}

/** The map to draw now, given the one already chosen (if any). Null means draw none yet. */
export function chooseMapStyle(chosen: MapStyle | null, input: MapChoiceInput): MapStyle | null {
  if (chosen === 'osm' && input.osmTilesUp === false) return 'google';
  // The chosen map's engine has no route of its own. Google's base map needs
  // nothing from our server; OpenStreetMap only if its tiles answer.
  if (chosen && !input.leftForRouting && input.unroutable === engineForMap(chosen)) {
    if (chosen === 'osm') return 'google';
    if (input.osmTilesUp === true) return 'osm';
  }
  if (chosen) return chosen;
  if (!input.wanted) return null;

  if (input.drawnWith === 'osrm') {
    // Recommended, but only drawable if our tiles load. Wait for the probe
    // rather than guess: guessing wrong is exactly the switch this prevents.
    if (input.osmTilesUp === null) return input.waitedTooLong ? 'google' : null;
    return input.osmTilesUp ? 'osm' : 'google';
  }
  if (input.drawnWith === 'google') return 'google';

  // No recommendation is coming (no signal, or the server could not route).
  // Google's base map needs nothing from our server, so it is the safe one.
  if (input.routeFailed || input.waitedTooLong) return 'google';
  return null;
}

// Module scope, not component state: the Task tab can be unmounted (sign-out,
// a navigation reset) and the choice must outlive it.
let chosenForSession: MapStyle | null = null;
// Whether the map has already moved off an engine that could not route. Once
// only: with both engines failing it would otherwise swap maps every retry.
let leftForRoutingThisSession = false;

/**
 * The base map to draw, or null while the server has not recommended one.
 * Once it returns a style it keeps returning it.
 */
export function useMapChoice(input: Omit<MapChoiceInput, 'waitedTooLong' | 'leftForRouting'>): MapStyle | null {
  const [chosen, setChosen] = useState<MapStyle | null>(chosenForSession);
  const [waitedTooLong, setWaitedTooLong] = useState(false);

  // Counted only while a map is wanted, from the moment it is.
  useEffect(() => {
    if (chosen || !input.wanted) return;
    const timer = setTimeout(() => setWaitedTooLong(true), MAP_CHOICE_WAIT_MS);
    return () => clearTimeout(timer);
  }, [chosen, input.wanted]);

  const next = chooseMapStyle(chosen, { ...input, waitedTooLong, leftForRouting: leftForRoutingThisSession });
  const leavingForRouting = chosen != null && next !== chosen && input.unroutable === engineForMap(chosen);

  useEffect(() => {
    if (next && next !== chosen) {
      if (leavingForRouting) leftForRoutingThisSession = true;
      chosenForSession = next;
      setChosen(next);
    }
  }, [next, chosen, leavingForRouting]);

  // Returned straight away rather than after the effect, so the map is
  // created with the right type on the very render the answer arrives.
  return next;
}

/** Tests only: forget the session's choice. */
export function __resetMapChoiceForTests(): void {
  chosenForSession = null;
  leftForRoutingThisSession = false;
}
