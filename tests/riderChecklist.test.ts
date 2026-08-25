import { describe, expect, it } from "vitest";
import { mapApiErrandToDomain } from "../src/services/errandMapper";
import { requestSections } from "../src/services/requestSections";
import { earningsOf, formatEarnings, totalEarnings } from "../src/utils/earnings";

/**
 * What the rider is actually shown once the dispatcher has finished with an
 * errand — the shopping list per stop, and the gate that lets them leave a shop.
 *
 * Every case here is one a real errand can produce.
 */

const PINS = [
  { id: 101, storeName: "Jollibee DT Roundball", latitude: 6.689, longitude: 124.6788, sequence: 0 },
  { id: 102, storeName: "Primark Save More", latitude: 6.6905, longitude: 124.6742, sequence: 1 },
];

const base = {
  id: "ERR-1",
  category: "Pabili",
  deliveryAddress: "Tacurong",
  deliveryLatitude: 6.69,
  deliveryLongitude: 124.675,
  status: "IN_TRANSIT",
  totalCost: 5205,
  createdAt: "",
  updatedAt: "",
  customer: { name: "Customer A" },
  pinpoints: PINS,
};

/** An item on the dispatcher's working list. */
const working = (id: number, itemName: string, quantity: number, pinpointId: number | null) => ({
  id,
  itemName,
  quantity,
  unitPrice: 0,
  estimatedSubtotal: 0,
  pinpointId,
});

/** An item on the customer's original, immutable list. */
const requested = (id: number, itemName: string, quantity: number, pinpointId: number | null) => ({
  id,
  itemName,
  quantity,
  storeCategory: "Fast Food & Restaurant",
  pinpointId,
});

describe("the shopping list the rider is given", () => {
  it("follows the dispatcher's split, not the customer's original grouping", () => {
    // The customer filed burgers AND noodles under Fast Food & Restaurant. The
    // dispatcher moved the noodles to a grocery.
    const errand = mapApiErrandToDomain({
      ...base,
      pabiliDetails: [working(1, "Burgers", 1, 101), working(2, "Noodles", 1, 102)],
      pabiliItemRequests: [requested(11, "Burgers", 1, 101), requested(12, "Noodles", 1, 101)],
    } as any);

    expect(errand.payload).toEqual([
      { name: "Jollibee DT Roundball", items: ["Burgers"], pinpointId: 101 },
      { name: "Primark Save More", items: ["Noodles"], pinpointId: 102 },
    ]);
  });

  it("shows quantities only when there is more than one", () => {
    const errand = mapApiErrandToDomain({
      ...base,
      pabiliDetails: [working(1, "Burgers", 3, 101), working(2, "Rice", 1, 101)],
      pabiliItemRequests: [],
    } as any);

    expect(errand.payload?.[0].items).toEqual(["Burgers x3", "Rice"]);
  });

  it("collects items with no stop under one honest heading", () => {
    // Nothing has been pinned yet, so nothing can be filed.
    const errand = mapApiErrandToDomain({
      ...base,
      pinpoints: [],
      pabiliDetails: [working(1, "Burgers", 1, null)],
      pabiliItemRequests: [],
    } as any);

    expect(errand.payload).toEqual([{ name: "Other items", items: ["Burgers"], pinpointId: null }]);
  });

  it("keeps an unfiled item visible beside the filed ones", () => {
    // A stale store label left one item unattached. It must not vanish.
    const errand = mapApiErrandToDomain({
      ...base,
      pabiliDetails: [working(1, "Burgers", 1, 101), working(2, "Batteries", 1, null)],
      pabiliItemRequests: [],
    } as any);

    expect(errand.payload).toEqual([
      { name: "Jollibee DT Roundball", items: ["Burgers"], pinpointId: 101 },
      { name: "Other items", items: ["Batteries"], pinpointId: null },
    ]);
  });

  it("lists stops in the order the rider will visit them", () => {
    // Items arrive newest-first from the API; the sequence decides the order.
    const errand = mapApiErrandToDomain({
      ...base,
      pabiliDetails: [working(1, "Noodles", 1, 102), working(2, "Burgers", 1, 101)],
      pabiliItemRequests: [],
    } as any);

    expect(errand.payload?.map((g) => g.name)).toEqual(["Jollibee DT Roundball", "Primark Save More"]);
  });

  it("still groups an old errand from the customer's list when the working list has no stops", () => {
    // Pinned before the working list could carry stops.
    const errand = mapApiErrandToDomain({
      ...base,
      pabiliDetails: [working(1, "Burgers", 1, null), working(2, "Noodles", 1, null)],
      pabiliItemRequests: [requested(11, "Burgers", 1, 101), requested(12, "Noodles", 1, 102)],
    } as any);

    expect(errand.payload?.map((g) => g.name)).toEqual(["Jollibee DT Roundball", "Primark Save More"]);
  });
});

describe("the gate that lets a rider leave a store", () => {
  /** The rule HomeScreen applies: every section needs a receipt. */
  const canLeave = (sections: unknown[], done: Record<number, boolean>) =>
    sections.filter((_, i) => done[i]).length === sections.length;

  it("counts stores, not items", () => {
    // Two shops, five items. The old code demanded five receipts and offered
    // two ways to give them, so this button could never be pressed.
    const errand = mapApiErrandToDomain({
      ...base,
      pabiliDetails: [
        working(1, "Burgers", 2, 101),
        working(2, "Fries", 1, 101),
        working(3, "Rice", 1, 102),
        working(4, "Oil", 1, 102),
        working(5, "Eggs", 12, 102),
      ],
      pabiliItemRequests: [],
    } as any);

    const sections = requestSections(errand);
    expect(sections).toHaveLength(2);
    expect(canLeave(sections, {})).toBe(false);
    expect(canLeave(sections, { 0: true })).toBe(false);
    expect(canLeave(sections, { 0: true, 1: true })).toBe(true);
  });

  it("files each receipt against the stop it was taken at", () => {
    const errand = mapApiErrandToDomain({
      ...base,
      pabiliDetails: [working(1, "Burgers", 1, 101), working(2, "Rice", 1, 102)],
      pabiliItemRequests: [],
    } as any);

    expect(requestSections(errand).map((s) => s.pinpointId)).toEqual([101, 102]);
  });

  it("needs one receipt for a single-stop errand", () => {
    const errand = mapApiErrandToDomain({
      ...base,
      pinpoints: [PINS[0]],
      pabiliDetails: [working(1, "Burgers", 1, 101)],
      pabiliItemRequests: [],
    } as any);

    const sections = requestSections(errand);
    expect(sections).toHaveLength(1);
    expect(canLeave(sections, { 0: true })).toBe(true);
  });

  it("falls back to the flat list for an errand with no itemised requests", () => {
    const sections = requestSections({
      id: "ERR-2",
      details: "(Pabili) Coke 1.5L; Bread | (Padala) Documents to Isulan",
    } as any);

    expect(sections).toHaveLength(2);
    expect(sections.map((s) => s.name)).toEqual(["Pabili", "Padala"]);
    expect(sections.every((s) => s.pinpointId === null)).toBe(true);
  });

  it("asks for nothing when there is nothing to buy", () => {
    expect(requestSections(null)).toEqual([]);
    expect(requestSections({ id: "ERR-3" } as any)).toEqual([]);
  });
});

describe("what the rider is told they will earn", () => {
  it("reports the server's figure, never the gross fee", () => {
    const errand = mapApiErrandToDomain({
      ...base,
      deliveryFee: 205,
      riderEarnings: { riderShare: 143.5, businessShare: 61.5, deliveryFee: 205, tip: 0, commissionRate: 0.7, itemCostExcluded: 5000, isFinal: false },
      pabiliDetails: [],
      pabiliItemRequests: [],
    } as any);

    expect(earningsOf(errand)).toBe(143.5);
    expect(formatEarnings(errand)).toContain("143.50");
  });

  it("shows a dash rather than inventing a number when the server sent none", () => {
    // This used to default to 50, promising a payout nobody had calculated.
    const errand = mapApiErrandToDomain({
      ...base,
      deliveryFee: 205,
      pabiliDetails: [],
      pabiliItemRequests: [],
    } as any);

    expect(earningsOf(errand)).toBeNull();
    expect(formatEarnings(errand)).toBe("—");
  });

  it("adds up a stacked run", () => {
    const one = { riderEarnings: { riderShare: 143.5 } } as any;
    const two = { riderEarnings: { riderShare: 70 } } as any;
    expect(totalEarnings([one, two])).toBe(213.5);
  });

  it("ignores errands with no figure when totalling", () => {
    const one = { riderEarnings: { riderShare: 143.5 } } as any;
    const unknown = {} as any;
    expect(totalEarnings([one, unknown])).toBe(143.5);
  });
});
