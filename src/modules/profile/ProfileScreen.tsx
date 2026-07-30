import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Star, LogOut } from 'lucide-react-native';
import { useRiderMission } from '../../hooks/useRiderMission';
import { useRiderAuth } from '../../context/RiderAuthContext';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../config/theme';

export default function ProfileScreen() {
  const { riderProfile } = useRiderMission();
  const { logout } = useRiderAuth();

  const infoRows = [
    { label: "Phone Number", value: riderProfile.phone },
    { label: "Email", value: riderProfile.email },
    { label: "Status", value: riderProfile.status },
    { label: "Total Trips (All Time)", value: riderProfile.totalTrips.toString() },
    { label: "Join Date", value: riderProfile.joinDate },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        <LinearGradient
          colors={[Colors.primaryGradientStart, Colors.primaryGradientEnd]}
          style={styles.profileCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{riderProfile.initials}</Text>
          </View>
          <Text style={styles.name}>{riderProfile.name}</Text>
          <Text style={styles.riderId}>Rider ID: {riderProfile.riderId}</Text>
          
          <View style={styles.ratingRow}>
            {[1, 2, 3, 4, 5].map((s) => (
              <Star 
                key={s} 
                size={14} 
                color={Colors.notifYellow} 
                fill={s <= 4 ? Colors.notifYellow : "transparent"} 
              />
            ))}
            <Text style={styles.ratingText}>{riderProfile.rating}</Text>
          </View>
        </LinearGradient>

        <View style={styles.infoContainer}>
          {infoRows.map((item, index) => (
            <View key={item.label} style={[styles.infoRow, index === infoRows.length - 1 && styles.noBorder]}>
              <Text style={styles.infoLabel}>{item.label}</Text>
              <Text style={styles.infoValue}>{item.value}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.signOutBtn} onPress={logout}>
          <LogOut size={16} color={Colors.primary} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

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
  profileCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxl,
    alignItems: 'center',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    borderWidth: 4,
    borderColor: Colors.bgWhite,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  avatarText: {
    color: Colors.textWhite,
    fontSize: FontSizes.display,
    fontWeight: FontWeights.extrabold,
  },
  name: {
    color: Colors.textWhite,
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
  },
  riderId: {
    color: Colors.whiteOverlayText,
    fontSize: FontSizes.sm,
    marginTop: Spacing.xs,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xxs,
    marginTop: Spacing.sm,
  },
  ratingText: {
    color: Colors.whiteOverlayText,
    fontSize: FontSizes.sm,
    marginLeft: Spacing.xs,
  },
  infoContainer: {
    backgroundColor: Colors.bgWhite,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.xl,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  noBorder: {
    borderBottomWidth: 0,
  },
  infoLabel: {
    color: Colors.textGray,
    fontSize: FontSizes.sm,
  },
  infoValue: {
    color: Colors.textDark,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  signOutText: {
    color: Colors.primary,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
});
