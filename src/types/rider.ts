/**
 * Type definitions for the Rider Mobile App.
 */

// ─── Status & Navigation Types ───────────────────────────────────────────────

/**
 * The rider's five steps became four.
 *
 * "Items Purchased" and "In Transit" were two taps for one event: the shopping
 * is finished, therefore the rider is going to the customer. Nothing happened
 * between them that the rider had to decide, and the second tap only ever
 * confirmed what the first had already made true.
 */
export type StatusStep = "Traveling" | "At Store" | "Delivering" | "Delivered";

export type NavTab = "home" | "task" | "history" | "profile";

export const STATUS_STEPS: StatusStep[] = ["Traveling", "At Store", "Delivering", "Delivered"];

export interface StepMeta {
  label: string;
  action: string;
}

export const STEP_META: Record<StatusStep, StepMeta> = {
  Traveling: { label: "On the way to the store", action: "I've arrived" },
  "At Store": { label: "At the store", action: "I've finished shopping" },
  Delivering: { label: "On the way to the customer", action: "I've handed it over" },
  Delivered: { label: "Delivered", action: "Finish" },
};

// ─── Errand & Business Types ─────────────────────────────────────────────────

export type RiderStatus = "Available" | "On Errand" | "Offline";
export type ErrandStatus =
  | "Pending"
  | "Assigned"
  | "Traveling"
  | "At Store"
  | "Purchased"
  | "In Route"
  | "Delivered"
  | "Cancelled";
export type ErrandType = "Pabili" | "Padala" | "Bills Payment";
/**
 * The literals the server's PaymentMode catalogue actually holds.
 *
 * Copied from `payment_modes.name` exactly, because every comparison against
 * these is a string match. This union said "GCash" while the catalogue said
 * "GCash / PayMaya" — harmless only for as long as that mode stayed inactive,
 * and silently wrong the moment it was switched on: isCashCollected would have
 * missed it and the rider would have been shown no amount to collect.
 *
 * A non-COD errand changes what the rider does: the customer has already paid
 * half through the company's Facebook Page, so the figure to collect at the door
 * is the BALANCE, not the total. See paymentPlan below and CashCollectionInput.
 */
export type PaymentMode =
  | "Cash on Delivery"
  | "GCash / PayMaya"
  | "Bank Transfer"
  | "Debit/Credit Card";

/**
 * The channels settled half up front, balance at the door.
 *
 * There was briefly a fifth catalogue entry called "Non-COD — 50% Downpayment",
 * on the mistaken reading that the downpayment was a payment METHOD. It is the
 * ARRANGEMENT these two channels run on — nobody hands money to "50%
 * downpayment" — and it has been removed.
 */
export const NON_COD_MODES: PaymentMode[] = ["GCash / PayMaya", "Bank Transfer"];

/**
 * Where this errand's money stands, straight from the server.
 *
 * The rider is never asked to work any of it out. `balanceDue` is the one figure
 * they collect, and `state` is the one thing that decides whether they may hand
 * the goods over at all.
 */
export interface PaymentPlan {
  /** Half the goods: half of what the rider actually paid, asked for mid-way. */
  dueUpFront: number;
  /** The goods figure the half is taken on: the rider's own receipts. */
  goodsTotal?: number;
  /**
   * When this rider, holding every item, asked for the half. Null until then.
   * Before it the rider has to ask; after it they wait for the customer.
   */
  halfPaymentRequestedAt?: string | null;
  amountPaid: number;
  /** What the rider collects at the door. */
  balanceDue: number;
  state:
    | "AWAITING_UPFRONT"
    | "OVERAGE_PENDING"
    | "AWAITING_BALANCE"
    | "SETTLED"
    | "REFUNDED"
    | "CANCELLED";
  /** False on COD, where there is no ledger at all. */
  hasLedger: boolean;
}

export type ItemFulfillmentStatus = "PENDING" | "PURCHASED" | "OUT_OF_STOCK";

export interface ErrandItemEntry {
  id?: number;
  label: string;
  itemName: string;
  /** How big one of them is ("5 kg"); `label` already includes it. */
  size?: string | null;
  /** What the customer asked the rider to mind about it ("walang bulok"). */
  notes?: string | null;
  quantity: number;
  fulfillmentStatus: ItemFulfillmentStatus;
}

export interface PabiliDetail {
  id: number;
  itemName: string;
  /** How big one of them is ("5 kg"). Show it with formatItemLabel. */
  size?: string | null;
  /** What the customer asked the rider to mind about it. */
  notes?: string | null;
  quantity: number;
  unitPrice: number;
  estimatedSubtotal: number;
  fulfillmentStatus?: ItemFulfillmentStatus;
  /** The store category this item is bought under, as the dispatcher filed it. */
  storeCategory?: string | null;
  /** Which pinned stop it is bought at. Null until the dispatcher pins stores. */
  pinpointId?: number | null;
}

export interface ErrandPinpoint {
  id: number;
  storeName: string;
  /**
   * How close the rider must get for this stop to count as reached. Sent per
   * stop by the server, resolved from the store's category — a supermarket's
   * car park is further from its pin than a carinderia's whole frontage.
   */
  geofenceRadiusMeters?: number | null;
  /**
   * The merchant category the dispatcher filed this stop under, flattened by the
   * server from the stop's category row. Null for a stop pinned off the
   * catalogue, which renders as no line rather than as a guess.
   */
  storeCategory?: string | null;
  arrivedAt?: string | null;
  departedAt?: string | null;
  latitude: number;
  longitude: number;
  sequence: number;
}

/**
 * What one errand pays its rider. Built server-side by splitCommission so the
 * app never derives a payout figure itself.
 */
export interface RiderEarnings {
  /** The headline figure: (deliveryFee x rate) + the whole tip. */
  riderShare: number;
  /**
   * The company's cut is deliberately absent — the server stopped sending it
   * (see server/src/services/patterns/riderEarnings.ts). It was rendered to
   * riders as a "Company share" row, which put the business's margin on the
   * screen of every person it employs on every errand they run.
   */
  /** The gross fee the split was taken from. */
  deliveryFee: number;
  tip: number;
  commissionRate: number;
  /** Company money the rider carries for the goods. Earns nobody anything. */
  itemCostExcluded: number;
  /** True once read from a recorded payout rather than projected. */
  isFinal: boolean;
}

export interface Errand {
  id: string;
  type: ErrandType;
  /** The dispatcher who claimed this errand. Null on payloads without dispatch logs. */
  dispatcherId?: number | null;
  dispatcherName?: string | null;
  customer: string;
  /**
   * The customer's account id. What tells two errands apart as the same
   * customer's (errandQueue.deliveryHolds); a name can be shared. Null when the
   * payload did not carry it.
   */
  customerId?: number | null;
  customerPhone: string;
  address: string;
  deliveryLatitude?: number | null;
  deliveryLongitude?: number | null;
  /**
   * What the customer saved for the door: a street name, a landmark, and notes
   * for the rider. Copied onto the errand when it was placed, so they are the
   * customer's words for THIS delivery. Null when left blank, and on errands
   * placed before the app asked for them.
   */
  deliveryStreetName?: string | null;
  deliveryLandmark?: string | null;
  deliveryNotes?: string | null;
  pinpoints?: ErrandPinpoint[];
  /**
   * The mode the customer confirmed, exactly as `payment_modes.name` holds it.
   *
   * Typed `string`, not the PaymentMode union: the catalogue is an owner-editable
   * table, and a renamed row must still reach the rider's badge verbatim rather
   * than be laundered into a literal it no longer matches. PaymentMode names the
   * values BEHAVIOUR keys off; this is what gets DISPLAYED.
   *
   * Null until the customer confirms — paymentSelectionService refuses the
   * choice until the dispatcher sets paymentEnabledAt, and an errand can reach a
   * rider before either happens. Shown as "not confirmed" rather than assumed to
   * be cash: this field was hardcoded to "Cash on Delivery" in the mapper, so a
   * GCash errand reached the rider as COD while the dispatcher board showed the
   * truth. The cash step does not depend on knowing — see isCashCollected.
   */
  paymentMode: string | null;
  /** Where this errand's money stands, server-derived. Null on COD. */
  paymentPlan?: PaymentPlan | null;
  /**
   * The merchant categories this errand's stores are filed under, in visiting
   * order, de-duplicated. "Grocery", "Pharmacy", "Fast Food & Restaurant".
   *
   * NOT `type`. `type` is the SERVICE type, which the server pins to the single
   * literal "Pabili" (ERRAND_CATEGORIES has cardinality one), so it tells a rider
   * nothing about the shop — and it was being rendered where the shop's category
   * belonged, which is how a badge came to read "pabili".
   *
   * A list rather than a joined label because merged errands join `type` with
   * " & " and catalogue names contain "&" of their own: "Grocery" plus "Fast Food
   * & Restaurant" would join to a string nothing can read back. Presentation
   * lives in merchantCategoryLabel, in one place.
   *
   * Empty when nothing is known — a stop pinned off the catalogue, or no store
   * pinned yet — and rendered as no line rather than a guess, the same rule
   * requestSections already applies per stop.
   */
  merchantCategories: string[];
  status: ErrandStatus;
  /**
   * When the rider confirmed they had everything, or null while they still do
   * not. The backend keeps Traveling, At Store and Delivering all as a single
   * IN_TRANSIT status, so `status` alone cannot say which of the three an
   * errand is on; this timestamp is what makes that step survive a re-login.
   * Read by missionProgress.deriveErrandProgress, and by the customer app's own
   * stepper, so both apps change at the same instant.
   */
  itemsPurchasedAt?: string | null;
  riderId?: number;
  riderName?: string;
  /** What the customer pays in total. Not the rider's, and not earnings. */
  amount: number;

  /**
   * What this errand pays the rider, straight from the server.
   *
   * Replaces `serviceFee`, which was mapped from `deliveryFee` — the GROSS fee —
   * and rendered as "GUARANTEED EARNINGS". On a ₱147 fee the rider was promised
   * ₱147 and received ₱102.90. The old field was typed `serviceFee: number`,
   * which read as authoritative while meaning something else entirely, so it is
   * removed rather than left to be picked up again. `commission` and `surcharge`
   * went with it: both were declared and never populated.
   */
  riderEarnings?: RiderEarnings;
  /**
   * What the customer pays, itemised — built server-side by the same
   * feeBreakdown every other surface renders. The rider needs it to show the
   * amount due at the door without deriving a figure of their own.
   */
  feeBreakdown?: {
    fees: {
      baseFee: number;
      distanceFee: number;
      multiStoreFee: number;
      groceryFee: number;
      nonCodFee: number;
      subtotal: number;
    };
    itemsSubtotal: number;
    tip: number;
    grandTotal: number;
    isFinal: boolean;
  };
  createdAt: string;
  updatedAt: string;
  /**
   * When the dispatcher offered it to this rider, and when they said yes. What
   * orders the rider's queue (services/errandQueue.ts): first accepted, first
   * run. createdAt cannot do that job, since an errand created earlier can be
   * assigned later.
   */
  assignedAt?: string | null;
  acceptedAt?: string | null;
  pabiliDetails?: PabiliDetail[];
  payload?: {
    name: string;
    items: string[];
    itemEntries?: ErrandItemEntry[];
    pinpointId: number | null;
    /** The stop's merchant category, shown between the store name and its items. */
    storeCategory: string | null;
  }[];
  details?: string;
}

export interface RiderProfile {
  id: string;
  name: string;
  /** Held separately from `name` so Edit Account can round-trip them unchanged. */
  firstName: string;
  lastName: string;
  initials: string;
  riderId: string;
  phone: string;
  email: string;
  joinDate: string;
  status: "Active" | "Inactive";
  /**
   * When the avatar last changed, or null if there is none. A timestamp rather
   * than the image: it tells the app whether to fetch the bytes at all, and
   * doubles as the cache key when the rider replaces their photo.
   */
  photoUpdatedAt?: string | null;
}

// ─── Messaging Types ─────────────────────────────────────────────────────────

export type ChatRole = "customer" | "dispatcher" | "rider";

export interface ChatMessage {
  id: number | string;
  from: ChatRole;
  text: string;
  imageUrl?: string;
  timestamp: string;
}

// ─── Decline Log ─────────────────────────────────────────────────────────────

export interface DeclineLog {
  id: string;
  errandId: string;
  riderId: number;
  riderName: string;
  reason: string;
  timestamp: string;
}

// ─── Merged Active Mission (computed from activeMissions array) ──────────────

export interface MergedErrand extends Omit<Errand, "type"> {
  type: string; // Can be combined e.g. "Pabili & Padala"
}

// ─── Non-blocking feedback ───────────────────────────────────────────────────

/**
 * A message shown without stopping the rider.
 *
 * Replaces the Alert.alert dialogs that fired on SUCCESS. A modal costs a tap,
 * and a rider dismissing one is a rider taking a hand off the handlebars to be
 * told something that already happened. Failures and real questions keep their
 * dialogs — those need to interrupt.
 */
export type BannerTone = "success" | "info" | "warning";

export interface RiderBanner {
  /** Distinct per showing, so a repeat of the same text still re-animates. */
  id: number;
  tone: BannerTone;
  text: string;
}

/** Long enough to read at a glance, short enough not to sit over the screen. */
export const BANNER_DURATION_MS = 4000;
