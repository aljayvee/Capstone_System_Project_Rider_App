import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CornerUpLeft,
  CornerUpRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  RotateCcw,
  Store,
  MapPin,
  RefreshCw,
  Navigation,
} from 'lucide-react-native';
import {
  Colors,
  Spacing,
  BorderRadius,
  FontSizes,
  FontWeights,
  FontFamily,
  scaledFontSize,
  moderateScale,
} from '../config/theme';
import type { ManeuverState } from '../hooks/useTurnByTurnNavigation';
import type { RoutePhase } from '../services/routePhase';

interface TurnByTurnHUDProps {
  maneuver: ManeuverState;
  phase?: RoutePhase;
  targetName?: string;
}

/**
 * Renders the appropriate directional arrow icon for a maneuver.
 */
function ManeuverIcon({
  maneuverType,
  modifier,
  size = 28,
  color = Colors.textWhite,
}: {
  maneuverType: string;
  modifier?: string;
  size?: number;
  color?: string;
}) {
  const mod = (modifier || '').toLowerCase();
  const type = (maneuverType || '').toLowerCase();

  if (type === 'arrive') {
    return <MapPin size={size} color={color} strokeWidth={2.5} />;
  }

  if (type === 'uturn' || mod.includes('uturn')) {
    return <RotateCcw size={size} color={color} strokeWidth={2.5} />;
  }

  if (mod.includes('sharp left') || mod.includes('slight left') || mod === 'left') {
    return <CornerUpLeft size={size} color={color} strokeWidth={2.8} />;
  }

  if (mod.includes('sharp right') || mod.includes('slight right') || mod === 'right') {
    return <CornerUpRight size={size} color={color} strokeWidth={2.8} />;
  }

  if (mod.includes('fork left')) {
    return <ArrowUpLeft size={size} color={color} strokeWidth={2.5} />;
  }

  if (mod.includes('fork right')) {
    return <ArrowUpRight size={size} color={color} strokeWidth={2.5} />;
  }

  if (type === 'roundabout' || type === 'rotary') {
    return <RotateCcw size={size} color={color} strokeWidth={2.5} />;
  }

  return <ArrowUp size={size} color={color} strokeWidth={2.8} />;
}

/**
 * Grab / Google Maps-Style Turn-by-Turn Navigation Floating HUD.
 *
 * Sits prominently at the top of the live delivery map, giving the rider
 * immediate high-contrast situational awareness with:
 * 1. Bold maneuver direction arrow (Turn Left, Right, Straight, U-turn, Arrive).
 * 2. Live meter countdown ("In 250 m", "In 40 m", "Turn Now").
 * 3. Street name / Destination target name.
 * 4. Sub-preview for rapid upcoming maneuvers ("Then turn right").
 * 5. Re-routing indicator if off-route.
 */
export function TurnByTurnHUD({ maneuver, phase = 'shopping', targetName }: TurnByTurnHUDProps) {
  const insets = useSafeAreaInsets();
  const {
    instruction,
    streetName,
    maneuverType,
    modifier,
    formattedDistance,
    nextStepPreview,
    isNearManeuver,
    isOffRoute,
    formattedTotalDistance,
  } = maneuver;

  const isDelivering = phase === 'delivering';
  const badgeColor = isDelivering ? Colors.routeToCustomer : Colors.routeToStore;

  return (
    <View style={[styles.container, { top: insets.top + Spacing.xs }]} pointerEvents="box-none">
      <View style={[styles.hudCard, isNearManeuver && styles.hudCardUrgent]}>
        {/* Left: Direction Icon Container */}
        <View style={[styles.iconContainer, { backgroundColor: badgeColor }]}>
          {isOffRoute ? (
            <RefreshCw size={26} color={Colors.textWhite} strokeWidth={2.5} />
          ) : (
            <ManeuverIcon maneuverType={maneuverType} modifier={modifier} size={28} color={Colors.textWhite} />
          )}
        </View>

        {/* Center: Live Meter Counter & Street Instruction */}
        <View style={styles.contentContainer}>
          {isOffRoute ? (
            <View style={styles.offRouteRow}>
              <Text style={styles.offRouteTitle} maxFontSizeMultiplier={1.15}>
                Recalculating route…
              </Text>
              <Text style={styles.offRouteSubtitle} maxFontSizeMultiplier={1.15}>
                Finding best path back to road
              </Text>
            </View>
          ) : (
            <>
              {/* Distance Countdown Pill & Next Action */}
              <View style={styles.distanceRow}>
                <Text
                  style={[styles.distanceText, isNearManeuver && styles.distanceTextUrgent]}
                  maxFontSizeMultiplier={1.2}
                >
                  {formattedDistance || 'Follow route'}
                </Text>
                {formattedTotalDistance ? (
                  <View style={styles.totalBadge}>
                    <Text style={styles.totalBadgeText} maxFontSizeMultiplier={1.1}>
                      {formattedTotalDistance} left
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Street Name or Target Instruction */}
              <Text style={styles.instructionText} numberOfLines={1} maxFontSizeMultiplier={1.15}>
                {streetName ? `${modifier ? `Turn ${modifier} onto ` : ''}${streetName}` : instruction}
              </Text>

              {/* Sub-line Next Step Preview (e.g. "Then turn right") */}
              {nextStepPreview && (
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel} maxFontSizeMultiplier={1.1}>
                    Then:
                  </Text>
                  <ManeuverIcon
                    maneuverType={nextStepPreview.maneuverType}
                    modifier={nextStepPreview.modifier}
                    size={14}
                    color={Colors.navyLight}
                  />
                  <Text style={styles.previewText} numberOfLines={1} maxFontSizeMultiplier={1.1}>
                    {nextStepPreview.instruction}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* Right: Phase Identity Pill (Store vs Customer) */}
        {targetName ? (
          <View style={styles.targetPill}>
            {isDelivering ? (
              <MapPin size={12} color={Colors.routeToCustomer} />
            ) : (
              <Store size={12} color={Colors.routeToStore} />
            )}
            <Text style={styles.targetPillText} numberOfLines={1} maxFontSizeMultiplier={1.1}>
              {targetName}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs,
    zIndex: 20,
  },
  hudCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.navy,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  hudCardUrgent: {
    borderColor: Colors.routeToCustomer,
    backgroundColor: Colors.hudCardUrgentBg,
  },
  iconContainer: {
    width: moderateScale(48, 0.2),
    height: moderateScale(48, 0.2),
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  contentContainer: {
    flex: 1,
    gap: 2,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  distanceText: {
    fontFamily: FontFamily.monoExtraBold,
    color: Colors.textWhite,
    fontSize: scaledFontSize(FontSizes.lg, 0.2),
    letterSpacing: -0.3,
  },
  distanceTextUrgent: {
    color: Colors.maneuverUrgent, // Crisp emerald green for "Turn Now"
  },
  totalBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  totalBadgeText: {
    fontFamily: FontFamily.monoBold,
    color: Colors.whiteOverlayText,
    fontSize: scaledFontSize(FontSizes.xxs, 0.2),
  },
  instructionText: {
    fontFamily: FontFamily.bold,
    color: Colors.textWhite,
    fontSize: scaledFontSize(FontSizes.sm, 0.2),
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  previewLabel: {
    fontFamily: FontFamily.semibold,
    color: Colors.navyLight,
    fontSize: scaledFontSize(FontSizes.xxs, 0.2),
  },
  previewText: {
    fontFamily: FontFamily.medium,
    color: Colors.whiteOverlayText,
    fontSize: scaledFontSize(FontSizes.xxs, 0.2),
    flex: 1,
  },
  offRouteRow: {
    gap: 2,
  },
  offRouteTitle: {
    color: Colors.maneuverAlert, // Amber alert
    fontSize: scaledFontSize(FontSizes.md, 0.2),
    fontWeight: FontWeights.bold as any,
  },
  offRouteSubtitle: {
    color: Colors.whiteOverlayText,
    fontSize: scaledFontSize(FontSizes.xs, 0.2),
  },
  targetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.bgWhite,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    maxWidth: 90,
  },
  targetPillText: {
    color: Colors.textDark,
    fontSize: scaledFontSize(FontSizes.xxs, 0.2),
    fontWeight: FontWeights.bold as any,
  },
});

export default TurnByTurnHUD;
