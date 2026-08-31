import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Bike } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius, Gradients, FontFamily, scaledFontSize, moderateScale } from '../config/theme';
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
      colors={Gradients.header}
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
            <Text style={styles.companyName} maxFontSizeMultiplier={1.15}>Sugo Express</Text>
            <Text style={styles.dutyStatus} maxFontSizeMultiplier={1.15}>{isOffline ? 'Off Duty' : 'On Duty'}</Text>
          </View>
        </View>
        
        <View style={styles.actionButtons}>
          <NotificationBell />
        </View>
      </View>

      <View style={styles.riderInfoRow}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText} maxFontSizeMultiplier={1.15}>{initials}</Text>
        </View>
        <View style={styles.riderMetaColumn}>
          <Text style={styles.riderName} numberOfLines={1} maxFontSizeMultiplier={1.2}>{riderName}</Text>
          <Text style={styles.riderIdText} maxFontSizeMultiplier={1.15}>{riderId}</Text>
          
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
                  { backgroundColor: isOffline ? Colors.offlineDot : Colors.onlineDot }
                ]}
              />
              <Text style={styles.liveIndicatorText} maxFontSizeMultiplier={1.15}>
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
    paddingHorizontal: Spacing.lg,
    paddingTop: moderateScale(36, 0.2),
    paddingBottom: Spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  logoBox: {
    width: moderateScale(36, 0.2),
    height: moderateScale(36, 0.2),
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.bgWhite,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  companyName: {
    color: Colors.textWhite,
    fontSize: scaledFontSize(FontSizes.xs, 0.2),
    fontWeight: FontWeights.bold,
    letterSpacing: 1.2,
  },
  dutyStatus: {
    color: Colors.whiteOverlayText,
    fontSize: scaledFontSize(FontSizes.xxs, 0.2),
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  riderInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  avatarCircle: {
    width: moderateScale(52, 0.2),
    height: moderateScale(52, 0.2),
    borderRadius: moderateScale(26, 0.2),
    borderWidth: 2,
    borderColor: Colors.bgWhite,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  avatarText: {
    fontFamily: FontFamily.bold,
    color: Colors.textWhite,
    fontSize: scaledFontSize(FontSizes.lg, 0.2),
  },
  riderMetaColumn: {
    flex: 1,
  },
  riderName: {
    fontFamily: FontFamily.bold,
    color: Colors.textWhite,
    fontSize: scaledFontSize(FontSizes.base, 0.2),
  },
  riderIdText: {
    fontFamily: FontFamily.mono,
    color: Colors.whiteOverlayText,
    fontSize: scaledFontSize(FontSizes.xs, 0.2),
  },
  statusIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  liveIndicatorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2.5,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveIndicatorText: {
    fontFamily: FontFamily.bold,
    color: Colors.textWhite,
    fontSize: scaledFontSize(FontSizes.xxs, 0.2),
    letterSpacing: 0.8,
  },
});

export default RiderHeader;
