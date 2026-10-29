import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius, scaledFontSize, moderateScale } from '../../../config/theme';
import { HomeColors } from '../homeTheme';

interface OfflineCardProps {
  hasErrand?: boolean;
  onViewRequests?: () => void;
  setShowWaybill?: (show: boolean) => void;
}

export function OfflineCard({ onViewRequests, setShowWaybill, hasErrand = true }: OfflineCardProps) {
  const handlePress = () => {
    if (setShowWaybill) setShowWaybill(true);
    if (onViewRequests) onViewRequests();
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <WifiOff size={28} color={HomeColors.accent} />
      </View>
      <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={1.2}>No connection</Text>
      <Text style={styles.description} maxFontSizeMultiplier={1.15}>
        {hasErrand
          ? 'No signal. You can still view the errand details saved on this phone.'
          : 'Reconnect to receive new errand offers from the dispatcher.'}
      </Text>
      {hasErrand && <TouchableOpacity
        style={styles.button}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel="See what to buy, saved on this phone"
      >
        <Text style={styles.buttonText} maxFontSizeMultiplier={1.15}>See what to buy</Text>
      </TouchableOpacity>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.huge,
    paddingHorizontal: moderateScale(8, 0.5),
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  iconContainer: {
    width: moderateScale(56, 0.20),
    height: moderateScale(56, 0.20),
    borderRadius: moderateScale(28, 0.20),
    backgroundColor: HomeColors.accentSurface,
    borderWidth: 1,
    borderColor: HomeColors.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    color: Colors.navy,
    fontSize: scaledFontSize(FontSizes.lg, 0.20),
    fontWeight: FontWeights.bold as any,
    marginBottom: moderateScale(12, 0.5),
  },
  description: {
    color: Colors.textGray,
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: moderateScale(22, 0.5),
    maxWidth: 320,
  },
  button: {
    width: '100%',
    maxWidth: 280,
    paddingVertical: moderateScale(12, 0.20),
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonText: {
    color: Colors.onPrimary,
    fontWeight: FontWeights.bold as any,
    fontSize: scaledFontSize(FontSizes.base, 0.20),
  },
});
