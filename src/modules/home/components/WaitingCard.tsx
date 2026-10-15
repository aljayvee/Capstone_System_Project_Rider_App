import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Bike, Radio } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius, scaledFontSize, moderateScale } from '../../../config/theme';

export function WaitingCard() {
  return (
    <View style={styles.container}>
      <View style={styles.radarWrapper}>
        <View style={styles.radarRingOuter} />
        <View style={styles.iconContainer}>
          <Bike size={28} color={Colors.primary} strokeWidth={2.2} />
        </View>
        <View style={styles.pulseDot} />
      </View>
      <Text style={styles.title} maxFontSizeMultiplier={1.25}>Ready for next errand</Text>
      <Text style={styles.description} maxFontSizeMultiplier={1.25}>
        The dispatcher will send errands when available. Keep the app open and stay in service areas.
      </Text>
      <View style={styles.statusPill}>
        <Radio size={12} color={Colors.success} />
        <Text style={styles.statusPillText} maxFontSizeMultiplier={1.25}>Listening for nearby dispatch</Text>
      </View>
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
  radarWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  radarRingOuter: {
    position: 'absolute',
    width: moderateScale(80, 0.20),
    height: moderateScale(80, 0.20),
    borderRadius: moderateScale(40, 0.20),
    borderWidth: 1.5,
    borderColor: 'rgba(246, 36, 89, 0.15)',
  },
  iconContainer: {
    width: moderateScale(60, 0.20),
    height: moderateScale(60, 0.20),
    borderRadius: moderateScale(30, 0.20),
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.success,
    borderWidth: 2,
    borderColor: Colors.bgWhite,
  },
  title: {
    color: Colors.textDark,
    fontSize: scaledFontSize(FontSizes.lg, 0.20),
    fontWeight: FontWeights.bold as any,
    textAlign: 'center',
  },
  description: {
    color: Colors.textGray,
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    marginTop: Spacing.xs,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.successSubtle,
    borderWidth: 1,
    borderColor: Colors.successBorder,
  },
  statusPillText: {
    flexShrink: 1,
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.semibold as any,
    color: Colors.success,
  },
});
