import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, AccessibilityInfo } from 'react-native';
import { CheckCircle2, Info, AlertTriangle, X } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '../config/theme';
import type { RiderBanner, BannerTone } from '../types/rider';

/**
 * Confirmation that does not stop the rider.
 *
 * The five Alert.alert dialogs this replaces all fired on SUCCESS, and each one
 * cost a tap to dismiss — a hand off the handlebars to be told about something
 * that had already happened. Failures and genuine questions keep their dialogs,
 * because those do need to interrupt.
 *
 * Announced to the screen reader explicitly: a visual-only banner is exactly the
 * regression you get when you remove a modal, since a modal took focus and this
 * does not.
 */

const TONE: Record<BannerTone, { fg: string; bg: string; border: string; Icon: typeof Info }> = {
  success: { fg: Colors.success, bg: Colors.successSubtle, border: Colors.success, Icon: CheckCircle2 },
  info: { fg: Colors.navy, bg: Colors.infoSubtle, border: Colors.navy, Icon: Info },
  warning: { fg: Colors.warning, bg: Colors.warningSubtle, border: Colors.warning, Icon: AlertTriangle },
};

interface StatusBannerProps {
  banner: RiderBanner | null;
  onDismiss: () => void;
}

export function StatusBanner({ banner, onDismiss }: StatusBannerProps) {
  // Keyed on id rather than text, so the same message shown twice still
  // announces twice — "Delivered" on two errands in a row is two events.
  React.useEffect(() => {
    if (banner) AccessibilityInfo.announceForAccessibility(banner.text);
  }, [banner?.id]);

  if (!banner) return null;

  const tone = TONE[banner.tone];
  const { Icon } = tone;

  return (
    <View
      style={[styles.container, { backgroundColor: tone.bg, borderColor: tone.border }]}
      // "status" is the polite live region — it reaches a screen reader without
      // stealing focus from whatever the rider is doing.
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID="status-banner"
    >
      <Icon size={18} color={tone.fg} />
      <Text style={[styles.text, { color: tone.fg }]} numberOfLines={2}>
        {banner.text}
      </Text>
      <TouchableOpacity
        onPress={onDismiss}
        style={styles.dismiss}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel="Dismiss this message"
        testID="status-banner-dismiss"
      >
        <X size={16} color={tone.fg} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
  },
  text: {
    flex: 1,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold as any,
  },
  dismiss: {
    // 48 to match every other control, with hitSlop above carrying the touch
    // area further still. An icon-only control has no text to widen it, so the
    // width floor has to be stated as well as the height.
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
