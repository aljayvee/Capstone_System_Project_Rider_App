import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useRiderAuth } from "../context/RiderAuthContext";

export const EarningsScreen = () => {
  const { rider } = useRiderAuth();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>RIDER EARNINGS & PAYOUTS</Text>
        <Text style={styles.headerSub}>{rider?.name} - Delivery Performance</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Today's Earnings</Text>
          <Text style={styles.summaryAmount}>₱840.00</Text>
          <Text style={styles.summarySub}>8 Errands Completed</Text>
        </View>

        <View style={styles.gridRow}>
          <View style={styles.miniCard}>
            <Text style={styles.miniTitle}>Delivery Fees</Text>
            <Text style={styles.miniValue}>₱680.00</Text>
          </View>
          <View style={styles.miniCard}>
            <Text style={styles.miniTitle}>Tips & Bonuses</Text>
            <Text style={styles.miniValue}>₱160.00</Text>
          </View>
        </View>

        <Text style={styles.historyTitle}>Recent Completed Errands</Text>
        <View style={styles.historyCard}>
          <View style={styles.historyHeader}>
            <Text style={styles.errandId}>ERR-1001</Text>
            <Text style={styles.payout}>+₱85.00</Text>
          </View>
          <Text style={styles.historyDesc}>Pharmacy Pickup - Gen. Santos Drive</Text>
          <Text style={styles.historyTime}>Completed Today, 10:45 AM</Text>
        </View>

        <View style={styles.historyCard}>
          <View style={styles.historyHeader}>
            <Text style={styles.errandId}>ERR-0998</Text>
            <Text style={styles.payout}>+₱110.00</Text>
          </View>
          <Text style={styles.historyDesc}>Grocery Delivery - KCC Mall</Text>
          <Text style={styles.historyTime}>Completed Today, 09:15 AM</Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  header: { backgroundColor: "#1E3A5F", paddingTop: 50, paddingBottom: 20, paddingHorizontal: 20 },
  headerTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" },
  headerSub: { color: "#93C5FD", fontSize: 12, marginTop: 2 },
  content: { padding: 16 },
  summaryCard: { backgroundColor: "#1E3A5F", padding: 24, borderRadius: 20, alignItems: "center", marginBottom: 16 },
  summaryTitle: { color: "#93C5FD", fontSize: 13, fontWeight: "700", textTransform: "uppercase" },
  summaryAmount: { color: "#FFFFFF", fontSize: 32, fontWeight: "900", marginVertical: 4 },
  summarySub: { color: "#34D399", fontSize: 12, fontWeight: "700" },
  gridRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  miniCard: { flex: 1, backgroundColor: "#FFFFFF", padding: 16, borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0" },
  miniTitle: { fontSize: 11, color: "#64748B", fontWeight: "700" },
  miniValue: { fontSize: 18, fontWeight: "800", color: "#1E293B", marginTop: 4 },
  historyTitle: { fontSize: 14, fontWeight: "800", color: "#1E3A5F", marginBottom: 12 },
  historyCard: { backgroundColor: "#FFFFFF", padding: 14, borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 10 },
  historyHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  errandId: { fontSize: 13, fontWeight: "800", color: "#1E3A5F" },
  payout: { fontSize: 14, fontWeight: "800", color: "#10B981" },
  historyDesc: { fontSize: 12, color: "#475569", marginTop: 4 },
  historyTime: { fontSize: 10, color: "#94A3B8", marginTop: 4 },
});
