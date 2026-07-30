import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, View, Text } from 'react-native';
import { useRiderMission } from '../../hooks/useRiderMission';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../config/theme';

export default function TasksScreen() {
  const { deliveredErrands } = useRiderMission();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.headerTitle}>Today's Task History</Text>
        
        {deliveredErrands.map(errand => (
          <View key={errand.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <Text style={styles.errandId}>{errand.id}</Text>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>Delivered</Text>
                </View>
              </View>
              <View style={styles.cardHeaderRight}>
                <Text style={styles.amount}>₱{errand.serviceFee}</Text>
                <Text style={styles.typeText}>{errand.type}</Text>
              </View>
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.customerName}>{errand.customer}</Text>
              <Text style={styles.address}>{errand.address}</Text>
            </View>
            <Text style={styles.timestamp}>{errand.createdAt} → {errand.updatedAt}</Text>
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
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  cardHeaderLeft: {
    gap: Spacing.xs,
  },
  errandId: {
    color: Colors.primary,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
  },
  statusBadge: {
    backgroundColor: Colors.greenLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    alignSelf: 'flex-start',
  },
  statusText: {
    color: Colors.greenDark,
    fontSize: FontSizes.xs,
  },
  cardHeaderRight: {
    alignItems: 'flex-end',
  },
  amount: {
    color: Colors.primary,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  typeText: {
    color: Colors.textLight,
    fontSize: FontSizes.xs,
  },
  cardBody: {
    marginBottom: Spacing.md,
  },
  customerName: {
    color: Colors.textMedium,
    fontSize: FontSizes.base,
  },
  address: {
    color: Colors.textLight,
    fontSize: FontSizes.sm,
  },
  timestamp: {
    color: Colors.textLight,
    fontSize: FontSizes.xs,
  },
});
