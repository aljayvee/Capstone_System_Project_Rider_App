import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius, scaledFontSize, moderateScale } from '../../../config/theme';

interface OfflineCardProps {
  onViewRequests?: () => void;
  setShowWaybill?: (show: boolean) => void;
}

export function OfflineCard({ onViewRequests, setShowWaybill }: OfflineCardProps) {
  const handlePress = () => {
    if (setShowWaybill) setShowWaybill(true);
    if (onViewRequests) onViewRequests();
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <WifiOff size={28} color={Colors.textGray} />
      </View>
      <Text style={styles.title} maxFontSizeMultiplier={1.2}>You're offline</Text>
      <Text style={styles.description} maxFontSizeMultiplier={1.15}>
        No signal. Everything you need is saved on this phone — carry on with the errand.
      </Text>
      <TouchableOpacity
        style={styles.button}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel="See what to buy, saved on this phone"
      >
        <Text style={styles.buttonText} maxFontSizeMultiplier={1.15}>See what to buy</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.huge,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  iconContainer: {
    width: moderateScale(56, 0.20),
    height: moderateScale(56, 0.20),
    borderRadius: moderateScale(28, 0.20),
    backgroundColor: Colors.bgWhite,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    color: Colors.textDark,
    fontSize: scaledFontSize(FontSizes.lg, 0.20),
    fontWeight: FontWeights.bold as any,
    marginBottom: Spacing.xs,
  },
  description: {
    color: Colors.textGray,
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 20,
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
