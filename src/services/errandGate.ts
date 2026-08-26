import type { Errand, MergedErrand, StatusStep } from '../types/rider';
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
}

export function errandGate(
  errand: MergedErrand | Errand | null | undefined,
  currentStatus: StatusStep,
  completedSubtasks: Record<number, boolean>,
  options: { handoverCaptured?: boolean; paymentMode?: string; collectedAmount?: string } = {}
): ErrandGate {
  // ── at the store: every stop needs a receipt or a declaration ─────────────
  if (currentStatus === 'At Store') {
    const sections = requestSections(errand);
    const done = sections.filter((_, i) => completedSubtasks[i]).length;
    const total = sections.length;
    const remaining = total - done;

    if (remaining > 0) {
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
  if (
    currentStatus === 'Delivering' &&
    options.paymentMode === 'Cash on Delivery' &&
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
