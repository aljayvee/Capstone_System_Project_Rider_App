import { beforeEach, describe, expect, it, vi } from 'vitest';

const { store, updateRiderDutyStatus } = vi.hoisted(() => ({
  store: new Map<string, string>(),
  updateRiderDutyStatus: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (k: string) => store.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => void store.set(k, v)),
    removeItem: vi.fn(async (k: string) => void store.delete(k)),
  },
}));
vi.mock('expo-notifications', () => ({ getPermissionsAsync: vi.fn(async () => ({ granted: true })) }));
vi.mock('../src/config/apiConfig', () => ({ riderApiService: { sendBeacon: vi.fn(async () => null) } }));
vi.mock('../src/firebase/location', () => ({ updateRiderDutyStatus }));

import {
  beaconDue,
  DUTY_SINCE_KEY,
  endShiftAtMidnight,
  getDutySince,
  mostRecentManilaMidnight,
  noteBeaconSent,
  onShiftEnded,
  shiftExpired,
  startShift,
} from '../src/services/riderShift';

// 00:00 Manila on 2026-09-23.
const MIDNIGHT = Date.UTC(2026, 8, 22, 16, 0, 0);

beforeEach(() => {
  store.clear();
  updateRiderDutyStatus.mockClear();
});

describe('the rider shift clock', () => {
  it('matches the server: 12:00 AM Manila time', () => {
    expect(mostRecentManilaMidnight(MIDNIGHT + 3 * 3600_000)).toBe(MIDNIGHT);
    expect(mostRecentManilaMidnight(MIDNIGHT - 60_000)).toBe(MIDNIGHT - 24 * 3600_000);
  });

  it('keeps a shift start across relaunches, but a new sign-on overwrites it', async () => {
    await startShift(true, MIDNIGHT - 3600_000);
    await startShift(false, MIDNIGHT + 3600_000);
    expect(await getDutySince()).toBe(MIDNIGHT - 3600_000);
    await startShift(true, MIDNIGHT + 3600_000);
    expect(await getDutySince()).toBe(MIDNIGHT + 3600_000);
  });

  it('expires a shift that ran past midnight, and only that', async () => {
    await startShift(true, MIDNIGHT - 3600_000);
    expect(await shiftExpired(MIDNIGHT + 60_000)).toBe(true);
    expect(await shiftExpired(MIDNIGHT - 60_000)).toBe(false);
    store.clear();
    expect(await shiftExpired(MIDNIGHT + 60_000)).toBe(false);
  });

  it('ending the shift turns duty off everywhere and tells the screens', async () => {
    store.set('@sugo_rider_user', JSON.stringify({ id: 3, isOnline: true }));
    await startShift(true, MIDNIGHT - 3600_000);
    const heard = vi.fn();
    const off = onShiftEnded(heard);
    const stop = vi.fn(async () => {});

    await endShiftAtMidnight(3, stop);

    expect(store.has(DUTY_SINCE_KEY)).toBe(false);
    expect(JSON.parse(store.get('@sugo_rider_user')!).isOnline).toBe(false);
    expect(updateRiderDutyStatus).toHaveBeenCalledWith(3, false);
    expect(stop).toHaveBeenCalled();
    expect(heard).toHaveBeenCalledTimes(1);
    off();
  });
});

describe('the shared beacon cadence', () => {
  it('lets the background task skip a beacon the foreground just sent', async () => {
    const now = MIDNIGHT + 3600_000;
    await noteBeaconSent(now);
    expect(await beaconDue(false, now + 5_000)).toBe(false);
    expect(await beaconDue(false, now + 10_000)).toBe(true);
    expect(await beaconDue(true, now + 2_000)).toBe(false);
    expect(await beaconDue(true, now + 5_000)).toBe(true);
  });
});
