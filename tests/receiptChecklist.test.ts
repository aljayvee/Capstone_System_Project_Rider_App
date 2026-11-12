import { describe, expect, it } from 'vitest';
import { hasUncheckedReceiptItems } from '../src/services/receiptChecklist';
import type { RequestSection } from '../src/services/requestSections';

const section = (statuses: Array<string | undefined>) => ({
  itemEntries: statuses.map((fulfillmentStatus, id) => ({ id, fulfillmentStatus })),
} as RequestSection);

describe('receipt checklist gate', () => {
  it('blocks pending and missing fulfillment states', () => {
    expect(hasUncheckedReceiptItems(section(['PURCHASED', 'PENDING']))).toBe(true);
    expect(hasUncheckedReceiptItems(section([undefined]))).toBe(true);
  });
  it('allows purchased and out-of-stock rows together', () => {
    expect(hasUncheckedReceiptItems(section(['PURCHASED', 'OUT_OF_STOCK']))).toBe(false);
  });
  it('does not block non-shopping or legacy sections without structured items', () => {
    expect(hasUncheckedReceiptItems(section([]))).toBe(false);
    expect(hasUncheckedReceiptItems({} as RequestSection)).toBe(false);
  });
});
