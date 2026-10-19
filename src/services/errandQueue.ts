import type { Errand, StatusStep } from '../types/rider';
import { haversineDistanceKm } from '../utils/geo';

/**
 * The order a rider runs the errands they have accepted.
 *
 * Only the errand at the front is ever progressed: its stops are the ones
 * routed to, its receipts are the ones filed, its door is the one the arrival
 * geofence watches. Everything behind it waits with its own progress slot
 * untouched.
 *
 * The front used to be simply `activeErrands[0]`, and the server lists a
 * rider's errands newest first (errandRepository.findByRiderId orders by
 * createdAt desc). So accepting a second errand in the middle of the first one
 * quietly made the NEW errand the front: its default "Traveling" slot took
 * over the step, and the half-shopped errand became "queued" behind it.
 *
 * Pure, so the rule is tested without a device.
 */

/** When the rider took the errand on: accepted, else offered, else created. */
export function acceptanceTime(errand: Pick<Errand, 'createdAt' | 'acceptedAt' | 'assignedAt'>): number {
  for (const stamp of [errand.acceptedAt, errand.assignedAt, errand.createdAt]) {
    if (!stamp) continue;
    const ms = Date.parse(stamp);
    if (Number.isFinite(ms)) return ms;
  }
  // Undated sorts last, never first: an errand of unknown age must not jump
  // ahead of one the rider is already working.
  return Number.POSITIVE_INFINITY;
}

/**
 * First accepted, first run, with the one the rider chose to start first (if
 * it is still in hand) moved to the front. Ties break on id so the order never
 * flips between two fetches of the same data.
 */
export function orderErrandQueue<T extends Pick<Errand, 'id' | 'createdAt' | 'acceptedAt' | 'assignedAt'>>(
  errands: T[],
  workingErrandId: string | null
): T[] {
  const ordered = [...errands].sort((a, b) => {
    const ta = acceptanceTime(a);
    const tb = acceptanceTime(b);
    // Two undated errands are both Infinity, so they fall through to the id.
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  if (!workingErrandId) return ordered;
  const chosen = ordered.findIndex((e) => e.id === workingErrandId);
  if (chosen <= 0) return ordered;
  return [ordered[chosen], ...ordered.slice(0, chosen), ...ordered.slice(chosen + 1)];
}

/**
 * Whether the rider may set the errand in hand aside and start another first.
 *
 * Only while still shopping for it. Once its goods are bought the rider is
 * carrying someone's order, and the next thing that happens to it has to be
 * that customer's door.
 */
export function canSwitchWorkingErrand(currentStatus: StatusStep): boolean {
  return currentStatus === 'Traveling' || currentStatus === 'At Store';
}

// ─── Delivery holds: one trip to a customer's door, not two ─────────────────
//
// A rider on the way with a customer's order can be given a second errand for
// the same customer. Delivering the first and then riding back with the second
// takes them to that door twice. Instead the first is HELD: the rider shops the
// second next, and both are delivered together.
//
// Mirrors the server's rule (Capstone_Server src/services/patterns/
// deliveryHold.ts), which uses it for the customer's ETA and pushes. Here
// "bought" is the rider's own step rather than itemsPurchasedAt, so the hold
// starts the moment the step does, not when the server hears of it.

/** Two drop-offs this close are the same door. */
export const SAME_DROP_OFF_KM = 0.1;

type HoldErrand = Pick<
  Errand,
  'id' | 'customerId' | 'deliveryLatitude' | 'deliveryLongitude' | 'address' | 'acceptedAt' | 'assignedAt' | 'createdAt'
>;

/**
 * The same door: within SAME_DROP_OFF_KM, or, when either has no pin, the same
 * written address. One order home and one to work are two deliveries.
 */
export function sameDropOff(a: HoldErrand, b: HoldErrand): boolean {
  if (a.deliveryLatitude != null && a.deliveryLongitude != null && b.deliveryLatitude != null && b.deliveryLongitude != null) {
    return (
      haversineDistanceKm(
        { latitude: a.deliveryLatitude, longitude: a.deliveryLongitude },
        { latitude: b.deliveryLatitude, longitude: b.deliveryLongitude }
      ) <= SAME_DROP_OFF_KM
    );
  }
  const left = a.address?.trim().toLowerCase();
  const right = b.address?.trim().toLowerCase();
  return Boolean(left) && left === right;
}

/**
 * Which accepted errands are held, and for which: bought, while another of
 * the same customer's errands for the same door is not bought yet. With more
 * than one still being shopped, the first accepted. An errand with no known
 * customer is never held: a guess here would send the rider the wrong way.
 */
export function deliveryHolds<T extends HoldErrand>(errands: T[], isBought: (errand: T) => boolean): Map<string, T> {
  const holds = new Map<string, T>();
  for (const errand of errands) {
    if (errand.customerId == null || !isBought(errand)) continue;
    const waitingOn = errands
      .filter(
        (other) =>
          other.id !== errand.id &&
          other.customerId === errand.customerId &&
          !isBought(other) &&
          sameDropOff(errand, other)
      )
      .sort((a, b) => acceptanceTime(a) - acceptanceTime(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (waitingOn[0]) holds.set(errand.id, waitingOn[0]);
  }
  return holds;
}

/**
 * The run order with each held errand's sibling moved in front of it, so the
 * rider shops that one next and the held one rides along. Nothing else moves:
 * another customer's errand queued behind keeps its place.
 */
export function applyDeliveryHolds<T extends Pick<Errand, 'id'>>(ordered: T[], holds: Map<string, T>): T[] {
  const result = [...ordered];
  for (const [heldId, sibling] of holds) {
    const held = result.findIndex((e) => e.id === heldId);
    const next = result.findIndex((e) => e.id === sibling.id);
    if (held < 0 || next < 0 || next < held) continue;
    const [moved] = result.splice(next, 1);
    result.splice(held, 0, moved);
  }
  return result;
}

/** "Now", "2nd", "3rd": where an errand sits in the rider's queue. */
export function queuePositionLabel(index: number): string {
  if (index <= 0) return 'Now';
  const n = index + 1;
  const suffix = n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
}
