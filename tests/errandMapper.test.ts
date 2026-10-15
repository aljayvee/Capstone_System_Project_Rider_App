import { describe, expect, it } from "vitest";
import { mapApiErrandToDomain, type ApiErrand } from "../src/services/errandMapper";
import { merchantCategoryLabel } from "../src/services/merchantCategory";

/**
 * The mapper had no coverage at all, and two bugs lived in it: the payment mode
 * was a hardcoded literal that never read the API value, and the category badge
 * was fed the SERVICE type instead of the shop's.
 */
function api(overrides: Partial<ApiErrand> = {}): ApiErrand {
  return {
    id: "err_1",
    category: "Pabili",
    description: "",
    pickupAddress: "",
    deliveryAddress: "123 Somewhere St",
    deliveryLatitude: 6.68,
    deliveryLongitude: 124.66,
    estimatedCost: 500,
    deliveryFee: 60,
    tip: 0,
    totalCost: 560,
    status: "ASSIGNED",
    customerId: 1,
    riderId: 21,
    createdAt: "2026-09-06T00:00:00.000Z",
    updatedAt: "2026-09-06T00:00:00.000Z",
    ...overrides,
  };
}

const stop = (id: number, storeCategory: string | null, sequence = id) => ({
  id,
  storeName: `Store ${id}`,
  latitude: 6.68,
  longitude: 124.66,
  sequence,
  storeCategory,
});

describe("payment mode", () => {
  it("reports the mode the customer confirmed", () => {
    // The exact literal, spacing and slash included. payment_modes.name holds
    // "GCash / PayMaya", and every comparison against it is a string match, so
    // a drift belongs here rather than at a customer's door.
    const errand = mapApiErrandToDomain(
      api({ paymentSelection: { paymentMode: { name: "GCash / PayMaya" } } })
    );

    expect(errand.paymentMode).toBe("GCash / PayMaya");
  });

  it.each(["Cash on Delivery", "Bank Transfer", "Debit/Credit Card"])(
    "passes %s through unchanged",
    (name) => {
      const errand = mapApiErrandToDomain(api({ paymentSelection: { paymentMode: { name } } }));
      expect(errand.paymentMode).toBe(name);
    }
  );

  it("is null until the customer confirms, never assumed to be cash", () => {
    // The bug: this returned "Cash on Delivery" for every errand ever mapped,
    // so a GCash order reached the rider as COD while the dispatcher board
    // showed the truth. Null is the honest answer and the screen says so.
    expect(mapApiErrandToDomain(api({ paymentSelection: null })).paymentMode).toBeNull();
    expect(mapApiErrandToDomain(api()).paymentMode).toBeNull();
  });

  it("carries the server's payment plan through", () => {
    // Dropped in mapping before, which left errandGate's two holds unreachable
    // and told the rider to collect the grand total on an errand where the
    // customer had already paid half.
    const plan = {
      dueUpFront: 280,
      amountPaid: 280,
      balanceDue: 280,
      state: "AWAITING_BALANCE" as const,
      hasLedger: true,
    };

    expect(mapApiErrandToDomain(api({ paymentPlan: plan })).paymentPlan).toEqual(plan);
    expect(mapApiErrandToDomain(api()).paymentPlan).toBeNull();
  });
});

describe("service type versus merchant category", () => {
  it("keeps the service type out of the merchant category", () => {
    // "pabili" is a legitimate value for Errand.category — it is the service
    // type, which the server pins to that one literal. It is simply not the
    // name of a shop, and it was being rendered as one.
    const errand = mapApiErrandToDomain(api({ category: "pabili" }));

    expect(errand.type).toBe("Pabili");
    expect(errand.merchantCategories).toEqual([]);
  });

  it("narrows the service type instead of asserting it", () => {
    // The `as` cast this replaces laundered any string into the union, which is
    // how a lowercase column value reached the badge verbatim.
    expect(mapApiErrandToDomain(api({ category: "PADALA" })).type).toBe("Padala");
    expect(mapApiErrandToDomain(api({ category: "nonsense" })).type).toBe("Pabili");
    expect(mapApiErrandToDomain(api({ category: "" })).type).toBe("Pabili");
  });

  it("takes the categories from the pinned stops", () => {
    const errand = mapApiErrandToDomain(
      api({ pinpoints: [stop(1, "Grocery"), stop(2, "Fast Food & Restaurant")] })
    );

    expect(errand.merchantCategories).toEqual(["Grocery", "Fast Food & Restaurant"]);
  });

  it("de-duplicates and keeps visiting order", () => {
    const errand = mapApiErrandToDomain(
      api({ pinpoints: [stop(1, "Grocery"), stop(2, "Pharmacy"), stop(3, "Grocery")] })
    );

    expect(errand.merchantCategories).toEqual(["Grocery", "Pharmacy"]);
  });

  it("prefers the stops over the items", () => {
    // A stop's category is a MerchantCategory catalogue row; an item's is
    // dispatcher free text. The catalogue wins where both exist.
    const errand = mapApiErrandToDomain(
      api({
        pinpoints: [stop(1, "Pharmacy")],
        pabiliDetails: [
          {
            id: 1,
            itemName: "Biogesic",
            quantity: 1,
            unitPrice: 10,
            estimatedSubtotal: 10,
            storeCategory: "Something Else",
            pinpointId: 1,
          },
        ],
      })
    );

    expect(errand.merchantCategories).toEqual(["Pharmacy"]);
  });

  it("falls back to the items when no store is pinned yet", () => {
    // The shape NewTaskCard's no-stops branch renders, which used to name a
    // "Pabili Partner Store" that does not exist.
    const errand = mapApiErrandToDomain(
      api({
        pabiliDetails: [
          {
            id: 1,
            itemName: "Rice",
            quantity: 1,
            unitPrice: 60,
            estimatedSubtotal: 60,
            storeCategory: "Grocery",
          },
        ],
      })
    );

    expect(errand.merchantCategories).toEqual(["Grocery"]);
  });

  it("is empty for a stop pinned off the catalogue", () => {
    // Null rather than "Other" — a category the dispatcher never chose is not
    // invented for the rider to shop by. The screens omit the line entirely.
    const errand = mapApiErrandToDomain(api({ pinpoints: [stop(1, null)] }));

    expect(errand.merchantCategories).toEqual([]);
  });

  it("ignores blank and whitespace-only categories", () => {
    const errand = mapApiErrandToDomain(
      api({ pinpoints: [stop(1, "   "), stop(2, "Grocery"), stop(3, "")] })
    );

    expect(errand.merchantCategories).toEqual(["Grocery"]);
  });
});

describe("naming the shop in one line", () => {
  it("says nothing when nothing is known", () => {
    // Null so callers omit the line rather than print a guess.
    expect(merchantCategoryLabel([])).toBeNull();
    expect(merchantCategoryLabel(null)).toBeNull();
    // The offline waybill cache replays errands mapped by an older build, which
    // carry no merchantCategories at all.
    expect(merchantCategoryLabel(undefined)).toBeNull();
    expect(merchantCategoryLabel(["  "])).toBeNull();
  });

  it("names one, then two, then counts the rest", () => {
    expect(merchantCategoryLabel(["Grocery"])).toBe("Grocery");
    expect(merchantCategoryLabel(["Grocery", "Pharmacy"])).toBe("Grocery, Pharmacy");
    expect(merchantCategoryLabel(["Grocery", "Pharmacy", "Hardware"])).toBe("Grocery +2");
  });

  it("never joins with ' & '", () => {
    // The whole reason merchantCategories is a list. Merged errands already join
    // service types with " & ", and catalogue names contain "&" of their own, so
    // "Grocery & Fast Food & Restaurant" could be two categories or three.
    const label = merchantCategoryLabel(["Grocery", "Fast Food & Restaurant"]);

    expect(label).toBe("Grocery, Fast Food & Restaurant");
    expect(label).not.toMatch(/ & Fast/);
  });
});

describe("door details", () => {
  it("carries the street, landmark and notes the customer saved", () => {
    const errand = mapApiErrandToDomain(
      api({
        deliveryStreetName: "Rizal Street",
        deliveryLandmark: "Blue gate beside the chapel",
        deliveryNotes: "Call when outside",
      })
    );

    expect(errand.deliveryStreetName).toBe("Rizal Street");
    expect(errand.deliveryLandmark).toBe("Blue gate beside the chapel");
    expect(errand.deliveryNotes).toBe("Call when outside");
  });

  it("reads blank as absent, so no empty line reaches the rider", () => {
    const errand = mapApiErrandToDomain(
      api({ deliveryStreetName: "   ", deliveryLandmark: "", deliveryNotes: null })
    );

    expect(errand.deliveryStreetName).toBeNull();
    expect(errand.deliveryLandmark).toBeNull();
    expect(errand.deliveryNotes).toBeNull();
  });

  it("copes with a server too old to send them", () => {
    const errand = mapApiErrandToDomain(api());

    expect(errand.deliveryStreetName).toBeNull();
    expect(errand.deliveryLandmark).toBeNull();
    expect(errand.deliveryNotes).toBeNull();
  });
});

describe("item size", () => {
  // "5 Kilo of Chicken 2qty" reaches the server as Chicken, 5 kg, two of them.
  // The size is what tells the rider which pack to take, so every place the
  // rider reads an item has to show it.
  const detail = (overrides: Partial<NonNullable<ApiErrand["pabiliDetails"]>[number]> = {}) => ({
    id: 1,
    itemName: "Chicken",
    size: "5 kg",
    quantity: 2,
    unitPrice: 0,
    estimatedSubtotal: 0,
    pinpointId: 1,
    ...overrides,
  });

  it("puts the size in the checklist line and keeps it on the entry", () => {
    const errand = mapApiErrandToDomain(api({ pinpoints: [stop(1, "Grocery")], pabiliDetails: [detail()] }));
    const group = errand.payload?.[0];

    expect(group?.items).toEqual(["Chicken · 5 kg x2"]);
    expect(group?.itemEntries?.[0]).toMatchObject({ itemName: "Chicken", size: "5 kg", quantity: 2 });
  });

  it("shows it in the one-line summary too", () => {
    const errand = mapApiErrandToDomain(api({ pabiliDetails: [detail()] }));
    expect(errand.details).toBe("Chicken · 5 kg x2");
  });

  it("reads a server too old to send a size as no size", () => {
    const { size: _size, ...withoutSize } = detail();
    const errand = mapApiErrandToDomain(api({ pinpoints: [stop(1, "Grocery")], pabiliDetails: [withoutSize] }));
    expect(errand.payload?.[0]?.items).toEqual(["Chicken x2"]);
    expect(errand.payload?.[0]?.itemEntries?.[0]?.size).toBeNull();
  });

  it("keeps the customer's note on the checklist entry", () => {
    const errand = mapApiErrandToDomain(
      api({ pinpoints: [stop(1, "Grocery")], pabiliDetails: [detail({ itemName: "Sibuyas", size: "1/2 kg", notes: "walang bulok" })] })
    );
    expect(errand.payload?.[0]?.itemEntries?.[0]).toMatchObject({ itemName: "Sibuyas", notes: "walang bulok" });
  });

  it("does not repeat a size already folded into the name", () => {
    // Rows written while the server runs ITEM_SIZE_STORAGE=fold.
    const errand = mapApiErrandToDomain(
      api({ pabiliDetails: [detail({ itemName: "Chicken · 5 kg", size: null, quantity: 1 })] })
    );
    expect(errand.details).toBe("Chicken · 5 kg x1");
  });
});
