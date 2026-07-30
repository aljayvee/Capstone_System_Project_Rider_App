import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from "react-native";
import { riderApiService, Errand } from "../config/apiConfig";

const STAGES = [
  { key: "ASSIGNED", label: "Job Accepted", desc: "Order confirmed by rider" },
  { key: "TRAVELING", label: "Traveling to Store", desc: "Rider heading to merchant location" },
  { key: "AT_STORE", label: "Arrived at Store", desc: "Purchasing requested items" },
  { key: "PURCHASED", label: "Items Purchased", desc: "Receipt generated & items secured" },
  { key: "EN_ROUTE", label: "En Route to Customer", desc: "Out for delivery to drop-off address" },
  { key: "DELIVERED", label: "Delivered & Completed", desc: "Cash collected & order completed" },
];

export const ActiveErrandScreen = ({ route, navigation }: any) => {
  const errandParam: Errand = route.params?.errand || {
    id: "ERR-1002",
    category: "Groceries & Supermarkets",
    description: "Buy fresh milk, bread, and fruits from KCC Mall",
    pickupAddress: "KCC Mall, Gensan Drive, Tacurong City",
    deliveryAddress: "Barangay Poblacion, House #142",
    estimatedCost: 350,
    deliveryFee: 65,
    tip: 20,
    totalCost: 435,
    status: "ASSIGNED",
    customerId: 101,
    customerName: "Maria Santos",
    customerPhone: "09181112233",
  };

  const [currentStageIdx, setCurrentStageIdx] = useState(0);

  const handleNextStage = async () => {
    if (currentStageIdx < STAGES.length - 1) {
      const nextIdx = currentStageIdx + 1;
      const nextStatus = STAGES[nextIdx].key;
      setCurrentStageIdx(nextIdx);
      await riderApiService.updateErrandStatus(errandParam.id, nextStatus);

      if (nextIdx === STAGES.length - 1) {
        Alert.alert("Errand Completed!", "Fulfillment recorded and delivery fee added to earnings.", [
          { text: "OK", onPress: () => navigation.navigate("JobsFeed") },
        ]);
      }
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ACTIVE ERRAND STEPPER</Text>
        <Text style={styles.headerSub}>{errandParam.id} - {errandParam.category}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Customer & Address Details */}
        <View style={styles.infoCard}>
          <Text style={styles.customerName}>Customer: {errandParam.customerName}</Text>
          <Text style={styles.customerPhone}>📞 {errandParam.customerPhone}</Text>
          <Text style={styles.itemDesc}>{errandParam.description}</Text>

          <View style={styles.divider} />

          <Text style={styles.addrTitle}>Pickup Location:</Text>
          <Text style={styles.addrText}>{errandParam.pickupAddress}</Text>

          <Text style={[styles.addrTitle, { marginTop: 8 }]}>Delivery Address:</Text>
          <Text style={styles.addrText}>{errandParam.deliveryAddress}</Text>
        </View>

        {/* 6-Stage Progress Stepper */}
        <Text style={styles.stepperHeader}>Errand Progress Stages</Text>
        {STAGES.map((stage, idx) => {
          const isDone = idx < currentStageIdx;
          const isCurrent = idx === currentStageIdx;

          return (
            <View key={stage.key} style={[styles.stepItem, isCurrent && styles.activeStepItem]}>
              <View style={[styles.stepCircle, isDone ? styles.doneCircle : isCurrent ? styles.activeCircle : styles.pendingCircle]}>
                <Text style={styles.stepNum}>{idx + 1}</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={[styles.stepLabel, isCurrent && styles.activeStepLabel]}>{stage.label}</Text>
                <Text style={styles.stepDesc}>{stage.desc}</Text>
              </View>
            </View>
          );
        })}

        {/* Stage Advance Button */}
        {currentStageIdx < STAGES.length - 1 && (
          <TouchableOpacity style={styles.nextButton} onPress={handleNextStage}>
            <Text style={styles.nextButtonText}>ADVANCE TO NEXT STAGE ({STAGES[currentStageIdx + 1].label})</Text>
          </TouchableOpacity>
        )}
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
  infoCard: { backgroundColor: "#FFFFFF", padding: 16, borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 20 },
  customerName: { fontSize: 16, fontWeight: "800", color: "#1E293B" },
  customerPhone: { fontSize: 13, color: "#10B981", fontWeight: "700", marginTop: 2 },
  itemDesc: { fontSize: 13, color: "#475569", marginTop: 8 },
  divider: { height: 1, backgroundColor: "#F1F5F9", marginVertical: 12 },
  addrTitle: { fontSize: 11, fontWeight: "700", color: "#64748B" },
  addrText: { fontSize: 13, color: "#1E293B", fontWeight: "600", marginTop: 2 },
  stepperHeader: { fontSize: 14, fontWeight: "800", color: "#1E3A5F", marginBottom: 12 },
  stepItem: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", padding: 12, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: "#E2E8F0" },
  activeStepItem: { borderColor: "#1E3A5F", borderWidth: 2, backgroundColor: "#F0F9FF" },
  stepCircle: { width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center", marginRight: 12 },
  doneCircle: { backgroundColor: "#10B981" },
  activeCircle: { backgroundColor: "#1E3A5F" },
  pendingCircle: { backgroundColor: "#CBD5E1" },
  stepNum: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },
  stepContent: { flex: 1 },
  stepLabel: { fontSize: 14, fontWeight: "700", color: "#334155" },
  activeStepLabel: { color: "#1E3A5F" },
  stepDesc: { fontSize: 11, color: "#64748B", marginTop: 1 },
  nextButton: { backgroundColor: "#1E3A5F", paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 10, marginBottom: 30 },
  nextButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },
});
