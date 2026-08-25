import { apiClient } from "../services/apiClient";
import { API_BASE_URL } from "./apiBaseUrl";
import { mapApiErrandToDomain, type ApiErrand } from "../services/errandMapper";
import type { Errand } from "../types/rider";
import type { ApiErrandStatus } from "../services/errandStatus";

export { API_BASE_URL };

// Used only for the auth bootstrap (login/refresh/logout in RiderAuthContext),
// which runs before a session token exists for apiClient's interceptor to
// attach. Every other call goes through the apiClient singleton below, per
// the project's single-axios-instance rule.
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

export const riderApiService = {
  async fetchRiderProfile(riderId: number): Promise<any> {
    try {
      const res = await apiClient.get(`/riders/profile/${riderId}`);
      return res.data?.user || res.data?.rider || res.data;
    } catch (err) {
      console.warn("Fetch rider profile error:", err);
      return null;
    }
  },

  async fetchRiderErrands(riderId: number): Promise<Errand[]> {
    try {
      const res = await apiClient.get(`/errands/rider/${riderId}`);
      const data: ApiErrand[] = Array.isArray(res.data) ? res.data : [];
      return data.map(mapApiErrandToDomain);
    } catch (err) {
      console.warn("Error fetching rider errands:", err);
      return [];
    }
  },

  // occurredAt is sent when replaying an action the rider took while offline,
  // so the record reflects when it actually happened rather than when the
  // signal came back.
  async acceptErrand(errandId: string, occurredAt?: string): Promise<any> {
    try {
      const res = await apiClient.post(`/errands/${errandId}/accept`, occurredAt ? { occurredAt } : {});
      return res.data;
    } catch (err) {
      console.warn("Error accepting errand:", err);
      throw err;
    }
  },

  async declineErrand(errandId: string, reason?: string): Promise<any> {
    try {
      const res = await apiClient.post(`/errands/${errandId}/decline`, reason ? { reason } : {});
      return res.data;
    } catch (err) {
      console.warn("Error declining errand:", err);
      throw err;
    }
  },

  async updateErrandStatus(errandId: string, status: ApiErrandStatus, occurredAt?: string): Promise<boolean> {
    try {
      await apiClient.patch(`/errands/${errandId}/status`, occurredAt ? { status, occurredAt } : { status });
      return true;
    } catch (err) {
      console.warn("Failed to update errand status:", err);
      return false;
    }
  },

  async markItemsPurchased(errandId: string, receiptTotal?: number, occurredAt?: string): Promise<boolean> {
    try {
      const body: any = {};
      if (receiptTotal !== undefined && receiptTotal > 0) {
        body.receiptTotal = receiptTotal;
      }
      if (occurredAt) body.occurredAt = occurredAt;
      await apiClient.patch(`/errands/${errandId}/items-purchased`, body);
      return true;
    } catch (err) {
      console.warn("Failed to mark items purchased:", err);
      return false;
    }
  },

  async registerPushToken(token: string): Promise<boolean> {
    try {
      await apiClient.post(`/riders/push-token`, { token });
      return true;
    } catch (err) {
      console.warn("Failed to register push token:", err);
      return false;
    }
  },

  async openConnectivityIncident(errandId?: string, disconnectedAt?: string): Promise<number | null> {
    try {
      const res = await apiClient.post(`/connectivity-incidents`, { errandId, disconnectedAt });
      return res.data?.id ?? null;
    } catch (err) {
      console.warn("Failed to open connectivity incident:", err);
      return null;
    }
  },

  async resolveConnectivityIncident(incidentId: number): Promise<boolean> {
    try {
      await apiClient.patch(`/connectivity-incidents/${incidentId}/resolve`);
      return true;
    } catch (err) {
      console.warn("Failed to resolve connectivity incident:", err);
      return false;
    }
  },

  // Uploads a batch of buffered GPS breadcrumb points. Returns false on ANY
  // failure so the queue keeps them and retries — losing the trail silently is
  // exactly the failure this whole mechanism exists to prevent.
  //
  // A 4xx other than 429 is not retryable (bad payload, errand no longer
  // trackable); those are dropped so one poisoned batch cannot block the queue
  // forever.
  async uploadTrackBatch(errandId: string, points: unknown[]): Promise<boolean> {
    try {
      await apiClient.post(`/errands/${errandId}/track`, { points });
      return true;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status && status >= 400 && status < 500 && status !== 429) {
        console.warn(`Track batch rejected (${status}) — dropping to unblock the queue.`);
        return true;
      }
      console.warn("Failed to upload track batch:", err?.message ?? err);
      return false;
    }
  },

  /**
   * Records the cash that came back.
   *
   * On the ordinary path this sends `collectedInFull` and NO AMOUNT — the
   * server fills in the errand's own total. That is deliberate: the app used to
   * post whatever figure the rider typed, so under-reporting was a matter of
   * typing a smaller number, and a client that cannot name an amount cannot
   * shrink one.
   *
   * `shortAmount` is only sent when the rider explicitly reports a shortfall,
   * which lands as a flagged SHORT settlement for dispatch to resolve.
   */
  async submitSettlement(
    errandId: string,
    settlement: { collectedInFull: true } | { collectedAmount: number; shortReason?: string },
    occurredAt?: string
  ): Promise<boolean> {
    try {
      await apiClient.post(`/errands/${errandId}/settle`, { ...settlement, ...(occurredAt ? { occurredAt } : {}) });
      return true;
    } catch (err) {
      console.warn("Failed to submit settlement:", err);
      return false;
    }
  },
};
