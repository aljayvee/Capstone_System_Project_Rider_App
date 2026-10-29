import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CheckCircle } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius, scaledFontSize, moderateScale } from '../../../config/theme';

import { Errand, MergedErrand } from '../../../types/rider';
import { formatEarnings } from '../../../utils/earnings';
import { HomeColors } from '../homeTheme';

interface CompletedCardProps {
  errand: MergedErrand | Errand;
  riderFirstName?: string;
  onAcceptNext: () => void;
}

export function CompletedCard({ errand, riderFirstName, onAcceptNext }: CompletedCardProps) {
  const earnings = formatEarnings(errand);
  const greetingName = riderFirstName?.trim() || 'there';

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <CheckCircle size={32} color={Colors.success} />
      </View>
      <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={1.2}>Errand delivered</Text>
      <Text style={styles.subtitle} maxFontSizeMultiplier={1.25}>Thanks, {greetingName}. The errand is complete.</Text>

      <View style={styles.earningsBox}>
        <Text style={styles.earningsLabel} maxFontSizeMultiplier={1.25}>Your earnings</Text>
        <Text style={styles.earningsValue} maxFontSizeMultiplier={1.2}>{earnings}</Text>
      </View>

      <TouchableOpacity
        style={styles.button}
        onPress={onAcceptNext}
        accessibilityRole="button"
        accessibilityLabel="Take the next errand">
        <Text style={styles.buttonText} maxFontSizeMultiplier={1.15}>Next errand</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: moderateScale(24, 0.5),
    paddingHorizontal: moderateScale(8, 0.5),
    alignItems: 'center',
  },
  iconContainer: {
    width: moderateScale(60, 0.20),
    height: moderateScale(60, 0.20),
    borderRadius: moderateScale(30, 0.20),
    backgroundColor: Colors.successBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    color: Colors.navy,
    fontSize: scaledFontSize(FontSizes.xl, 0.35),
    fontWeight: FontWeights.bold as any,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    color: Colors.textMedium,
    fontSize: scaledFontSize(FontSizes.sm, 0.35),
    lineHeight: moderateScale(22, 0.5),
    textAlign: 'center',
  },
  earningsBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
    paddingVertical: moderateScale(16, 0.5),
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: HomeColors.divider,
    alignItems: 'center',
    width: '100%',
    gap: Spacing.md,
    flexWrap: 'wrap',
  },
  earningsValue: {
    color: Colors.success,
    fontSize: scaledFontSize(FontSizes.lg, 0.35),
    fontWeight: FontWeights.bold as any,
  },
  earningsLabel: {
    color: Colors.navy,
    fontSize: scaledFontSize(FontSizes.base, 0.35),
    fontWeight: FontWeights.bold as any,
  },
  button: {
    marginTop: Spacing.lg,
    width: '100%',
    paddingVertical: moderateScale(12, 0.20),
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonText: {
    color: Colors.onPrimary,
    fontWeight: FontWeights.bold as any,
    fontSize: scaledFontSize(FontSizes.md, 0.35),
  },
});
