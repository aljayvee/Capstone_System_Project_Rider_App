/**
 * Base reference screen geometry calibrated to Samsung Galaxy A04 (720x1600 px).
 * Standard density-independent pixels (dp) on Android 2.0x (xhdpi): 360dp width x 800dp height.
 */
export const BASE_WIDTH = 360;
export const BASE_HEIGHT = 800;

export const Breakpoints = {
  compact: 350,  // < 350: Small budget Androids, folded outer screens, iPhone SE
  standard: 414, // 350 - 413: Samsung Galaxy A04/A14/A23/S23, iPhone 13/14/15/16, Pixel 7/8
  phablet: 600,  // 414 - 599: Galaxy Ultra, iPhone Pro Max, Note Series
  tablet: 768,   // 600+: Foldables unfolded (Z-Fold), Tablets
} as const;

/**
 * Global maximum content width for tablet and wide screens to prevent
 * excessive stretching and preserve optimal readability.
 */
export const MAX_CONTENT_WIDTH = 580;

/**
 * Safe runtime resolver for React Native dimensions.
 * Gracefully provides baseline dimensions in pure Node.js / Vitest test environments.
 */
function getActiveWindowDimensions() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RN = require('react-native');
    if (RN?.Dimensions?.get) {
      return RN.Dimensions.get('window');
    }
  } catch {
    // Node environment fallback
  }
  return { width: BASE_WIDTH, height: BASE_HEIGHT, scale: 2, fontScale: 1 };
}

/**
 * Helper to clamp a number between min and max bounds.
 */
export function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

/**
 * Linear width scale: proportional to screen width vs base canvas (360).
 */
export function scale(size: number, width?: number): number {
  const currentWidth = width ?? getActiveWindowDimensions().width;
  return (currentWidth / BASE_WIDTH) * size;
}

/**
 * Linear height scale: proportional to screen height vs base canvas (800).
 */
export function verticalScale(size: number, height?: number): number {
  const currentHeight = height ?? getActiveWindowDimensions().height;
  return (currentHeight / BASE_HEIGHT) * size;
}

/**
 * Damped moderate scale: The graphic designer standard for mobile UI.
 * Applies a gentle dampening factor (0.30) so elements scale smoothly on compact phones
 * and large phablets without extreme shrinking or ballooning.
 *
 * @param size Base size in dp / pt
 * @param factor Dampening factor (0 = no scale, 1 = full linear scale). Default 0.30.
 * @param width Optional custom screen width for testability or split views.
 */
export function moderateScale(size: number, factor = 0.30, width?: number): number {
  const currentWidth = width ?? getActiveWindowDimensions().width;
  const scaled = (currentWidth / BASE_WIDTH) * size;
  return Math.round(size + (scaled - size) * factor);
}

/**
 * Damped vertical moderate scale.
 */
export function moderateVerticalScale(size: number, factor = 0.30, height?: number): number {
  const currentHeight = height ?? getActiveWindowDimensions().height;
  const scaled = (currentHeight / BASE_HEIGHT) * size;
  return Math.round(size + (scaled - size) * factor);
}

/**
 * Scaled font size with strict anti-overflow safety clamping:
 * Calibrated against Samsung A04 (360dp width).
 * Upper cap clamped to max 1.06x base size to prevent ballooning on 1080x2408 (FHD+) screens.
 * Lower bound clamped to 0.85x base size for compact screens.
 */
export function scaledFontSize(size: number, factor = 0.20, width?: number): number {
  const scaled = moderateScale(size, factor, width);
  const minAllowed = Math.round(size * 0.85);
  const maxAllowed = Math.round(size * 1.06);
  return clamp(scaled, minAllowed, maxAllowed);
}

export type DeviceCategory = 'compact' | 'standard' | 'phablet' | 'tablet';
export type AspectRatioCategory = 'tall' | 'standard' | 'wide';

export function getDeviceCategory(width: number): DeviceCategory {
  if (width < Breakpoints.compact) return 'compact';
  if (width < Breakpoints.standard) return 'standard';
  if (width < Breakpoints.phablet) return 'phablet';
  return 'tablet';
}

export function getAspectRatioCategory(width: number, height: number): AspectRatioCategory {
  const ratio = height / Math.max(width, 1);
  if (ratio > 2.05) return 'tall'; // Z-Flip (21:9 or 22:9)
  if (ratio < 1.7) return 'wide';  // Tablets, 16:9 landscape / square foldables
  return 'standard';
}

/**
 * Responsive React Hook:
 * Dynamically tracks window dimension changes (rotation, fold/unfold, split screen)
 * and provides contextual scaling functions.
 */
export function useResponsive() {
  let width = BASE_WIDTH;
  let height = BASE_HEIGHT;
  let fontScale = 1;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RN = require('react-native');
    if (RN?.useWindowDimensions) {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const dims = RN.useWindowDimensions();
      width = dims.width;
      height = dims.height;
      fontScale = dims.fontScale ?? 1;
    }
  } catch {
    // Fallback in non-RN execution contexts
  }

  const deviceCategory = getDeviceCategory(width);
  const aspectCategory = getAspectRatioCategory(width, height);

  const isCompact = deviceCategory === 'compact';
  const isStandard = deviceCategory === 'standard';
  const isPhablet = deviceCategory === 'phablet';
  const isTablet = deviceCategory === 'tablet';
  const isTallAspect = aspectCategory === 'tall';

  // Responsive content width (constrained to MAX_CONTENT_WIDTH on tablets)
  const contentWidth = Math.min(width, MAX_CONTENT_WIDTH);

  return {
    width,
    height,
    contentWidth,
    fontScale,
    deviceCategory,
    aspectCategory,
    isCompact,
    isStandard,
    isPhablet,
    isTablet,
    isTallAspect,
    scale: (size: number) => scale(size, width),
    verticalScale: (size: number) => verticalScale(size, height),
    moderateScale: (size: number, factor = 0.30) => moderateScale(size, factor, width),
    moderateVerticalScale: (size: number, factor = 0.30) => moderateVerticalScale(size, factor, height),
    scaledFontSize: (size: number, factor = 0.20) => scaledFontSize(size, factor, width),
  };
}
