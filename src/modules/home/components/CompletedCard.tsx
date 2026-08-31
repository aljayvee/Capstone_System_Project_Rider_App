import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CheckCircle } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius, scaledFontSize, moderateScale } from '../../../config/theme';

import { Errand, MergedErrand } from '../../../types/rider';
import { formatEarnings } from '../../../utils/earnings';

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
        <CheckCircle size={32} color={Colors.primary} />
      </View>
      <Text style={styles.title} maxFontSizeMultiplier={1.2}>Errand delivered</Text>
      <Text style={styles.subtitle} maxFontSizeMultiplier={1.15}>Great job, {greetingName}! Payment collected.</Text>

      <View style={styles.earningsBox}>
        <Text style={styles.earningsValue} maxFontSizeMultiplier={1.2}>{earnings}</Text>
        <Text style={styles.earningsLabel} maxFontSizeMultiplier={1.15}>YOU EARNED</Text>
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
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    backgroundColor: Colors.primary,
  },
  iconContainer: {
    width: moderateScale(60, 0.20),
    height: moderateScale(60, 0.20),
    borderRadius: moderateScale(30, 0.20),
    backgroundColor: Colors.bgWhite,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    color: Colors.textWhite,
    fontSize: scaledFontSize(FontSizes.xl, 0.20),
    fontWeight: FontWeights.bold as any,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    color: Colors.whiteOverlayText,
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    textAlign: 'center',
  },
  earningsBox: {
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.bgWhite,
    alignItems: 'center',
    width: '100%',
    shadowColor: Colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 2,
  },
  earningsValue: {
    color: Colors.primary,
    fontSize: scaledFontSize(FontSizes.xxl, 0.20),
    fontWeight: FontWeights.black as any,
  },
  earningsLabel: {
    color: Colors.primaryStrong,
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.bold as any,
    letterSpacing: 0.5,
  },
  button: {
    marginTop: Spacing.lg,
    width: '100%',
    paddingVertical: moderateScale(12, 0.20),
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.bgWhite,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonText: {
    color: Colors.primary,
    fontWeight: FontWeights.bold as any,
    fontSize: scaledFontSize(FontSizes.md, 0.20),
  },
});
