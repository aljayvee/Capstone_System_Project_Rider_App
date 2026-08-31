import React, { useCallback, useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, BorderRadius, Spacing } from '../config/theme';

export interface BottomSheetProps {
  children: React.ReactNode;
  /** Height of the peeking state, in dp. */
  collapsedHeight?: number;
  /** Fraction of screen height the expanded state occupies. 0-1. */
  expandedRatio?: number;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** Extra bottom padding, e.g. to clear a tab bar. */
  bottomInset?: number;
}

const SPRING = { damping: 20, stiffness: 180, mass: 0.6 };

/**
 * A sheet that sits over a map without ever containing it.
 *
 * The map is the sibling above this in the tree, never the child — react-native-maps
 * renders a native view that a scroll container will fight for touches and, on
 * Android, blank out entirely. That is the reason the live map used to be a
 * modal route rather than something docked to a screen.
 *
 * Dragging moves the sheet; the content inside it scrolls on its own once the
 * sheet is open. The two gestures are separate on purpose — a rider pulling the
 * sheet up should not also fling the list inside it.
 */
export function BottomSheet({
  children,
  collapsedHeight = 132,
  expandedRatio = 0.72,
  expanded,
  onExpandedChange,
  bottomInset = 0,
}: BottomSheetProps) {
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const expandedHeight = Math.round(screenHeight * expandedRatio);
  // How far down the sheet sits. 0 is fully open; `travel` is fully collapsed.
  const travel = Math.max(expandedHeight - collapsedHeight, 0);

  const translateY = useSharedValue(travel);
  const startY = useSharedValue(0);

  const settle = useCallback(
    (isOpen: boolean) => {
      onExpandedChange?.(isOpen);
    },
    [onExpandedChange]
  );

  // Controlled from outside: selecting an errand on the map should open the
  // sheet without the rider having to drag it too.
  useEffect(() => {
    if (expanded === undefined) return;
    translateY.value = withSpring(expanded ? 0 : travel, SPRING);
  }, [expanded, travel, translateY]);

  const pan = Gesture.Pan()
    .onStart(() => {
      startY.value = translateY.value;
    })
    .onUpdate((event) => {
      const next = startY.value + event.translationY;
      translateY.value = Math.min(Math.max(next, 0), travel);
    })
    .onEnd((event) => {
      // Velocity first, position second. A deliberate flick should open the
      // sheet even from a few pixels of travel, which is what it feels like a
      // flick ought to do.
      const flungOpen = event.velocityY < -400;
      const flungShut = event.velocityY > 400;
      const isOpen = flungOpen ? true : flungShut ? false : translateY.value < travel / 2;
      translateY.value = withSpring(isOpen ? 0 : travel, SPRING);
      runOnJS(settle)(isOpen);
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.sheet,
        {
          height: expandedHeight + insets.bottom + bottomInset,
          paddingBottom: insets.bottom + bottomInset,
        },
        sheetStyle,
      ]}
    >
      {/* Only the handle area drags. The body below it scrolls normally. */}
      <GestureDetector gesture={pan}>
        <View style={styles.handleArea} accessibilityRole="adjustable">
          <View style={styles.handle} />
        </View>
      </GestureDetector>
      <View style={styles.body}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.bgWhite,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
  },
  handleArea: {
    alignItems: 'center',
    justifyContent: 'center',
    // Comfortably past the 48dp minimum: this is the grab target, and it is
    // being aimed at one-handed by someone who has just stopped a motorcycle.
    minHeight: 48,
    paddingTop: Spacing.sm,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.border,
  },
  body: {
    flex: 1,
  },
});

export default BottomSheet;
