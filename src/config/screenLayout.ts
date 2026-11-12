import { StyleSheet } from 'react-native';
import { Colors, FontFamily, FontSizes, FontWeights, MAX_CONTENT_WIDTH, moderateScale, scaledFontSize } from './theme';

// Screens own their safe-area edges. Tab screens let the navigator reserve the
// bottom inset; stack screens reserve it once at their SafeAreaView boundary.
export const ScreenSpacing = {
  horizontal: Math.min(24, moderateScale(20, 0.5)),
  top: Math.min(16, moderateScale(12, 0.5)),
  bottom: Math.min(32, moderateScale(24, 0.5)),
  section: Math.min(32, moderateScale(24, 0.5)),
  dock: Math.min(16, moderateScale(12, 0.5)),
};

export const ScreenLayout = StyleSheet.create({
  frame: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  },
  content: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: ScreenSpacing.horizontal,
    paddingTop: ScreenSpacing.top,
    paddingBottom: ScreenSpacing.bottom,
  },
  header: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 64,
    paddingHorizontal: ScreenSpacing.horizontal,
    paddingVertical: 8,
    backgroundColor: Colors.bgWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    flex: 1,
    fontFamily: FontFamily.bold,
    fontSize: scaledFontSize(FontSizes.lg, 0.35),
    fontWeight: FontWeights.bold,
    color: Colors.textDark,
    textAlign: 'center',
  },
  pageTitle: {
    fontFamily: FontFamily.bold,
    fontSize: scaledFontSize(FontSizes.xxl, 0.35),
    fontWeight: FontWeights.bold,
    color: Colors.textDark,
  },
  actionDock: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    flexShrink: 0,
    paddingHorizontal: ScreenSpacing.horizontal,
    paddingVertical: ScreenSpacing.dock,
    backgroundColor: Colors.bgWhite,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    gap: 8,
  },
  primaryButton: {
    minHeight: Math.max(52, Math.min(60, moderateScale(54, 0.5))),
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButton: {
    minWidth: 48,
    minHeight: 48,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
