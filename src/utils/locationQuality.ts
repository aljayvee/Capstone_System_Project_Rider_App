// Client-side GPS quality gate.
//
// Deliberately mirrors server/src/lib/trackQuality.ts. Both exist on purpose:
// filtering here saves the rider's battery and mobile data by never uploading a
// junk fix, while the server repeats the checks because it cannot assume a
// well-behaved client (a stale build, a bug, a crafted request).

// A fix this imprecise says "somewhere on this block" — not good enough to tell
// which store the rider is standing in, and actively harmful if it drags a
// geofence or an ETA around.
export const MAX_ACCURACY_METERS = 50;

// No vehicle sustains this on Tacurong city streets. A fix implying it is a GPS
// glitch (a cold-start fix, a cell-tower estimate) rather than real movement.
export const MAX_PLAUSIBLE_SPEED_MPS = 30;

// Below this the device is standing still and any apparent movement is noise.
export const STATIONARY_SPEED_MPS = 0.5;

// How far a "stationary" reading may wander before it is treated as real
// movement rather than jitter. Without this the customer watches the rider's pin
// twitch around the car park for the entire time they are inside a store.
export const JITTER_RADIUS_METERS = 15;

export interface Fix {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  speedMps: number | null;
  headingDeg: number | null;
  timestamp: number;
}

export type FixVerdict =
  | { kind: 'accept'; fix: Fix }
  // Keep showing the previous coordinate: the device has not really moved, so
  // publishing the new one would only add visible jitter.
  | { kind: 'hold'; fix: Fix }
  | { kind: 'reject'; reason: 'inaccurate' | 'out_of_order' | 'implausible_speed' };

const EARTH_RADIUS_M = 6371000;

export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.asin(Math.sqrt(h));
}

/**
 * Decides what to do with one incoming fix given the last one that was accepted.
 *
 * Returns 'hold' rather than 'reject' for stationary jitter because the reading
 * is not wrong — the rider really is there — it just should not move the pin.
 */
export function evaluateFix(candidate: Fix, previous: Fix | null): FixVerdict {
  if (candidate.accuracyMeters != null && candidate.accuracyMeters > MAX_ACCURACY_METERS) {
    return { kind: 'reject', reason: 'inaccurate' };
  }

  if (!previous) return { kind: 'accept', fix: candidate };

  const elapsedSeconds = (candidate.timestamp - previous.timestamp) / 1000;
  if (elapsedSeconds <= 0) {
    return { kind: 'reject', reason: 'out_of_order' };
  }

  const moved = distanceMeters(candidate, previous);
  if (moved / elapsedSeconds > MAX_PLAUSIBLE_SPEED_MPS) {
    return { kind: 'reject', reason: 'implausible_speed' };
  }

  const stationary =
    (candidate.speedMps == null || candidate.speedMps < STATIONARY_SPEED_MPS) &&
    moved < JITTER_RADIUS_METERS;
  if (stationary) {
    // Carry the previous coordinate forward but keep the new timestamp, so the
    // fix still counts as a fresh heartbeat rather than looking like a dropout.
    return { kind: 'hold', fix: { ...previous, timestamp: candidate.timestamp } };
  }

  return { kind: 'accept', fix: candidate };
}
