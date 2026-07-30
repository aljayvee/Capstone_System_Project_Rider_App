/**
 * Theme constants for the Rider Mobile App.
 * All colors, typography, spacing, and border radii match the
 * Designprototypecreation RiderPortal.tsx reference exactly.
 */

export const Colors = {
  // Primary
  primary: "#DC2626",
  primaryGradientStart: "#EF4444",
  primaryGradientEnd: "#FECACA",
  primaryLight: "#FEE2E2",
  primaryDark: "#B91C1C",

  // Navy (Chat, Dispatcher)
  navy: "#1E3A5F",
  navyDark: "#162D4A",
  navyLight: "#93C5FD",

  // Accent
  amber: "#F59E0B",
  amberDark: "#92400E",
  amberLight: "#FEF3C7",
  amberBg: "#FFFBEB",

  // Success / Online
  green: "#4ADE80",
  greenDark: "#065F46",
  greenMedium: "#10B981",
  greenLight: "#D1FAE5",
  greenBg: "#F0FDF4",
  greenBorder: "#BBF7D0",

  // Info / Blue badges
  blue: "#1E40AF",
  blueLight: "#DBEAFE",
  blueBorder: "#BFDBFE",
  blueBg: "#EFF6FF",

  // Notification badge
  notifYellow: "#FCD34D",
  notifYellowText: "#92400E",

  // Text
  textDark: "#1F2937",
  textMedium: "#374151",
  textGray: "#6B7280",
  textLight: "#9CA3AF",
  textWhite: "#FFFFFF",

  // Backgrounds
  bgWhite: "#FFFFFF",
  bgLight: "#F9FAFB",
  bgGray: "#F3F4F6",
  bgDark: "#1F2937",

  // Borders
  border: "#E5E7EB",
  borderLight: "#F3F4F6",
  borderYellow: "#FEF3C7",

  // Overlay
  overlayDark: "rgba(0,0,0,0.45)",
  overlayHeavy: "rgba(0,0,0,0.60)",
  overlayBlur: "rgba(0,0,0,0.70)",
  whiteOverlay: "rgba(255,255,255,0.2)",
  whiteOverlayLight: "rgba(255,255,255,0.15)",
  whiteOverlayText: "rgba(255,255,255,0.85)",

  // Offline
  offlineBg: "#374151",
  offlineGray: "#4B5563",
} as const;

export const FontSizes = {
  xxs: 10,   // 0.6rem ≈ ~10px
  xs: 11,    // 0.68rem ≈ ~11px
  sm: 12,    // 0.72-0.75rem ≈ ~12px
  base: 13,  // 0.78-0.82rem ≈ ~13px
  md: 14,    // 0.85rem ≈ ~14px
  lg: 16,    // 1rem ≈ ~16px
  xl: 18,    // 1.1rem ≈ ~18px
  xxl: 22,   // 1.4rem ≈ ~22px
  xxxl: 29,  // 1.8rem ≈ ~29px
  display: 24, // 1.5rem ≈ ~24px
} as const;

export const FontWeights = {
  normal: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
  extrabold: "800" as const,
  black: "900" as const,
} as const;

export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 20,
  xxxl: 24,
  huge: 32,
} as const;

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
} as const;
