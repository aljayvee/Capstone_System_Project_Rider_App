import { describe, it, expect } from 'vitest';
import {
  BASE_WIDTH,
  BASE_HEIGHT,
  MAX_CONTENT_WIDTH,
  scale,
  verticalScale,
  moderateScale,
  moderateVerticalScale,
  scaledFontSize,
  getDeviceCategory,
  getAspectRatioCategory,
  clamp,
} from '../src/utils/responsive';
import { FontSizes } from '../src/config/theme';

describe('Rider Mobile App Samsung Galaxy A04 Responsive Engine', () => {
  it('has base reference dimensions calibrated to Samsung Galaxy A04 (360x800dp)', () => {
    expect(BASE_WIDTH).toBe(360);
    expect(BASE_HEIGHT).toBe(800);
    expect(MAX_CONTENT_WIDTH).toBe(580);
  });

  it('clamps values correctly within min and max boundaries', () => {
    expect(clamp(15, 10, 20)).toBe(15);
    expect(clamp(5, 10, 20)).toBe(10);
    expect(clamp(25, 10, 20)).toBe(20);
  });

  it('scales linearly on exact base width (360dp)', () => {
    expect(scale(100, 360)).toBe(100);
    expect(verticalScale(200, 800)).toBe(200);
  });

  it('scales moderately with dampening factor', () => {
    // On 360dp width, moderateScale returns exact size
    expect(moderateScale(20, 0.30, 360)).toBe(20);
    // On 412dp width, moderateScale increases subtly
    const scaled412 = moderateScale(20, 0.30, 412);
    expect(scaled412).toBeGreaterThan(20);
    expect(scaled412).toBeLessThan(25);
  });

  it('applies anti-overflow clamping to font sizes', () => {
    // Exact Samsung A04 baseline
    expect(scaledFontSize(FontSizes.base, 0.20, 360)).toBe(FontSizes.base);

    // High-density FHD+ screen (1080x2408 px -> 412dp)
    const scaledFHD = scaledFontSize(FontSizes.base, 0.20, 412);
    expect(scaledFHD).toBeLessThanOrEqual(Math.round(FontSizes.base * 1.06));

    // Compact screen (320dp)
    const scaledCompact = scaledFontSize(FontSizes.base, 0.20, 320);
    expect(scaledCompact).toBeGreaterThanOrEqual(Math.round(FontSizes.base * 0.85));
  });

  it('classifies device form factors into 5 distinct tiers', () => {
    expect(getDeviceCategory(320)).toBe('compact');
    expect(getDeviceCategory(360)).toBe('standard');
    expect(getDeviceCategory(412)).toBe('standard');
    expect(getDeviceCategory(450)).toBe('phablet');
    expect(getDeviceCategory(768)).toBe('tablet');
  });

  it('classifies aspect ratios accurately for tall displays', () => {
    // Standard 16:9 / 20:9
    expect(getAspectRatioCategory(360, 800)).toBe('tall'); // 800/360 = 2.22 (20:9 Samsung A04)
    expect(getAspectRatioCategory(375, 667)).toBe('standard'); // iPhone SE (16:9)
    expect(getAspectRatioCategory(768, 1024)).toBe('wide'); // 4:3 tablet
  });
});
