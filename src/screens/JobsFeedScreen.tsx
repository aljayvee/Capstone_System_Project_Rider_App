import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { useRiderAuth } from "../context/RiderAuthContext";
import { riderApiService, Errand } from "../config/apiConfig";

export const JobsFeedScreen = ({ navigation }: any) => {
  const { rider, isOnline, toggleShiftStatus } = useRiderAuth();
  const [jobs, setJobs] = useState<Errand[]>([]);

  useEffect(() => {
    async function loadJobs() {
      if (rider) {
        const fetched = await riderApiService.getAssignedErrands(rider.id);
        setJobs(fetched);
      }
    }
    loadJobs();
  }, [rider]);

  const handleAcceptJob = (job: Errand) => {
    navigation.navigate("ActiveErrand", { errand: job });
  };

  return (
    <View style={styles.container}>
      {/* Header Bar */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>RIDER DISPATCH</Text>
          <Text style={styles.headerSub}>{rider?.name} ({rider?.vehicle})</Text>
        </View>
        <TouchableOpacity
          onPress={toggleShiftStatus}
          style={[styles.statusBadge, isOnline ? styles.onlineBg : styles.offlineBg]}
        >
          <Text style={styles.statusText}>{isOnline ? "● ONLINE" : "○ OFFLINE"}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!isOnline ? (
          <View style={styles.offlineNotice}>
            <Text style={styles.noticeTitle}>You are currently Offline</Text>
            <Text style={styles.noticeText}>Toggle your shift status to Online to start receiving dispatch errand offers.</Text>
          </View>
        ) : jobs.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No assigned errands available. Waiting for dispatcher...</Text>
          </View>
        ) : (
          jobs.map((job) => (
            <View key={job.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.jobId}>{job.id}</Text>
                <Text style={styles.categoryBadge}>{job.category}</Text>
              </View>

              <Text style={styles.jobDesc}>{job.description}</Text>

              <View style={styles.addressBox}>
                <Text style={styles.addrLabel}>📍 PICKUP:</Text>
                <Text style={styles.addrText}>{job.pickupAddress}</Text>
                <Text style={[styles.addrLabel, { marginTop: 6 }]}>🏁 DELIVERY:</Text>
                <Text style={styles.addrText}>{job.deliveryAddress}</Text>
              </View>

              <View style={styles.feeRow}>
                <Text style={styles.feeLabel}>Earn Fee:</Text>
                <Text style={styles.feeAmount}>₱{job.deliveryFee + job.tip}</Text>
              </View>

              <TouchableOpacity style={styles.acceptButton} onPress={() => handleAcceptJob(job)}>
                <Text style={styles.acceptButtonText}>ACCEPT ERRAND JOB</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    backgroundColor: "#1E3A5F",
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" },
  headerSub: { color: "#93C5FD", fontSize: 12, marginTop: 2 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  onlineBg: { backgroundColor: "#10B981" },
  offlineBg: { backgroundColor: "#64748B" },
  statusText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  content: { padding: 16 },
  offlineNotice: { backgroundColor: "#FFF1F2", padding: 20, borderRadius: 16, borderWidth: 1, borderColor: "#FECACA", marginTop: 20 },
  noticeTitle: { color: "#E53935", fontWeight: "700", fontSize: 16, marginBottom: 4 },
  noticeText: { color: "#9F1239", fontSize: 13 },
  emptyContainer: { padding: 30, alignItems: "center" },
  emptyText: { color: "#64748B", fontSize: 14, textAlign: "center" },
  card: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: "#E2E8F0" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  jobId: { fontSize: 14, fontWeight: "800", color: "#1E3A5F" },
  categoryBadge: { backgroundColor: "#EFF6FF", color: "#1D4ED8", fontSize: 11, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  jobDesc: { color: "#334155", fontSize: 13, marginBottom: 12 },
  addressBox: { backgroundColor: "#F8FAFC", padding: 12, borderRadius: 10, marginBottom: 12 },
  addrLabel: { fontSize: 11, fontWeight: "700", color: "#475569" },
  addrText: { fontSize: 12, color: "#1E293B", marginTop: 2 },
  feeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  feeLabel: { fontSize: 13, color: "#64748B" },
  feeAmount: { fontSize: 18, fontWeight: "800", color: "#10B981" },
  acceptButton: { backgroundColor: "#1E3A5F", paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  acceptButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },
});
