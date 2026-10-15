import { describe, expect, it } from "vitest";
import {
  classifyRouteFailure,
  nextRetryDelayMs,
  mapDirectionsToRoute,
  ROUTE_MIN_FETCH_INTERVAL_MS,
  ROUTE_REFRESH_INTERVAL_MS,
} from "../src/services/routeRetry";
import type { DirectionsResult } from "../src/services/directionsService";

const coord = (latitude: number, longitude: number) => ({ latitude, longitude });

function directions(overrides: Partial<DirectionsResult> = {}): DirectionsResult {
  return {
    coordinates: [coord(6.68, 124.66), coord(6.69, 124.67), coord(6.7, 124.68)],
    pickupLegCoordinates: null,
    deliveryLegCoordinates: null,
    steps: [],
    legs: [],
    distanceMeters: 2716,
    durationSeconds: 376,
    provider: "google",
    degraded: false,
    ...overrides,
  };
}

describe("classifying a routing failure", () => {
  it("reads 401 and 403 as an expired session", () => {
    expect(classifyRouteFailure(401)).toBe("unauthorized");
    expect(classifyRouteFailure(403)).toBe("unauthorized");
  });

  it("reads 429 as the server's rate limiter", () => {
    expect(classifyRouteFailure(429)).toBe("rate-limited");
  });

  it.each([500, 502, 503])("reads %i as the server", (status) => {
    expect(classifyRouteFailure(status)).toBe("server");
  });

  it.each([400, 404, 422])("reads %i as a bad request", (status) => {
    expect(classifyRouteFailure(status)).toBe("bad-request");
  });

  it("reads a missing status as a network failure, not a server one", () => {
    // The request never reached the server: a timeout, or no signal. Worth
    // trying again shortly, unlike a 500.
    expect(classifyRouteFailure(null)).toBe("network");
    expect(classifyRouteFailure(undefined)).toBe("network");
  });
});

describe("backing off after a failure", () => {
  it("starts at five seconds, so a blip does not cost a stale route", () => {
    expect(nextRetryDelayMs("network", 1)).toBe(5_000);
  });

  it("doubles while the failure persists", () => {
    expect(nextRetryDelayMs("network", 2)).toBe(10_000);
    expect(nextRetryDelayMs("network", 3)).toBe(20_000);
    expect(nextRetryDelayMs("network", 4)).toBe(40_000);
  });

  it("caps at a minute", () => {
    expect(nextRetryDelayMs("network", 5)).toBe(60_000);
    expect(nextRetryDelayMs("network", 99)).toBe(60_000);
  });

  it("waits out the whole window on a rate limit", () => {
    // The server's limiter counts over a minute. Retrying inside that window
    // just spends another request on the same 429, which is how a rate limit
    // sustains itself.
    expect(nextRetryDelayMs("rate-limited", 1)).toBeGreaterThanOrEqual(60_000);
    expect(nextRetryDelayMs("rate-limited", 9)).toBeGreaterThanOrEqual(60_000);
  });

  it("schedules nothing at all on an expired session", () => {
    // The client already spent its refresh token and lost. Asking again cannot
    // produce a valid one; it only burns battery and rate budget.
    expect(nextRetryDelayMs("unauthorized", 1)).toBeNull();
    expect(nextRetryDelayMs("unauthorized", 12)).toBeNull();
  });
});

describe("the request budget", () => {
  it("cannot trip the server's own rate limiter", () => {
    // The routing endpoint allows 30 requests a minute per IP. This is the
    // assertion that would have caught the real bug: the hook keyed its effect
    // on the rider's position at ~11m and fetched immediately, so a moving
    // rider could produce about thirty requests a minute all by themselves.
    const worstCasePerMinute = Math.ceil(60_000 / ROUTE_MIN_FETCH_INTERVAL_MS) + 1;
    expect(worstCasePerMinute).toBeLessThan(30);
  });

  it("leaves the ordinary refresh cadence alone", () => {
    expect(ROUTE_REFRESH_INTERVAL_MS).toBe(30_000);
  });
});

describe("turning a directions response into what the map draws", () => {
  it("treats a road route as a real one", () => {
    const mapped = mapDirectionsToRoute(directions({ degraded: false }), { legsKnown: false });
    expect(mapped.isFallback).toBe(false);
    expect(mapped.degraded).toBe(false);
  });

  it("treats a degraded route as a fallback, so the map dashes it", () => {
    // The assertion that encodes this bug. The server answers from the
    // haversine provider when every real one fails, returning the very points
    // it was sent — a straight line — and saying so. That flag was stored and
    // then ignored, so the guess was drawn solid and casing-backed.
    const mapped = mapDirectionsToRoute(directions({ degraded: true }), { legsKnown: false });
    expect(mapped.isFallback).toBe(true);
  });

  it("trusts a response from a server too old to send the flag", () => {
    const mapped = mapDirectionsToRoute(directions({ degraded: undefined }), { legsKnown: false });
    expect(mapped.isFallback).toBe(false);
  });

  it("carries no turn instructions on a degraded route", () => {
    // A straight line has no turns. Handing the haversine provider's
    // "proceed towards"/"arrive at" steps to the turn-by-turn HUD puts a metre
    // countdown over a line the rider cannot follow.
    const withSteps = directions({
      degraded: true,
      steps: [{ instruction: "Proceed towards" }] as any,
      legs: [{ distanceMeters: 10 }] as any,
    });
    const mapped = mapDirectionsToRoute(withSteps, { legsKnown: false });
    expect(mapped.steps).toEqual([]);
    expect(mapped.legs).toEqual([]);
  });

  it("keeps every step it was given on a road route", () => {
    const withSteps = directions({
      degraded: false,
      steps: [{ instruction: "Turn left" }, { instruction: "Turn right" }] as any,
    });
    const mapped = mapDirectionsToRoute(withSteps, { legsKnown: false });
    expect(mapped.steps).toHaveLength(2);
  });

  it("still reports distance and duration on a degraded route", () => {
    // Estimated rather than measured, but the rider is better served by a rough
    // figure than by a blank.
    const mapped = mapDirectionsToRoute(directions({ degraded: true }), { legsKnown: false });
    expect(mapped.distanceMeters).toBe(2716);
    expect(mapped.durationSeconds).toBe(376);
  });

  it("only splits the legs when the stops are actually known", () => {
    const withLegs = directions({
      pickupLegCoordinates: [coord(1, 1), coord(2, 2)],
      deliveryLegCoordinates: [coord(2, 2), coord(3, 3)],
    });

    const known = mapDirectionsToRoute(withLegs, { legsKnown: true });
    expect(known.pickupLegCoordinates).toHaveLength(2);

    const unknown = mapDirectionsToRoute(withLegs, { legsKnown: false });
    expect(unknown.pickupLegCoordinates).toBeNull();
    expect(unknown.deliveryLegCoordinates).toEqual(withLegs.coordinates);
  });
});

describe("the line the rider's map draws", () => {
  it("is the road exactly, from the legs, not the corner-rounded display copy", () => {
    // The display copy cuts the corner at (6.69, 124.67); the road does not.
    const rounded = [coord(6.68, 124.66), coord(6.6899, 124.6699), coord(6.7, 124.68)];
    const mapped = mapDirectionsToRoute(
      directions({
        coordinates: rounded,
        legs: [
          { coordinates: [coord(6.68, 124.66), coord(6.69, 124.67)] },
          { coordinates: [coord(6.69, 124.67), coord(6.7, 124.68)] },
        ] as any,
      }),
      { legsKnown: false }
    );
    expect(mapped.roadCoordinates).toEqual([coord(6.68, 124.66), coord(6.69, 124.67), coord(6.7, 124.68)]);
    expect(mapped.coordinates).toEqual(rounded);
  });

  it("carries the server's verdict on which engine's route won", () => {
    const selection = { strategy: "fastest" as const, chosen: "osrm", drawnWith: "google", candidates: [] };
    expect(mapDirectionsToRoute(directions({ selection }), { legsKnown: false }).selection).toEqual(selection);
    expect(mapDirectionsToRoute(directions(), { legsKnown: false }).selection).toBeNull();
  });

  it("falls back to the display copy when no legs came", () => {
    const mapped = mapDirectionsToRoute(directions(), { legsKnown: false });
    expect(mapped.roadCoordinates).toEqual(directions().coordinates);
  });

  it("is the straight line itself on a degraded route", () => {
    const mapped = mapDirectionsToRoute(
      directions({ degraded: true, legs: [{ coordinates: [coord(1, 1), coord(2, 2)] }] as any }),
      { legsKnown: false }
    );
    expect(mapped.roadCoordinates).toEqual(directions().coordinates);
  });
});
