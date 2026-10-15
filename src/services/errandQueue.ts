import type { Errand, StatusStep } from '../types/rider';

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

/** "Now", "2nd", "3rd": where an errand sits in the rider's queue. */
export function queuePositionLabel(index: number): string {
  if (index <= 0) return 'Now';
  const n = index + 1;
  const suffix = n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
}
