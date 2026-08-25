/**
 * Formats full UUID errand IDs into a consistent, readable format for UI displays.
 * Keeps the raw UUID intact for API calls, socket events, and database lookups.
 * Example: '6d48243c-8b83-4a11-897b-9c3f0b2f6b80' -> 'SGO-2F6B80'
 */
export function formatErrandId(rawId: string | number | null | undefined): string {
  const raw = String(rawId ?? '').trim();
  if (!raw) return 'SGO-000000';
  const alnum = raw.replace(/[^a-zA-Z0-9]/g, '');
  const tail = (alnum.slice(-6) || alnum).toUpperCase();
  return `SGO-${tail.padStart(6, '0')}`;
}
