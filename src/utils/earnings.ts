import type { Errand, MergedErrand, RiderEarnings } from '../types/rider';

type AnyErrand = Pick<Errand | MergedErrand, 'riderEarnings'>;

/**
 * What this errand pays the rider, or null when the server did not send it.
 *
 * Null rather than a fallback number, deliberately. The code this replaces read
 * `errand.serviceFee || 50` — so a missing figure silently became ₱50, and a
 * present one was the GROSS delivery fee rather than the rider's share. Both
 * failures showed the rider a number that was not their pay. A dash is honest;
 * an invented peso amount is not.
 */
export function earningsOf(errand: AnyErrand): number | null {
  const value = errand.riderEarnings?.riderShare;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Peso-formatted earnings, or an em dash when unknown. */
export function formatEarnings(errand: AnyErrand): string {
  const value = earningsOf(errand);
  return value === null ? '—' : `₱${value.toFixed(2)}`;
}

/** Sums earnings across errands, skipping any the server did not price. */
export function totalEarnings(errands: AnyErrand[]): number {
  return errands.reduce((sum, errand) => sum + (earningsOf(errand) ?? 0), 0);
}

/**
 * Combines the earnings of several errands the rider is running together.
 *
 * Every money field sums; the rate is shared, so it carries across unchanged.
 * `isFinal` holds only if every one of them is settled — a batch is not a
 * recorded payout while any part of it is still moving.
 */
export function mergeEarnings(errands: AnyErrand[]): RiderEarnings | undefined {
  const parts = errands
    .map((e) => e.riderEarnings)
    .filter((e): e is RiderEarnings => Boolean(e));
  if (parts.length === 0) return undefined;

  const sum = (pick: (e: RiderEarnings) => number) =>
    Math.round(parts.reduce((total, e) => total + pick(e), 0) * 100) / 100;

  return {
    riderShare: sum((e) => e.riderShare),
    businessShare: sum((e) => e.businessShare),
    deliveryFee: sum((e) => e.deliveryFee),
    tip: sum((e) => e.tip),
    itemCostExcluded: sum((e) => e.itemCostExcluded),
    commissionRate: parts[0].commissionRate,
    isFinal: parts.every((e) => e.isFinal),
  };
}

export type { RiderEarnings };
