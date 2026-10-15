import { describe, expect, it } from "vitest";
import {
  DELIVERY_ARRIVAL_RADIUS_METERS,
  IDLE_WATCH,
  REQUIRED_PRESENCE_MS,
  STORE_DELAY_THRESHOLD_MS,
  isDeliveryWaypoint,
  isStoreEligibleForDelay,
  isStoreExemptFromDelay,
  nearestOutstandingStop,
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

describe("nearest-store dynamic routing (Rule 1 & 2)", () => {
  it("picks the nearest store pin based on rider GPS rather than sequence number", () => {
    // Jollibee is seq 0, Savemore is seq 1.
    // Place rider right at Savemore's coordinates:
    const atSavemore = { latitude: SAVEMORE.latitude, longitude: SAVEMORE.longitude };
    const target = nearestOutstandingStop([JOLLIBEE, SAVEMORE], atSavemore);
    expect(target?.id).toBe(SAVEMORE.id);
  });

  it("picks Jollibee when the rider is closer to Jollibee", () => {
    const atJollibee = { latitude: JOLLIBEE.latitude, longitude: JOLLIBEE.longitude };
    const target = nearestOutstandingStop([SAVEMORE, JOLLIBEE], atJollibee);
    expect(target?.id).toBe(JOLLIBEE.id);
  });

  it("falls back to sequence order when no currentLocation is supplied", () => {
    expect(nearestOutstandingStop([SAVEMORE, JOLLIBEE], null)?.id).toBe(JOLLIBEE.id);
    expect(nearestOutstandingStop([SAVEMORE, JOLLIBEE], undefined)?.id).toBe(JOLLIBEE.id);
  });

  it("skips deferred stops when non-deferred candidates exist (Rule 6)", () => {
    // Both stops available; rider at Jollibee. If Jollibee is deferred, pick Savemore.
    const atJollibee = { latitude: JOLLIBEE.latitude, longitude: JOLLIBEE.longitude };
    const target = nearestOutstandingStop([JOLLIBEE, SAVEMORE], atJollibee, new Set([JOLLIBEE.id]));
    expect(target?.id).toBe(SAVEMORE.id);
  });

  it("falls back to deferred stop once all other stops are completed/departed", () => {
    // Savemore completed (or departed). Jollibee was deferred.
    const atSavemore = { latitude: SAVEMORE.latitude, longitude: SAVEMORE.longitude };
    const target = nearestOutstandingStop(
      [JOLLIBEE, SAVEMORE],
      atSavemore,
      new Set([JOLLIBEE.id]),
      new Set([SAVEMORE.id])
    );
    // Even though Jollibee is in deferred set, it's the only remaining outstanding stop
    expect(target?.id).toBe(JOLLIBEE.id);
  });

  it("supports array and Set types for deferredStopIds and completedStopIds", () => {
    const atJollibee = { latitude: JOLLIBEE.latitude, longitude: JOLLIBEE.longitude };
    const target = nearestOutstandingStop(
      [JOLLIBEE, SAVEMORE],
      atJollibee,
      [JOLLIBEE.id],
      []
    );
    expect(target?.id).toBe(SAVEMORE.id);
  });

  it("falls back to deferred stop even if arrivedAt was recorded prior to deferral", () => {
    // Rider arrived at Jollibee, waited >12m, and deferred Jollibee after arrivedAt was stamped.
    const arrivedJollibee = {
      ...JOLLIBEE,
      arrivedAt: "2026-08-25T01:00:00Z",
    };
    const atSavemore = { latitude: SAVEMORE.latitude, longitude: SAVEMORE.longitude };

    // While Savemore is outstanding, Jollibee is deferred -> Savemore chosen
    const target1 = nearestOutstandingStop(
      [arrivedJollibee, SAVEMORE],
      atSavemore,
      new Set([JOLLIBEE.id]),
      new Set()
    );
    expect(target1?.id).toBe(SAVEMORE.id);

    // Once Savemore is departed, Jollibee MUST be chosen even though arrivedAt is set
    const target2 = nearestOutstandingStop(
      [arrivedJollibee, SAVEMORE],
      atSavemore,
      new Set([JOLLIBEE.id]),
      new Set([SAVEMORE.id])
    );
    expect(target2?.id).toBe(JOLLIBEE.id);
  });

  it("routes through 3+ stops where store A is deferred, store B completed, store C completed, then falls back to store A", () => {
    const STORE_C: ErrandPinpoint = {
      id: 103,
      storeName: "Mercury Drug",
      latitude: 6.691,
      longitude: 124.676,
      sequence: 2,
    };
    const arrivedJollibee = {
      ...JOLLIBEE,
      arrivedAt: "2026-08-25T01:00:00Z",
    };

    const locationNearSavemore = { latitude: SAVEMORE.latitude, longitude: SAVEMORE.longitude };
    const deferred = new Set([JOLLIBEE.id]);
    const completed = new Set<number>();

    // Step 1: Jollibee is deferred. Savemore and Mercury are candidates. Nearest is Savemore.
    const next1 = nearestOutstandingStop([arrivedJollibee, SAVEMORE, STORE_C], locationNearSavemore, deferred, completed);
    expect(next1?.id).toBe(SAVEMORE.id);

    // Step 2: Savemore completed. Next nearest non-deferred is Mercury.
    completed.add(SAVEMORE.id);
    const next2 = nearestOutstandingStop([arrivedJollibee, SAVEMORE, STORE_C], locationNearSavemore, deferred, completed);
    expect(next2?.id).toBe(STORE_C.id);

    // Step 3: Mercury completed. All non-deferred completed. System must route back to Jollibee!
    completed.add(STORE_C.id);
    const next3 = nearestOutstandingStop([arrivedJollibee, SAVEMORE, STORE_C], locationNearSavemore, deferred, completed);
    expect(next3?.id).toBe(JOLLIBEE.id);
  });

  it("supports includeArrived option so active store is maintained while shopping inside it", () => {
    const arrivedJollibee = {
      ...JOLLIBEE,
      arrivedAt: "2026-08-25T01:00:00Z",
    };
    const atJollibee = { latitude: JOLLIBEE.latitude, longitude: JOLLIBEE.longitude };

    // With includeArrived: false (default waypoint navigation), arrived store is skipped
    expect(nearestOutstandingStop([arrivedJollibee, SAVEMORE], atJollibee)?.id).toBe(SAVEMORE.id);

    // With includeArrived: true (TaskScreen active store evaluation), current arrived store is maintained
    expect(
      nearestOutstandingStop([arrivedJollibee, SAVEMORE], atJollibee, undefined, undefined, {
        includeArrived: true,
      })?.id
    ).toBe(JOLLIBEE.id);
  });
});

describe("establishment dwell delay rules (Rule 6)", () => {
  it("defines the delay threshold as exactly 12 minutes (720,000 ms)", () => {
    expect(STORE_DELAY_THRESHOLD_MS).toBe(12 * 60 * 1000);
    expect(STORE_DELAY_THRESHOLD_MS).toBe(720_000);
  });

  it("exempts Supermarkets and Groceries from delay alert", () => {
    expect(isStoreExemptFromDelay("Supermarket")).toBe(true);
    expect(isStoreExemptFromDelay("supermarket")).toBe(true);
    expect(isStoreExemptFromDelay("Grocery")).toBe(true);
    expect(isStoreExemptFromDelay("Local Grocery Store")).toBe(true);
    expect(isStoreEligibleForDelay("Supermarket")).toBe(false);
    expect(isStoreEligibleForDelay("Grocery")).toBe(false);
  });

  it("flags Pharmacies, Cafes, Restaurants and other stores as eligible for delay", () => {
    expect(isStoreExemptFromDelay("Pharmacy")).toBe(false);
    expect(isStoreExemptFromDelay("Cafe")).toBe(false);
    expect(isStoreExemptFromDelay("Restaurant")).toBe(false);
    expect(isStoreExemptFromDelay("Fast Food")).toBe(false);
    expect(isStoreExemptFromDelay(null)).toBe(false);
    expect(isStoreExemptFromDelay(undefined)).toBe(false);

    expect(isStoreEligibleForDelay("Pharmacy")).toBe(true);
    expect(isStoreEligibleForDelay("Cafe")).toBe(true);
    expect(isStoreEligibleForDelay("Restaurant")).toBe(true);
  });
});

