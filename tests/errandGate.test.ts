import { describe, expect, it } from "vitest";
import { errandGate, nextAction, isCashCollected } from "../src/services/errandGate";

/**
 * The rule that decides whether a rider can move on — and, when they cannot,
 * whether the screen can tell them why.
 *
 * Extracted from HomeScreen so the map screen can offer the same action. Two
 * screens computing this separately is exactly how the last one of these bugs
 * happened: the panel counted stores while the screen counted items, and the
 * button stayed greyed out for good.
 */

const errand = (over: Record<string, any> = {}): any => ({
  id: "ERR-1",
  details: "",
  payload: [
    { name: "Jollibee", items: ["2 Chickenjoy"], pinpointId: 1 },
    { name: "Save More", items: ["1kg rice"], pinpointId: 2 },
  ],
  ...over,
});

describe("at the store", () => {
  it("blocks until every stop has a receipt", () => {
    const g = errandGate(errand(), "At Store", {});
    expect(g.canAdvance).toBe(false);
    expect(g.progress).toEqual({ done: 0, total: 2 });
  });

  it("names the shop still owing a receipt, rather than counting abstractly", () => {
    // On a three-stop errand "1 receipt left" does not tell a rider which shop
    // they are standing in front of.
    const g = errandGate(errand(), "At Store", { 0: true });
    expect(g.canAdvance).toBe(false);
    expect(g.blockedReason).toBe("Still need a receipt from Save More");
    expect(g.progress).toEqual({ done: 1, total: 2 });
  });

  it("lets the rider move on once every stop is filed", () => {
    const g = errandGate(errand(), "At Store", { 0: true, 1: true });
    expect(g.canAdvance).toBe(true);
    expect(g.blockedReason).toBeNull();
  });

  it("counts sections, not items — the bug this rule was rewritten for", () => {
    // Two stores, eleven items. The gate must ask for two receipts, not eleven.
    const many = errand({
      payload: [
        { name: "Jollibee", items: ["a", "b", "c", "d", "e"], pinpointId: 1 },
        { name: "Save More", items: ["f", "g", "h", "i", "j", "k"], pinpointId: 2 },
      ],
    });
    expect(errandGate(many, "At Store", {}).progress).toEqual({ done: 0, total: 2 });
    expect(errandGate(many, "At Store", { 0: true, 1: true }).canAdvance).toBe(true);
  });

  it("does not block an errand with nothing to buy", () => {
    const g = errandGate(errand({ payload: [], details: "" }), "At Store", {});
    expect(g.canAdvance).toBe(true);
  });
});

describe("on the way", () => {
  it("never blocks while travelling", () => {
    expect(errandGate(errand(), "Traveling", {}).canAdvance).toBe(true);
  });
});

describe("at the door", () => {
  it("blocks a cash errand until the rider says what they collected", () => {
    // Previously this was an Alert reading "Please enter the collected amount."
    // Same rule, one fewer tap, and the reason is visible in place.
    const g = errandGate(errand(), "Delivering", {}, {
      paymentMode: "Cash on Delivery",
      collectedAmount: "",
      handoverCaptured: true,
    });
    expect(g.canAdvance).toBe(false);
    expect(g.blockedReason).toBe("Photograph the payment first");
  });

  it("still asks for the figure on a mode it does not recognise", () => {
    // This asserted the opposite, against "GCash" — a string the catalogue does
    // not even hold (it is "GCash / PayMaya"). Under the old allow-list that
    // typo silently skipped the cash step; the test was encoding the bug.
    //
    // Every mode this system supports takes money at the door: COD the whole
    // bill, a non-COD errand the balance after the downpayment. So an unknown
    // mode asks, rather than assuming the rider carries nothing.
    const g = errandGate(errand(), "Delivering", {}, {
      paymentMode: "Some Renamed Mode",
      collectedAmount: "",
      handoverCaptured: true,
    });
    expect(g.canAdvance).toBe(false);
    expect(g.blockedReason).toBe("Photograph the payment first");
  });

  it("still asks for the figure when the customer has not confirmed a mode", () => {
    // paymentSelection is null until the customer chooses, and an errand can
    // reach a rider before that. Not knowing is not a reason to skip the money.
    for (const mode of [null, undefined]) {
      const g = errandGate(errand(), "Delivering", {}, {
        paymentMode: mode,
        collectedAmount: "",
        handoverCaptured: true,
      });
      expect(g.canAdvance).toBe(false);
      expect(g.blockedReason).toBe("Photograph the payment first");
    }
  });

  it("does NOT block on the handover photo", () => {
    // Deliberate. Gating on a camera is how a rider gets stranded at a door by
    // a failed lens or a denied permission — the same shape as the sari-sari
    // receipt bug, where a shop that printed nothing made an errand impossible
    // to finish. The photo is surfaced as the next thing to do, not enforced.
    //
    // The figure is supplied here so the photo is genuinely the only thing
    // missing. Without it this passed for the wrong reason: the mode was a
    // typo the old allow-list did not recognise, so the cash rule never ran.
    const g = errandGate(errand(), "Delivering", {}, {
      paymentMode: "GCash / PayMaya",
      collectedAmount: "620",
      handoverCaptured: false,
    });
    expect(g.canAdvance).toBe(true);
    expect(g.blockedReason).toBeNull();
  });

  it("still asks for the photo, as the next thing rather than a barrier", () => {
    expect(nextAction("Delivering", { handoverCaptured: false })).toBe("Take the handover photo");
    expect(nextAction("Delivering", { handoverCaptured: true })).toBeNull();
  });

  it("asks for nothing extra on the other steps", () => {
    expect(nextAction("Traveling", {})).toBeNull();
    expect(nextAction("At Store", {})).toBeNull();
  });
});

describe("what a blocked state owes the rider", () => {
  it("always gives a reason when it says no", () => {
    // A disabled button with no stated reason is a dead end: low contrast, no
    // feedback on tap, and no tooltip on a touch screen.
    const blocked = [
      errandGate(errand(), "At Store", {}),
      errandGate(errand(), "Delivering", {}, { paymentMode: "Cash on Delivery", collectedAmount: "" }),
    ];
    for (const g of blocked) {
      expect(g.canAdvance).toBe(false);
      expect(g.blockedReason, "a refusal must say what is missing").toBeTruthy();
    }
  });

  it("phrases the reason as the thing to do, not the rule being enforced", () => {
    const g = errandGate(errand(), "At Store", {});
    expect(g.blockedReason).toMatch(/^Still need/);
    expect(g.blockedReason).not.toMatch(/must|required|invalid|cannot/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// THE DOWNPAYMENT PLAN
//
// Two holds the rider can do nothing about. The server enforces both; this is
// so the rider learns why at the door instead of tapping into a bare 409 in
// front of a customer.
// ───────────────────────────────────────────────────────────────────────────

const plan = (over: Record<string, any> = {}): any => ({
  hasLedger: true,
  dueUpFront: 500,
  amountPaid: 500,
  balanceDue: 620,
  state: "AWAITING_BALANCE",
  ...over,
});

const DOWNPAYMENT = "GCash / PayMaya";

describe("goods held on the downpayment plan", () => {
  it("holds when the receipt beat what the customer agreed to", () => {
    const g = errandGate(errand(), "Delivering", {}, {
      paymentMode: DOWNPAYMENT,
      collectedAmount: "620",
      paymentPlan: plan({ state: "OVERAGE_PENDING" }),
    });

    expect(g.canAdvance).toBe(false);
    expect(g.blockedReason).toMatch(/office is sorting it/i);
  });

  it("holds when the downpayment has not been confirmed", () => {
    const g = errandGate(errand(), "Delivering", {}, {
      paymentMode: DOWNPAYMENT,
      collectedAmount: "620",
      paymentPlan: plan({ state: "AWAITING_UPFRONT", amountPaid: 0 }),
    });

    expect(g.canAdvance).toBe(false);
    expect(g.blockedReason).toMatch(/waiting for the office/i);
  });

  it("phrases both as a wait, never as something the rider forgot", () => {
    // The rider cannot confirm a customer's payment. Telling them to "collect
    // the downpayment first" would send them to argue at a door about money
    // that was never theirs to take.
    for (const state of ["OVERAGE_PENDING", "AWAITING_UPFRONT"] as const) {
      const g = errandGate(errand(), "Delivering", {}, {
        paymentMode: DOWNPAYMENT,
        collectedAmount: "620",
        paymentPlan: plan({ state }),
      });
      expect(g.blockedReason).toMatch(/waiting|office/i);
      expect(g.blockedReason).not.toMatch(/you (must|need to|should)/i);
    }
  });

  it("still asks what was collected once the holds clear", () => {
    // The rider does take money on this plan — the balance — so the cash step
    // applies exactly as it does on COD.
    const g = errandGate(errand(), "Delivering", {}, {
      paymentMode: DOWNPAYMENT,
      collectedAmount: "",
      paymentPlan: plan(),
    });

    expect(g.canAdvance).toBe(false);
    expect(g.blockedReason).toBe("Photograph the payment first");
  });

  it("lets the rider finish once the balance is in", () => {
    const g = errandGate(errand(), "Delivering", {}, {
      paymentMode: DOWNPAYMENT,
      collectedAmount: "620",
      paymentPlan: plan(),
    });

    expect(g.canAdvance).toBe(true);
    expect(g.blockedReason).toBeNull();
  });

  it("leaves a COD errand exactly as it was", () => {
    // No plan, no new behaviour: the overwhelming majority of errands must not
    // notice this feature exists.
    const g = errandGate(errand(), "Delivering", {}, {
      paymentMode: "Cash on Delivery",
      collectedAmount: "293",
    });

    expect(g.canAdvance).toBe(true);
  });
});

describe("every non-COD channel behaves the same", () => {
  // GCash and Bank Transfer both run the 50% arrangement, and on both the rider
  // collects the balance. There is no channel where they collect nothing.
  it.each(["GCash / PayMaya", "Bank Transfer"])("collects the balance on %s", (mode) => {
    const g = errandGate(errand(), "Delivering", {}, {
      paymentMode: mode,
      collectedAmount: "",
      paymentPlan: plan(),
    });

    expect(g.canAdvance).toBe(false);
    expect(g.blockedReason).toBe("Photograph the payment first");
  });

  it.each(["GCash / PayMaya", "Bank Transfer"])("holds the goods on %s until paid", (mode) => {
    const g = errandGate(errand(), "Delivering", {}, {
      paymentMode: mode,
      paymentPlan: plan({ amountPaid: 0, state: "AWAITING_UPFRONT" }),
    });

    expect(g.canAdvance).toBe(false);
    expect(g.blockedReason).toMatch(/waiting for the office/i);
  });
});

describe("who carries money to the door", () => {
  // A deny-list over an empty list, mirroring the server's riderCollectsCash.
  //
  // This was an allow-list of two literals, which is safe only while the mode is
  // a string the app controls. It is neither: it is a payment_modes.name an
  // owner can rename, and it is null until the customer confirms. Either one
  // used to hide the cash panel AND skip the settlement submit — money taken at
  // the door that nothing recorded.
  it.each(["Cash on Delivery", "GCash / PayMaya", "Bank Transfer", "Debit/Credit Card"])(
    "collects on %s",
    (mode) => {
      expect(isCashCollected(mode)).toBe(true);
    }
  );

  it("collects when the mode is unknown rather than assuming it is not needed", () => {
    expect(isCashCollected(null)).toBe(true);
    expect(isCashCollected(undefined)).toBe(true);
    expect(isCashCollected("")).toBe(true);
  });

  it("collects on a catalogue row an owner has renamed", () => {
    // The case the allow-list could not survive: the owner edits the row and the
    // rider silently stops being asked for the money they are still handed.
    expect(isCashCollected("GCash / Maya")).toBe(true);
    expect(isCashCollected("Some Renamed Mode")).toBe(true);
  });
});

describe("the half-payment, asked for mid-way", () => {
  // Every stop filed on a two-stop errand: the moment the rider used to head out.
  const allFiled = { 0: true, 1: true };
  const owed = (over: Record<string, any> = {}) =>
    plan({ state: "AWAITING_UPFRONT", amountPaid: 0, dueUpFront: 585, goodsTotal: 1170, ...over });

  it("asks for the half instead of heading to the customer", () => {
    const g = errandGate(errand(), "At Store", allFiled, {
      paymentPlan: owed({ halfPaymentRequestedAt: null }),
    });

    expect(g.canAdvance).toBe(false);
    expect(g.halfPayment).toBe("ask");
    // Nothing is wrong: asking is the next thing to do, not a block to explain.
    expect(g.blockedReason).toBeNull();
  });

  it("waits, and says so, once the rider has asked", () => {
    const g = errandGate(errand(), "At Store", allFiled, {
      paymentPlan: owed({ halfPaymentRequestedAt: "2026-09-23T08:00:00.000Z" }),
    });

    expect(g.canAdvance).toBe(false);
    expect(g.halfPayment).toBe("waiting");
    expect(g.blockedReason).toMatch(/half-payment/i);
  });

  it("lets the rider head out once the half is in", () => {
    const g = errandGate(errand(), "At Store", allFiled, {
      paymentPlan: plan({ halfPaymentRequestedAt: "2026-09-23T08:00:00.000Z" }),
    });

    expect(g.canAdvance).toBe(true);
    expect(g.halfPayment).toBeUndefined();
  });

  it("still wants the receipts first: the half is taken on them", () => {
    const g = errandGate(errand(), "At Store", { 0: true }, {
      paymentPlan: owed({ halfPaymentRequestedAt: null }),
    });

    expect(g.halfPayment).toBeUndefined();
    expect(g.blockedReason).toBe("Still need a receipt from Save More");
  });

  it("leaves cash on delivery exactly as it was", () => {
    const g = errandGate(errand(), "At Store", allFiled, { paymentPlan: null });
    expect(g.canAdvance).toBe(true);
    expect(g.halfPayment).toBeUndefined();
  });

  it("NEVER asks for half-payment at intermediate stores when hasStoresRemaining is true", () => {
    // Rider finished Store 1 (idx 0), but Store 2 still remains (hasStoresRemaining: true)
    const g = errandGate(errand(), "At Store", { 0: true }, {
      activeStoreTargetId: 1,
      hasStoresRemaining: true,
      paymentPlan: owed({ halfPaymentRequestedAt: null }),
    });

    expect(g.canAdvance).toBe(true);
    expect(g.halfPayment).toBeUndefined();
    expect(g.blockedReason).toBeNull();
  });

  it("asks for half-payment only at final store when hasStoresRemaining is false and all store receipts are filed", () => {
    // Rider finished all stores (idx 0 & 1), at final store with hasStoresRemaining: false
    const g = errandGate(errand(), "At Store", allFiled, {
      activeStoreTargetId: 2,
      hasStoresRemaining: false,
      paymentPlan: owed({ halfPaymentRequestedAt: null }),
    });

    expect(g.canAdvance).toBe(false);
    expect(g.halfPayment).toBe("ask");
    expect(g.blockedReason).toBeNull();
  });
});

describe("per-store progressive gating (Rule 4 & 5)", () => {
  it("allows advancing from active store when active store receipt is filed, even if other store receipt is missing", () => {
    // Jollibee is pinpointId 1 (idx 0), Save More is pinpointId 2 (idx 1)
    const g = errandGate(errand(), "At Store", { 0: true }, { activeStoreTargetId: 1 });
    expect(g.canAdvance).toBe(true);
    expect(g.blockedReason).toBeNull();
    expect(g.progress).toEqual({ done: 1, total: 2 });
  });

  it("blocks advancing from active store when active store receipt is missing", () => {
    const g = errandGate(errand(), "At Store", { 1: true }, { activeStoreTargetId: 1 });
    expect(g.canAdvance).toBe(false);
    expect(g.blockedReason).toBe("Still need a receipt from Jollibee");
    expect(g.progress).toEqual({ done: 1, total: 2 });
  });

  it("checks second store receipt when activeStoreTargetId is 2", () => {
    const g = errandGate(errand(), "At Store", { 0: true }, { activeStoreTargetId: 2 });
    expect(g.canAdvance).toBe(false);
    expect(g.blockedReason).toBe("Still need a receipt from Save More");
    expect(g.progress).toEqual({ done: 1, total: 2 });
  });

  it("allows advancing when second store receipt is filed", () => {
    const g = errandGate(errand(), "At Store", { 0: true, 1: true }, { activeStoreTargetId: 2 });
    expect(g.canAdvance).toBe(true);
    expect(g.blockedReason).toBeNull();
    expect(g.progress).toEqual({ done: 2, total: 2 });
  });

  it("blocks transition to delivery if hasStoresRemaining is false but not all receipts are filed", () => {
    // Active store (Save More, id: 2, idx 1) has receipt, but earlier store (Jollibee, id: 1, idx 0) was skipped/deferred and never filed
    const g = errandGate(errand(), "At Store", { 1: true }, { activeStoreTargetId: 2, hasStoresRemaining: false });
    expect(g.canAdvance).toBe(false);
    expect(g.blockedReason).toBe("Still need a receipt from Jollibee");
  });

  it("allows transition to delivery when hasStoresRemaining is false and all receipts are filed", () => {
    const g = errandGate(errand(), "At Store", { 0: true, 1: true }, { activeStoreTargetId: 2, hasStoresRemaining: false });
    expect(g.canAdvance).toBe(true);
    expect(g.blockedReason).toBeNull();
  });
});

