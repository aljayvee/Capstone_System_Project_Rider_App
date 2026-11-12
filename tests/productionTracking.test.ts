import { beforeEach, describe, expect, it, vi } from 'vitest';

const { post, patch, data } = vi.hoisted(() => ({ post: vi.fn(), patch: vi.fn(), data: new Map<string, unknown>() }));
vi.mock('../src/services/apiClient', () => ({ apiClient: { post, patch } }));
vi.mock('../src/config/apiBaseUrl', () => ({ API_BASE_URL: 'https://example.test/api' }));
vi.mock('../src/adapters/storageAdapter', () => ({ storageAdapter: {
  getJSON: vi.fn(async (key: string) => structuredClone(data.get(key) ?? null)),
  setJSON: vi.fn(async (key: string, value: unknown) => { data.set(key, structuredClone(value)); }),
  remove: vi.fn(async (key: string) => { data.delete(key); }),
} }));

import { riderApiService } from '../src/config/apiConfig';
import { clearLocationQueue, enqueuePoint, flushLocationQueue, queuedCount, type QueuedPoint } from '../src/services/locationQueue';
import { clearArrivalQueue, flushArrivalQueue, reportStoreArrival } from '../src/services/arrivalQueue';

const point = (id: string, errandId = 'current'): QueuedPoint => ({
  clientPointId: id, errandId, latitude: 6.4, longitude: 124.8,
  accuracyMeters: 5, speedMps: 0, headingDeg: 0, recordedAt: '2026-11-10T01:00:00Z', wasOffline: true,
});

beforeEach(async () => {
  await clearLocationQueue();
  await clearArrivalQueue();
  vi.clearAllMocks();
  post.mockResolvedValue({});
  patch.mockResolvedValue({});
});

describe('GPS batch recovery', () => {
  it.each([400, 401, 403, 404, 409, 422])('drops wrapped %i responses', async (status) => {
    post.mockRejectedValueOnce(Object.assign(new Error('Rejected'), { status }));
    expect(await riderApiService.uploadTrackBatch('old', [])).toBe(true);
  });
  it.each([429, 500, 503, undefined])('retains transient %s failures', async (status) => {
    post.mockRejectedValueOnce(Object.assign(new Error('Retry later'), { status }));
    expect(await riderApiService.uploadTrackBatch('current', [])).toBe(false);
  });
  it('drops a stale head batch and uploads the active errand in the same flush', async () => {
    await enqueuePoint(point('old', 'stale'));
    await enqueuePoint(point('fresh'));
    post.mockRejectedValueOnce({ status: 403 });
    expect(await flushLocationQueue()).toEqual({ sent: 2, remaining: 0 });
    expect(post.mock.calls.map(([url]) => url)).toEqual(['/errands/stale/track', '/errands/current/track']);
  });
  it('retains a new point added while the batch is uploading', async () => {
    await enqueuePoint(point('first'));
    post.mockImplementationOnce(async () => { await enqueuePoint(point('second')); return {}; });
    expect(await flushLocationQueue()).toEqual({ sent: 1, remaining: 1 });
  });
  it('shares simultaneous flushes instead of uploading the head twice', async () => {
    await enqueuePoint(point('first'));
    await Promise.all([flushLocationQueue(), flushLocationQueue()]);
    expect(post).toHaveBeenCalledTimes(1);
  });
  it('does not restore the old queue when logout interrupts a failed upload', async () => {
    await enqueuePoint(point('first'));
    post.mockImplementationOnce(async () => { await clearLocationQueue(); throw new Error('offline'); });
    await flushLocationQueue();
    expect(await queuedCount()).toBe(0);
  });
  it('still accepts an unwrapped Axios status', async () => {
    post.mockRejectedValueOnce({ response: { status: 403 } });
    expect(await riderApiService.uploadTrackBatch('old', [])).toBe(true);
  });
});

describe('arrival reporting independent of GPS', () => {
  it('persists offline arrival and retries successfully', async () => {
    patch.mockRejectedValue(new Error('offline'));
    await reportStoreArrival('current', 12);
    await flushArrivalQueue();
    expect(data.get('@sugo_rider_arrival_queue')).toEqual([{ errandId: 'current', pinpointId: 12 }]);
    patch.mockResolvedValue({});
    await flushArrivalQueue();
    expect(patch).toHaveBeenLastCalledWith('/errands/current/pinpoints/12/arrived');
    expect(data.has('@sugo_rider_arrival_queue')).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });
  it('discards permanently rejected arrivals', async () => {
    patch.mockRejectedValue({ status: 403 });
    await reportStoreArrival('stale', 12);
    await flushArrivalQueue();
    expect(data.has('@sugo_rider_arrival_queue')).toBe(false);
  });
  it('retains rate-limited arrival and clears it on logout', async () => {
    patch.mockRejectedValue({ status: 429 });
    await reportStoreArrival('current', 12);
    await flushArrivalQueue();
    expect(data.has('@sugo_rider_arrival_queue')).toBe(true);
    await clearArrivalQueue();
    expect(data.has('@sugo_rider_arrival_queue')).toBe(false);
  });
  it('preserves arrivals enqueued while another report is in flight', async () => {
    patch.mockImplementationOnce(async () => {
      await reportStoreArrival('current', 13);
      return {};
    });
    await reportStoreArrival('current', 12);
    await flushArrivalQueue();
    expect(data.get('@sugo_rider_arrival_queue')).toEqual([{ errandId: 'current', pinpointId: 13 }]);
    await flushArrivalQueue();
    expect(data.has('@sugo_rider_arrival_queue')).toBe(false);
  });
  it('drops a stale head arrival and uploads the next stop in the same flush', async () => {
    data.set('@sugo_rider_arrival_queue', [
      { errandId: 'stale', pinpointId: 11 },
      { errandId: 'current', pinpointId: 12 },
    ]);
    patch.mockRejectedValueOnce({ status: 403 });
    await flushArrivalQueue();
    expect(data.has('@sugo_rider_arrival_queue')).toBe(false);
    expect(patch.mock.calls.map(([url]) => url)).toEqual([
      '/errands/stale/pinpoints/11/arrived',
      '/errands/current/pinpoints/12/arrived',
    ]);
  });
  it('halts flush on transient 429 failure without attempting subsequent arrivals', async () => {
    data.set('@sugo_rider_arrival_queue', [
      { errandId: 'current', pinpointId: 11 },
      { errandId: 'current', pinpointId: 12 },
    ]);
    patch.mockRejectedValueOnce({ status: 429 });
    await flushArrivalQueue();
    expect(data.get('@sugo_rider_arrival_queue')).toEqual([
      { errandId: 'current', pinpointId: 11 },
      { errandId: 'current', pinpointId: 12 },
    ]);
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith('/errands/current/pinpoints/11/arrived');
  });
});
