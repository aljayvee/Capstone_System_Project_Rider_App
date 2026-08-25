import { useEffect, useRef, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { storageAdapter } from "../adapters/storageAdapter";
import { riderApiService } from "../config/apiConfig";
import { flushLocationQueue } from "../services/locationQueue";
import { flushActionQueue, type StaleActionReport } from "../services/actionQueue";

const PENDING_INCIDENT_KEY = "@sugo_rider_pending_connectivity_incident";

interface PendingIncident {
  errandId?: string;
  disconnectedAt: string;
  incidentId?: number;
}

export interface UseConnectivityReturn {
  isConnected: boolean;
  // Actions that could no longer be applied when the device came back online
  // (the errand was cancelled or advanced by someone else while it was offline).
  // Surfaced rather than swallowed: the rider did the work and needs to be told
  // it did not land.
  staleActions: StaleActionReport[];
  dismissStaleActions: () => void;
}

// Real device-connectivity detection, paired with a durable audit trail of
// outages (ConnectivityIncident rows on the backend). Disconnection is, by
// definition, the one moment an "open incident" API call is least likely to
// land — so the incident is recorded locally the instant it happens and only
// reconciled with the server once the device is verifiably back online
// (queue-then-flush), rather than relying on a write that may never arrive.
export function useConnectivity(riderId?: number, errandId?: string): UseConnectivityReturn {
  const [isConnected, setIsConnected] = useState(true);
  const [staleActions, setStaleActions] = useState<StaleActionReport[]>([]);
  const errandIdRef = useRef(errandId);
  const riderIdRef = useRef(riderId);
  const wasConnectedRef = useRef(true);

  useEffect(() => {
    errandIdRef.current = errandId;
  }, [errandId]);

  useEffect(() => {
    riderIdRef.current = riderId;
  }, [riderId]);

  useEffect(() => {
    // Idempotent no-op when nothing's queued (the common case) — safe to
    // call on every "connected" event, not just the disconnect->connect
    // transition, so a leftover record from a force-killed app still gets
    // flushed the next time the app launches already online.
    const flushPendingIncident = async () => {
      const pending = await storageAdapter.getJSON<PendingIncident>(PENDING_INCIDENT_KEY);
      if (!pending) return;
      const resolvedId = pending.incidentId
        ? pending.incidentId
        : await riderApiService.openConnectivityIncident(pending.errandId, pending.disconnectedAt);
      if (resolvedId) {
        await riderApiService.resolveConnectivityIncident(resolvedId);
      }
      await storageAdapter.remove(PENDING_INCIDENT_KEY);
    };

    // Everything buffered during the outage, flushed in dependency order:
    // lifecycle actions first (they change what the errand IS), then the
    // breadcrumb (which only describes where the rider was).
    const flushOfflineWork = async () => {
      try {
        const { stale } = await flushActionQueue();
        if (stale.length > 0) setStaleActions((prev) => [...prev, ...stale]);
      } catch (err) {
        console.warn("Failed to flush queued actions", err);
      }
      try {
        await flushLocationQueue();
      } catch (err) {
        console.warn("Failed to flush queued locations", err);
      }
    };

    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsConnected(connected);
      if (!riderIdRef.current) return;

      if (connected) {
        wasConnectedRef.current = true;
        void flushPendingIncident();
        void flushOfflineWork();
      } else if (wasConnectedRef.current) {
        wasConnectedRef.current = false;
        const disconnectedAt = new Date().toISOString();
        const pending: PendingIncident = { errandId: errandIdRef.current, disconnectedAt };
        void storageAdapter.setJSON(PENDING_INCIDENT_KEY, pending);
        // Best-effort live open, for partial/flaky loss where this can still
        // land. Silent no-op on a true blackout — the local record above is
        // what guarantees the incident survives to be flushed on reconnect.
        void riderApiService.openConnectivityIncident(errandIdRef.current, disconnectedAt).then((id) => {
          if (id) void storageAdapter.setJSON(PENDING_INCIDENT_KEY, { ...pending, incidentId: id });
        });
      }
    });

    return () => unsubscribe();
  }, []);

  return {
    isConnected,
    staleActions,
    dismissStaleActions: () => setStaleActions([]),
  };
}
