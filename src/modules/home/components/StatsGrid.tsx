import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '../../../config/theme';

interface StatsGridProps {
  earnings?: { trips: number; total: number };
  trips?: number;
  earned?: number;
  avgTime?: string;
}

export function StatsGrid({ earnings, trips: propTrips, earned: propEarned, avgTime = "28 min" }: StatsGridProps) {
  const trips = earnings ? earnings.trips : propTrips ?? 5;
  const earned = earnings ? earnings.total : propEarned ?? 285;

  const stats = [
    { label: "Trips", value: trips.toString(), color: Colors.primary },
    { label: "Earned", value: `₱${earned}`, color: Colors.navy },
    { label: "Avg Time", value: avgTime, color: Colors.amber },
  ];


  return (
    <View style={styles.container}>
      {stats.map(s => (
        <View key={s.label} style={styles.card}>
          <Text style={[styles.value, { color: s.color }]}>{s.value}</Text>
          <Text style={styles.label}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: Spacing.md,
    justifyContent: 'space-between',
  },
  card: {
    flex: 1,
    backgroundColor: Colors.bgLight,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  value: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.extrabold as any,
  },
  label: {
    color: Colors.textLight,
    fontSize: FontSizes.xs,
    marginTop: Spacing.xs,
  },
});
