import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '../../../config/theme';

import { Errand, MergedErrand } from '../../../types/rider';
import { formatPeso } from '../../../utils/format';

interface FeeBreakdownPanelProps {
  errand: MergedErrand | Errand;
}

const peso = formatPeso;

/**
 * Shows the rider how their payout was arrived at, not just the result.
 *
 * This panel used to print one figure twice — the gross delivery fee, labelled
 * once as "Base Delivery Fee" and again as "Your Earnings" — so it appeared to
 * explain the number while actually just repeating an incorrect one.
 *
 * The item line is the part that matters most. A rider handed ₱500 of company
 * cash for the shopping needs to see it named as the company's, or a large total
 * invites the assumption that some of it is theirs to keep.
 */
export function FeeBreakdownPanel({ errand }: FeeBreakdownPanelProps) {
  const earnings = errand.riderEarnings;

  if (!earnings) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Fee Breakdown</Text>
        <Text style={styles.label}>Earnings for this errand aren't available yet.</Text>
      </View>
    );
  }

  const sharePercent = Math.round(earnings.commissionRate * 100);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Fee Breakdown</Text>
      <View style={styles.rows}>
        <View style={styles.row}>
          <Text style={styles.label}>Delivery fee</Text>
          <Text style={styles.value} testID="fee-gross">{peso(earnings.deliveryFee)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Your share ({sharePercent}%)</Text>
          <Text style={styles.value} testID="fee-rider-share">
            {peso(earnings.deliveryFee * earnings.commissionRate)}
          </Text>
        </View>
        {earnings.tip > 0 && (
          <View style={styles.row}>
            <Text style={styles.label}>Tip (yours in full)</Text>
            <Text style={styles.value} testID="fee-tip">{peso(earnings.tip)}</Text>
          </View>
        )}
        <View style={styles.row}>
          <Text style={styles.label}>Company share</Text>
          <Text style={styles.value} testID="fee-business-share">{peso(earnings.businessShare)}</Text>
        </View>

        <View style={[styles.row, styles.totalRow]}>
          <Text style={styles.totalLabel}>You earn</Text>
          <Text style={styles.totalValue} testID="fee-total-earnings">{peso(earnings.riderShare)}</Text>
        </View>

        {earnings.itemCostExcluded > 0 && (
          <View style={[styles.row, styles.itemRow]}>
            <Text style={styles.itemLabel}>Items to buy — company money</Text>
            <Text style={styles.itemValue} testID="fee-item-cost">
              {peso(earnings.itemCostExcluded)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.greenBg,
    borderWidth: 1,
    borderColor: Colors.greenBorder,
    marginBottom: Spacing.md,
  },
  title: {
    color: Colors.greenDark,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold as any,
    marginBottom: Spacing.md,
  },
  rows: {
    gap: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    color: Colors.textMedium,
    fontSize: FontSizes.base,
  },
  value: {
    color: Colors.textDark,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold as any,
  },
  totalRow: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderTopColor: Colors.greenBorder,
    paddingTop: Spacing.xs,
    marginTop: Spacing.xs,
  },
  totalLabel: {
    color: Colors.greenDark,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold as any,
  },
  totalValue: {
    color: Colors.greenDark,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.extrabold as any,
  },
  // Set apart from the earnings rows on purpose: this money is not part of the
  // total above it, and must not read as though it were.
  itemRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.greenBorder,
    paddingTop: Spacing.sm,
    marginTop: Spacing.sm,
  },
  itemLabel: {
    color: Colors.textMedium,
    fontSize: FontSizes.sm,
    flexShrink: 1,
    paddingRight: Spacing.sm,
  },
  itemValue: {
    color: Colors.textMedium,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold as any,
  },
});
