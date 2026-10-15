import { describe, expect, it } from "vitest";
import {
  deriveErrandProgress,
  deriveDepartedStoreIds,
  dueAtDoorFor,
  type ProofImageSummary,
} from "../src/services/missionProgress";
import type { Errand } from "../src/types/rider";
import type { RequestSection } from "../src/services/requestSections";

/**
 * The bug this covers: every one of these facts was already in the database,
 * and none of it was ever read back. Signing out, clearing storage or letting
 * the OS reclaim the app emptied the in-memory progress map, and each errand
 * came back reading "Traveling" with an empty checklist — a rider at the
 * customer's door being told to start riding to the shop.
 */

function errand(overrides: Partial<Errand> = {}): Errand {
  return {
    id: "err_1",
    type: "Pabili",
    merchantCategories: [],
    customer: "Customer",
    customerPhone: "",
    address: "123 Somewhere St",
    paymentMode: "Cash on Delivery",
    status: "Traveling",
    amount: 560,
    createdAt: "2026-09-23T00:00:00.000Z",
    updatedAt: "2026-09-23T00:00:00.000Z",
    details: "",
    ...overrides,
  } as Errand;
}

function proof(overrides: Partial<ProofImageSummary> = {}): ProofImageSummary {
  return {
    id: 1,
    kind: "RECEIPT",
    pinpointId: null,
    declaredTotal: null,
    capturedAt: "2026-09-23T09:00:00.000Z",
    supersededAt: null,
    extraction: null,
    ...overrides,
  };
}

const section = (pinpointId: number | null, name = `Stop ${pinpointId}`): RequestSection => ({
  title: name,
  lines: ["Bread"],
  name,
  pinpointId,
  storeCategory: null,
});

const derive = (
  e: Errand,
  proofs: ProofImageSummary[] = [],
  sections: RequestSection[] = []
) => deriveErrandProgress({ errand: e, proofs, sections });

describe("restoring which step the rider is on", () => {
  it("starts at Traveling when nothing has happened yet", () => {
    expect(derive(errand()).currentStatus).toBe("Traveling");
  });

  it("restores At Store from the server's own geofence arrival", () => {
    // The rider never photographed anything at the first stop, but the
    // breadcrumb geofence recorded them reaching it. That is persisted, so it
    // survives a re-login where the local step did not.
    const withArrival = errand({
      pinpoints: [
        { id: 7, storeName: "Store 7", latitude: 6.68, longitude: 124.66, sequence: 1, arrivedAt: "2026-09-23T08:40:00.000Z" },
      ],
    });
    expect(derive(withArrival).currentStatus).toBe("At Store");
  });

  it("restores At Store from a filed receipt even with no arrival recorded", () => {
    expect(derive(errand(), [proof({ pinpointId: 7 })]).currentStatus).toBe("At Store");
  });

  it("restores Delivering from itemsPurchasedAt", () => {
    // The one persisted signal separating "still shopping" from "carrying the
    // goods" — all three pre-delivery steps share a single IN_TRANSIT row, so
    // the status column alone cannot tell them apart.
    const purchased = errand({ itemsPurchasedAt: "2026-09-23T09:15:00.000Z" });
    expect(derive(purchased).currentStatus).toBe("Delivering");
  });

  it("lets a Delivered errand outrank every earlier signal", () => {
    const delivered = errand({ status: "Delivered", itemsPurchasedAt: "2026-09-23T09:15:00.000Z" });
    expect(derive(delivered).currentStatus).toBe("Delivered");
  });

  it("ignores a superseded receipt when deciding the step", () => {
    // A replaced photo is kept as dispute evidence, never as current progress.
    const stale = proof({ pinpointId: 7, supersededAt: "2026-09-23T09:05:00.000Z" });
    expect(derive(errand(), [stale]).currentStatus).toBe("Traveling");
  });
});

describe("restoring which shopping sections are done", () => {
  it("ticks each section that has a receipt filed against its stop", () => {
    const sections = [section(7), section(8), section(9)];
    const proofs = [proof({ id: 1, pinpointId: 7 }), proof({ id: 2, kind: "NO_RECEIPT", pinpointId: 9 })];
    expect(derive(errand(), proofs, sections).completedSubtasks).toEqual({ 0: true, 2: true });
  });

  it("does not tick a section whose only receipt was replaced", () => {
    const sections = [section(7)];
    const stale = proof({ pinpointId: 7, supersededAt: "2026-09-23T09:05:00.000Z" });
    expect(derive(errand(), [stale], sections).completedSubtasks).toEqual({});
  });

  it("matches an unpinned proof to an unpinned section when there is only one", () => {
    const sections = [section(7), section(null, "Other items")];
    const proofs = [proof({ id: 2, pinpointId: null })];
    expect(derive(errand(), proofs, sections).completedSubtasks).toEqual({ 1: true });
  });

  it("refuses to guess when two sections are both unpinned", () => {
    // Two unpinned sections are indistinguishable from each other, so ticking
    // one would be a coin flip. Letting the rider re-photograph is the honest
    // answer; marking the wrong store bought is not.
    const sections = [section(null, "Segment A"), section(null, "Segment B")];
    expect(derive(errand(), [proof({ pinpointId: null })], sections).completedSubtasks).toEqual({});
  });

  it("clears the checklist once the errand is past shopping", () => {
    // Advancing a step wipes completedSubtasks by design — the checklist is
    // re-used step to step, so restoring ticks onto a later step would show a
    // delivery checklist already half-crossed-off.
    const purchased = errand({ itemsPurchasedAt: "2026-09-23T09:15:00.000Z" });
    const sections = [section(7)];
    expect(derive(purchased, [proof({ pinpointId: 7 })], sections).completedSubtasks).toEqual({});
  });
});

describe("restoring the handover photo", () => {
  it("remembers that the door photo was already taken", () => {
    // Without this the rider is asked to photograph a handover they already
    // completed, at a door they have since left.
    const proofs = [proof({ id: 3, kind: "PROOF_OF_DELIVERY" })];
    expect(derive(errand(), proofs).handoverCaptured).toBe(true);
  });

  it("does not count a receipt as a handover", () => {
    expect(derive(errand(), [proof({ pinpointId: 7 })]).handoverCaptured).toBe(false);
  });
});

describe("restoring what was collected at the door", () => {
  const cod = errand({ feeBreakdown: { grandTotal: 560 } as Errand["feeBreakdown"] });

  it("reads a cash capture that matched the total as collected in full", () => {
    const proofs = [proof({ id: 4, kind: "CASH_COLLECTED", declaredTotal: 560 })];
    expect(derive(cod, proofs)).toMatchObject({
      collectedAmount: "FULL",
      shortPayment: false,
      proofImageId: 4,
    });
  });

  it("reads a cash capture that came up short as short", () => {
    const proofs = [proof({ id: 5, kind: "CASH_COLLECTED", declaredTotal: 500 })];
    expect(derive(cod, proofs)).toMatchObject({
      collectedAmount: "500",
      shortPayment: true,
      proofImageId: 5,
    });
  });

  it("treats a GCash balance receipt as full without re-judging the amount", () => {
    // The server validated it against the exact balance due before storing it
    // at all, so there is no short reading of one to restore.
    const proofs = [proof({ id: 6, kind: "RIDER_BALANCE_PROOF" })];
    expect(derive(cod, proofs)).toMatchObject({
      collectedAmount: "FULL",
      shortPayment: false,
      proofImageId: 6,
    });
  });

  it("judges a downpayment errand against the balance, not the grand total", () => {
    const halfPaid = errand({
      feeBreakdown: { grandTotal: 560 } as Errand["feeBreakdown"],
      paymentPlan: { hasLedger: true, balanceDue: 280 } as Errand["paymentPlan"],
    });
    const proofs = [proof({ id: 7, kind: "CASH_COLLECTED", declaredTotal: 280 })];
    expect(derive(halfPaid, proofs)).toMatchObject({ collectedAmount: "FULL", shortPayment: false });
  });

  it("keeps the latest capture when the rider tried both routes", () => {
    // A GCash receipt that would not read, then cash instead. The last capture
    // is what actually happened at the door.
    const proofs = [
      proof({ id: 8, kind: "RIDER_BALANCE_PROOF", capturedAt: "2026-09-23T10:00:00.000Z" }),
      proof({ id: 9, kind: "CASH_COLLECTED", declaredTotal: 560, capturedAt: "2026-09-23T10:04:00.000Z" }),
    ];
    expect(derive(cod, proofs).proofImageId).toBe(9);
  });

  it("re-attaches the photo but invents no figure when the amount is missing", () => {
    const proofs = [proof({ id: 10, kind: "CASH_COLLECTED", declaredTotal: null })];
    expect(derive(cod, proofs)).toMatchObject({
      collectedAmount: "",
      shortPayment: false,
      proofImageId: 10,
    });
  });

  it("never restores the delivered panel", () => {
    // showComplete is a one-shot confirmation, not a state the errand is in.
    const delivered = errand({ status: "Delivered" });
    expect(derive(delivered).showComplete).toBe(false);
  });
});

describe("what the rider is owed at the door", () => {
  it("uses the grand total on an ordinary COD errand", () => {
    expect(dueAtDoorFor(errand({ feeBreakdown: { grandTotal: 560 } as Errand["feeBreakdown"] }))).toBe(560);
  });

  it("uses the outstanding balance once part of it is already paid", () => {
    const halfPaid = errand({
      feeBreakdown: { grandTotal: 560 } as Errand["feeBreakdown"],
      paymentPlan: { hasLedger: true, balanceDue: 280 } as Errand["paymentPlan"],
    });
    expect(dueAtDoorFor(halfPaid)).toBe(280);
  });

  it("falls back to the errand total when no breakdown came through", () => {
    expect(dueAtDoorFor(errand())).toBe(560);
  });

  it("is zero with no errand in hand", () => {
    expect(dueAtDoorFor(null)).toBe(0);
  });
});

describe("multi-store departed store derivation and auto-advance", () => {
  it("derives departedStoreIds from both RECEIPT and NO_RECEIPT proofs", () => {
    const sections = [section(66), section(67), section(68)];
    const proofs = [
      proof({ id: 29, kind: "RECEIPT", pinpointId: 67 }),
      proof({ id: 30, kind: "NO_RECEIPT", pinpointId: 66, declaredTotal: 140 }),
    ];
    const departed = deriveDepartedStoreIds(sections, proofs);
    expect(departed).toContain(67);
    expect(departed).toContain(66);
    expect(departed).not.toContain(68);
  });

  it("auto-advances to Delivering when all store sections have filed proofs", () => {
    const multiErrand = errand({
      id: "89b83a30-ef03-4ce2-b811-2bd765c8af2b",
      pinpoints: [
        { id: 66, storeName: "Julie's Bakeshop", sequence: 0, latitude: 6.69, longitude: 124.67 },
        { id: 67, storeName: "Jollibee DT", sequence: 1, latitude: 6.68, longitude: 124.67 },
        { id: 68, storeName: "Kookel's", sequence: 2, latitude: 6.67, longitude: 124.68 },
      ],
    });
    const sections = [section(66), section(67), section(68)];
    const proofs = [
      proof({ id: 29, kind: "RECEIPT", pinpointId: 67 }),
      proof({ id: 30, kind: "NO_RECEIPT", pinpointId: 66, declaredTotal: 140 }),
      proof({ id: 31, kind: "NO_RECEIPT", pinpointId: 68, declaredTotal: 120 }),
    ];
    const progress = derive(multiErrand, proofs, sections);
    expect(progress.currentStatus).toBe("Delivering");
    // In Delivering status, completedSubtasks is cleared by design so delivery checklist is clean
    expect(progress.completedSubtasks).toEqual({});
    expect(progress.departedStoreIds).toEqual(expect.arrayContaining([66, 67, 68]));
  });

  it("stays in Traveling when intermediate store is done and heading to next store", () => {
    const multiErrand = errand({
      id: "err_multi",
      pinpoints: [
        { id: 10, storeName: "Store 1", sequence: 0, latitude: 6.69, longitude: 124.67 },
        { id: 11, storeName: "Store 2", sequence: 1, latitude: 6.68, longitude: 124.67 },
      ],
    });
    const sections = [section(10), section(11)];
    // Store 10 has a receipt, Store 11 does not and has not arrived
    const proofs = [proof({ id: 1, kind: "RECEIPT", pinpointId: 10 })];
    const progress = derive(multiErrand, proofs, sections);
    expect(progress.currentStatus).toBe("Traveling");
    expect(progress.departedStoreIds).toContain(10);
  });
});

