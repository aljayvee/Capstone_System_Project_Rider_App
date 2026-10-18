import type { Errand, StatusStep } from '../types/rider';
import type { RequestSection } from './requestSections';

/**
 * Rebuilding an errand's visible progress from what the server already knows.
 *
 * The rider app tracks four UI steps (Traveling / At Store / Delivering /
 * Delivered) while the backend's ErrandStatus enum only has IN_TRANSIT for the
 * first three — so the fine-grained step, the ticked shopping sections, the
 * handover photo and the collected amount all lived ONLY in React state, in a
 * map keyed by errand id. Nothing persisted them and nothing rebuilt them, so
 * signing out (or clearing storage, or the OS reclaiming a backgrounded app)
 * dropped every slot and each errand came back reading "Traveling" with an
 * empty checklist — a rider standing at the customer's door being told to start
 * riding to the shop.
 *
 * None of that needed a new column. Every one of those facts was already
 * persisted, just never read back:
 *
 *   - `errand.itemsPurchasedAt`  stamped by markItemsPurchased when the rider
 *                                confirms they have everything. This is the
 *                                Traveling/At Store -> Delivering boundary, and
 *                                it is the very same flag the customer's own
 *                                tracking screen gates on.
 *   - `pinpoint.arrivedAt`       stamped server-side from the rider's own
 *                                breadcrumb geofence crossings.
 *   - proof images               one row per receipt, per handover photo, per
 *                                cash/GCash capture, each carrying the stop it
 *                                was filed against and what it was read for.
 *
 * Kept as a pure function, away from the hook, because the interesting part is
 * the rule and the rule should be testable without a device or a fetch.
 */

/**
 * Per-errand shopping/delivery progress. Used to be five flat `useState`s
 * shared by every entry in `activeMissions` at once — see useRiderMission for
 * why it became a map keyed by errand id.
 */
export interface ErrandProgress {
  currentStatus: StatusStep;
  completedSubtasks: Record<number, boolean>;
  handoverCaptured: boolean;
  collectedAmount: string;
  shortPayment: boolean;
  showComplete: boolean;
  /**
   * The photo (GCash/Maya receipt, or cash in hand) backing the collected
   * amount above — attached to the eventual settlement so it is on record which
   * evidence justified it. Null until a capture completes.
   */
  proofImageId: number | null;
  /**
   * Which of the two that photo is. A GCash/Maya errand can still end in cash
   * ("They're paying cash instead"), so the errand's payment plan cannot say
   * which one happened. Null until a capture completes.
   */
  paymentProofKind?: PaymentProofKind | null;
  /** Optional note from the rider explaining the cash collection or receiptless purchase. */
  riderNote?: string;
  /** Delayed store IDs that were deferred to visit later stops first */
  deferredStoreIds?: number[];
  /** Store pinpoint IDs that have finished shopping and departed */
  departedStoreIds?: number[];
  /** Timestamp in epoch ms when rider entered 'At Store' */
  storeArrivalTimestamp?: number | null;
}

export const DEFAULT_PROGRESS: ErrandProgress = {
  currentStatus: 'Traveling',
  completedSubtasks: {},
  handoverCaptured: false,
  collectedAmount: '',
  shortPayment: false,
  showComplete: false,
  proofImageId: null,
  paymentProofKind: null,
  riderNote: '',
  deferredStoreIds: [],
  departedStoreIds: [],
  storeArrivalTimestamp: null,
};

/**
 * One row of GET /errands/:id/proof-images, as the list projection sends it.
 * The image bytes are deliberately absent — restoring a tick mark needs to know
 * a photo EXISTS, not what it looks like.
 */
export interface ProofImageSummary {
  id: number;
  kind: string;
  pinpointId: number | null;
  declaredTotal: number | null;
  capturedAt: string;
  /**
   * Non-null once a later upload replaced this one. Superseded rows are kept as
   * fraud-dispute evidence, so every read here has to filter them out.
   */
  supersededAt: string | null;
  extraction?: { confirmedTotal: number | null; extractedTotal: number | null } | null;
}

/** Evidence filed against a shopping stop, which is what ticks a section off. */
const SHOPPING_KINDS = ['RECEIPT', 'NO_RECEIPT'];
/** Evidence of money changing hands at the door. */
const PAYMENT_KINDS = ['RIDER_BALANCE_PROOF', 'CASH_COLLECTED'];
export type PaymentProofKind = 'RIDER_BALANCE_PROOF' | 'CASH_COLLECTED';

const isLive = (proof: ProofImageSummary) => !proof.supersededAt;

/**
 * What the rider collects at the door.
 *
 * The downpayment balance wins over the grand total wherever there is one — the
 * customer already paid the rest electronically. Mirrors CashCollectionInput's
 * own `due`, which works from loose props rather than from a whole errand.
 */
export function dueAtDoorFor(errand: Errand | null | undefined): number {
  if (!errand) return 0;
  if (errand.paymentPlan?.hasLedger) return errand.paymentPlan.balanceDue;
  return errand.feeBreakdown?.grandTotal ?? errand.amount ?? 0;
}

/**
 * Which store pinpoints already have shopping evidence (RECEIPT or NO_RECEIPT) filed.
 */
export function deriveDepartedStoreIds(
  sections: RequestSection[],
  proofs: ProofImageSummary[]
): number[] {
  const shopping = proofs.filter((proof) => isLive(proof) && SHOPPING_KINDS.includes(proof.kind));
  const departed = new Set<number>();
  for (const proof of shopping) {
    if (proof.pinpointId != null) {
      departed.add(proof.pinpointId);
    }
  }
  return Array.from(departed);
}

/**
 * Which step this errand is really on, from persisted signals alone.
 *
 * Deliberately never returns a step LATER than the evidence supports. Being one
 * step behind costs the rider a tap; being one step ahead skips a photograph
 * that a settlement dispute later needs.
 */
function deriveStatus(
  errand: Errand,
  proofs: ProofImageSummary[],
  sections: RequestSection[] = []
): StatusStep {
  if (errand.status === 'Delivered') return 'Delivered';

  // The rider has confirmed they have the goods. Same flag the customer's
  // stepper reads, so the two apps cannot disagree about this moment.
  if (errand.itemsPurchasedAt) return 'Delivering';

  // If all shopping sections have filed evidence, all stores are complete.
  if (sections.length > 0) {
    const completed = deriveCompletedSubtasks(sections, proofs);
    const allCompleted = sections.every((_, idx) => completed[idx]);
    if (allCompleted) return 'Delivering';
  }

  const shopped = proofs.some((proof) => isLive(proof) && SHOPPING_KINDS.includes(proof.kind));
  const pinpoints = errand.pinpoints ?? [];

  if (pinpoints.length > 0) {
    const uncompletedStops = pinpoints.filter((stop) => {
      return !proofs.some((p) => isLive(p) && SHOPPING_KINDS.includes(p.kind) && p.pinpointId === stop.id);
    });
    const arrivedAtUncompleted = uncompletedStops.some((stop) => Boolean(stop.arrivedAt));

    if (arrivedAtUncompleted) return 'At Store';
    if (shopped && uncompletedStops.length > 0) return 'Traveling';

    const arrived = pinpoints.some((stop) => Boolean(stop.arrivedAt));
    if (arrived) return 'At Store';
  } else {
    const arrived = Boolean((errand as any).arrivedAt);
    if (shopped || arrived) return 'At Store';
  }

  return 'Traveling';
}

/**
 * Which shopping sections already have evidence against them.
 *
 * Sections are matched by the stop they were pinned to, which is exactly what
 * the capture screen files the photo under. A section carrying no stop can only
 * be matched when it is the ONLY one — otherwise two unpinned sections are
 * indistinguishable, and the honest answer is to let the rider re-photograph
 * rather than to tick the wrong line.
 */
function deriveCompletedSubtasks(
  sections: RequestSection[],
  proofs: ProofImageSummary[]
): Record<number, boolean> {
  const shopping = proofs.filter((proof) => isLive(proof) && SHOPPING_KINDS.includes(proof.kind));
  if (shopping.length === 0) return {};

  const unpinnedSections = sections.filter((section) => section.pinpointId == null).length;
  const hasUnpinnedProof = shopping.some((proof) => proof.pinpointId == null);

  const completed: Record<number, boolean> = {};
  sections.forEach((section, index) => {
    if (section.pinpointId != null) {
      if (shopping.some((proof) => proof.pinpointId === section.pinpointId)) {
        completed[index] = true;
      }
    } else if (unpinnedSections === 1 && hasUnpinnedProof) {
      completed[index] = true;
    }
  });
  return completed;
}

/** The figure a capture recorded, whichever field its kind stores it in. */
function amountOf(proof: ProofImageSummary): number | null {
  const value =
    proof.declaredTotal ?? proof.extraction?.confirmedTotal ?? proof.extraction?.extractedTotal;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * What was collected at the door, from the most recent live payment capture.
 *
 * A rider can legitimately produce both kinds on one errand — the customer's
 * GCash receipt fails to read, so they pay cash instead — so the latest capture
 * wins rather than whichever one is found first.
 */
function derivePayment(
  proofs: ProofImageSummary[],
  dueAtDoor: number
): Pick<ErrandProgress, 'collectedAmount' | 'shortPayment' | 'proofImageId' | 'paymentProofKind'> {
  const latest = proofs
    .filter((proof) => isLive(proof) && PAYMENT_KINDS.includes(proof.kind))
    .sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime())[0];

  if (!latest) return { collectedAmount: '', shortPayment: false, proofImageId: null, paymentProofKind: null };

  // A GCash/Maya receipt was validated against the exact balance due before the
  // server would store it at all, so there is no short reading of one.
  if (latest.kind === 'RIDER_BALANCE_PROOF') {
    return {
      collectedAmount: 'FULL',
      shortPayment: false,
      proofImageId: latest.id,
      paymentProofKind: 'RIDER_BALANCE_PROOF',
    };
  }

  const collected = amountOf(latest);
  if (collected == null) {
    // The photo is on record but its figure is not. Restoring the link without
    // inventing an amount keeps the evidence attached and leaves the rider to
    // re-enter what they were handed.
    return { collectedAmount: '', shortPayment: false, proofImageId: latest.id, paymentProofKind: 'CASH_COLLECTED' };
  }

  const isFull = Math.abs(collected - dueAtDoor) < 0.01;
  return {
    collectedAmount: isFull ? 'FULL' : String(collected),
    shortPayment: !isFull,
    proofImageId: latest.id,
    paymentProofKind: 'CASH_COLLECTED',
  };
}

/**
 * The whole progress slot for one errand, rebuilt from server truth.
 *
 * `completedSubtasks` is restored only while the errand is still on a shopping
 * step, because advancing past one clears the map by design — the checklist is
 * re-used step to step, so restoring ticks onto a later step would show the
 * rider a delivery checklist already half-crossed-off.
 */
export function deriveErrandProgress(args: {
  errand: Errand;
  proofs: ProofImageSummary[];
  sections: RequestSection[];
}): ErrandProgress {
  const { errand, proofs, sections } = args;
  const currentStatus = deriveStatus(errand, proofs, sections);
  const shopping = currentStatus === 'Traveling' || currentStatus === 'At Store';
  const departedStoreIds = deriveDepartedStoreIds(sections, proofs);

  return {
    currentStatus,
    completedSubtasks: shopping ? deriveCompletedSubtasks(sections, proofs) : {},
    handoverCaptured: proofs.some((proof) => isLive(proof) && proof.kind === 'PROOF_OF_DELIVERY'),
    ...derivePayment(proofs, dueAtDoorFor(errand)),
    departedStoreIds,
    // Never restored: it is the one-shot "delivered!" panel, not a state the
    // errand is in. Re-showing it on relaunch would congratulate the rider for
    // work they finished yesterday.
    showComplete: false,
  };
}
