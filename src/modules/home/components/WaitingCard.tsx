import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Bike, Radio } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius, scaledFontSize, moderateScale } from '../../../config/theme';
import { HomeColors } from '../homeTheme';

export function WaitingCard({ hasActiveErrand = false, isOnDuty = true }: { hasActiveErrand?: boolean; isOnDuty?: boolean }) {
  return (
    <View style={styles.container}>
      <View style={styles.radarWrapper}>
        <View style={styles.iconContainer}>
          <Bike size={30} color={HomeColors.accent} strokeWidth={2.2} />
        </View>
      </View>
      <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={1.25}>
        {hasActiveErrand ? 'Your errand is in progress' : isOnDuty ? 'Ready for next errand' : "You're off duty"}
      </Text>
      <Text style={styles.description} maxFontSizeMultiplier={1.25}>
        {hasActiveErrand
          ? 'Use Open navigation below to continue your current errand. New offers will appear here.'
          : isOnDuty
            ? 'New errands from the dispatcher will appear here. Stay within your service area.'
            : "Go online from Profile when you're ready to receive errands."}
      </Text>
      {!hasActiveErrand && isOnDuty && <View style={styles.statusPill}>
        <Radio size={12} color={Colors.success} />
        <Text style={styles.statusPillText} maxFontSizeMultiplier={1.25}>Available for dispatch</Text>
      </View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: moderateScale(32, 0.5),
    paddingHorizontal: moderateScale(8, 0.5),
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  radarWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  iconContainer: {
    width: moderateScale(60, 0.20),
    height: moderateScale(60, 0.20),
    borderRadius: BorderRadius.md,
    backgroundColor: HomeColors.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: Colors.navy,
    fontSize: scaledFontSize(FontSizes.lg, 0.35),
    fontWeight: FontWeights.bold as any,
    textAlign: 'center',
  },
  description: {
    color: Colors.textGray,
    fontSize: scaledFontSize(FontSizes.sm, 0.35),
    marginTop: moderateScale(12, 0.5),
    textAlign: 'center',
    lineHeight: moderateScale(22, 0.5),
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
