import { describe, expect, it } from "vitest";
import { errandGate, nextAction } from "../src/services/errandGate";

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
    expect(g.blockedReason).toBe("Say what you collected first");
  });

  it("does not block a non-cash errand on the cash figure", () => {
    const g = errandGate(errand(), "Delivering", {}, {
      paymentMode: "GCash",
      collectedAmount: "",
      handoverCaptured: true,
    });
    expect(g.canAdvance).toBe(true);
  });

  it("does NOT block on the handover photo", () => {
    // Deliberate. Gating on a camera is how a rider gets stranded at a door by
    // a failed lens or a denied permission — the same shape as the sari-sari
    // receipt bug, where a shop that printed nothing made an errand impossible
    // to finish. The photo is surfaced as the next thing to do, not enforced.
    const g = errandGate(errand(), "Delivering", {}, {
      paymentMode: "GCash",
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
