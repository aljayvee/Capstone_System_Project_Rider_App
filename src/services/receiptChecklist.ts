import type { RequestSection } from './requestSections';

export function hasUncheckedReceiptItems(section: RequestSection): boolean {
  return (section.itemEntries ?? []).some(
    (item) => item.fulfillmentStatus !== 'PURCHASED' && item.fulfillmentStatus !== 'OUT_OF_STOCK'
  );
}
