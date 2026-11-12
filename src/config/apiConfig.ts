import { apiClient } from "../services/apiClient";
import { freshFlight, singleFlight } from "../services/requestCache";
import { API_BASE_URL } from "./apiBaseUrl";
import { mapApiErrandToDomain, type ApiErrand } from "../services/errandMapper";
import type { Errand } from "../types/rider";
import type { ApiErrandStatus } from "../services/errandStatus";

export { API_BASE_URL };

// Used only for the auth bootstrap (login/refresh/logout in RiderAuthContext),
// which runs before a session token exists for apiClient's interceptor to
// attach. Every other call goes through the apiClient singleton below, per
// the project's single-axios-instance rule.
export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 20000): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } catch (err: any) {
    if (
      timedOut ||
      err?.name === 'AbortError' ||
      err?.message?.includes('canceled') ||
      err?.message?.includes('cancelled')
    ) {
      const abortErr = new Error(
        timedOut
          ? 'Connection timed out while contacting authentication server.'
          : 'Network request was interrupted or canceled. Please try again.'
      );
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** What the device reports about itself on every beacon. */
export interface RiderBeacon {
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  headingDeg?: number | null;
  recordedAt?: string | null;
  onDuty: boolean;
  /** Permission granted AND the background task confirmed running. */
  backgroundLocation: boolean;
  notifications: boolean;
  exactAlarms: boolean;
  connectivity?: "wifi" | "cellular" | "none" | null;
  /**
   * The cadence this device is beaconing at, in ms.
   *
   * The server sizes its staleness window from this rather than assuming one.
   * Only the device knows whether it is idle or on an errand, and the two
   * cadences differ threefold.
   */
  beaconIntervalMs?: number;
  /** Sent once, on the way down, so the server need not guess at silence. */
  shuttingDown?: boolean;
  /**
   * When this shift started, epoch ms. Lets the server end every shift at
   * 12:00 AM Manila time even if this phone missed the moment.
   */
  dutySince?: number | null;
}

/** The server's reading of that beacon, echoed back so the rider can be told. */
export interface RiderBeaconResult {
  riderId: number;
  state: "AVAILABLE" | "SIGNAL_LOST" | "OFFLINE" | "NEEDS_PERMISSIONS" | "OFF_DUTY" | "LOGGED_OUT";
  dispatchable: boolean;
  impediments: Array<"background_location" | "notifications" | "exact_alarms">;
  beaconAgeMs: number | null;
  presumed: boolean;
  /** The status the dispatcher sees. Absent from servers older than 2026-09-23. */
  riderStatus?: "AVAILABLE_ONLINE" | "AVAILABLE_SIGNAL_LOST" | "OFFLINE";
  riderStatusReason?: string;
  /** Set when the server ended this shift at midnight: stop and go offline. */
  forcedOffline?: "midnight_reset" | null;
}

/** One proof photo as the list endpoint describes it — no bytes. */
export interface ProofImageMeta {
  id: number;
  kind: "RECEIPT" | "NO_RECEIPT" | "TRANSFER" | "PROOF_OF_DELIVERY";
  mimeType: string;
  byteSize: number;
  capturedAt: string;
  pinpointId: number | null;
  verified: boolean;
  declaredTotal?: number | null;
}

// Every call below that can be asked twice at once is deduplicated
// (services/requestCache). Mutations use singleFlight: a double tap sent one
// twice, and identical ones in flight now share one request. The reads a
// socket event or reconnect asks for again use freshFlight: a burst shares
// one follow-up request that starts after any already out, so the answer is
// never older than the event. The key names everything that makes two calls
// different; photo uploads are left out, since two different photos for the
// same slot are not the same request.
export const riderApiService = {
  async fetchRiderProfile(riderId: number): Promise<any> {
    try {
      const res = await freshFlight(`GET /riders/profile/${riderId}`, () =>
        apiClient.get(`/riders/profile/${riderId}`)
      );
      return res.data?.user || res.data?.rider || res.data;
    } catch (err) {
      console.warn("Fetch rider profile error:", err);
      return null;
    }
  },

  async fetchRiderErrands(riderId: number): Promise<Errand[]> {
    try {
      const res = await freshFlight(`GET /errands/rider/${riderId}`, () =>
        apiClient.get(`/errands/rider/${riderId}`)
      );
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
      const res = await singleFlight(`POST /errands/${errandId}/accept|${occurredAt ?? ""}`, () =>
        apiClient.post(`/errands/${errandId}/accept`, occurredAt ? { occurredAt } : {})
      );
      return res.data;
    } catch (err) {
      console.warn("Error accepting errand:", err);
      throw err;
    }
  },

  async declineErrand(errandId: string, reason?: string): Promise<any> {
    try {
      const res = await singleFlight(`POST /errands/${errandId}/decline|${reason ?? ""}`, () =>
        apiClient.post(`/errands/${errandId}/decline`, reason ? { reason } : {})
      );
      return res.data;
    } catch (err) {
      console.warn("Error declining errand:", err);
      throw err;
    }
  },

  async updateErrandStatus(errandId: string, status: ApiErrandStatus, occurredAt?: string): Promise<boolean> {
    try {
      await singleFlight(`PATCH /errands/${errandId}/status|${status}|${occurredAt ?? ""}`, () =>
        apiClient.patch(`/errands/${errandId}/status`, occurredAt ? { status, occurredAt } : { status })
      );
      return true;
    } catch (err) {
      console.warn("Failed to update errand status:", err);
      return false;
    }
  },

  /**
   * Holding every item, ask for the customer's 50% before heading to them.
   *
   * The server's refusal reasons are written for the rider ("File the receipts
   * for what you bought first", "already settled. Head to the customer"), so
   * they are passed back rather than replaced with a generic failure.
   */
  async requestHalfPayment(
    errandId: string
  ): Promise<{ ok: true; dueUpFront: number | null } | { ok: false; message: string | null }> {
    try {
      const res = await singleFlight(`POST /errands/${errandId}/payments/request-half`, () =>
        apiClient.post(`/errands/${errandId}/payments/request-half`)
      );
      return { ok: true, dueUpFront: res.data?.ledger?.dueUpFront ?? null };
    } catch (err: any) {
      console.warn("Failed to request the half-payment:", err);
      const message = err?.response?.data?.error;
      return { ok: false, message: typeof message === "string" ? message : null };
    }
  },

  async markItemsPurchased(errandId: string, receiptTotal?: number, occurredAt?: string): Promise<boolean> {
    try {
      const body: any = {};
      if (receiptTotal !== undefined && receiptTotal > 0) {
        body.receiptTotal = receiptTotal;
      }
      if (occurredAt) body.occurredAt = occurredAt;
      await singleFlight(`PATCH /errands/${errandId}/items-purchased|${JSON.stringify(body)}`, () =>
        apiClient.patch(`/errands/${errandId}/items-purchased`, body)
      );
      return true;
    } catch (err) {
      console.warn("Failed to mark items purchased:", err);
      return false;
    }
  },

  async updateItemFulfillmentStatus(
    errandId: string,
    itemId: number,
    fulfillmentStatus: "PENDING" | "PURCHASED" | "OUT_OF_STOCK"
  ): Promise<boolean> {
    try {
      await singleFlight(`PATCH /errands/${errandId}/items/${itemId}/status|${fulfillmentStatus}`, () =>
        apiClient.patch(`/errands/${errandId}/items/${itemId}/status`, {
          fulfillmentStatus,
        })
      );
      return true;
    } catch (err) {
      console.warn("Failed to update item fulfillment status:", err);
      return false;
    }
  },

  /**
   * The proof photos filed against one errand — receipts, no-receipt shots of the
   * goods, and the handover at the door. Metadata only: the list endpoint omits
   * the blobs on purpose, because a history screen showing ten past errands would
   * otherwise download ten megabytes to draw ten thumbnails.
   */
  async fetchProofImages(errandId: string): Promise<ProofImageMeta[]> {
    try {
      const res = await singleFlight(`GET /errands/${errandId}/proof-images|`, () =>
        apiClient.get(`/errands/${errandId}/proof-images`)
      );
      return Array.isArray(res.data) ? res.data : (res.data?.images ?? []);
    } catch (err) {
      console.warn("Failed to fetch proof images:", err);
      return [];
    }
  },

  /**
   * One image, as a data URI ready to hand straight to <Image source={{ uri }}>.
   *
   * The server stores RAW base64, not a data URI — proofImageService.stripDataUri
   * removes the `data:image/...;base64,` prefix on upload — and returns it that
   * way alongside its mimeType. Passing that raw string to <Image> silently
   * fails: the component mounts and renders an empty grey box rather than
   * erroring, which is exactly what it did here.
   *
   * Rebuilt from mimeType the same way the dispatcher dashboard does it
   * (ExceptionEvidence.tsx). The guard covers any row already carrying a prefix.
   */
  async fetchProofImage(errandId: string, imageId: number): Promise<string | null> {
    try {
      const res = await singleFlight(`GET /errands/${errandId}/proof-images/${imageId}`, () =>
        apiClient.get(`/errands/${errandId}/proof-images/${imageId}`)
      );
      const imageData: string | undefined = res.data?.imageData;
      if (!imageData) return null;
      if (imageData.startsWith("data:")) return imageData;
      const mimeType: string = res.data?.mimeType || "image/jpeg";
      return `data:${mimeType};base64,${imageData}`;
    } catch (err) {
      console.warn("Failed to fetch proof image:", err);
      return null;
    }
  },

  /**
   * The rider's own account details. Throws rather than swallowing, because this
   * is a form submission — a rider who is told nothing went wrong, and whose
   * changes did not save, will not try again.
   */
  async updateProfile(
    userId: string | number,
    input: { firstName?: string; lastName?: string; email?: string; phone?: string }
  ): Promise<any> {
    const res = await apiClient.put(`/users/profile/${userId}`, input);
    return res.data;
  },

  /** Sets or replaces the avatar. Same 5MB jpeg/jpg/png rules the server enforces. */
  async uploadProfilePhoto(
    riderId: string | number,
    photo: { photoData: string; mimeType: string; fileSize: number; fileName?: string }
  ): Promise<any> {
    const res = await apiClient.put(`/riders/${riderId}/photo`, photo);
    return res.data;
  },

  /** The avatar bytes, or null when the rider has not set one. */
  async fetchProfilePhoto(riderId: string | number): Promise<string | null> {
    try {
      const res = await freshFlight(`GET /riders/${riderId}/photo`, () => apiClient.get(`/riders/${riderId}/photo`));
      return res.data?.photoData ?? null;
    } catch (err: any) {
      // 404 is the ordinary "no photo set" answer, not a failure worth logging.
      if (err?.response?.status !== 404) console.warn("Failed to fetch profile photo:", err);
      return null;
    }
  },

  /**
   * The presence beacon: where the rider is and whether an offer could reach them.
   *
   * Deliberately not tied to an errand — that is the entire point. The breadcrumb
   * endpoint refuses any errand that is not ASSIGNED or IN_TRANSIT, so an idle
   * rider had no way to tell the backend anything, and dispatch could not rank a
   * fleet that had not already been dispatched to.
   *
   * Fails soft: a dropped beacon is not worth an error path on the device. The
   * server treats silence as SIGNAL_LOST on its own, which is the correct reading
   * of a beacon that did not arrive.
   */
  async sendBeacon(payload: RiderBeacon): Promise<RiderBeaconResult | null> {
    try {
      const res = await apiClient.post(`/riders/beacon`, payload);
      return res.data ?? null;
    } catch {
      return null;
    }
  },

  async registerPushToken(token: string): Promise<boolean> {
    try {
      await singleFlight(`POST /riders/push-token|${token}`, () => apiClient.post(`/riders/push-token`, { token }));
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

  // Keep transient failures for retry; discard permanently rejected batches.
  //
  // A 4xx other than 429 is not retryable (bad payload, errand no longer
  // trackable); those are dropped so one poisoned batch cannot block the queue
  // forever.
  async markPinpointArrived(errandId: string, pinpointId: number): Promise<void> {
    await apiClient.patch(`/errands/${errandId}/pinpoints/${pinpointId}/arrived`);
  },

  async uploadTrackBatch(errandId: string, points: unknown[]): Promise<boolean> {
    try {
      await apiClient.post(`/errands/${errandId}/track`, { points });
      return true;
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status;
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
    settlement:
      | { collectedInFull: true; proofImageId?: number }
      | { collectedAmount: number; shortReason?: string; proofImageId?: number },
    occurredAt?: string
  ): Promise<boolean> {
    try {
      const body = { ...settlement, ...(occurredAt ? { occurredAt } : {}) };
      await singleFlight(`POST /errands/${errandId}/settle|${JSON.stringify(body)}`, () =>
        apiClient.post(`/errands/${errandId}/settle`, body)
      );
      return true;
    } catch (err) {
      console.warn("Failed to submit settlement:", err);
      return false;
    }
  },

  /** Metadata for every proof image on an errand — a receipt, a handover
   * photo, or a payment confirmation. Optionally scoped to one kind. */
  async listProofImages(errandId: string, kind?: string): Promise<any[]> {
    try {
      const res = await freshFlight(`GET /errands/${errandId}/proof-images|${kind ?? ""}`, () =>
        apiClient.get(`/errands/${errandId}/proof-images`, {
          params: kind ? { kind } : undefined,
        })
      );
      return Array.isArray(res.data) ? res.data : [];
    } catch (err) {
      console.warn("Failed to list proof images:", err);
      return [];
    }
  },

  /** One image's actual bytes, fetched only when a viewer is about to show it. */
  async getProofImage(
    errandId: string,
    imageId: number
  ): Promise<{ id: number; mimeType: string; imageData: string; capturedAt: string } | null> {
    try {
      const res = await singleFlight(`GET /errands/${errandId}/proof-images/${imageId}`, () =>
        apiClient.get(`/errands/${errandId}/proof-images/${imageId}`)
      );
      return res.data;
    } catch (err) {
      console.warn("Failed to fetch proof image:", err);
      return null;
    }
  },
};
