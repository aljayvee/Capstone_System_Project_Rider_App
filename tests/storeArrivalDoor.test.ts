import { describe, expect, it } from 'vitest';
import { IDLE_WATCH, nextWaypoint, observeFix } from '../src/services/storeArrival';

/**
 * The door is watched by the same presence rule as a store, and it does report
 * "arrived" after 20 s inside. What changed (useStoreArrival) is that the hook
 * no longer acts on it at the door. This pins the part of the rule the hook
 * relies on: a watch kept "inside" keeps reporting arrival on every later fix,
 * so the hook can hold it without restarting the 20 s.
 */
describe("the door's presence watch", () => {
  const door = nextWaypoint([], { latitude: 6.4117201, longitude: 124.7690754 })!;
  const here = (second: number) => ({ latitude: 6.4117201 + 5 / 111_195, longitude: 124.7690754, accuracyMeters: 9, at: second * 1000 });

  it('arrives after 20 s, and a watch held at that point keeps arriving', () => {
    let watch = IDLE_WATCH;
    let first: number | null = null;
    for (let second = 0; second <= 40; second++) {
      const result = observeFix(watch, door, here(second));
      if (result.arrived && first === null) first = second;
      // What the hook now does at the door: keep the watch, never reset it.
      watch = result.arrived ? watch : result.watch;
      if (first !== null) expect(result.arrived).toBe(true);
    }
    expect(first).toBe(20);
    expect(watch.insideSince).toBe(0);
  });
});
