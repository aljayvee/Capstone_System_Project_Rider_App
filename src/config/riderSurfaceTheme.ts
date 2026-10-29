import { Colors } from './theme';

/** Neutral Rider surfaces, using the same page background as My History. */
export const RiderSurfaceColors = {
  background: Colors.bgGray,
  surface: Colors.bgWhite,
  mutedSurface: Colors.bgLight,
  divider: Colors.border,
  accent: '#245D85',
  accentSurface: '#E9F3FA',
  accentBorder: '#537F9E',
} as const;
