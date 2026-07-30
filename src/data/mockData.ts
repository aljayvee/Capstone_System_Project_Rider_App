/**
 * Mock data for the Rider Mobile App.
 * Ported from Designprototypecreation/src/app/components/mockData.ts.
 * Only includes data relevant to the Rider Portal experience.
 */

import { Errand, Merchant, RiderEarnings, RiderProfile, Conversation } from "../types/rider";

// ─── Rider Profile ───────────────────────────────────────────────────────────

export const riderProfile: RiderProfile = {
  id: "3",
  name: "Al-Dhen Musali",
  initials: "AM",
  riderId: "RDR-001",
  phone: "09391234567",
  email: "ad.musali@company.ph",
  vehicleType: "Motorcycle",
  plateNumber: "ABC-1234",
  rating: 4.8,
  totalTrips: 248,
  joinDate: "January 15, 2024",
  status: "Active",
};

// ─── Current Errand (fallback when no mission is actively dispatched) ────────

export const riderCurrentErrand: Errand = {
  id: "SGO-002",
  type: "Padala",
  customer: "Jiane Gamboa",
  customerPhone: "09501234567",
  address: "Maharlika Highway, Brgy Calean",
  landmark: "Near SM Sultan Kudarat",
  paymentMode: "GCash",
  status: "Assigned",
  riderId: 1,
  riderName: "Al-Dhen Musali",
  amount: 120,
  serviceFee: 35,
  createdAt: "10:30 AM",
  updatedAt: "10:45 AM",
  distance: "1.8 km",
};

// ─── Rider Earnings ──────────────────────────────────────────────────────────

export const riderEarnings: RiderEarnings = {
  today: { trips: 5, baseFee: 235, commission: 50, total: 285 },
  week: { trips: 32, baseFee: 1480, commission: 320, total: 1800 },
  month: { trips: 128, baseFee: 5920, commission: 1280, total: 7200 },
};

// ─── Errands List (for task history) ─────────────────────────────────────────

export const errands: Errand[] = [
  {
    id: "SGO-001",
    type: "Pabili",
    customer: "Jiane Gamboa",
    customerPhone: "09501234567",
    address: "Maharlika Highway, Brgy Calean",
    landmark: "Near SM Sultan Kudarat",
    paymentMode: "Cash on Delivery",
    status: "Delivered",
    amount: 850,
    serviceFee: 78,
    commission: 50,
    createdAt: "10:45 AM",
    updatedAt: "10:55 AM",
    distance: "2.5 km",
    storeCount: 1,
  },
  {
    id: "SGO-002",
    type: "Padala",
    customer: "Jiane Gamboa",
    customerPhone: "09501234567",
    address: "Maharlika Highway, Brgy Calean",
    landmark: "Near SM Sultan Kudarat",
    paymentMode: "GCash",
    status: "Assigned",
    riderId: 1,
    riderName: "Al-Dhen Musali",
    amount: 120,
    serviceFee: 74,
    createdAt: "10:30 AM",
    updatedAt: "10:45 AM",
    distance: "1.8 km",
  },
  {
    id: "SGO-004",
    type: "Bills Payment",
    customer: "Ben Navarro",
    customerPhone: "09504567890",
    address: "Brgy Edsa, Tacurong",
    landmark: "Near BDO ATM",
    paymentMode: "Cash on Delivery",
    status: "Delivered",
    amount: 2500,
    serviceFee: 81,
    createdAt: "11:05 AM",
    updatedAt: "11:05 AM",
    distance: "3.1 km",
  },
  {
    id: "SGO-006",
    type: "Padala",
    customer: "Jun Apostol",
    customerPhone: "09506789012",
    address: "Brgy New Isabela",
    landmark: "Red roof near school",
    paymentMode: "Cash on Delivery",
    status: "Delivered",
    riderId: 3,
    riderName: "Jose Dela Cruz",
    amount: 200,
    serviceFee: 75,
    createdAt: "09:00 AM",
    updatedAt: "09:45 AM",
    distance: "2.0 km",
  },
  {
    id: "SGO-008",
    type: "Bills Payment",
    customer: "Leo Villarin",
    customerPhone: "09508901234",
    address: "Brgy Calean, Tacurong",
    landmark: "Green fence near water refill",
    paymentMode: "Cash on Delivery",
    status: "Delivered",
    riderId: 6,
    riderName: "Ramon Torres",
    amount: 1800,
    serviceFee: 73,
    createdAt: "08:30 AM",
    updatedAt: "09:15 AM",
    distance: "1.5 km",
  },
];

// ─── Merchants ───────────────────────────────────────────────────────────────

export const merchants: Merchant[] = [
  {
    id: 1,
    businessName: "Aling Rosa's Sari-Sari Store",
    categories: ["Retail Store"],
    city: "Tacurong City",
    municipality: "Tacurong",
    barangay: "Brgy. Calean",
    purok: "Purok 3",
    street: "Maharlika Highway",
    landmark: "Near SM Sultan Kudarat",
    description: "General merchandise store.",
    operatingHours: { open: "06:00", close: "21:00" },
    status: "Active",
    createdAt: "2026-01-10",
    updatedAt: "2026-04-07",
  },
  {
    id: 2,
    businessName: "BDO / Bayad Center Tacurong",
    categories: ["Remittance", "Banks"],
    city: "Tacurong City",
    municipality: "Tacurong",
    barangay: "Brgy. Edsa",
    purok: "Purok 1",
    street: "National Highway",
    landmark: "Near BDO ATM",
    description: "Authorized bills payment center.",
    operatingHours: { open: "08:00", close: "17:00" },
    status: "Active",
    createdAt: "2026-01-15",
    updatedAt: "2026-03-20",
  },
  {
    id: 3,
    businessName: "Rose Pharmacy Isulan Branch",
    categories: ["Pharmacy"],
    city: "Isulan",
    municipality: "Isulan",
    barangay: "Brgy. Tina",
    purok: "Purok 2",
    street: "Quezon Ave.",
    landmark: "Corner shop near church",
    description: "Full-service pharmacy.",
    operatingHours: { open: "07:00", close: "22:00" },
    status: "Active",
    createdAt: "2026-01-20",
    updatedAt: "2026-02-14",
  },
];

// ─── Conversations (empty initial, populated dynamically) ────────────────────

export const conversations: Conversation[] = [];
