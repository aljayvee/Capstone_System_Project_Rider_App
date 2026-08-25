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

export type NavTab = "home" | "tasks" | "profile";

export const STATUS_STEPS: StatusStep[] = ["Traveling", "At Store", "Delivering", "Delivered"];

export interface StepMeta {
  label: string;
  action: string;
}

export const STEP_META: Record<StatusStep, StepMeta> = {
  Traveling: { label: "Traveling to Pickup", action: "Mark Arrived at Store" },
  "At Store": { label: "Arrived at Store", action: "Done Shopping" },
  Delivering: { label: "Delivering to Customer", action: "Mark as Delivered" },
  Delivered: { label: "Delivered!", action: "Complete" },
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
  businessShare: number;
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
  payload?: { name: string; items: string[]; pinpointId: number | null }[];
  details?: string;
}

export interface RiderProfile {
  id: string;
  name: string;
  initials: string;
  riderId: string;
  phone: string;
  email: string;
  joinDate: string;
  status: "Active" | "Inactive";
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
