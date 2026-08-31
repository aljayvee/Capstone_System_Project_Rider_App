import React from 'react';
import { ScrollView, TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius, scaledFontSize, moderateScale } from '../../../config/theme';
import type { Errand } from '../../../types/rider';
import { formatErrandId } from '../../../utils/formatErrandId';
import { formatEarnings } from '../../../utils/earnings';

interface FeeCapsuleBarProps {
  errands: Errand[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

/**
 * What each errand in hand pays, floating over the map.
 *
 * This replaces a row of grey chips that showed only errand ids, so the rider
 * had to open each one to remember which was worth what. The figure shown is
 * `riderShare` — their own take, tip included — and there is deliberately no
 * company-share line anywhere on it: the server no longer sends that field at all.
 *
 * Caps at three because that is what a rider may carry (the server enforces the
 * same number in acceptErrand), so the bar can never need to scroll far.
 */
export function FeeCapsuleBar({ errands, selectedIndex, onSelect }: FeeCapsuleBarProps) {
  if (errands.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.container}
    >
      {errands.map((errand, index) => {
        const isSelected = index === selectedIndex;
        return (
          <TouchableOpacity
            key={errand.id}
            onPress={() => onSelect(index)}
            activeOpacity={0.85}
            style={[styles.capsule, isSelected ? styles.capsuleActive : styles.capsuleInactive]}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`Errand ${formatErrandId(errand.id)}, you earn ${formatEarnings(errand)}`}
            testID={`fee-capsule-${index}`}
          >
            <Text style={[styles.id, isSelected && styles.idActive]} maxFontSizeMultiplier={1.15}>
              {formatErrandId(errand.id)}
            </Text>
            <Text style={[styles.amount, isSelected && styles.amountActive]} maxFontSizeMultiplier={1.2}>
              {formatEarnings(errand)}
            </Text>
          </TouchableOpacity>
        );
      })}
      {errands.length > 1 && (
        <View style={styles.countPill}>
          <Text style={styles.countText} maxFontSizeMultiplier={1.15}>{errands.length}/3</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // Sits over a live map, so it must not eat touches outside the capsules.
    maxHeight: 76,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  capsule: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    // Map tiles are busy and unpredictable, so every capsule carries its own
    // shadow rather than relying on contrast with whatever is underneath.
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  capsuleActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  capsuleInactive: {
    backgroundColor: Colors.bgWhite,
    borderColor: Colors.border,
  },
  id: {
    fontSize: scaledFontSize(FontSizes.xxs, 0.20),
    fontWeight: FontWeights.semibold as any,
    color: Colors.textGray,
  },
  idActive: {
    color: Colors.whiteOverlayText,
  },
  amount: {
    fontSize: scaledFontSize(FontSizes.md, 0.20),
    fontWeight: FontWeights.extrabold as any,
    color: Colors.textDark,
  },
  amountActive: {
    color: Colors.onPrimary,
  },
  countPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.navy,
    minHeight: 48,
    justifyContent: 'center',
  },
  countText: {
    color: Colors.onNavy,
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.bold as any,
  },
});

export default FeeCapsuleBar;
