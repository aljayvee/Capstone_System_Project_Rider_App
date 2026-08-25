import React from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft } from 'lucide-react-native';
import { useRiderMissionContext } from '../context/RiderMissionContext';
import { LiveErrandMap } from '../components/LiveErrandMap';
import { useLiveRoute } from '../hooks/useLiveRoute';
import { toCoordinate } from '../utils/coords';
import { routePhaseFor } from '../services/routePhase';
import { Colors, Spacing, FontSizes, FontWeights } from '../config/theme';

export default function LiveErrandMapScreen() {
  const navigation = useNavigation();
  const { errand, riderLocation, currentStatus } = useRiderMissionContext();

  const destination = errand ? toCoordinate(errand.deliveryLatitude, errand.deliveryLongitude) : null;
  // Every stop stays on the map as a marker — the rider should still see where
  // they have been.
  const pinpoints = errand?.pinpoints ?? [];

  // But the routed waypoints are only the stops still outstanding. Same filter
  // the server's ETA applies (etaStrategy.ts). Without it this screen navigated
  // the rider back through a store they had already finished, which is worse
  // here than on the customer's map: this is the screen they follow.
  const waypoints = pinpoints
    .filter((p: any) => !p.departedAt && !p.arrivedAt)
    .map((p) => toCoordinate(p.latitude, p.longitude))
    .filter((c): c is NonNullable<typeof c> => c !== null);

  // Destructure the full LiveRouteResult — gives us leg coords for two-colour
  // rendering and ETA data for the floating badge.
  const {
    coordinates: routeCoordinates,
    pickupLegCoordinates,
    deliveryLegCoordinates,
    distanceMeters,
    durationSeconds,
  } = useLiveRoute(riderLocation, destination, waypoints);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ChevronLeft size={22} color={Colors.textDark} />
        </TouchableOpacity>
        <Text style={styles.title}>Live Errand Map</Text>
        <View style={styles.backButton} />
      </View>

      {destination || pinpoints.length > 0 ? (
        <LiveErrandMap
          riderLocation={riderLocation}
          destination={destination}
          pinpoints={pinpoints}
          routeCoordinates={routeCoordinates}
          pickupLegCoordinates={pickupLegCoordinates}
          deliveryLegCoordinates={deliveryLegCoordinates}
          distanceMeters={distanceMeters}
          durationSeconds={durationSeconds}
          // Orange out to the stores, primary in to the customer — switching at
          // "Purchased", the same instant the customer's map switches on
          // itemsPurchasedAt.
          phase={routePhaseFor(currentStatus)}
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No destination or store pins set for this errand yet.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgWhite,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxl,
  },
  emptyText: {
    color: Colors.textGray,
    fontSize: FontSizes.base,
    textAlign: 'center',
  },
});
