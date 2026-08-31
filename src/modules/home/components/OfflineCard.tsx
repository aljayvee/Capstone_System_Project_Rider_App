import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Navigation } from 'lucide-react-native';
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
        <Navigation size={24} color={Colors.textLight} />
      </View>
      <Text style={styles.title} maxFontSizeMultiplier={1.2}>You're offline</Text>
      <Text style={styles.description} maxFontSizeMultiplier={1.15}>No signal. Everything you need is saved on this phone — carry on with the errand.</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel="See what to buy, saved on this phone">
        <Text style={styles.buttonText} maxFontSizeMultiplier={1.15}>See what to buy</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.bgDark,
    alignItems: 'center',
    shadowColor: Colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  iconContainer: {
    width: moderateScale(48, 0.20),
    height: moderateScale(48, 0.20),
    borderRadius: moderateScale(24, 0.20),
    backgroundColor: Colors.offlineBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    color: Colors.textWhite,
    fontSize: scaledFontSize(FontSizes.md, 0.20),
    fontWeight: FontWeights.bold as any,
    marginBottom: Spacing.xs,
  },
  description: {
    color: Colors.textLight,
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 18,
  },
  button: {
    width: '100%',
    paddingVertical: moderateScale(12, 0.20),
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    shadowColor: Colors.primaryStrong,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 3,
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonText: {
    color: Colors.textWhite,
    fontWeight: FontWeights.bold as any,
    fontSize: scaledFontSize(FontSizes.md, 0.20),
  },
});
