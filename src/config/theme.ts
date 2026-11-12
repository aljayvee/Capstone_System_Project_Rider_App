import { MobileLight, MobileDark } from "./palette";

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

export const LightColors = MobileLight;

/**
 * The same roles on a dark ground.
 *
 * Not an inversion. Saturated brand colours burn on a dark background, so the
 * inks lighten and the tinted surfaces become deep rather than pale; the
 * relationship each pair encodes is what is preserved, not the hue's lightness.
 * Riders work at night, which is when this matters and also when a wrong value
 * is most punishing.
 */
export const DarkColors: Record<keyof typeof LightColors, string> = MobileDark;

/**
 * The light palette, as a plain object.
 *
 * Components that have not yet moved to `useThemeColor()` keep importing this
 * and keep rendering in light mode. Same arrangement the CustomerApp uses, so
 * the migration can be done a screen at a time instead of in one commit.
 */
export const Colors = LightColors;
export type ThemeColors = Record<keyof typeof LightColors, string>;

export const FontFamily = {
  regular: 'Urbanist_400Regular',
  medium: 'Urbanist_500Medium',
  semibold: 'Urbanist_600SemiBold',
  bold: 'Urbanist_700Bold',
  mono: 'JetBrainsMono_500Medium',
  monoBold: 'JetBrainsMono_700Bold',
  monoExtraBold: 'JetBrainsMono_800ExtraBold',
} as const;

/**
 * Sizes in sp, calibrated to the Samsung Galaxy A04 reference baseline.
 * Material treats 16sp as body and 14sp as practical floor.
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
  sm: 8,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 30,
  xxxl: 36,
  huge: 40,
} as const;

export const BorderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  xxl: 24,
  full: 9999,
} as const;

export const Shadows = {
  // Soft card lift
  soft: {
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  // Upward-cast shadow for surfaces anchored to the bottom of the screen
  liftedUp: {
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
} as const;

/**
 * Android resolves overlapping views by `elevation`, not `zIndex`.
 * `bottomSheet` is elevated higher than `floatingControls` so that the expanded
 * errand sheet always cleanly covers the map controls and overlays.
 */
export const Elevation = {
  bottomSheet: 20,
  floatingControls: 16,
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

// Responsive Layout & Container Tokens
export {
  scale,
  verticalScale,
  moderateScale,
  moderateVerticalScale,
  scaledFontSize,
  useResponsive,
  Breakpoints,
  MAX_CONTENT_WIDTH,
  getDeviceCategory,
  getAspectRatioCategory,
  clamp,
} from '../utils/responsive';
