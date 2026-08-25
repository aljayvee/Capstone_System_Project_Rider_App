import type { Errand as DomainErrand, ErrandStatus, PabiliDetail, RiderEarnings } from "../types/rider";

// Shape returned by GET /errands/rider/:riderId (confirmed against
// server/src/repositories/errandRepository.ts's ERRAND_INCLUDE +
// errandService.ts's attachErrandNames flattening).
export interface ApiErrandPinpoint {
  id: number;
  storeName: string;
  latitude: number | string;
  longitude: number | string;
  sequence: number;
}

export interface ApiErrand {
  id: string;
  category: string;
  description: string;
  pickupAddress: string;
  deliveryAddress: string;
  deliveryLatitude: number | string | null;
  deliveryLongitude: number | string | null;
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
  customer?: { firstName?: string; lastName?: string; phone?: string; name?: string } | null;
  pabiliDetails?: PabiliDetail[];
  pinpoints?: ApiErrandPinpoint[];
  // The customer's ORIGINAL, immutable ask. Kept for audit and as a fallback for
  // errands created before the working list carried stops — never the source of
  // the rider's checklist, because it cannot show a dispatcher's corrections.
  pabiliItemRequests?: Array<{
    id: number;
    itemName: string;
    quantity: number;
    storeCategory?: string | null;
    pinpointId?: number | null;
  }>;
}

function toFiniteNumberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
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

  return {
    id: api.id,
    type: (api.category as DomainErrand["type"]) || "Pabili",
    customer: customerName,
    customerPhone: api.customer?.phone || "",
    address: api.deliveryAddress,
    deliveryLatitude: toFiniteNumberOrNull(api.deliveryLatitude),
    deliveryLongitude: toFiniteNumberOrNull(api.deliveryLongitude),
    pinpoints,
    paymentMode: "Cash on Delivery",
    status: mapApiStatusToDomain(api.status),
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
    pabiliDetails,
    // A shopping list per stop, in visit order. Falls back to undefined when
    // there are no item requests, which leaves RequestItemsPanel showing the
    // flat `details` line exactly as before.
    payload: itemsByStore.length > 0 ? itemsByStore : undefined,
    details: pabiliDetails.map((d) => `${d.itemName} x${d.quantity}`).join(" | ") || api.description,
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
  itemName: string;
  quantity: number;
  pinpointId?: number | null;
}

function groupItemsByStore(
  items: GroupableItem[],
  pinpoints: DomainErrand["pinpoints"]
): NonNullable<DomainErrand["payload"]> {
  if (items.length === 0) return [];

  const label = (item: (typeof items)[number]) =>
    item.quantity > 1 ? `${item.itemName} x${item.quantity}` : item.itemName;

  const groups: NonNullable<DomainErrand["payload"]> = [];

  // Stops first, in the order the rider will visit them.
  for (const stop of pinpoints ?? []) {
    const forStop = items.filter((i) => i.pinpointId === stop.id);
    if (forStop.length > 0) {
      // The stop id rides along so the receipt photographed here is filed
      // against this store rather than the errand at large.
      groups.push({ name: stop.storeName, items: forStop.map(label), pinpointId: stop.id });
    }
  }

  const unattached = items.filter(
    (i) => !i.pinpointId || !(pinpoints ?? []).some((p) => p.id === i.pinpointId)
  );
  if (unattached.length > 0) {
    groups.push({ name: "Other items", items: unattached.map(label), pinpointId: null });
  }

  return groups;
}
