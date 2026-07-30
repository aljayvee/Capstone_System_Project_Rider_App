import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Bell, LogOut } from 'lucide-react-native';
import { Colors, FontWeights } from '../config/theme';

import { UseRiderMissionReturn } from '../hooks/useRiderMission';

export interface RiderHeaderProps {
  mission?: UseRiderMissionReturn;
  isOffline?: boolean;
  onToggleOffline?: () => void;
  unreadCount?: number;
  onBellPress?: () => void;
  onLogout?: () => void;
  riderName?: string;
  riderId?: string;
  initials?: string;
}

export function RiderHeader({
  mission,
  isOffline: propIsOffline,
  onToggleOffline: propOnToggleOffline,
  unreadCount: propUnreadCount = 0,
  onBellPress: propOnBellPress = () => {},
  onLogout: propOnLogout = () => {},
  riderName: propRiderName,
  riderId: propRiderId,
  initials: propInitials,
}: RiderHeaderProps) {
  const isOffline = mission ? mission.isOffline : propIsOffline ?? false;
  const onToggleOffline = mission ? mission.toggleOffline : propOnToggleOffline ?? (() => {});
  const unreadCount = mission ? (mission.unreadDR ? 1 : 0) : propUnreadCount;
  const onBellPress = propOnBellPress;
  const onLogout = propOnLogout;
  const riderName = mission ? mission.riderProfile.name : propRiderName ?? "Al-Dhen Musali";
  const riderId = mission ? mission.riderProfile.riderId : propRiderId ?? "RDR-001";
  const initials = mission ? mission.riderProfile.initials : propInitials ?? "AM";

  return (
    <LinearGradient
      colors={['#EF4444', '#F87171', '#FECACA', '#FFFFFF']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <View style={styles.topRow}>
        <View style={styles.brandContainer}>
          <View style={styles.logoBox} />
          <View>
            <Text style={styles.companyName}>Company Name</Text>
            <Text style={styles.dutyStatus}>On Duty</Text>
          </View>
        </View>
        
        <View style={styles.actionButtons}>
          <TouchableOpacity onPress={onBellPress} style={styles.iconButton}>
            <Bell size={18} color={Colors.textWhite} />
            {unreadCount > 0 && (
              <View style={styles.badgeContainer}>
                <Text style={styles.badgeText}>{unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={onLogout} style={styles.iconButton}>
            <LogOut size={18} color={Colors.textWhite} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.riderInfoRow}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View>
          <Text style={styles.riderName}>{riderName}</Text>
          <Text style={styles.riderIdText}>{riderId}</Text>
          <View style={styles.statusToggleContainer}>
            <TouchableOpacity 
              onPress={onToggleOffline}
              style={[
                styles.statusToggleButton,
                { backgroundColor: isOffline ? Colors.offlineBg : Colors.green }
              ]}
            >
              <View style={styles.pulseDot} />
              <Text style={styles.statusToggleText}>
                {isOffline ? 'OFFLINE' : 'LIVE'}
              </Text>
            </TouchableOpacity>
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
  badgeContainer: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.notifYellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: Colors.notifYellowText,
    fontSize: 9,
    fontWeight: FontWeights.extrabold,
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
  riderName: {
    color: Colors.textWhite,
    fontSize: 16,
    fontWeight: FontWeights.bold,
  },
  riderIdText: {
    color: Colors.whiteOverlayText,
    fontSize: 13,
  },
  statusToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  statusToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.bgWhite,
  },
  statusToggleText: {
    color: Colors.textWhite,
    fontSize: 10,
    fontWeight: FontWeights.extrabold,
  },
});

export default RiderHeader;

