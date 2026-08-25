import type { Errand, MergedErrand } from '../types/rider';

/** One block of the shopping list, as the rider sees it. */
export interface RequestSection {
  /** Heading, when the section has one (a store name). Null for the flat form. */
  title: string | null;
  /** Body lines. Bulleted beneath a title; rendered as-is without one. */
  lines: string[];
  /** What this section is called when a receipt is filed against it. */
  name: string;
  /** The stop this list was pinned to, when the items carry one. */
  pinpointId: number | null;
}

/**
 * The sections RequestItemsPanel renders, derived in exactly one place.
 *
 * This function exists because the panel and the screen's "can the rider move
 * on?" check disagreed about what a section was. The panel drew one upload
 * button per STORE, while the screen counted items in the flat `details`
 * string and required that many uploads. An errand with two stores and eleven
 * items therefore needed eleven confirmations it only ever offered two ways to
 * give, and "Mark Items Purchased" stayed greyed out for good.
 *
 * Both callers now count the same array, so the two cannot drift apart again.
 */
export function requestSections(errand?: MergedErrand | Errand | null): RequestSection[] {
  if (!errand) return [];

  if (errand.payload && errand.payload.length > 0) {
    return errand.payload.map((group) => ({
      title: group.name,
      lines: group.items,
      name: group.name,
      pinpointId: group.pinpointId ?? null,
    }));
  }

  if (!errand.details) return [];

  // The legacy flat form, still used for errands with no per-stop item
  // requests: one section per " | "-joined segment.
  return errand.details.split(' | ').map((section) => {
    const formatted = section
      .replace(/; /g, '\n')
      .replace(/\(Pabili\) /, 'Pabili:\n')
      .replace(/\(Padala\) /, 'Padala:\n')
      .replace(/\(Bills\) /, 'Bills:\n');

    return {
      title: null,
      lines: [formatted],
      name: formatted.split(':')[0],
      pinpointId: null,
    };
  });
}
