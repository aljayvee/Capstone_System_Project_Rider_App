import type {
  Errand as DomainErrand,
  ErrandStatus,
  PabiliDetail,
  PaymentPlan,
  RiderEarnings,
} from "../types/rider";
import { formatItemLabel } from "../utils/format";

/**
 * The service types the domain union allows.
 *
 * Listed so `api.category` can be NARROWED against them instead of asserted into
 * the union with `as`. That cast was laundering an arbitrary column value into
 * ErrandType, which is how a lowercase "pabili" reached a badge meant to name
 * the shop.
 */
const SERVICE_TYPES: readonly DomainErrand["type"][] = ["Pabili", "Padala", "Bills Payment"];

// Shape returned by GET /errands/rider/:riderId (confirmed against
// server/src/repositories/errandRepository.ts's ERRAND_INCLUDE +
// errandService.ts's attachErrandNames flattening).
export interface ApiErrandPinpoint {
  id: number;
  storeName: string;
  latitude: number | string;
  longitude: number | string;
  sequence: number;
  /** Flattened from the stop's category by the server's attachErrandNames. */
  storeCategory?: string | null;
  /**
   * This stop's own arrival radius, flattened from its category by
   * attachErrandNames. A supermarket's circle has to reach across its car park
   * while a carinderia's covers its whole frontage, which is why the server
   * sends one per stop rather than letting the app assume a single number.
   */
  geofenceRadiusMeters?: number | null;
  /** Set server-side from the rider's breadcrumb geofence crossings. */
  arrivedAt?: string | null;
  departedAt?: string | null;
}

export interface ApiErrand {
  id: string;
  /** Latest first, one row: who claimed the errand (ERRAND_INCLUDE on the server). */
  dispatchLogs?: Array<{ dispatcherId?: number | null; dispatcher?: { name?: string | null } | null }>;
  category: string;
  description: string;
  pickupAddress: string;
  deliveryAddress: string;
  deliveryLatitude: number | string | null;
  deliveryLongitude: number | string | null;
  /** Scalar columns on `errands`. Absent from a server older than them. */
  deliveryStreetName?: string | null;
  deliveryLandmark?: string | null;
  deliveryNotes?: string | null;
  estimatedCost: number | string;
  deliveryFee: number | string;
  tip: number | string;
  totalCost: number | string;
  // Attached by the server's attachErrandNames. Optional because slim payload
  // projections omit it; the UI shows a dash rather than inventing a figure.
  riderEarnings?: RiderEarnings;
  feeBreakdown?: DomainErrand["feeBreakdown"];
  status: "PENDING" | "ASSIGNED" | "IN_TRANSIT" | "DELIVERED" | "COMPLETED" | "CANCELLED";
  customerId: number;
  riderId: number | null;
  createdAt: string;
  updatedAt: string;
  /** Scalar columns on `errands`, sent by every errand response. */
  assignedAt?: string | null;
  acceptedAt?: string | null;
  customer?: { firstName?: string; lastName?: string; phone?: string; name?: string } | null;
  pabiliDetails?: PabiliDetail[];
  pinpoints?: ApiErrandPinpoint[];
  // The customer's ORIGINAL, immutable ask. Kept for audit and as a fallback for
  // errands created before the working list carried stops — never the source of
  // the rider's checklist, because it cannot show a dispatcher's corrections.
  pabiliItemRequests?: Array<{
    id: number;
    itemName: string;
    size?: string | null;
    notes?: string | null;
    quantity: number;
    storeCategory?: string | null;
    pinpointId?: number | null;
  }>;
  /**
   * The mode the customer confirmed. Null until they do.
   *
   * ERRAND_INCLUDE selects `paymentSelection: { paymentMode: { name } }` and
   * attachErrandNames spreads it through untouched, so this is the very same
   * field the dispatcher board reads. It was simply never declared here, so
   * nothing flagged the mapper ignoring it.
   */
  paymentSelection?: { paymentMode: { name: string } } | null;
  /** Where the money stands, derived server-side by derivePaymentPlan. Null on COD. */
  paymentPlan?: PaymentPlan | null;
  /**
   * Stamped when the rider confirms they have everything (see
   * errandService.markItemsPurchased). The backend's ErrandStatus enum keeps
   * all three pre-delivery steps as IN_TRANSIT, so this timestamp is the ONLY
   * persisted record of the Traveling/At Store -> Delivering boundary — which
   * is what makes the rider's step survive a re-login. See missionProgress.ts.
   */
  itemsPurchasedAt?: string | null;
}

function toFiniteNumberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function textOrNull(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

const API_TO_DOMAIN_STATUS: Record<ApiErrand["status"], ErrandStatus> = {
  PENDING: "Pending",
  ASSIGNED: "Assigned",
  // The three pre-delivery UI steps (Traveling/At Store/Delivering)
  // all persist as IN_TRANSIT server-side — the fine-grained step is tracked
  // locally, not derivable from this single API value. "Traveling" is used
  // as the display default when reading from the server.
  IN_TRANSIT: "Traveling",
  DELIVERED: "Delivered",
  COMPLETED: "Delivered",
  CANCELLED: "Cancelled",
};

export function mapApiStatusToDomain(status: ApiErrand["status"]): ErrandStatus {
  return API_TO_DOMAIN_STATUS[status] ?? "Pending";
}

// Fields with no server-side source (distance, landmark, merchantId) are
// simply omitted rather than faked with a placeholder value.
export function mapApiErrandToDomain(api: ApiErrand): DomainErrand {
  const customerName =
    api.customer?.name ||
    [api.customer?.firstName, api.customer?.lastName].filter(Boolean).join(" ") ||
    "Customer";
  const pabiliDetails = api.pabiliDetails ?? [];
  const pinpoints = (api.pinpoints ?? [])
    .map((p) => ({
      id: p.id,
      storeName: p.storeName,
      storeCategory: p.storeCategory ?? null,
      // The server computes a radius per stop from its merchant category and
      // sends it on every errand. Dropping it here meant radiusOf() and the
      // map circle both silently fell back to the 75 m default for every stop
      // in the system, so a supermarket and a carinderia were geofenced
      // identically — and `arrivedAt`, which is derived from that geofence, is
      // now read back by missionProgress to restore the "At Store" step.
      geofenceRadiusMeters: p.geofenceRadiusMeters ?? null,
      arrivedAt: p.arrivedAt ?? null,
      departedAt: p.departedAt ?? null,
      latitude: Number(p.latitude),
      longitude: Number(p.longitude),
      sequence: p.sequence,
    }))
    .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
    .sort((a, b) => a.sequence - b.sequence);

  // Grouped from the WORKING list, not the customer's original request.
  //
  // The dispatcher reads the customer's ask, works out that the noodles filed
  // under "Fast Food & Restaurant" are really groceries, and moves them to a
  // second stop. That correction lives only on the working list. Reading the
  // request list here showed the rider the customer's own grouping back to
  // them — two items at the fast-food stop, nothing at the grocery.
  //
  // Falls back to the request list only when the working list has no stop
  // assignments at all, which is the case for errands created before the
  // working list could carry them.
  const workingItems = api.pabiliDetails ?? [];
  const requestItems = api.pabiliItemRequests ?? [];

  const workingIsFiled = workingItems.some((i) => i.pinpointId != null);
  const requestIsFiled = requestItems.some((i) => i.pinpointId != null);

  // The request list is used only when it is filed and the working list is not
  // — the shape of an errand pinned before the working list could carry stops.
  // Everywhere else the working list wins, filed or not.
  const itemSource =
    !workingIsFiled && requestIsFiled
      ? requestItems
      : workingItems.length > 0
        ? workingItems
        : requestItems;

  const itemsByStore = groupItemsByStore(itemSource, pinpoints);

  // What KIND of shop each stop is: the merchant category the dispatcher filed
  // it under, flattened onto each pinpoint by the server's attachErrandNames.
  //
  // Stops win over items. A stop's category is a MerchantCategory catalogue row;
  // an item's is dispatcher free text. Items are read only when no stop carries a
  // category at all, which is the shape of an errand whose stores are not pinned
  // yet — exactly the case NewTaskCard's no-stops branch renders.
  const distinctNames = (values: Array<string | null | undefined>): string[] =>
    Array.from(new Set(values.map((v) => (v ?? "").trim()).filter((v) => v.length > 0)));

  const stopCategories = distinctNames(pinpoints.map((p) => p.storeCategory));
  const merchantCategories =
    stopCategories.length > 0
      ? stopCategories
      : distinctNames(itemSource.map((i) => i.storeCategory));

  return {
    id: api.id,
    // The dispatcher who claimed this errand: whom the rider's chat answers to.
    dispatcherId: api.dispatchLogs?.[0]?.dispatcherId ?? null,
    dispatcherName: api.dispatchLogs?.[0]?.dispatcher?.name ?? null,
    // The SERVICE type, and only that. `api.category` is pinned server-side to
    // the single literal "Pabili"; the `as` cast this replaces was laundering an
    // arbitrary string into the ErrandType union, which is how a lowercase
    // "pabili" reached a badge meant to name the shop. Matched
    // case-insensitively because the column carries no casing guarantee.
    type:
      SERVICE_TYPES.find(
        (t) => t.toLowerCase() === String(api.category ?? "").toLowerCase()
      ) ?? "Pabili",
    // What kind of shop the rider is walking into, from the same stop categories
    // requestSections already reads for the per-store lines.
    merchantCategories,
    customer: customerName,
    customerPhone: api.customer?.phone || "",
    address: api.deliveryAddress,
    deliveryLatitude: toFiniteNumberOrNull(api.deliveryLatitude),
    deliveryLongitude: toFiniteNumberOrNull(api.deliveryLongitude),
    // Blank is the same as absent: a rider is shown nothing rather than an
    // empty "Landmark:" line.
    deliveryStreetName: textOrNull(api.deliveryStreetName),
    deliveryLandmark: textOrNull(api.deliveryLandmark),
    deliveryNotes: textOrNull(api.deliveryNotes),
    pinpoints,
    // The mode the customer actually confirmed. This was the bare literal
    // "Cash on Delivery" — the API value was never read at all — so every errand
    // reached the rider as COD however the customer had paid.
    //
    // Null until confirmed, and shown as such rather than assumed to be cash:
    // assuming is what caused the bug. The cash step does not depend on it.
    paymentMode: api.paymentSelection?.paymentMode?.name ?? null,
    // Straight from the server, never derived here. Drives the balance the cash
    // panel shows and the two holds errandGate applies at the door — both of
    // which were unreachable for as long as this field was dropped in mapping,
    // so a downpayment errand told the rider to collect the whole bill.
    paymentPlan: api.paymentPlan ?? null,
    status: mapApiStatusToDomain(api.status),
    // The one persisted signal that separates "still shopping" from "carrying
    // the goods to the door" — the coarse status column cannot tell them apart.
    itemsPurchasedAt: api.itemsPurchasedAt ?? null,
    riderId: api.riderId ?? undefined,
    amount: Number(api.totalCost) || 0,
    // Straight from the server, never derived here. This used to read
    // `serviceFee: Number(api.deliveryFee)` — the gross fee, which five screens
    // then displayed as the rider's earnings, overstating a ₱102.90 payout as
    // ₱147. The split belongs to splitCommission on the server; the app's job is
    // to render it.
    riderEarnings: api.riderEarnings,
    // Straight from the server, never derived here — the amount the rider
    // collects at the door has to be the same figure the customer was shown.
    feeBreakdown: api.feeBreakdown,
    createdAt: api.createdAt,
    updatedAt: api.updatedAt,
    assignedAt: api.assignedAt ?? null,
    acceptedAt: api.acceptedAt ?? null,
    pabiliDetails,
    // A shopping list per stop, in visit order. Falls back to undefined when
    // there are no item requests, which leaves RequestItemsPanel showing the
    // flat `details` line exactly as before.
    payload: itemsByStore.length > 0 ? itemsByStore : undefined,
    details: pabiliDetails.map((d) => `${formatItemLabel(d.itemName, d.size)} x${d.quantity}`).join(" | ") || api.description,
  };
}

/**
 * Turns a flat item list into "what to buy at each stop".
 *
 * The rider used to get every item on one run-together line regardless of which
 * shop it came from — workable for one stop, useless for three.
 *
 * Items the server could not attach to a stop keep their own group rather than
 * being dropped or guessed onto the nearest one. That happens legitimately: a
 * customer lists items before any store is pinned, and some categories (a
 * retired one, or an off-catalogue map pin) never resolve. Showing them plainly
 * is better than a rider arriving without something the customer asked for.
 */
interface GroupableItem {
  id?: number;
  itemName: string;
  size?: string | null;
  notes?: string | null;
  quantity: number;
  fulfillmentStatus?: "PENDING" | "PURCHASED" | "OUT_OF_STOCK";
  pinpointId?: number | null;
  /** The dispatcher's free-text category, read only when no stop carries one. */
  storeCategory?: string | null;
}

function groupItemsByStore(
  items: GroupableItem[],
  pinpoints: DomainErrand["pinpoints"]
): NonNullable<DomainErrand["payload"]> {
  if (items.length === 0) return [];

  const label = (item: (typeof items)[number]) => {
    // "Chicken · 5 kg x2": the size is what tells a rider which pack to take.
    const name = formatItemLabel(item.itemName, item.size);
    return item.quantity > 1 ? `${name} x${item.quantity}` : name;
  };

  const toEntry = (item: (typeof items)[number]) => ({
    id: item.id,
    label: label(item),
    itemName: item.itemName,
    size: item.size ?? null,
    notes: item.notes ?? null,
    quantity: item.quantity,
    fulfillmentStatus:
      item.fulfillmentStatus === "PURCHASED" || item.fulfillmentStatus === "OUT_OF_STOCK"
        ? item.fulfillmentStatus
        : ("PENDING" as const),
  });

  const groups: NonNullable<DomainErrand["payload"]> = [];

  // Stops first, in the order the rider will visit them.
  for (const stop of pinpoints ?? []) {
    const forStop = items.filter((i) => i.pinpointId === stop.id);
    if (forStop.length > 0) {
      // The stop id rides along so the receipt photographed here is filed
      // against this store rather than the errand at large.
      groups.push({
        name: stop.storeName,
        items: forStop.map(label),
        itemEntries: forStop.map(toEntry),
        pinpointId: stop.id,
        storeCategory: stop.storeCategory ?? null,
      });
    }
  }

  const unattached = items.filter(
    (i) => !i.pinpointId || !(pinpoints ?? []).some((p) => p.id === i.pinpointId)
  );
  if (unattached.length > 0) {
    // No stop, so no category to name. Null rather than "Other" — a category the
    // dispatcher never chose should not be invented for the rider to shop by.
    groups.push({
      name: "Other items",
      items: unattached.map(label),
      itemEntries: unattached.map(toEntry),
      pinpointId: null,
      storeCategory: null,
    });
  }

  return groups;
}
