import React, { useEffect, useState } from 'react';
import { ScreenLayout, ScreenSpacing } from '../config/screenLayout';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius, FontFamily, scaledFontSize, moderateScale } from '../config/theme';
import { HomeColors } from '../modules/home/homeTheme';
import { useRiderAuth } from '../context/RiderAuthContext';
import { NotificationBell } from './NotificationBell';
import { riderApiService } from '../config/apiConfig';

import type { UseRiderMissionReturn } from '../hooks/useRiderMission';

// The Sugo scooter mark, white on transparent (scripts/export-brand-icons.mjs); tintColor recolours it.
const SUGO_MARK = require('../../assets/brand/sugo-mark-white.png');

export interface RiderHeaderProps {
  mission?: UseRiderMissionReturn;
  isOffline?: boolean;
  riderName?: string;
  initials?: string;
}

export function RiderHeader({
  mission,
  isOffline: propIsOffline,
  riderName: propRiderName,
  initials: propInitials,
}: RiderHeaderProps) {
  const { isOnline } = useRiderAuth();
  
  // Real connectivity and duty status
  const isOffline = mission ? !isOnline : propIsOffline ?? false;
  const riderName = mission ? mission.riderProfile?.name ?? '' : propRiderName ?? '';
  const initials = mission ? mission.riderProfile?.initials ?? '?' : propInitials ?? '?';
  const profileId = mission?.riderProfile?.id;
  const photoUpdatedAt = mission?.riderProfile?.photoUpdatedAt;
  const photoKey = profileId && photoUpdatedAt ? `${profileId}:${photoUpdatedAt}` : null;
  const [photo, setPhoto] = useState<{ key: string; uri: string } | null>(null);
  const avatarUri = photo?.key === photoKey ? photo?.uri : null;

  // Match Profile's photo endpoint and refresh whenever its timestamp changes.
  useEffect(() => {
    let cancelled = false;
    setPhoto(null);
    if (!profileId || !photoKey) return;

    riderApiService.fetchProfilePhoto(profileId)
      .then(uri => {
        if (!cancelled && uri) setPhoto({ key: photoKey, uri });
      })
      .catch(() => { /* Keep initials when the photo cannot be loaded. */ });

    return () => { cancelled = true; };
  }, [profileId, photoKey]);

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.brandContainer}>
          <View style={styles.logoBox}>
            <Image source={SUGO_MARK} style={styles.logoMark} resizeMode="contain" accessible={false} />
          </View>
          <View style={styles.brandText}>
            <Text style={styles.companyName} maxFontSizeMultiplier={1.25}>Sugo Rider</Text>
            <Text style={[styles.dutyStatus, !isOffline && styles.onDutyText]} maxFontSizeMultiplier={1.25}>{isOffline ? 'Off duty' : 'On duty'}</Text>
          </View>
        </View>
        
        <View style={styles.actionButtons}>
          <NotificationBell />
        </View>
      </View>

      <View style={styles.riderInfoRow}>
        <View style={styles.avatarCircle}>
          {avatarUri ? (
            <Image
              source={{ uri: avatarUri }}
              style={styles.avatarImage}
              onError={() => setPhoto(null)}
              accessibilityLabel={`${riderName}'s profile picture`}
              testID="home-avatar-image"
            />
          ) : (
            <Text style={styles.avatarText} maxFontSizeMultiplier={1.25}>{initials}</Text>
          )}
        </View>
        <View style={styles.riderMetaColumn}>
          <Text style={styles.riderName} maxFontSizeMultiplier={1.25}>{riderName}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...ScreenLayout.frame,
    flexShrink: 0,
    backgroundColor: HomeColors.background,
    paddingHorizontal: ScreenSpacing.horizontal,
    paddingTop: ScreenSpacing.top,
    paddingBottom: ScreenSpacing.top,
    borderBottomWidth: 1,
    borderBottomColor: HomeColors.divider,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  brandContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  brandText: { flex: 1 },
  logoBox: {
    width: moderateScale(36, 0.2),
    height: moderateScale(36, 0.2),
    borderRadius: BorderRadius.md,
    backgroundColor: HomeColors.accentSurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoMark: {
    width: moderateScale(26, 0.2),
    aspectRatio: 1.5,
    tintColor: HomeColors.accent,
  },
  companyName: {
    color: Colors.navy,
    fontSize: scaledFontSize(FontSizes.md, 0.35),
    fontWeight: FontWeights.bold,
  },
  dutyStatus: {
    color: Colors.textGray,
    fontSize: scaledFontSize(FontSizes.sm, 0.35),
  },
  onDutyText: { color: Colors.success },
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
    borderColor: HomeColors.accentBorder,
    backgroundColor: HomeColors.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: {
    fontFamily: FontFamily.bold,
    color: HomeColors.accent,
    fontSize: scaledFontSize(FontSizes.base, 0.2),
  },
  riderMetaColumn: {
    flex: 1,
  },
  riderName: {
    fontFamily: FontFamily.bold,
    color: Colors.navy,
    fontSize: scaledFontSize(FontSizes.md, 0.35),
  },
});

export default RiderHeader;
