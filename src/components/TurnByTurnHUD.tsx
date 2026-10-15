import React from 'react';
import { Animated, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
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
import { departInstruction } from '../utils/compass';
import { navigationBannerText, thenText } from '../utils/maneuverText';

interface TurnByTurnHUDProps {
  maneuver: ManeuverState;
  phase?: RoutePhase;
  targetName?: string;
  /** Custom top offset for layered stacking; defaults below top header bar. */
  topOffset?: number;
  /** The panel's own layout, so the screen can stack what sits below it. */
  onLayout?: (event: LayoutChangeEvent) => void;
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
export function TurnByTurnHUD({ maneuver, phase = 'shopping', targetName, topOffset, onLayout }: TurnByTurnHUDProps) {
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
  const hudTop = topOffset ?? (insets.top + moderateScale(56, 0.2));

  // A new maneuver slides in rather than replacing the old one in a single
  // frame, which at a junction read as the panel flickering mid-turn.
  const swap = React.useRef(new Animated.Value(1)).current;
  const shownKey = `${maneuver.displayedStepIndex ?? 0}:${maneuverType}:${modifier ?? ''}`;
  const lastKey = React.useRef(shownKey);
  React.useEffect(() => {
    if (lastKey.current === shownKey) return;
    lastKey.current = shownKey;
    swap.setValue(0);
    Animated.timing(swap, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [shownKey, swap]);
  const swapStyle = {
    opacity: swap,
    transform: [{ translateY: swap.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
  };

  // Google Maps' order: the turn and how far ahead on top ("In 55 m, turn
  // right"), the street under it ("onto Rizal Street"). Setting off, the second
  // line says which way out of the gate instead ("Head west on Alunan Avenue"),
  // since the rider is not on any street of the route yet.
  //
  // A route that is nothing but its departure (no turn anywhere on it) still
  // says the departure on top, as before.
  const onlyDeparture = maneuverType === 'depart';
  const banner = onlyDeparture
    ? {
        primary: departInstruction(maneuver.activeStep?.bearingAfter, streetName) ?? instruction,
        secondary: '',
      }
    : navigationBannerText({
        distanceMeters: maneuver.distanceToManeuverMeters,
        maneuverType,
        modifier,
        streetName,
        instruction,
        targetName,
      });
  const setOff = maneuver.setOff
    ? departInstruction(maneuver.setOff.bearingAfter, maneuver.setOff.streetName) ?? maneuver.setOff.instruction
    : null;
  const secondaryText = setOff ?? banner.secondary;

  return (
    <View style={[styles.container, { top: hudTop }]} pointerEvents="box-none" onLayout={onLayout}>
      <View style={[styles.hudCard, isNearManeuver && styles.hudCardUrgent]}>
        {/* Left: Direction Icon Container */}
        <Animated.View style={[styles.iconContainer, { backgroundColor: badgeColor }, swapStyle]}>
          {isOffRoute ? (
            <RefreshCw size={26} color={Colors.textWhite} strokeWidth={2.5} />
          ) : (
            <ManeuverIcon maneuverType={maneuverType} modifier={modifier} size={28} color={Colors.textWhite} />
          )}
        </Animated.View>

        {/* Center: Live Meter Counter & Street Instruction */}
        <Animated.View style={[styles.contentContainer, swapStyle]}>
          {isOffRoute ? (
            <View style={styles.offRouteRow}>
              <Text style={styles.offRouteTitle} maxFontSizeMultiplier={1.25}>
                Recalculating route…
              </Text>
              <Text style={styles.offRouteSubtitle} maxFontSizeMultiplier={1.25}>
                Finding best path back to road
              </Text>
            </View>
          ) : (
            <>
              {/* What to do, and how far ahead: "In 55 m, turn right". Capped
                  at 2 lines. Green once the turn is close. */}
              <Text
                style={[styles.primaryText, isNearManeuver && styles.primaryTextUrgent]}
                numberOfLines={2}
                ellipsizeMode="tail"
                maxFontSizeMultiplier={1.25}
                testID="hud-instruction"
              >
                {banner.primary || formattedDistance || 'Follow the route'}
              </Text>

              {/* Where: "onto Rizal Street", or the way out while setting off.
                  Laid out even on an unnamed road, for the same one height. */}
              <Text
                style={styles.secondaryText}
                numberOfLines={1}
                ellipsizeMode="tail"
                maxFontSizeMultiplier={1.25}
                testID="hud-street"
                importantForAccessibility={secondaryText ? 'auto' : 'no-hide-descendants'}
              >
                {secondaryText || ' '}
              </Text>

              {/* The turn after, when it comes quickly, and what is left of the
                  whole route. Always laid out, so the panel keeps one height:
                  it used to grow a line within 50 m of every turn and shrink
                  after it, and the capsules stacked below it jumped each time. */}
              <View style={styles.footerRow} testID="hud-preview-row">
                <View
                  style={[styles.previewGroup, !nextStepPreview && styles.previewRowIdle]}
                  importantForAccessibility={nextStepPreview ? 'auto' : 'no-hide-descendants'}
                >
                  <ManeuverIcon
                    maneuverType={nextStepPreview?.maneuverType ?? 'continue'}
                    modifier={nextStepPreview?.modifier}
                    size={14}
                    color={Colors.navyLight}
                  />
                  <Text style={styles.previewText} numberOfLines={1} maxFontSizeMultiplier={1.25}>
                    {nextStepPreview ? thenText(nextStepPreview.maneuverType, nextStepPreview.modifier) : ' '}
                  </Text>
                </View>
                {formattedTotalDistance ? (
                  <Text style={styles.totalText} numberOfLines={1} maxFontSizeMultiplier={1.25}>
                    {formattedTotalDistance} left
                  </Text>
                ) : null}
              </View>
            </>
          )}
        </Animated.View>
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
    alignItems: 'flex-start',
    backgroundColor: Colors.navy,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
    minHeight: moderateScale(64, 0.2),
    width: '100%',
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
  // "In 55 m, turn right": the line read at a glance, so the largest.
  primaryText: {
    fontFamily: FontFamily.bold,
    color: Colors.textWhite,
    fontSize: scaledFontSize(FontSizes.lg, 0.2),
    letterSpacing: -0.2,
  },
  primaryTextUrgent: {
    color: Colors.maneuverUrgent, // Crisp emerald green once the turn is close
  },
  // "onto Rizal Street".
  secondaryText: {
    fontFamily: FontFamily.semibold,
    color: Colors.whiteOverlayText,
    fontSize: scaledFontSize(FontSizes.sm, 0.2),
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: 2,
  },
  previewGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  // Keeps its height, shows nothing.
  previewRowIdle: {
    opacity: 0,
  },
  previewText: {
    fontFamily: FontFamily.medium,
    color: Colors.whiteOverlayText,
    fontSize: scaledFontSize(FontSizes.xs, 0.2),
    flexShrink: 1,
  },
  totalText: {
    fontFamily: FontFamily.monoBold,
    color: Colors.whiteOverlayText,
    fontSize: scaledFontSize(FontSizes.xxs, 0.2),
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
    maxWidth: moderateScale(140, 0.25),
    flexShrink: 1,
  },
  targetPillText: {
    color: Colors.textDark,
    fontSize: scaledFontSize(FontSizes.xxs, 0.2),
    fontWeight: FontWeights.bold as any,
  },
});

export default TurnByTurnHUD;
