import { describe, expect, it } from 'vitest';
import { arrivalAssist, GPS_LOST_MS, STOPPED_NEAR_METERS } from '../src/services/arrivalAssist';
import { DELIVERY_ARRIVAL_RADIUS_METERS, observeFix, IDLE_WATCH } from '../src/services/storeArrival';

// A store in Tacurong, and points north of it.
const store = { id: 7, storeName: 'Rojon Pharmacy', latitude: 6.6906, longitude: 124.6772, sequence: 0 };
const M = 111_195;
const north = (meters: number) => ({ latitude: store.latitude + meters / M, longitude: store.longitude });
const NOW = 1_800_000_000_000;
const fix = (meters: number, extra: Record<string, unknown> = {}) => ({ ...north(meters), accuracyMeters: 8, updatedAt: NOW - 1000, ...extra });
const assist = (location: ReturnType<typeof fix> | null, extra: Record<string, unknown> = {}) =>
  arrivalAssist({ target: store, location, now: NOW, ...extra });

describe('bringing the task sheet back when the GPS has not placed the rider in the store', () => {
  it('stays away on the open road, where the map is the directions', () => {
    expect(assist(fix(900))).toBeNull();
    expect(assist(fix(160))).toBeNull();
  });

  it('comes back close to the store, outside the circle that would have arrived them', () => {
    // 110 m out: the 75 m circle says nothing, and never will if the pin or the fix is that far off.
    const here = fix(110);
    expect(observeFix(IDLE_WATCH, store, { ...here, at: NOW }).watch.insideSince).toBeNull();
    expect(assist(here)).toBe('close');
    expect(assist(fix(150))).toBe('close');
  });

  it("uses the stop's own radius: a supermarket's reaches further than a stall's", () => {
    expect(arrivalAssist({ target: { ...store, geofenceRadiusMeters: 120 }, location: fix(230), now: NOW })).toBe('close');
    expect(arrivalAssist({ target: { ...store, geofenceRadiusMeters: 40 }, location: fix(110), now: NOW })).toBeNull();
  });

  it('comes back for a rider standing still not far off, as when the pin is held where they parked', () => {
    expect(assist(fix(300, { stationary: true }))).toBe('stopped-nearby');
    // Riding past at the same distance is not arriving.
    expect(assist(fix(300, { stationary: false }))).toBeNull();
    // And a red light across town is not the store.
    expect(assist(fix(STOPPED_NEAR_METERS + 50, { stationary: true }))).toBeNull();
  });

  it('comes back when the fix is too coarse for the circle to ever count it', () => {
    // 90 m accuracy against a 75 m circle: observeFix treats it as no information.
    const coarse = fix(40, { accuracyMeters: 90 });
    const watched = observeFix({ stopId: store.id, insideSince: NOW - 60_000 }, store, { ...coarse, at: NOW });
    expect(watched.arrived).toBe(false);
    expect(assist(coarse)).toBe('gps-imprecise');
    // Coarse, but nowhere near: still riding.
    expect(assist(fix(900, { accuracyMeters: 90 }))).toBeNull();
  });

  it('comes back when there has been no fix for half a minute', () => {
    expect(assist(fix(900, { updatedAt: NOW - GPS_LOST_MS - 1 }))).toBe('gps-lost');
    expect(assist(fix(900, { updatedAt: NOW - GPS_LOST_MS + 5000 }))).toBeNull();
    // A fix with no time on it is not read as an old one.
    expect(assist(fix(900, { updatedAt: 0 }))).toBeNull();
  });

  it('gives a phone still finding its first fix half a minute before saying the GPS is lost', () => {
    expect(assist(null, { legStartedAt: NOW - 5000 })).toBeNull();
    expect(assist(null, { legStartedAt: NOW - GPS_LOST_MS - 1 })).toBe('gps-lost');
    expect(assist(null)).toBeNull();
  });

  it("applies to the customer's door with its tighter circle", () => {
    const door = { latitude: store.latitude, longitude: store.longitude, geofenceRadiusMeters: DELIVERY_ARRIVAL_RADIUS_METERS };
    expect(arrivalAssist({ target: door, location: fix(90), now: NOW })).toBe('close');
    expect(arrivalAssist({ target: door, location: fix(130), now: NOW })).toBeNull();
  });

  it('says nothing without a stop to ride to', () => {
    expect(arrivalAssist({ target: null, location: fix(10), now: NOW })).toBeNull();
  });
});
