import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Bike } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius, FontFamily, scaledFontSize, moderateScale } from '../config/theme';
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
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.brandContainer}>
          <View style={styles.logoBox}>
            <Bike size={20} color={Colors.primary} strokeWidth={2.4} />
          </View>
          <View>
            <Text style={styles.companyName} maxFontSizeMultiplier={1.25}>Sugo Express</Text>
            <Text style={styles.dutyStatus} maxFontSizeMultiplier={1.25}>{isOffline ? 'Offline' : 'Available Online'}</Text>
          </View>
        </View>
        
        <View style={styles.actionButtons}>
          <NotificationBell />
        </View>
      </View>

      <View style={styles.riderInfoRow}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText} maxFontSizeMultiplier={1.25}>{initials}</Text>
        </View>
        <View style={styles.riderMetaColumn}>
          <Text style={styles.riderName} maxFontSizeMultiplier={1.25}>{riderName}</Text>
          <View style={styles.riderMetaBottom}>
            <Text style={styles.riderIdText} maxFontSizeMultiplier={1.25}>{riderId}</Text>
            <View style={styles.idStatusDot} />
            {/* Non-Clickable Live Location Indicator */}
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
              <Text style={styles.liveIndicatorText} maxFontSizeMultiplier={1.25}>
                {isOffline ? 'OFFLINE' : 'LIVE'}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.navy,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
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
    width: moderateScale(48, 0.2),
    height: moderateScale(48, 0.2),
    borderRadius: moderateScale(24, 0.2),
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  avatarText: {
    fontFamily: FontFamily.bold,
    color: Colors.textWhite,
    fontSize: scaledFontSize(FontSizes.base, 0.2),
  },
  riderMetaColumn: {
    flex: 1,
  },
  riderName: {
    fontFamily: FontFamily.bold,
    color: Colors.textWhite,
    fontSize: scaledFontSize(FontSizes.base, 0.2),
  },
  riderMetaBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: 3,
  },
  riderIdText: {
    fontFamily: FontFamily.mono,
    color: Colors.whiteOverlayText,
    fontSize: scaledFontSize(FontSizes.xs, 0.2),
  },
  idStatusDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  liveIndicatorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
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
