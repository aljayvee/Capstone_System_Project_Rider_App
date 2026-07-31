import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Platform, Modal, TextInput } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import { riderApiService, Errand } from "../config/apiConfig";
import { saveRiderLocation } from "../firebase/location";

const STAGES = [
  { key: "ASSIGNED", label: "Job Accepted", desc: "Order confirmed by rider" },
  { key: "TRAVELING", label: "Traveling to Store", desc: "Rider heading to merchant location" },
  { key: "AT_STORE", label: "Arrived at Store", desc: "Purchasing requested items" },
  { key: "PURCHASED", label: "Items Purchased", desc: "Receipt generated & items secured" },
  { key: "EN_ROUTE", label: "En Route to Customer", desc: "Out for delivery to drop-off address" },
  { key: "DELIVERED", label: "Delivered & Completed", desc: "Cash collected & order completed" },
];

export const ActiveErrandScreen = ({ route, navigation }: any) => {
  const riderId = 3; // Mocking riderId for now, would typically come from context/auth
  const [activeErrand, setActiveErrand] = useState<Errand | null>(null);
  const [storePinpoints, setStorePinpoints] = useState<{latitude: number, longitude: number, storeName: string}[]>([]);
  const [currentStageIdx, setCurrentStageIdx] = useState(0);

  // COD Modal State
  const [isCodModalVisible, setIsCodModalVisible] = useState(false);
  const [amountPaidInput, setAmountPaidInput] = useState("");

  // Rider GPS Location
  const [riderCoords, setRiderCoords] = useState({ latitude: 6.671, longitude: 124.6644 });
  const [customerCoords, setCustomerCoords] = useState({ latitude: 6.6695, longitude: 124.663 });

  useEffect(() => {
    const loadErrand = async () => {
      const errand = await riderApiService.fetchActiveErrand(riderId);
      if (errand) {
        setActiveErrand(errand);
        
        // Find current stage index
        const stageIdx = STAGES.findIndex(s => s.key === errand.status);
        if (stageIdx !== -1) setCurrentStageIdx(stageIdx);

        // Fetch pinpoints
        const orderIdStr = (errand as any).orderId || errand.id;
        if (orderIdStr) {
          const pinpoints = await riderApiService.fetchStorePinpoints(orderIdStr);
          setStorePinpoints(pinpoints);
        }

        // Parse customer coordinates
        const lat = parseFloat(String((errand as any).latitude));
        const lng = parseFloat(String((errand as any).longitude));
        if (!isNaN(lat) && !isNaN(lng)) {
          setCustomerCoords({ latitude: lat, longitude: lng });
        }
      }
    };
    loadErrand();
  }, [riderId]);

  useEffect(() => {
    let locationSubscription: any = null;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({});
          if (loc && loc.coords) {
            const current = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
            setRiderCoords(current);
            saveRiderLocation(riderId, current.latitude, current.longitude, loc.coords.heading || 0, loc.coords.speed || 0);
          }

          locationSubscription = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
            (newLoc) => {
              const updated = { latitude: newLoc.coords.latitude, longitude: newLoc.coords.longitude };
              setRiderCoords(updated);
              saveRiderLocation(riderId, updated.latitude, updated.longitude, newLoc.coords.heading || 0, newLoc.coords.speed || 0);
            }
          );
        }
      } catch (err) {
        console.warn("Rider location tracking note:", err);
      }
    })();

    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, [riderId]);

  const handleNextStage = async () => {
    if (!activeErrand) return;
    if (currentStageIdx < STAGES.length - 1) {
      const nextIdx = currentStageIdx + 1;
      
      // Intercept final stage for COD Payment
      if (nextIdx === STAGES.length - 1) {
        setIsCodModalVisible(true);
        return;
      }

      const nextStatus = STAGES[nextIdx].key;
      setCurrentStageIdx(nextIdx);
      await riderApiService.updateErrandStatus((activeErrand as any).orderId || activeErrand.id, nextStatus);
    }
  };

  const finalizeDelivery = async () => {
    if (!activeErrand) return;
    const amount = parseFloat(amountPaidInput);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount paid by the customer.");
      return;
    }

    const nextIdx = STAGES.length - 1;
    const nextStatus = STAGES[nextIdx].key;
    setCurrentStageIdx(nextIdx);
    setIsCodModalVisible(false);

    await riderApiService.updateErrandStatus((activeErrand as any).orderId || activeErrand.id, nextStatus, amount);

    Alert.alert("Errand Completed!", `Fulfillment recorded. Collected: ₱${amount.toFixed(2)}`, [
      { text: "OK", onPress: () => navigation.navigate("JobsFeed") },
    ]);
  };

  if (!activeErrand) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text>Loading active errand...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ACTIVE ERRAND STEPPER & ROUTING</Text>
        <Text style={styles.headerSub}>{(activeErrand as any).orderId || activeErrand.id} - {activeErrand.category}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* FOOD PANDA STYLE ROUTING MAP */}
        <View style={styles.mapCard}>
          <Text style={styles.mapTitle}>🗺️ Food Panda Live Routing & Navigation</Text>
          <View style={styles.mapWrapper}>
            <MapView
              style={styles.map}
              initialRegion={{
                latitude: riderCoords.latitude,
                longitude: riderCoords.longitude,
                latitudeDelta: 0.015,
                longitudeDelta: 0.015,
              }}
            >
              {/* Rider Marker */}
              <Marker coordinate={riderCoords} title="Your Location" pinColor="blue" />

              {/* Dynamic Store Markers */}
              {storePinpoints.map((pin, i) => (
                <Marker
                  key={i}
                  coordinate={{ latitude: parseFloat(String(pin.latitude)), longitude: parseFloat(String(pin.longitude)) }}
                  title={`Pickup: ${pin.storeName}`}
                  pinColor="orange"
                />
              ))}

              {/* Customer Marker */}
              <Marker
                coordinate={customerCoords}
                title={`Customer: ${activeErrand.customerName}`}
                description={activeErrand.deliveryAddress}
                pinColor="red"
              />

              {/* Dynamic Polyline Route */}
              <Polyline
                coordinates={[
                  riderCoords,
                  ...storePinpoints.map(p => ({ latitude: parseFloat(String(p.latitude)), longitude: parseFloat(String(p.longitude)) })),
                  customerCoords
                ]}
                strokeColor="#1E3A5F"
                strokeWidth={4}
                lineDashPattern={[1]}
              />
            </MapView>
          </View>
        </View>

        {/* Customer & Address Details */}
        <View style={styles.infoCard}>
          <Text style={styles.customerName}>Customer: {activeErrand.customerName}</Text>
          <Text style={styles.customerPhone}>📞 {activeErrand.customerPhone || "N/A"}</Text>
          <Text style={styles.itemDesc}>{activeErrand.description || (activeErrand as any).items}</Text>

          <View style={styles.divider} />

          <Text style={styles.addrTitle}>Pickup Location(s):</Text>
          <Text style={styles.addrText}>{activeErrand.pickupAddress || storePinpoints.map(p => p.storeName).join(", ")}</Text>

          <Text style={[styles.addrTitle, { marginTop: 8 }]}>Delivery Address:</Text>
          <Text style={styles.addrText}>{activeErrand.deliveryAddress}</Text>
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

      {/* COD Payment Modal */}
      <Modal visible={isCodModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Finalize Delivery (COD)</Text>
            <Text style={styles.modalSubtitle}>Total to Collect: ₱{activeErrand.totalCost || (activeErrand as any).grandTotal}</Text>
            
            <TextInput
              style={styles.modalInput}
              placeholder="Enter Exact Amount Paid (₱)"
              keyboardType="numeric"
              value={amountPaidInput}
              onChangeText={setAmountPaidInput}
            />

            <TouchableOpacity style={styles.modalDisabledButton} disabled>
              <Text style={styles.modalDisabledButtonText}>Digital Wallet / Credit Card (Not Properly Implemented)</Text>
            </TouchableOpacity>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setIsCodModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={finalizeDelivery}>
                <Text style={styles.modalConfirmText}>Confirm COD</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  header: { backgroundColor: "#1E3A5F", paddingTop: 50, paddingBottom: 20, paddingHorizontal: 20 },
  headerTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" },
  headerSub: { color: "#93C5FD", fontSize: 12, marginTop: 2 },
  content: { padding: 16 },
  mapCard: { backgroundColor: "#FFFFFF", padding: 12, borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 16 },
  mapTitle: { fontSize: 14, fontWeight: "800", color: "#1E3A5F", marginBottom: 8 },
  mapWrapper: { height: 200, borderRadius: 12, overflow: "hidden" },
  map: { width: "100%", height: "100%" },
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
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 20, width: "100%", elevation: 5 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#1E3A5F", marginBottom: 8 },
  modalSubtitle: { fontSize: 14, color: "#10B981", fontWeight: "700", marginBottom: 20 },
  modalInput: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 16 },
  modalDisabledButton: { backgroundColor: "#F1F5F9", padding: 14, borderRadius: 10, alignItems: "center", marginBottom: 24, borderWidth: 1, borderColor: "#E2E8F0" },
  modalDisabledButtonText: { color: "#94A3B8", fontSize: 12, fontWeight: "700" },
  modalActions: { flexDirection: "row", justifyContent: "flex-end" },
  modalCancelBtn: { padding: 12, marginRight: 10 },
  modalCancelText: { color: "#64748B", fontWeight: "700" },
  modalConfirmBtn: { backgroundColor: "#10B981", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10 },
  modalConfirmText: { color: "#FFF", fontWeight: "700" },
});

