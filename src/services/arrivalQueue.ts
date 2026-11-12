import { storageAdapter } from '../adapters/storageAdapter';
import { riderApiService } from '../config/apiConfig';

const KEY = '@sugo_rider_arrival_queue';
type Arrival = { errandId: string; pinpointId: number };
let mutations: Promise<unknown> = Promise.resolve();
let flight: Promise<void> | null = null;
let generation = 0;

function mutate<T>(work: () => Promise<T>): Promise<T> {
  const result = mutations.then(work);
  mutations = result.catch(() => {});
  return result;
}
const read = async (): Promise<Arrival[]> => (await storageAdapter.getJSON<Arrival[]>(KEY)) ?? [];
const same = (a: Arrival, b: Arrival) => a.errandId === b.errandId && a.pinpointId === b.pinpointId;

/** Persist before advancing the UI; GPS upload failures cannot block this queue. */
export async function reportStoreArrival(errandId: string, pinpointId: number): Promise<void> {
  await mutate(async () => {
    const queue = await read();
    const arrival = { errandId, pinpointId };
    if (!queue.some((item) => same(item, arrival))) {
      await storageAdapter.setJSON(KEY, [...queue, arrival]);
    }
  });
  void flushArrivalQueue().catch(() => {});
}

export function flushArrivalQueue(): Promise<void> {
  if (flight) return flight;
  const session = generation;
  flight = (async () => {
    const queue = await mutate(read);
    for (const arrival of queue) {
      if (session !== generation) break;
      try {
        await riderApiService.markPinpointArrived(arrival.errandId, arrival.pinpointId);
      } catch (err: any) {
        const status = err?.status ?? err?.response?.status;
        const isPermanentRejection = Boolean(status && status >= 400 && status < 500 && status !== 429);
        if (!isPermanentRejection) {
          // Transient failure (network drop, 429 rate limit, 5xx): stop flushing and retry later.
          break;
        }
        // A stale/invalid stop (non-429 4xx) must not block arrivals for other stops; drop it and continue.
      }
      await mutate(async () => {
        if (session !== generation) return;
        const remaining = (await read()).filter((item) => !same(item, arrival));
        if (remaining.length) await storageAdapter.setJSON(KEY, remaining);
        else await storageAdapter.remove(KEY);
      });
    }
  })().finally(() => { flight = null; });
  return flight;
}

export async function clearArrivalQueue(): Promise<void> {
  generation += 1;
  await mutate(() => storageAdapter.remove(KEY));
}
