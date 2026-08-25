import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Bike } from 'lucide-react-native';
import { Colors, FontWeights } from '../config/theme';
import { useRiderAuth } from '../context/RiderAuthContext';
import { NotificationBell } from './NotificationBell';

import { UseRiderMissionReturn } from '../hooks/useRiderMission';

export interface RiderHeaderProps {
  mission?: UseRiderMissionReturn;
  isOffline?: boolean;
  riderName?: string;
  riderId?: string;
  initials?: string;
}

export function RiderHeader({
  mission,
  isOffline: propIsOffline,
  riderName: propRiderName,
  riderId: propRiderId,
  initials: propInitials,
}: RiderHeaderProps) {
  const { isOnline } = useRiderAuth();
  
  // Real connectivity and duty status
  const isOffline = mission ? !isOnline : propIsOffline ?? false;
  const riderName = mission ? mission.riderProfile?.name ?? '' : propRiderName ?? '';
  const riderId = mission ? mission.riderProfile?.riderId ?? '' : propRiderId ?? '';
  const initials = mission ? mission.riderProfile?.initials ?? '?' : propInitials ?? '?';

  return (
    <LinearGradient
      colors={['#EF4444', '#F87171', '#FECACA', '#FFFFFF']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <View style={styles.topRow}>
        <View style={styles.brandContainer}>
          <View style={styles.logoBox}>
            <Bike size={20} color={Colors.primary} strokeWidth={2.4} />
          </View>
          <View>
            <Text style={styles.companyName}>Sugo Express</Text>
            <Text style={styles.dutyStatus}>{isOffline ? 'Off Duty' : 'On Duty'}</Text>
          </View>
        </View>
        
        <View style={styles.actionButtons}>
          <NotificationBell />
        </View>
      </View>

      <View style={styles.riderInfoRow}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.riderMetaColumn}>
          <Text style={styles.riderName}>{riderName}</Text>
          <Text style={styles.riderIdText}>{riderId}</Text>
          
          {/* Non-Clickable Live Location Indicator */}
          <View style={styles.statusIndicatorContainer}>
            <View
              style={[
                styles.liveIndicatorBadge,
                { backgroundColor: isOffline ? 'rgba(55, 65, 81, 0.7)' : 'rgba(22, 101, 52, 0.55)' }
              ]}
            >
              <View
                style={[
                  styles.pulseDot,
                  { backgroundColor: isOffline ? '#9CA3AF' : '#4ADE80' }
                ]}
              />
              <Text style={styles.liveIndicatorText}>
                {isOffline ? 'OFFLINE' : 'LIVE'}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 24,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Colors.bgWhite,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  companyName: {
    color: Colors.textWhite,
    fontSize: 12,
    fontWeight: FontWeights.bold,
    letterSpacing: 1.2,
  },
  dutyStatus: {
    color: Colors.whiteOverlayText,
    fontSize: 11,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: Colors.whiteOverlay,
    position: 'relative',
  },
  riderInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: Colors.bgWhite,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  avatarText: {
    color: Colors.textWhite,
    fontSize: 18,
    fontWeight: FontWeights.extrabold,
  },
  riderMetaColumn: {
    flex: 1,
  },
  riderName: {
    color: Colors.textWhite,
    fontSize: 16,
    fontWeight: FontWeights.bold,
  },
  riderIdText: {
    color: Colors.whiteOverlayText,
    fontSize: 13,
  },
  statusIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  liveIndicatorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveIndicatorText: {
    color: Colors.textWhite,
    fontSize: 10,
    fontWeight: FontWeights.black,
    letterSpacing: 0.8,
  },
});

export default RiderHeader;
