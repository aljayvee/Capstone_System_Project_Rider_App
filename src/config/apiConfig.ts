import { Platform } from "react-native";
import Constants from "expo-constants";

declare const process: { env: { [key: string]: string | undefined } };

const getDynamicHostIp = (): string | null => {
  try {
    const hostUri = Constants.expoConfig?.hostUri || (Constants as any).manifest?.debuggerHost || (Constants as any).manifest2?.extra?.expoGo?.developer?.tool;
    if (hostUri) {
      const ip = hostUri.split(":")[0];
      if (ip && ip !== "localhost" && ip !== "127.0.0.1") {
        return `http://${ip}:5000/api`;
      }
    }
  } catch (e) {
    // Ignore error
  }
  return null;
};

const rawUrl =
  (typeof process !== "undefined" && process.env && process.env.EXPO_PUBLIC_API_BASE_URL) ||
  getDynamicHostIp() ||
  (Platform.OS === "android" ? "http://10.0.2.2:5000/api" : "http://localhost:5000/api");

export const API_BASE_URL = rawUrl.replace(/\/+$/, "");

export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}


export interface Errand {
  id: string;
  category: string;
  description: string;
  pickupAddress: string;
  deliveryAddress: string;
  estimatedCost: number;
  deliveryFee: number;
  tip: number;
  totalCost: number;
  status: "PENDING" | "ASSIGNED" | "TRAVELING" | "AT_STORE" | "PURCHASED" | "EN_ROUTE" | "DELIVERED" | "COMPLETED" | "CANCELLED";
  customerId: number;
  riderId?: number;
  customerName?: string;
  customerPhone?: string;
}

export const riderApiService = {
  async fetchRiderProfile(riderId: number, token?: string): Promise<any> {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetchWithTimeout(`${API_BASE_URL}/riders/profile/${riderId}`, {
        method: "GET",
        headers,
      }, 5000);
      if (!res.ok) return null;
      const data = await res.json();
      return data.user || data.rider || data;
    } catch (err) {
      console.warn("Fetch rider profile error:", err);
      return null;
    }
  },

  async getAssignedErrands(riderId: number, token?: string): Promise<Errand[]> {
    try {
      const active = await this.fetchActiveErrand(riderId, token);
      return active ? [active] : [];
    } catch (err) {
      return [];
    }
  },

  async fetchActiveErrand(riderId: number, token?: string): Promise<Errand | null> {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetchWithTimeout(`${API_BASE_URL}/orders/pabili/rider/${riderId}/active`, {
        method: "GET",
        headers,
      }, 5000);
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error("Failed to fetch active errand");
      }
      const data = await res.json();
      return data.order || null;
    } catch (err) {
      console.warn("Error fetching active errand from errand_system_db:", err);
      return null;
    }
  },

  async fetchStorePinpoints(orderId: string, token?: string): Promise<{latitude: number, longitude: number, storeName: string}[]> {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetchWithTimeout(`${API_BASE_URL}/orders/pabili/${orderId}/pinpoints`, {
        method: "GET",
        headers,
      }, 5000);
      if (!res.ok) throw new Error("Failed to fetch store pinpoints");
      const data = await res.json();
      return data.pinpoints || [];
    } catch (err) {
      console.warn("Error fetching store pinpoints:", err);
      return [];
    }
  },

  async updateErrandStatus(orderId: string, status: string, amountPaid?: number, token?: string): Promise<boolean> {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const body: any = { status };
      if (amountPaid !== undefined) {
        body.amountPaid = amountPaid;
      }
      const res = await fetchWithTimeout(`${API_BASE_URL}/orders/pabili/${orderId}/status`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
      }, 5000);
      return res.ok;
    } catch (err) {
      console.warn("Failed to update status on server", err);
      return false;
    }
  },
};
