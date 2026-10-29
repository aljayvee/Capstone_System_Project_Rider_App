/**
 * The errand number people read and say aloud: YYMMDD-KKKKK-NNNN, the Manila
 * date the order was placed, the last 5 characters of its UUID, and that day's
 * order number. The server stores it as `referenceNo` (lib/errandReference.ts).
 * Display only: the raw UUID keeps flowing to API calls, socket events and
 * Firebase paths.
 *
 * Most screens hold only the id, so the API client and the socket remember
 * every id/referenceNo pair they see (rememberErrandReferences) and
 * this reads them back. Until a pair has arrived, or for an older errand the
 * backfill has not numbered, it shows the key alone: the middle of the number.
 * Example: '6d48243c-8b83-4a11-897b-9c3f0b2f6b80' -> '261019-F6B80-0042'
 */
const REFERENCE = /^(\d{6})-([0-9A-Z]{5})-(\d{4,})$/;
const references = new Map<string, string>();

/** The last 5 letters or digits of an errand id, upper case. */
export function errandReferenceKey(rawId: string | number | null | undefined): string {
  return String(rawId ?? '').replace(/[^a-zA-Z0-9]/g, '').slice(-5).toUpperCase();
}

export function formatErrandId(rawId: string | number | null | undefined, referenceNo?: string | null): string {
  if (referenceNo) return referenceNo;
  const raw = String(rawId ?? '').trim();
  if (!raw) return '';
  return references.get(raw) ?? errandReferenceKey(raw);
}

/** Orders by day, then by the day's number, which is placing order. */
export function compareErrandIds(a: string, b: string): number {
  return sortKey(formatErrandId(a)).localeCompare(sortKey(formatErrandId(b)));
}

function sortKey(display: string): string {
  const match = REFERENCE.exec(display);
  return match ? `${match[1]}${match[3].padStart(6, '0')}` : `~${display}`;
}

/**
 * Records every errand number in an API or socket payload. A pair counts only
 * when the number's middle is that id's own key, so another table's
 * `referenceNo` (a receipt's, say) can never be taken for an errand's.
 */
export function rememberErrandReferences(payload: unknown, depth = 0): void {
  if (!payload || typeof payload !== 'object' || depth > 6) return;
  if (Array.isArray(payload)) {
    for (const item of payload) rememberErrandReferences(item, depth + 1);
    return;
  }
  const record = payload as Record<string, unknown>;
  const match = typeof record.referenceNo === 'string' ? REFERENCE.exec(record.referenceNo) : null;
  if (match) {
    for (const id of [record.errandId, record.id]) {
      if (typeof id === 'string' && errandReferenceKey(id) === match[2]) {
        references.set(id, record.referenceNo as string);
        break;
      }
    }
  }
  for (const value of Object.values(record)) {
    if (value && typeof value === 'object') rememberErrandReferences(value, depth + 1);
  }
}
