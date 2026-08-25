import { storageAdapter } from '../adapters/storageAdapter';
import { riderApiService } from '../config/apiConfig';
import type { ApiErrandStatus } from './errandStatus';

const ACTION_QUEUE_KEY = '@sugo_rider_action_queue';

/**
 * A lifecycle action the rider performed, recorded with the moment they
 * performed it rather than the moment it reached the server.
 *
 * GPS points are recoverable if a few go missing; these are not. "I picked the
 * items up", "I delivered this" are the events the customer, the fee, and the
 * settlement all hang off, and a rider inside a concrete supermarket with no
 * signal must still be able to record them.
 */
export type QueuedAction =
  | { kind: 'accept'; errandId: string; occurredAt: string }
  | { kind: 'items_purchased'; errandId: string; occurredAt: string; receiptTotal?: number }
  | { kind: 'status'; errandId: string; occurredAt: string; status: ApiErrandStatus };

export interface StaleActionReport {
  action: QueuedAction;
  reason: string;
}

async function readQueue(): Promise<QueuedAction[]> {
  return (await storageAdapter.getJSON<QueuedAction[]>(ACTION_QUEUE_KEY)) || [];
}

/**
 * Queues an action. An array rather than a single slot, for the same reason
 * settlementQueue.ts uses one: a rider can complete several steps — even several
 * errands — during one offline stretch, and collapsing them would silently lose
 * real events.
 */
export async function enqueueAction(action: QueuedAction): Promise<void> {
  const queue = await readQueue();
  queue.push(action);
  await storageAdapter.setJSON(ACTION_QUEUE_KEY, queue);
}

async function submit(action: QueuedAction): Promise<{ ok: boolean; stale?: string }> {
  try {
    switch (action.kind) {
      case 'accept':
        await riderApiService.acceptErrand(action.errandId, action.occurredAt);
        return { ok: true };
      case 'items_purchased': {
        const ok = await riderApiService.markItemsPurchased(
          action.errandId,
          action.receiptTotal,
          action.occurredAt
        );
        return { ok };
      }
      case 'status': {
        const ok = await riderApiService.updateErrandStatus(
          action.errandId,
          action.status,
          action.occurredAt
        );
        return { ok };
      }
    }
  } catch (err: any) {
    const status = err?.response?.status;
    // 409 means the world moved on while the rider was offline — a dispatcher
    // cancelled the errand, or someone else advanced it. That is not a transient
    // failure to retry; it needs a person to see it, which is what the returned
    // report is for.
    if (status === 409 || status === 403 || status === 404) {
      return {
        ok: false,
        stale: err?.response?.data?.message || `This action is no longer valid (${status}).`,
      };
    }
    return { ok: false };
  }
}

/**
 * Replays queued actions in the order they were performed.
 *
 * Order matters: "accept" must land before "delivered". A transient failure
 * stops the flush so the sequence is never applied out of order; a stale action
 * is dropped and reported so one dead entry cannot block everything behind it
 * forever.
 */
export async function flushActionQueue(): Promise<{ sent: number; stale: StaleActionReport[] }> {
  const queue = await readQueue();
  if (queue.length === 0) return { sent: 0, stale: [] };

  queue.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  const stale: StaleActionReport[] = [];
  let index = 0;

  while (index < queue.length) {
    const result = await submit(queue[index]);
    if (result.ok) {
      index += 1;
      continue;
    }
    if (result.stale) {
      stale.push({ action: queue[index], reason: result.stale });
      index += 1;
      continue;
    }
    break; // transient — stop and keep the rest for the next flush
  }

  const remaining = queue.slice(index);
  if (remaining.length > 0) {
    await storageAdapter.setJSON(ACTION_QUEUE_KEY, remaining);
  } else {
    await storageAdapter.remove(ACTION_QUEUE_KEY);
  }

  return { sent: index - stale.length, stale };
}

export async function clearActionQueue(): Promise<void> {
  await storageAdapter.remove(ACTION_QUEUE_KEY);
}
