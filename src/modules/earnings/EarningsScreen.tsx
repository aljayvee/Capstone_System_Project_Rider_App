import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, View, Text } from 'react-native';
import { useRiderMission } from '../../hooks/useRiderMission';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../config/theme';

export default function EarningsScreen() {
  const { riderEarnings } = useRiderMission();

  const periods = [
    { period: "Today", data: riderEarnings.today },
    { period: "This Week", data: riderEarnings.week },
    { period: "This Month", data: riderEarnings.month },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.headerTitle}>My Earnings</Text>

        {periods.map(({ period, data }) => (
          <View key={period} style={styles.card}>
            <Text style={styles.periodLabel}>{period}</Text>
            
            <View style={styles.totalRow}>
              <Text style={styles.totalAmount}>₱{data.total.toLocaleString()}</Text>
              <Text style={styles.tripsCount}>{data.trips} trips</Text>
            </View>

            <View style={styles.breakdown}>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Base Delivery Fees</Text>
                <Text style={styles.breakdownValue}>₱{data.baseFee.toLocaleString()}</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Commissions</Text>
                <Text style={styles.breakdownValue}>₱{data.commission.toLocaleString()}</Text>
              </View>
              <View style={styles.totalBorderRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>₱{data.total.toLocaleString()}</Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgGray,
  },
  scrollContent: {
    padding: Spacing.xl,
    gap: Spacing.xl,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.textDark,
  },
  card: {
    backgroundColor: Colors.bgWhite,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xxl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  periodLabel: {
    color: Colors.textGray,
    fontSize: FontSizes.sm,
    marginBottom: Spacing.md,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  totalAmount: {
    color: Colors.textDark,
    fontSize: FontSizes.xxxl,
    fontWeight: FontWeights.extrabold,
  },
  tripsCount: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  breakdown: {
    gap: Spacing.sm,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: {
    color: Colors.textGray,
    fontSize: FontSizes.sm,
  },
  breakdownValue: {
    color: Colors.textDark,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  totalBorderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.md,
    marginTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  totalLabel: {
    color: Colors.primary,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  totalValue: {
    color: Colors.primary,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.extrabold,
  },
});
