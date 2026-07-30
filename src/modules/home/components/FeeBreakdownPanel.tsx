import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '../../../config/theme';

import { Errand, MergedErrand } from '../../../types/rider';

interface FeeBreakdownPanelProps {
  errand?: MergedErrand | Errand;
  serviceFee?: number;
  distance?: string;
}

export function FeeBreakdownPanel({ errand, serviceFee: propFee, distance: propDist }: FeeBreakdownPanelProps) {
  const serviceFee = errand ? errand.serviceFee : propFee ?? 75;
  const distance = errand ? (errand.distance || "1.8 km") : propDist ?? "1.8 km";

  return (

    <View style={styles.container}>
      <Text style={styles.title}>Fee Breakdown</Text>
      <View style={styles.rows}>
        <View style={styles.row}>
          <Text style={styles.label}>Base Delivery Fee</Text>
          <Text style={styles.value}>₱{serviceFee}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Distance</Text>
          <Text style={styles.distanceValue}>{distance}</Text>
        </View>
        <View style={[styles.row, styles.totalRow]}>
          <Text style={styles.totalLabel}>Your Earnings</Text>
          <Text style={styles.totalValue}>₱{serviceFee}</Text>
        </View>
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
  distanceValue: {
    color: Colors.textGray,
    fontSize: FontSizes.base,
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
});
