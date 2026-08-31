import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius, FontFamily } from '../config/theme';

import { Errand, MergedErrand } from '../types/rider';
import { formatPeso } from '../utils/format';

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
 *
 * There is no "Company share" row. It used to sit directly above the rider's own
 * total, which put the business's margin on the screen of every person it employs,
 * on every errand they run, next to the smaller number they take home. The field
 * is gone from the payload as well (server/src/services/patterns/riderEarnings.ts),
 * so this is not a hidden row — there is nothing to hide.
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
    backgroundColor: Colors.successSubtle,
    borderWidth: 1,
    borderColor: Colors.successBorder,
    marginBottom: Spacing.md,
  },
  title: {
    fontFamily: FontFamily.bold,
    color: Colors.success,
    fontSize: FontSizes.base,
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
    fontFamily: FontFamily.regular,
    color: Colors.textMedium,
    fontSize: FontSizes.base,
  },
  value: {
    fontFamily: FontFamily.mono,
    color: Colors.textDark,
    fontSize: FontSizes.base,
  },
  totalRow: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderTopColor: Colors.successBorder,
    paddingTop: Spacing.xs,
    marginTop: Spacing.xs,
  },
  totalLabel: {
    fontFamily: FontFamily.bold,
    color: Colors.success,
    fontSize: FontSizes.md,
  },
  totalValue: {
    fontFamily: FontFamily.monoBold,
    color: Colors.success,
    fontSize: FontSizes.md,
  },
  // Set apart from the earnings rows on purpose: this money is not part of the
  // total above it, and must not read as though it were.
  itemRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.successBorder,
    paddingTop: Spacing.sm,
    marginTop: Spacing.sm,
  },
  itemLabel: {
    fontFamily: FontFamily.medium,
    color: Colors.textMedium,
    fontSize: FontSizes.sm,
    flexShrink: 1,
    paddingRight: Spacing.sm,
  },
  itemValue: {
    fontFamily: FontFamily.mono,
    color: Colors.textMedium,
    fontSize: FontSizes.sm,
  },
});
