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
export type PaymentMode = "Cash on Delivery" | "GCash" | "Bank Transfer";

export interface PabiliDetail {
  id: number;
  itemName: string;
  quantity: number;
  unitPrice: number;
  estimatedSubtotal: number;
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
  customer: string;
  customerPhone: string;
  address: string;
  deliveryLatitude?: number | null;
  deliveryLongitude?: number | null;
  pinpoints?: ErrandPinpoint[];
  paymentMode: PaymentMode;
  status: ErrandStatus;
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
  pabiliDetails?: PabiliDetail[];
  payload?: {
    name: string;
    items: string[];
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
  id: number;
  from: ChatRole;
  text: string;
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
