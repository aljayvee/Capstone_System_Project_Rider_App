import { describe, expect, it } from "vitest";
import {
  DELIVERY_ARRIVAL_RADIUS_METERS,
  IDLE_WATCH,
  REQUIRED_PRESENCE_MS,
  isDeliveryWaypoint,
  nextOutstandingStop,
  nextWaypoint,
  observeFix,
  radiusOf,
  type ArrivalFix,
} from "../src/services/storeArrival";
import type { ErrandPinpoint } from "../src/types/rider";

/** The two real Tacurong branches, 440 m apart. */
const JOLLIBEE: ErrandPinpoint = {
  id: 101,
  storeName: "Jollibee DT Roundball",
  latitude: 6.689,
  longitude: 124.6788,
  sequence: 0,
  geofenceRadiusMeters: 75,
};

const SAVEMORE: ErrandPinpoint = {
  id: 102,
  storeName: "Primark Save More",
  latitude: 6.6905,
  longitude: 124.6742,
  sequence: 1,
  geofenceRadiusMeters: 150,
};

const at = (stop: ErrandPinpoint, ms: number, accuracyMeters: number | null = 10): ArrivalFix => ({
  latitude: stop.latitude,
  longitude: stop.longitude,
  accuracyMeters,
  at: ms,
});

/** Somewhere far from every stop. */
const away = (ms: number): ArrivalFix => ({
  latitude: 6.66,
  longitude: 124.63,
  accuracyMeters: 10,
  at: ms,
});

describe("which stop the rider can arrive at", () => {
  it("is the first one not yet reached", () => {
    expect(nextOutstandingStop([JOLLIBEE, SAVEMORE])?.id).toBe(101);
  });

  it("moves on once the first is done", () => {
    const done = { ...JOLLIBEE, arrivedAt: "2026-08-25T01:00:00Z", departedAt: "2026-08-25T01:20:00Z" };
    expect(nextOutstandingStop([done, SAVEMORE])?.id).toBe(102);
  });

  it("skips a stop already arrived at but not yet left", () => {
    const here = { ...JOLLIBEE, arrivedAt: "2026-08-25T01:00:00Z" };
    expect(nextOutstandingStop([here, SAVEMORE])?.id).toBe(102);
  });

  it("respects visit order regardless of how the list arrives", () => {
    expect(nextOutstandingStop([SAVEMORE, JOLLIBEE])?.id).toBe(101);
  });

  it("is nothing when every stop is done, or there are none", () => {
    const done = (s: ErrandPinpoint) => ({ ...s, departedAt: "2026-08-25T01:20:00Z" });
    expect(nextOutstandingStop([done(JOLLIBEE), done(SAVEMORE)])).toBeNull();
    expect(nextOutstandingStop([])).toBeNull();
    expect(nextOutstandingStop(undefined)).toBeNull();
  });
});

describe("staying long enough to have arrived", () => {
  it("does not arrive on merely crossing the circle", () => {
    const entering = observeFix(IDLE_WATCH, JOLLIBEE, at(JOLLIBEE, 0));
    expect(entering.arrived).toBe(false);
    expect(entering.watch.insideSince).toBe(0);
  });

  it("does not arrive while still short of the required time", () => {
    let watch = observeFix(IDLE_WATCH, JOLLIBEE, at(JOLLIBEE, 0)).watch;
    const almost = observeFix(watch, JOLLIBEE, at(JOLLIBEE, REQUIRED_PRESENCE_MS - 1));
    expect(almost.arrived).toBe(false);
  });

  it("arrives once the rider has stayed the full time", () => {
    const watch = observeFix(IDLE_WATCH, JOLLIBEE, at(JOLLIBEE, 0)).watch;
    expect(observeFix(watch, JOLLIBEE, at(JOLLIBEE, REQUIRED_PRESENCE_MS)).arrived).toBe(true);
  });

  it("forgets a rider who leaves before the time is up", () => {
    // Riding past the first store on the way to the second.
    let watch = observeFix(IDLE_WATCH, JOLLIBEE, at(JOLLIBEE, 0)).watch;
    watch = observeFix(watch, JOLLIBEE, away(5_000)).watch;
    expect(watch).toEqual(IDLE_WATCH);

    // Coming back later starts the clock again rather than resuming it.
    const back = observeFix(watch, JOLLIBEE, at(JOLLIBEE, 10_000));
    expect(back.arrived).toBe(false);
    expect(back.watch.insideSince).toBe(10_000);
  });

  it("arrives only once, not on every fix afterwards", () => {
    const watch = observeFix(IDLE_WATCH, JOLLIBEE, at(JOLLIBEE, 0)).watch;
    const first = observeFix(watch, JOLLIBEE, at(JOLLIBEE, REQUIRED_PRESENCE_MS));
    expect(first.arrived).toBe(true);

    // The watch is cleared, so the next fix begins a fresh presence rather than
    // firing again — and by then the stop has dropped out of the candidates.
    expect(observeFix(first.watch, JOLLIBEE, at(JOLLIBEE, REQUIRED_PRESENCE_MS + 2_000)).arrived).toBe(false);
  });

  it("restarts the clock when the candidate stop changes", () => {
    const watch = observeFix(IDLE_WATCH, JOLLIBEE, at(JOLLIBEE, 0)).watch;
    const switched = observeFix(watch, SAVEMORE, at(SAVEMORE, 1_000));
    expect(switched.arrived).toBe(false);
    expect(switched.watch).toEqual({ stopId: 102, insideSince: 1_000 });
  });
});

describe("fixes that cannot be trusted", () => {
  it("ignores a fix too vague to place the rider in the circle", () => {
    // A 200 m error cannot prove presence in a 75 m circle.
    const watch = { stopId: 101, insideSince: 0 };
    const vague = observeFix(watch, JOLLIBEE, at(JOLLIBEE, REQUIRED_PRESENCE_MS, 200));
    expect(vague.arrived).toBe(false);
    // And it must not reset a rider who has genuinely been standing there.
    expect(vague.watch).toEqual(watch);
  });

  it("accepts a vaguer fix at a store with a wider circle", () => {
    // The same 100 m error is good enough for the supermarket's 150 m radius.
    const watch = { stopId: 102, insideSince: 0 };
    expect(observeFix(watch, SAVEMORE, at(SAVEMORE, REQUIRED_PRESENCE_MS, 100)).arrived).toBe(true);
  });

  it("accepts a fix from a device that reports no accuracy at all", () => {
    const watch = observeFix(IDLE_WATCH, JOLLIBEE, at(JOLLIBEE, 0, null)).watch;
    expect(observeFix(watch, JOLLIBEE, at(JOLLIBEE, REQUIRED_PRESENCE_MS, null)).arrived).toBe(true);
  });

  it("does nothing without a stop or without a fix", () => {
    expect(observeFix(IDLE_WATCH, null, at(JOLLIBEE, 0))).toEqual({ watch: IDLE_WATCH, arrived: false });
    expect(observeFix(IDLE_WATCH, JOLLIBEE, null)).toEqual({ watch: IDLE_WATCH, arrived: false });
  });
});

describe("each store's own circle", () => {
  it("uses the radius the owner set for that category", () => {
    expect(radiusOf(SAVEMORE)).toBe(150);
    expect(radiusOf(JOLLIBEE)).toBe(75);
  });

  it("falls back for a pin dropped outside the catalogue", () => {
    expect(radiusOf({ geofenceRadiusMeters: null })).toBe(75);
    expect(radiusOf({})).toBe(75);
  });

  it("is why a rider 120 m out has arrived at the supermarket but not the fast food", () => {
    // 120 m north of each pin: inside Save More's 150 m, outside Jollibee's 75 m.
    const north = (s: ErrandPinpoint): ArrivalFix => ({
      latitude: s.latitude + 0.00108,
      longitude: s.longitude,
      accuracyMeters: 10,
      at: 0,
    });

    expect(observeFix(IDLE_WATCH, SAVEMORE, north(SAVEMORE)).watch.insideSince).toBe(0);
    expect(observeFix(IDLE_WATCH, JOLLIBEE, north(JOLLIBEE)).watch).toEqual(IDLE_WATCH);
  });
});

describe("the customer's door as the last waypoint", () => {
  const DESTINATION = { latitude: 6.6926, longitude: 124.6759 };

  it("is not offered while any shop is still outstanding", () => {
    // The rider may live past the store; reaching the door mid-errand must not
    // become an arrival.
    expect(nextWaypoint([JOLLIBEE, SAVEMORE], DESTINATION)?.id).toBe(101);
  });

  it("is what remains once every shop is done", () => {
    const done = (s: ErrandPinpoint) => ({ ...s, departedAt: "2026-08-25T01:20:00Z" });
    const last = nextWaypoint([done(JOLLIBEE), done(SAVEMORE)], DESTINATION);

    expect(last).not.toBeNull();
    expect(isDeliveryWaypoint(last)).toBe(true);
    expect(last!.latitude).toBe(DESTINATION.latitude);
  });

  it("carries a tighter radius than any shop", () => {
    // A house is a house; a supermarket's circle has to cross its car park.
    const last = nextWaypoint([], DESTINATION);
    expect(radiusOf(last!)).toBe(DELIVERY_ARRIVAL_RADIUS_METERS);
    expect(radiusOf(last!)).toBeLessThan(radiusOf(SAVEMORE));
  });

  it("cannot be mistaken for a real stop", () => {
    // The negative id is what stops the watch treating the door as a shop it
    // has already visited.
    expect(nextWaypoint([], DESTINATION)!.id).toBeLessThan(0);
    expect(isDeliveryWaypoint(JOLLIBEE)).toBe(false);
  });

  it("is nothing when the errand has no delivery coordinates", () => {
    expect(nextWaypoint([], null)).toBeNull();
    expect(nextWaypoint([], undefined)).toBeNull();
  });

  it("arrives on the same dwell rule as a shop", () => {
    const door = nextWaypoint([], DESTINATION)!;
    const atDoor = (ms: number) => ({ ...DESTINATION, accuracyMeters: 10, at: ms });

    const watch = observeFix(IDLE_WATCH, door, atDoor(0)).watch;
    expect(observeFix(watch, door, atDoor(REQUIRED_PRESENCE_MS - 1)).arrived).toBe(false);
    expect(observeFix(watch, door, atDoor(REQUIRED_PRESENCE_MS)).arrived).toBe(true);
  });

  it("ignores a fix too vague for a 50 m circle", () => {
    // The tighter radius means a fix good enough for a supermarket is not good
    // enough here.
    const door = nextWaypoint([], DESTINATION)!;
    const vague = { ...DESTINATION, accuracyMeters: 100, at: REQUIRED_PRESENCE_MS };
    expect(observeFix({ stopId: -1, insideSince: 0 }, door, vague).arrived).toBe(false);
  });
});
