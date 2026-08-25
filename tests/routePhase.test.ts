import { describe, expect, it } from "vitest";
import { routePhaseFor } from "../src/services/routePhase";
import { bearingBetween } from "../src/utils/geo";

describe("which line the map draws", () => {
  it("draws the shopping run while the rider is still travelling to a store", () => {
    expect(routePhaseFor("Traveling")).toBe("shopping");
  });

  it("still draws the shopping run while the rider is inside a store", () => {
    // Standing at Jollibee is not the same as being done with it — there may be
    // another stop after this one.
    expect(routePhaseFor("At Store")).toBe("shopping");
  });

  it("switches to the delivery run the moment the items are bought", () => {
    // The same instant the customer app's itemsPurchasedAt is written, so both
    // maps change colour together. This was two steps — "Purchased" then
    // "In Route" — collapsed into one because nothing happened between them.
    expect(routePhaseFor("Delivering")).toBe("delivering");
  });

  it("stays on the delivery run for the rest of the errand", () => {
    expect(routePhaseFor("Delivered")).toBe("delivering");
  });

  it("falls back to the shopping run when the status is missing or unknown", () => {
    // Showing the line to the next store a moment too long is a smaller lie
    // than promising a delivery run that has not started.
    expect(routePhaseFor(null)).toBe("shopping");
    expect(routePhaseFor(undefined)).toBe("shopping");
    expect(routePhaseFor("Nonsense" as never)).toBe("shopping");
  });
});

describe("bearingBetween", () => {
  const TACURONG = { latitude: 6.6926, longitude: 124.6759 };

  it("reads the four compass points", () => {
    expect(bearingBetween(TACURONG, { ...TACURONG, latitude: TACURONG.latitude + 0.01 })).toBeCloseTo(0, 1);
    expect(bearingBetween(TACURONG, { ...TACURONG, longitude: TACURONG.longitude + 0.01 })).toBeCloseTo(90, 1);
    expect(bearingBetween(TACURONG, { ...TACURONG, latitude: TACURONG.latitude - 0.01 })).toBeCloseTo(180, 1);
    expect(bearingBetween(TACURONG, { ...TACURONG, longitude: TACURONG.longitude - 0.01 })).toBeCloseTo(270, 1);
  });

  it("always returns a compass bearing, never a negative angle", () => {
    // A negative value fed to a camera heading rotates the map the wrong way.
    const northWest = bearingBetween(TACURONG, {
      latitude: TACURONG.latitude + 0.01,
      longitude: TACURONG.longitude - 0.01,
    });
    expect(northWest).toBeGreaterThan(270);
    expect(northWest).toBeLessThan(360);
  });

  it("gives the same answer as the customer app for the same move", () => {
    // The two apps must agree about which way "forward" is, or the rider and
    // the customer see the same journey pointing different ways.
    expect(bearingBetween(TACURONG, { latitude: 6.7, longitude: 124.68 })).toBeCloseTo(29.3, 0);
  });
});
