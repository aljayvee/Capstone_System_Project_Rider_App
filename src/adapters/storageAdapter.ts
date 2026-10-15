import AsyncStorage from "@react-native-async-storage/async-storage";

// Shared here (rather than inlined as a string literal at each call site) so
// RiderAuthContext.tsx's logout() and useRiderMission.ts's cache read/write
// can't drift apart on the key name.
// Versioned, and the suffix is load-bearing.
//
// This cache stores errands that have ALREADY been through errandMapper, so a
// rider upgrading with a warm cache would replay objects built by the old
// mapper: paymentMode baked to "Cash on Delivery" from the hardcode, and no
// merchantCategories at all. A stale COD is indistinguishable from a real one,
// so the entry is dropped rather than silently trusted. Bump this again whenever
// the mapper's output shape changes.
export const WAYBILL_CACHE_KEY = "@sugo_rider_waybill_cache_v2";

// Adapter over AsyncStorage's raw string API — scoped to the offline waybill
// cache and pending connectivity-incident record (RiderAuthContext.tsx keeps
// its own direct AsyncStorage calls for session persistence; that's
// deliberately left alone here rather than folded into this wrapper, since
// touching working auth/token persistence isn't worth the DRY gain).
export const storageAdapter = {
  async getJSON<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      console.warn(`storageAdapter: failed to read "${key}"`, err);
      return null;
    }
  },

  async setJSON<T>(key: string, value: T): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn(`storageAdapter: failed to write "${key}"`, err);
    }
  },

  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (err) {
      console.warn(`storageAdapter: failed to remove "${key}"`, err);
    }
  },
};
