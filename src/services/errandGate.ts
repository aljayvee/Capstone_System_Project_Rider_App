import type { Errand, MergedErrand, PaymentPlan, StatusStep } from '../types/rider';
import { requestSections } from './requestSections';

/**
 * Whether the rider may move to the next step, and — when they may not — what
 * is actually missing.
 *
 * Extracted from HomeScreen because the map screen now offers the same action,
 * and two screens computing "can the rider move on?" separately is precisely
 * how the last one of these bugs happened: the panel counted stores while the
 * screen counted items, and the button stayed greyed out for good. See the note
 * in requestSections.
 *
 * The second half of this — `blockedReason` — exists because a disabled button
 * is a dead end. It is low-contrast, it does nothing when tapped, and on a
 * touch screen it cannot show a tooltip, so a rider who does not already know
 * what is missing has no way to find out. The gate therefore returns the reason
 * alongside the verdict, and the screens are expected to show it.
 */

export interface ErrandGate {
  /** True when the primary action should do something. */
  canAdvance: boolean;
  /**
   * What is standing in the way, in the rider's words. Null when nothing is.
   * Phrased as the thing to do, not the rule being enforced.
   */
  blockedReason: string | null;
  /** Receipts filed, out of the number of stops needing one. */
  progress: { done: number; total: number } | null;
  /**
   * The customer's 50%, collected mid-way. `ask` when every item is bought and
   * the rider has yet to ask for it; `waiting` once they have. Absent otherwise.
   * The screens swap the primary action for asking, rather than heading out.
   */
  halfPayment?: 'ask' | 'waiting';
}

export function errandGate(
  errand: MergedErrand | Errand | null | undefined,
  currentStatus: StatusStep,
  completedSubtasks: Record<number, boolean>,
  options: {
    handoverCaptured?: boolean;
    /** Null until the customer confirms; isCashCollected treats that as cash. */
    paymentMode?: string | null;
    collectedAmount?: string;
    /** Server-derived. Absent on a COD errand, and on one not yet loaded. */
    paymentPlan?: PaymentPlan | null;
    /** The store pinpoint ID the rider is currently shopping at */
    activeStoreTargetId?: number | null;
    /** Whether there are remaining stores after the current one */
    hasStoresRemaining?: boolean;
  } = {}
): ErrandGate {
  // ── at the store: every stop needs a receipt or a declaration ─────────────
  if (currentStatus === 'At Store') {
    const sections = requestSections(errand);
    const done = sections.filter((_, i) => completedSubtasks[i]).length;
    const total = sections.length;
    const remaining = total - done;

    // Multi-store progressive gating: when activeStoreTargetId is provided,
    // verify the receipt requirement for the CURRENT active store section.
    if (options.activeStoreTargetId != null) {
      const activeSectionIdx = sections.findIndex(
        (s) => s.pinpointId === options.activeStoreTargetId
      );
      if (activeSectionIdx !== -1 && !completedSubtasks[activeSectionIdx]) {
        const activeSection = sections[activeSectionIdx];
        return {
          canAdvance: false,
          blockedReason: activeSection?.title
            ? `Still need a receipt from ${activeSection.title}`
            : 'Still need a receipt for this store',
          progress: { done, total },
        };
      }
    } else if (remaining > 0) {
      const next = sections.find((_, i) => !completedSubtasks[i]);
      return {
        canAdvance: false,
        // Names the shop rather than counting abstractly: on a three-stop
        // errand "1 receipt left" does not tell the rider which shop they are
        // still standing in front of.
        blockedReason: next?.title
          ? `Still need a receipt from ${next.title}`
          : remaining === 1
            ? 'Still need one receipt'
            : `Still need ${remaining} receipts`,
        progress: { done, total },
      };
    }

    // Final store check: if no stores remain (advancing to delivery),
    // ensure ALL store receipts across the errand have been filed.
    if (options.hasStoresRemaining === false && remaining > 0) {
      const next = sections.find((_, i) => !completedSubtasks[i]);
      return {
        canAdvance: false,
        blockedReason: next?.title
          ? `Still need a receipt from ${next.title}`
          : remaining === 1
            ? 'Still need one receipt'
            : `Still need ${remaining} receipts`,
        progress: { done, total },
      };
    }

    // Everything bought, on the 50% plan, and the half not in yet: the rider
    // does not head to the customer. They ask for half of what they actually
    // paid, then wait for the office to say it has landed. The server holds the
    // handover either way (assertGoodsReleasable); this stops the rider driving
    // to a door they could not hand anything over at.
    // Everything bought, on the 50% plan, and the half not in yet: the rider
    // does not head to the customer. They ask for half of what they actually
    // paid, then wait for the office to say it has landed.
    //
    // CRITICAL MULTI-STORE INVARIANT: The half-payment step MUST ONLY trigger
    // at the FINAL store when all store pins have receipts/declarations (remaining === 0)
    // and there are NO stores remaining (options.hasStoresRemaining !== true).
    const isAtFinalStore =
      options.hasStoresRemaining === false ||
      (options.hasStoresRemaining === undefined && (done === total || options.activeStoreTargetId == null));

    const plan = options.paymentPlan;
    if (
      isAtFinalStore &&
      remaining === 0 &&
      plan?.hasLedger &&
      plan.state === 'AWAITING_UPFRONT'
    ) {
      return plan.halfPaymentRequestedAt
        ? {
            canAdvance: false,
            blockedReason: "Waiting for the customer's half-payment",
            progress: { done, total },
            halfPayment: 'waiting',
          }
        : { canAdvance: false, blockedReason: null, progress: { done, total }, halfPayment: 'ask' };
    }

    return { canAdvance: true, blockedReason: null, progress: { done, total } };
  }

  // ── at the door ───────────────────────────────────────────────────────────
  //
  // Only the cash figure blocks, and only because it already did: advanceStatus
  // raised an Alert reading "Please enter the collected amount." This turns that
  // blocking dialog into a reason shown in place, which is the same rule with
  // one fewer tap.
  //
  // The handover photo deliberately does NOT block, even though it is the only
  // evidence that exists if a customer later says nothing arrived. Gating on a
  // camera is how a rider gets stranded at a door by a failed lens or a denied
  // permission — the same shape as the sari-sari receipt bug, where a shop that
  // printed nothing made an errand impossible to finish. It is surfaced as the
  // next thing to do (see nextAction) and left recoverable.
  // ── the office has to clear this one, not the rider ──────────────────────
  //
  // Two holds the rider can do nothing about, so both are phrased as a wait
  // rather than a task. The server enforces them either way
  // (errandPaymentService.assertGoodsReleasable) — this exists so the rider
  // learns why at the door instead of tapping into a 409 in front of a customer.
  if (currentStatus === 'Delivering' && options.paymentPlan?.hasLedger) {
    if (options.paymentPlan.state === 'OVERAGE_PENDING') {
      return {
        canAdvance: false,
        blockedReason: 'Receipt is higher than agreed — the office is sorting it with the customer',
        progress: null,
      };
    }

    if (options.paymentPlan.state === 'AWAITING_UPFRONT') {
      return {
        canAdvance: false,
        blockedReason: "Waiting for the office to confirm the customer's payment",
        progress: null,
      };
    }
  }

  if (
    currentStatus === 'Delivering' &&
    isCashCollected(options.paymentMode) &&
    !options.collectedAmount
  ) {
    return {
      canAdvance: false,
      blockedReason: 'Say what you collected first',
      progress: null,
    };
  }

  return { canAdvance: true, blockedReason: null, progress: null };
}

/**
 * Modes on which the rider carries nothing to the door.
 *
 * Empty, and the server agrees: its riderCollectsCash returns true for every
 * mode this system supports. Named as a list rather than inlined `true` because
 * a real gateway is the plausible future, and this is the single place it would
 * be added.
 */
const NO_CASH_AT_THE_DOOR: readonly string[] = [];

/**
 * Whether the rider takes money at the door on this mode.
 *
 * Every mode this system supports: COD hands over the whole bill, a non-COD
 * errand the balance after the customer paid half through the Facebook Page.
 * Both need the same "say what you collected" step.
 *
 * A deny-list, deliberately. This was an allow-list of two literals, which reads
 * as safe only while the mode is a string the app controls. It is neither: it is
 * a `payment_modes.name` an owner can rename, and it is null until the customer
 * confirms. Under an allow-list either of those hides the cash panel, drops the
 * "say what you collected" block AND skips the settlement submit — the rider
 * takes cash at the door and nothing records it. Defaulting the other way costs
 * one confirmation tap on an errand that needed none.
 */
export function isCashCollected(paymentMode?: string | null): boolean {
  return !NO_CASH_AT_THE_DOOR.includes(paymentMode ?? '');
}

/**
 * The single thing the rider should do next, or null when the primary action is
 * itself the next thing.
 *
 * Exists for pillar "one decision per screen": while Delivering, the rider is
 * currently shown the cash panel, the handover-photo button and the advance
 * button all at once, with nothing saying which comes first.
 */
export function nextAction(
  currentStatus: StatusStep,
  options: { handoverCaptured?: boolean } = {}
): string | null {
  if (currentStatus === 'Delivering' && !options.handoverCaptured) {
    return 'Take the handover photo';
  }
  return null;
}
