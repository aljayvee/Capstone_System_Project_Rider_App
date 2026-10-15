/**
 * How long to wait before polling again (see hooks/useSmartPolling).
 *
 * An answer that changed means something is happening: ask again at the base
 * rate. An answer identical to the last one means nothing is: wait twice as
 * long as last time, up to `maxMs`. A failure waits like an unchanged answer,
 * so a server that is down is not asked faster than one that is idle.
 */
export function nextPollDelay(
  previousMs: number,
  outcome: 'changed' | 'unchanged' | 'failed',
  baseMs: number,
  maxMs: number
): number {
  if (outcome === 'changed') return baseMs;
  return Math.min(maxMs, Math.max(baseMs, previousMs * 2));
}

/**
 * A cheap fingerprint of a JSON-able answer, to tell "changed" from
 * "unchanged" without keeping two copies around to compare field by field.
 */
export function fingerprint(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    // Not serialisable: treat every answer as new rather than none of them.
    return String(Math.random());
  }
}
