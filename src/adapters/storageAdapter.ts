import AsyncStorage from "@react-native-async-storage/async-storage";

// Shared here (rather than inlined as a string literal at each call site) so
// RiderAuthContext.tsx's logout() and useRiderMission.ts's cache read/write
// can't drift apart on the key name.
export const WAYBILL_CACHE_KEY = "@sugo_rider_waybill_cache";

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
