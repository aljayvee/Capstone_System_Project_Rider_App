import React from 'react';
import { ScrollView, TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius, scaledFontSize, moderateScale } from '../../../config/theme';
import type { Errand } from '../../../types/rider';
import { formatErrandId } from '../../../utils/formatErrandId';
import { formatEarnings } from '../../../utils/earnings';
import { queuePositionLabel } from '../../../services/errandQueue';

interface FeeCapsuleBarProps {
  errands: Errand[];
  selectedIndex: number;
  /** Opens that errand's task in full (TaskScreen). */
  onSelect: (index: number) => void;
  /**
   * Marks the first capsule with a dot for unread dispatcher messages, while
   * the chat button (in the errand sheet's header) is out of sight.
   */
  showUnreadDot?: boolean;
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
 *
 * `errands` arrives in run order (services/errandQueue.ts), so each capsule
 * also says where it sits: "Now" for the errand in hand, then "2nd", "3rd".
 */
export function FeeCapsuleBar({ errands, selectedIndex, onSelect, showUnreadDot = false }: FeeCapsuleBarProps) {
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
        const unread = showUnreadDot && index === 0;
        return (
          <TouchableOpacity
            key={errand.id}
            onPress={() => onSelect(index)}
            activeOpacity={0.85}
            style={[styles.capsule, isSelected ? styles.capsuleActive : styles.capsuleInactive]}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`Errand ${formatErrandId(errand.id)}, ${
              index === 0 ? 'your current errand' : `${queuePositionLabel(index)} in your queue`
            }, you earn ${formatEarnings(errand)}${unread ? ', you have unread messages' : ''}`}
            accessibilityHint="Opens this errand's task in full"
            testID={`fee-capsule-${index}`}
          >
            {unread && <View style={styles.unreadDot} testID="fee-capsule-unread-dot" />}
            <Text style={[styles.id, isSelected && styles.idActive]} maxFontSizeMultiplier={1.15}>
              {queuePositionLabel(index)} · {formatErrandId(errand.id)}
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
    // In flow, not absolute, and with no height cap. Absolute, it gave the
    // layer around it no height, so the banners below were stacked as if the
    // capsules were not there; capped at 76 dp, a capsule with the system font
    // enlarged was cut off at its bottom edge.
    flexGrow: 0,
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
  // White with a navy ring, so it reads on the red capsule and the white one.
  unreadDot: {
    position: 'absolute',
    top: 4,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.textWhite,
    borderWidth: 1.5,
    borderColor: Colors.navy,
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
