import { storageAdapter } from '../adapters/storageAdapter';
import { riderApiService } from '../config/apiConfig';

const LOCATION_QUEUE_KEY = '@sugo_rider_location_queue';

// Roughly three hours of active-delivery tracking. The queue is a ring: past
// this, the oldest points are dropped rather than letting a device that has been
// offline all day grow its storage without bound. Oldest-first because the
// recent trail is what the ETA and the customer's map need.
const MAX_QUEUED_POINTS = 2000;

// The server caps a batch at 200 points.
const MAX_BATCH_SIZE = 200;
let mutations: Promise<unknown> = Promise.resolve();
let flight: Promise<{ sent: number; remaining: number }> | null = null;
let generation = 0;

function mutate<T>(work: () => Promise<T>): Promise<T> {
  const result = mutations.then(work);
  mutations = result.catch(() => {});
  return result;
}

export interface QueuedPoint {
  clientPointId: string;
  errandId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  speedMps: number | null;
  headingDeg: number | null;
  recordedAt: string;
  wasOffline: boolean;
}

// RN has no crypto.randomUUID. This does not need to be cryptographically
// strong — it only has to be unique per device per errand, since the server's
// idempotency key is (errandId, clientPointId).
export function createClientPointId(): string {
  const rand = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${rand()}${rand()}-${rand()}-4${rand().slice(1)}-a${rand().slice(1)}-${rand()}${rand()}${rand()}`;
}

async function readQueue(): Promise<QueuedPoint[]> {
  return (await storageAdapter.getJSON<QueuedPoint[]>(LOCATION_QUEUE_KEY)) || [];
}

/**
 * Buffers one fix for later upload.
 *
 * Every fix goes through here, online or not — the queue is the single upload
 * path, so there is no separate "send now" branch that could succeed while the
 * queued one is still pending and land points out of order.
 */
export async function enqueuePoint(point: QueuedPoint): Promise<void> {
  await mutate(async () => {
    const queue = await readQueue();
    queue.push(point);
    // Drop from the front when over capacity.
    const trimmed = queue.length > MAX_QUEUED_POINTS ? queue.slice(queue.length - MAX_QUEUED_POINTS) : queue;
    await storageAdapter.setJSON(LOCATION_QUEUE_KEY, trimmed);
  });
}

export async function queuedCount(): Promise<number> {
  return (await readQueue()).length;
}

/**
 * Uploads everything buffered, oldest first, one errand at a time.
 *
 * Acknowledged or permanently rejected batches are removed. Transient failures
 * stop the flush and retain the rest. Server idempotency makes retries harmless.
 */
export function flushLocationQueue(): Promise<{ sent: number; remaining: number }> {
  if (flight) return flight;
  const session = generation;
  flight = flush(session).finally(() => { flight = null; });
  return flight;
}

async function flush(session: number): Promise<{ sent: number; remaining: number }> {
  const queue = await mutate(readQueue);
  if (queue.length === 0) return { sent: 0, remaining: 0 };

  // Oldest first, so a partial flush still leaves a chronologically contiguous
  // remainder.
  queue.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));

  let sent = 0;
  let index = 0;

  while (index < queue.length) {
    if (session !== generation) break;
    // A batch may only contain points for one errand, since the errand is in
    // the URL.
    const errandId = queue[index].errandId;
    const batch: QueuedPoint[] = [];
    while (index < queue.length && queue[index].errandId === errandId && batch.length < MAX_BATCH_SIZE) {
      batch.push(queue[index]);
      index += 1;
    }

    const ok = await riderApiService.uploadTrackBatch(errandId, batch);
    if (!ok) break;
    sent += batch.length;
  }

  return mutate(async () => {
    // Re-read before removing acknowledged points: fixes queued during HTTP must
    // survive, and a flush that outlives logout must never restore the old trail.
    if (session !== generation) return { sent, remaining: await queuedCount() };
    const acknowledged = new Set(queue.slice(0, sent).map((point) => `${point.errandId}:${point.clientPointId}`));
    const remaining = (await readQueue()).filter((point) => !acknowledged.has(`${point.errandId}:${point.clientPointId}`));
    if (remaining.length > 0) {
      await storageAdapter.setJSON(LOCATION_QUEUE_KEY, remaining);
    } else {
      await storageAdapter.remove(LOCATION_QUEUE_KEY);
    }
    return { sent, remaining: remaining.length };
  });
}

// Called on logout so one rider's unsent trail can never be uploaded under the
// next rider to sign in on the same device.
export async function clearLocationQueue(): Promise<void> {
  generation += 1;
  await mutate(() => storageAdapter.remove(LOCATION_QUEUE_KEY));
}
