import type { ErrandProgress } from './missionProgress';

/**
 * Undoing a proof photo the screen already showed as saved.
 *
 * Receipt saves and handover photos are optimistic: the step ticks the moment
 * the rider confirms, and the upload finishes behind it (see
 * ReceiptCaptureScreen). If the server then refuses it, or it never arrives,
 * the tick has to come back off, or the errand would read as having evidence
 * the server does not hold.
 */

/**
 * The section's receipt is no longer on record: the section is open again and
 * the rider is put back at that store to photograph it.
 *
 * A delivered errand keeps its step. "Delivered" has already been told to the
 * server, and dragging the rider back from it would only strand them; the
 * section reopening is still visible to dispatch on the record.
 */
export function undoSectionReceipt(
  slot: ErrandProgress,
  index: number,
  pinpointId: number | null,
  now: number = Date.now()
): Partial<ErrandProgress> {
  const completedSubtasks = { ...slot.completedSubtasks };
  delete completedSubtasks[index];
  const departedStoreIds = (slot.departedStoreIds ?? []).filter((id) => id !== pinpointId);

  if (slot.currentStatus === 'Delivered') return { completedSubtasks, departedStoreIds };
  return {
    completedSubtasks,
    departedStoreIds,
    currentStatus: 'At Store',
    storeArrivalTimestamp: now,
  };
}

/** The handover photo is no longer on record: "Delivered" waits for a new one. */
export function undoHandover(slot: ErrandProgress): Partial<ErrandProgress> {
  if (slot.currentStatus === 'Delivered') return {};
  return { handoverCaptured: false };
}

/** What the rider is told, in a sentence or two, when a saved photo is undone. */
export function proofRollbackMessage(what: 'receipt' | 'handover', storeName: string | null, error: unknown): string {
  const reason =
    error instanceof Error && error.message ? error.message.replace(/\s*$/, '') : 'The connection dropped.';
  const said = /[.!?]$/.test(reason) ? reason : `${reason}.`;
  // The upload's own copy (uploadFailure.ts) often already says what to do.
  const instruction = /again/i.test(said) ? '' : what === 'handover' ? ' Take it again.' : ' Photograph it again.';
  return what === 'handover'
    ? `The handover photo did not upload. ${said}${instruction}`
    : `The receipt${storeName ? ` for ${storeName}` : ''} did not save. ${said}${instruction}`;
}
