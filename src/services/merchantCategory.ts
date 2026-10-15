/**
 * What kind of shop this errand is, in one line.
 *
 * Its own module for the reason requestSections has one: three screens print
 * this, and all three printed the same wrong thing — `errand.type`, the SERVICE
 * type, which the server pins to the literal "Pabili". One derivation means they
 * cannot drift apart again.
 */

/**
 * Joins merchant categories into a label.
 *
 * Null when nothing is known, so callers omit the line entirely rather than
 * render a guess — the same rule RequestItemsPanel already applies per stop.
 *
 * Uses ", " and "+N", never " & ". Merged errands already join service types
 * with " & ", and catalogue names contain "&" of their own ("Fast Food &
 * Restaurant"), so a " & " join here would be unreadable back: "Grocery & Fast
 * Food & Restaurant" could be two categories or three.
 *
 * Accepts null/undefined because the offline waybill cache replays errands
 * mapped by an older build, which have no merchantCategories at all.
 */
export function merchantCategoryLabel(categories?: string[] | null): string | null {
  const names = (categories ?? []).map((c) => c.trim()).filter((c) => c.length > 0);

  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]}, ${names[1]}`;
  return `${names[0]} +${names.length - 1}`;
}
