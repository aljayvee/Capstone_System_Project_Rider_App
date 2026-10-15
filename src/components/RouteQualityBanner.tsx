import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '../config/theme';
import type { RouteFailureReason } from '../services/routeRetry';

/**
 * Says plainly that the line on the map is a guess.
 *
 * Separate from StatusBanner on purpose. That one is for events: it clears
 * itself after four seconds and carries a dismiss control. This is a condition —
 * it must stay up for as long as the route is approximate, and there is nothing
 * for the rider to dismiss or decide.
 *
 * The wording is byte-identical to the customer's tracking screen so the two
 * apps cannot drift into describing the same state differently.
 */

/** Kept in one place so the render test can assert it against the CustomerApp copy. */
export const APPROXIMATE_ROUTE_TEXT =
  'Showing an approximate route — road directions are unavailable right now';

interface RouteQualityBannerProps {
  visible: boolean;
  /** Shown in development only, as the reason is otherwise invisible on a device. */
  reason?: RouteFailureReason | null;
}

export function RouteQualityBanner({ visible, reason }: RouteQualityBannerProps) {
  if (!visible) return null;

  return (
    <View
      style={styles.container}
      // No touches at all. This sits over a map the rider is reading and offers
      // no controls, so it must never take a tap meant for the map.
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID="route-quality-banner"
    >
      <AlertTriangle size={18} color={Colors.warning} />
      <View style={styles.textColumn}>
        <Text style={styles.text} numberOfLines={2} maxFontSizeMultiplier={1.15}>
          {APPROXIMATE_ROUTE_TEXT}
        </Text>
        {__DEV__ && reason ? (
          <Text style={styles.detail} maxFontSizeMultiplier={1.15} testID="route-quality-reason">
            {reason}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    // The same warning pairing StatusBanner uses, already asserted as an AA
    // contrast pair by the palette test. No new colour is introduced here.
    backgroundColor: Colors.warningSubtle,
    borderColor: Colors.warning,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
  },
  textColumn: {
    flex: 1,
  },
  text: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold as any,
    color: Colors.warning,
  },
  detail: {
    fontSize: FontSizes.sm,
    color: Colors.warning,
    opacity: 0.8,
  },
});
