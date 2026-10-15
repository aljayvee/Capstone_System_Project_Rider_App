import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Wrench, AlertTriangle, ShieldAlert } from 'lucide-react-native';
import { useThemeContext } from '../context/ThemeContext';
import { FontFamily, FontSizes, Spacing, BorderRadius } from '../config/theme';
import type { RiderMaintenanceNoticeState } from '../hooks/useMaintenanceNotice';

interface MaintenanceNoticeBannerProps {
  notice: RiderMaintenanceNoticeState;
}

export const MaintenanceNoticeBanner: React.FC<MaintenanceNoticeBannerProps> = ({ notice }) => {
  const { colors, isDark } = useThemeContext();

  if (!notice.isActive) {
    return null;
  }

  const isEmergency = notice.maintenanceType === 'EMERGENCY' || notice.maintenanceType === 'SECURITY';
  const accentColor = isEmergency ? colors.danger : colors.warning;
  const bgColor = isEmergency ? colors.dangerBg : colors.warningBg;
  const borderColor = isEmergency
    ? (isDark ? 'rgba(239, 68, 68, 0.4)' : '#FECACA')
    : (isDark ? 'rgba(245, 158, 11, 0.4)' : '#FDE68A');

  const IconComponent = isEmergency ? ShieldAlert : (notice.maintenanceType === 'UPGRADE' ? Wrench : AlertTriangle);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: bgColor,
          borderColor: borderColor,
        },
      ]}
      accessibilityRole="summary"
      accessibilityLabel={`System Notice: ${notice.header}. ${notice.message}`}
    >
      <View style={styles.topRow}>
        <View
          style={[
            styles.iconBox,
            { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' },
          ]}
        >
          <IconComponent size={18} color={accentColor} strokeWidth={2.2} />
        </View>

        <View style={styles.textColumn}>
          <View style={styles.tagRow}>
            <View style={[styles.badge, { backgroundColor: accentColor }]}>
              <Text style={styles.badgeText} maxFontSizeMultiplier={1.15}>
                {notice.maintenanceType || 'MAINTENANCE'}
              </Text>
            </View>
            <Text style={[styles.liveIndicator, { color: accentColor }]} maxFontSizeMultiplier={1.15}>
              • System Notice
            </Text>
          </View>
          <Text
            style={[styles.headerTitle, { color: isDark ? '#F9FAFB' : '#111827' }]}
            maxFontSizeMultiplier={1.15}
          >
            {notice.header}
          </Text>
        </View>
      </View>

      <Text
        style={[styles.messageBody, { color: isDark ? '#D1D5DB' : '#374151' }]}
        maxFontSizeMultiplier={1.15}
      >
        {notice.message}
      </Text>

      {notice.supportContact ? (
        <View style={styles.footerRow}>
          <Text
            style={[styles.footerText, { color: isDark ? '#9CA3AF' : '#6B7280' }]}
            maxFontSizeMultiplier={1.15}
          >
            Dispatch Desk: {notice.supportContact}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm + 2,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  textColumn: {
    flex: 1,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontFamily: FontFamily.bold,
    letterSpacing: 0.5,
  },
  liveIndicator: {
    fontSize: 10,
    fontFamily: FontFamily.semibold,
  },
  headerTitle: {
    fontSize: FontSizes.sm + 1,
    fontFamily: FontFamily.bold,
    letterSpacing: -0.2,
  },
  messageBody: {
    fontSize: FontSizes.xs + 1,
    fontFamily: FontFamily.regular,
    lineHeight: 18,
    marginTop: Spacing.xs,
  },
  footerRow: {
    marginTop: Spacing.xs + 2,
    paddingTop: Spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  footerText: {
    fontSize: 11,
    fontFamily: FontFamily.medium,
  },
});

export default MaintenanceNoticeBanner;
