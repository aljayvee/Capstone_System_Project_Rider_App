/**
 * Type definitions for the Rider Mobile App.
 * Ported from Designprototypecreation mockData.ts and RiderPortal.tsx.
 */

// ─── Status & Navigation Types ───────────────────────────────────────────────

export type StatusStep = "Traveling" | "At Store" | "Purchased" | "En Route" | "Delivered";

export type NavTab = "home" | "tasks" | "earnings" | "profile";

export const STATUS_STEPS: StatusStep[] = [
  "Traveling",
  "At Store",
  "Purchased",
  "En Route",
  "Delivered",
];

export interface StepMeta {
  label: string;
  action: string;
}

export const STEP_META: Record<StatusStep, StepMeta> = {
  Traveling: { label: "Traveling to Pickup", action: "Mark Arrived at Store" },
  "At Store": { label: "Arrived at Store", action: "Mark Items Purchased" },
  Purchased: { label: "Items Purchased", action: "Mark In Transit" },
  "En Route": { label: "In Transit to Customer", action: "Mark as Delivered" },
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
  | "En Route"
  | "Delivered"
  | "Cancelled";
export type ErrandType = "Pabili" | "Padala" | "Bills Payment";
export type PaymentMode = "Cash on Delivery" | "GCash" | "Bank Transfer";
export type MerchantStatus = "Active" | "Inactive" | "Temporarily Closed";

export interface Merchant {
  id: number;
  businessName: string;
  categories: string[];
  city: string;
  municipality: string;
  barangay: string;
  purok: string;
  street: string;
  landmark: string;
  description: string;
  operatingHours: { open: string; close: string };
  status: MerchantStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Errand {
  id: string;
  type: ErrandType;
  customer: string;
  customerPhone: string;
  address: string;
  landmark: string;
  paymentMode: PaymentMode;
  status: ErrandStatus;
  riderId?: number;
  riderName?: string;
  merchantId?: number;
  merchantName?: string;
  amount: number;
  serviceFee: number;
  commission?: number;
  surcharge?: number;
  createdAt: string;
  updatedAt: string;
  distance?: string;
  storeCount?: number;
  payload?: { name: string; items: string[] }[];
  details?: string;
}

export interface RiderEarningsPeriod {
  trips: number;
  baseFee: number;
  commission: number;
  total: number;
}

export interface RiderEarnings {
  today: RiderEarningsPeriod;
  week: RiderEarningsPeriod;
  month: RiderEarningsPeriod;
}

export interface RiderProfile {
  id: string;
  name: string;
  initials: string;
  riderId: string;
  phone: string;
  email: string;
  vehicleType: string;
  plateNumber: string;
  rating: number;
  totalTrips: number;
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

export interface Conversation {
  id: string;
  errandId: string;
  type: "customer-dispatcher" | "dispatcher-rider" | "customer-rider";
  messages: ChatMessage[];
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
