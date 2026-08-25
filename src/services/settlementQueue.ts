import { storageAdapter } from "../adapters/storageAdapter";
import { riderApiService } from "../config/apiConfig";

const PENDING_SETTLEMENTS_KEY = "@sugo_rider_pending_settlements";

export type SettlementPayload =
  | { collectedInFull: true }
  | { collectedAmount: number; shortReason?: string };

interface PendingSettlement {
  errandId: string;
  /** Whole, so a flushed settlement still says what it was. */
  settlement: SettlementPayload;
  queuedAt: string;
}

// Array, not a single slot (unlike useConnectivity.ts's pending incident) —
// a rider can complete more than one COD errand during a single offline
// stretch, and each is a distinct cash reconciliation. Overwriting one
// queued settlement with another would silently lose real money data, which
// a single-slot design (safe for connectivity incidents, since a device is
// only ever in one connectivity state at a time) can't guarantee here.
async function queueSettlement(errandId: string, settlement: SettlementPayload): Promise<void> {
  const existing = (await storageAdapter.getJSON<PendingSettlement[]>(PENDING_SETTLEMENTS_KEY)) || [];
  // Replace any already-queued entry for the same errand (a corrected resubmission) rather than stacking duplicates.
  const next = existing.filter((s) => s.errandId !== errandId);
  next.push({ errandId, settlement, queuedAt: new Date().toISOString() });
  await storageAdapter.setJSON(PENDING_SETTLEMENTS_KEY, next);
}

// Tries the live submit first; queues locally only if that fails (offline or
// a transient server error), to be retried by flushPendingSettlements once
// connectivity is back — see useRiderMission.ts's reconnect effect.
export async function submitSettlement(errandId: string, settlement: SettlementPayload): Promise<void> {
  const ok = await riderApiService.submitSettlement(errandId, settlement);
  if (!ok) {
    // Queued whole rather than as a bare number, so a settlement flushed later
    // still says whether it was a full collection or a reported shortfall.
    await queueSettlement(errandId, settlement);
  }
}

export async function flushPendingSettlements(): Promise<void> {
  const pending = await storageAdapter.getJSON<PendingSettlement[]>(PENDING_SETTLEMENTS_KEY);
  if (!pending || pending.length === 0) return;

  const stillPending: PendingSettlement[] = [];
  for (const item of pending) {
    const ok = await riderApiService.submitSettlement(item.errandId, item.settlement);
    if (!ok) stillPending.push(item);
  }

  if (stillPending.length > 0) {
    await storageAdapter.setJSON(PENDING_SETTLEMENTS_KEY, stillPending);
  } else {
    await storageAdapter.remove(PENDING_SETTLEMENTS_KEY);
  }
}
