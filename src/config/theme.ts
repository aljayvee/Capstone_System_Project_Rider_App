/**
 * The Rider App's design tokens.
 *
 * Two things changed here and both were measured rather than judged by eye.
 *
 * **Names describe the job, not the colour.** The old set was literal —
 * `green`, `greenDark`, `amber`, `amberBg` — and that is why 169 hardcoded hex
 * values accumulated in files that already imported this module: a token called
 * `green` tells you nothing about whether it is the right green for the thing
 * you are building, so people wrote the value they wanted instead. The
 * vocabulary now matches the CustomerApp's (`success`, `warning`, `danger`,
 * `info`), so the two apps can be reasoned about together.
 *
 * **Values meet WCAG 2.2 AA.** Every ink here clears 4.5:1 against every
 * surface it is paired with — see `npm run audit:ui`. The greys moved most:
 * `textLight` was #9CA3AF, which reached only 2.54:1 even on pure white, and
 * it is the colour used for timestamps and hints, the text a rider squints at
 * in Philippine daylight.
 *
 * Five tokens are gone rather than renamed — `green`, `amber`, `blueBorder`,
 * `navyDark`, `notifYellow`, `notifYellowText`, `offlineGray` — because nothing
 * referenced them. They were also the source of most of the audit's "latent"
 * contrast failures: unreachable pairs the naming implied but no screen drew.
 */

export const LightColors = {
  // ─── brand ────────────────────────────────────────────────────────────────
  /** The fill. White on it is 4.83:1. */
  primary: "#DC2626",
  /** Ink on primarySurface (5.3:1) and the pressed state of a primary fill. */
  primaryStrong: "#B91C1C",
  /** Tinted background for primary-coloured panels. */
  primarySurface: "#FEE2E2",
  primaryGradientStart: "#EF4444",
  primaryGradientEnd: "#FECACA",

  // ─── the dispatcher's blue ────────────────────────────────────────────────
  navy: "#1E3A5F",
  navyLight: "#93C5FD",

  // ─── status ───────────────────────────────────────────────────────────────
  // Each is an ink that passes on both of its surfaces.
  /** 6.78:1 on successBg, 7.34:1 on successSubtle. */
  success: "#065F46",
  successBg: "#D1FAE5",
  successSubtle: "#F0FDF4",
  successBorder: "#BBF7D0",
  /** Decorative only — the online dot. Never used behind text. */
  successAccent: "#10B981",

  /** 6.37:1 on warningBg, 6.84:1 on warningSubtle. */
  warning: "#92400E",
  warningBg: "#FEF3C7",
  warningSubtle: "#FFFBEB",
  warningBorder: "#FEF3C7",

  /**
   * 5.3:1 on dangerBg. Deliberately NOT #DC2626, which reaches only 3.95:1 on
   * the same surface — the failure this palette was carrying. #DC2626 survives
   * as `primary`, where it is a fill with white on it and passes at 4.83:1.
   */
  danger: "#B91C1C",
  dangerBg: "#FEE2E2",

  info: "#1E40AF",
  infoBg: "#DBEAFE",
  infoSubtle: "#EFF6FF",

  // ─── text ─────────────────────────────────────────────────────────────────
  // Three weights of emphasis, all of which clear 4.5:1 on the darkest surface
  // this palette defines (bgGray, #F3F4F6).
  textDark: "#1F2937",
  textMedium: "#374151",
  /** Raised from #6B7280, which was 4.39:1 on bgGray. Now 6.01:1. */
  textGray: "#565D6B",
  /** Raised from #9CA3AF, which failed on every surface. Now 4.88:1 at worst. */
  textLight: "#646B76",
  textWhite: "#FFFFFF",

  // ─── surfaces ─────────────────────────────────────────────────────────────
  bgWhite: "#FFFFFF",
  bgLight: "#F9FAFB",
  bgGray: "#F3F4F6",
  bgDark: "#1F2937",
  card: "#FFFFFF",

  // ─── lines ────────────────────────────────────────────────────────────────
  border: "#E5E7EB",
  borderLight: "#F3F4F6",

  // ─── overlays ─────────────────────────────────────────────────────────────
  overlayDark: "rgba(0,0,0,0.45)",
  overlayHeavy: "rgba(0,0,0,0.60)",
  overlayBlur: "rgba(0,0,0,0.70)",
  whiteOverlay: "rgba(255,255,255,0.2)",
  whiteOverlayLight: "rgba(255,255,255,0.15)",
  whiteOverlayText: "rgba(255,255,255,0.85)",

  // ─── ink that sits ON a filled control ───────────────────────────────────
  //
  // Material 3's primary/onPrimary pairing, and it exists because one token
  // cannot do both jobs across two themes. In light mode `primary` is a dark
  // red carrying white text. In dark mode it is a LIGHT red, because it also
  // has to be legible as an accent on a dark ground — and white on a light red
  // fails. Naming the ink separately is what lets both themes be correct.
  onPrimary: "#FFFFFF",
  onSuccess: "#FFFFFF",
  onWarning: "#FFFFFF",
  onDanger: "#FFFFFF",
  onInfo: "#FFFFFF",
  onNavy: "#FFFFFF",

  // ─── the two route legs ──────────────────────────────────────────────────
  //
  // Named because they carry meaning, not decoration: orange is the run to the
  // pinned stores, and the pink-red only appears once every stop is done and
  // the rider is heading to the customer. A rider reads the colour before they
  // read anything else on that screen.
  routeToStore: "#F97316",
  routeToCustomer: "#DC2626",

  /** The presence dot in the header. Non-text, so 3:1 against its ground. */
  onlineDot: "#10B981",
  offlineDot: "#646B76",

  /**
   * A camera viewfinder's ground. Deliberately true black in BOTH themes: it
   * sits behind a live preview, where anything else shows as a coloured halo
   * around the frame.
   */
  viewfinder: "#000000",

  /** shadowColor. A token so the dark theme can soften it rather than
   *  stacking black on an already-black ground. */
  shadow: "#000000",

  offlineBg: "#374151",
} as const;

/**
 * The same roles on a dark ground.
 *
 * Not an inversion. Saturated brand colours burn on a dark background, so the
 * inks lighten and the tinted surfaces become deep rather than pale; the
 * relationship each pair encodes is what is preserved, not the hue's lightness.
 * Riders work at night, which is when this matters and also when a wrong value
 * is most punishing.
 */
export const DarkColors: Record<keyof typeof LightColors, string> = {
  primary: "#F87171",
  primaryStrong: "#FCA5A5",
  primarySurface: "#3B1519",
  primaryGradientStart: "#DC2626",
  primaryGradientEnd: "#7F1D1D",

  navy: "#93C5FD",
  navyLight: "#1E3A5F",

  success: "#6EE7B7",
  successBg: "#064E3B",
  successSubtle: "#052E24",
  successBorder: "#065F46",
  successAccent: "#34D399",

  warning: "#FCD34D",
  warningBg: "#78350F",
  warningSubtle: "#451A03",
  warningBorder: "#92400E",

  danger: "#FCA5A5",
  dangerBg: "#7F1D1D",

  info: "#93C5FD",
  infoBg: "#1E3A8A",
  infoSubtle: "#172554",

  textDark: "#F9FAFB",
  textMedium: "#E5E7EB",
  textGray: "#C3C9D4",
  textLight: "#A9B0BD",
  textWhite: "#FFFFFF",

  bgWhite: "#1F2937",
  bgLight: "#111827",
  bgGray: "#374151",
  bgDark: "#0B1220",
  card: "#1F2937",

  border: "#374151",
  borderLight: "#1F2937",

  overlayDark: "rgba(0,0,0,0.60)",
  overlayHeavy: "rgba(0,0,0,0.75)",
  overlayBlur: "rgba(0,0,0,0.85)",
  whiteOverlay: "rgba(255,255,255,0.16)",
  whiteOverlayLight: "rgba(255,255,255,0.10)",
  whiteOverlayText: "rgba(255,255,255,0.85)",

  // Dark ink, because every fill above is light in this theme. 5.31:1 at worst
  // (on `primary`), which is the tightest of the seven.
  onPrimary: "#1F2937",
  onSuccess: "#1F2937",
  onWarning: "#1F2937",
  onDanger: "#1F2937",
  onInfo: "#1F2937",
  onNavy: "#1F2937",

  routeToStore: "#FB923C",
  routeToCustomer: "#F87171",

  onlineDot: "#34D399",
  offlineDot: "#A9B0BD",

  viewfinder: "#000000",

  shadow: "#000000",

  offlineBg: "#111827",
};

/**
 * The light palette, as a plain object.
 *
 * Components that have not yet moved to `useThemeColor()` keep importing this
 * and keep rendering in light mode. Same arrangement the CustomerApp uses, so
 * the migration can be done a screen at a time instead of in one commit.
 */
export const Colors = LightColors;
export type ThemeColors = Record<keyof typeof LightColors, string>;

/**
 * Sizes in sp, raised so the app is legible on a phone rather than at desk
 * distance.
 *
 * The old scale came from a web dashboard prototype whose rem values were
 * carried across as React Native pixels: body text was 13 and labels were 10.
 * Material treats 16sp as body and 14sp as the practical floor, and this app is
 * read outdoors, in motion, in bright sun. Every step below `sm` is for
 * decoration — a badge, a caption — never for anything a rider must act on.
 */
export const FontSizes = {
  xxs: 11,
  xs: 12,
  /** Material's practical minimum. */
  sm: 14,
  /** Body. */
  base: 16,
  md: 18,
  lg: 20,
  xl: 22,
  xxl: 26,
  display: 28,
  xxxl: 32,
} as const;

export const FontWeights = {
  normal: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
  extrabold: "800" as const,
  black: "900" as const,
};

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

/**
 * Brand gradients, as tokens.
 *
 * A gradient is a design decision like any other colour, and leaving these as
 * inline arrays is how the same three-stop red ends up written slightly
 * differently in three places. Ordered light-to-dark in the direction each is
 * drawn.
 */
export const Gradients = {
  /** The header's wash, fading into the page. */
  header: [LightColors.primaryGradientStart, "#F87171", LightColors.primaryGradientEnd, LightColors.bgWhite],
  /** The login badge and primary button. */
  brand: [LightColors.primaryGradientStart, LightColors.primary, LightColors.primaryStrong],
} as const;

/** Material's minimum touch target, in dp. Referenced by controls directly. */
export const TOUCH_TARGET = 48;
