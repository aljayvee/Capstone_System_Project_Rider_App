import React, { useCallback, useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, BorderRadius, Spacing, Elevation } from '../config/theme';

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
  /**
   * Pinned below the sheet, always on screen, open or closed: the action a
   * rider needs without dragging anything. It does not scroll or slide; the
   * sheet slides above it.
   */
  footer?: React.ReactNode;
  /**
   * How much of the screen the sheet covers when closed (the peek plus the
   * footer), whenever that changes. What the map needs to keep its controls
   * and its camera clear of the sheet.
   */
  onPeekChange?: (peek: number) => void;
  /** The tallest the open sheet may be, e.g. to stop below a navigation panel. */
  maxHeight?: number;
  /**
   * The most of the screen the open sheet and its footer together may cover,
   * 0-1. Over a map being navigated by, the part left uncovered is what keeps
   * the rider and the road ahead in sight while they read the errand.
   */
  maxCoverRatio?: number;
  /**
   * How much of the screen the sheet covers right now, open or closed, once it
   * settles. onPeekChange only ever reports the closed height. 0 while hidden.
   */
  onCoverChange?: (covered: number) => void;
  /**
   * Slides the sheet AND its footer off the bottom of the screen, leaving the
   * map beneath uncovered. Controlled: the caller decides, and brings it back.
   */
  hidden?: boolean;
  /**
   * Asked for when the rider swipes the closed sheet down. Without it the sheet
   * cannot be swiped away, as before.
   */
  onHiddenChange?: (hidden: boolean) => void;
  /**
   * Whether the sheet itself pads the phone's bottom inset. False inside a tab
   * screen, where the tab bar below it already does: padding it twice left a
   * dead white strip under the action button.
   */
  padSafeAreaBottom?: boolean;
}

const SPRING = { damping: 20, stiffness: 180, mass: 0.6 };

/** The drag handle's height (styles.handleArea), for callers sizing the peek to their header. */
export const SHEET_HANDLE_HEIGHT = 48;

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
  footer,
  onPeekChange,
  maxHeight,
  maxCoverRatio,
  onCoverChange,
  hidden = false,
  onHiddenChange,
  padSafeAreaBottom = true,
}: BottomSheetProps) {
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const safeBottom = padSafeAreaBottom ? insets.bottom : 0;
  const [footerHeight, setFooterHeight] = useState(0);
  const onFooterLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.height);
    setFooterHeight((prev) => (prev === next ? prev : next));
  }, []);
  const pinned = footer ? footerHeight : 0;

  // The open sheet sits above the footer, so the footer's height comes off it.
  const ratioHeight = Math.round(screenHeight * expandedRatio);
  const coverCap =
    maxCoverRatio != null && maxCoverRatio > 0 ? Math.round(screenHeight * maxCoverRatio) - pinned : Infinity;
  const expandedHeight = Math.max(
    collapsedHeight,
    Math.min(
      ratioHeight,
      coverCap,
      maxHeight != null && maxHeight > 0 ? Math.round(maxHeight) - pinned : Infinity
    )
  );
  // How far down the sheet sits. 0 is fully open; `travel` is fully collapsed.
  const travel = Math.max(expandedHeight - collapsedHeight, 0);

  const translateY = useSharedValue(travel);
  const startY = useSharedValue(0);

  const unpadded = footer ? 0 : safeBottom + bottomInset;
  // Far enough down that nothing of the closed sheet, its footer or its shadow
  // is left on screen.
  const hideDistance = collapsedHeight + pinned + unpadded + 32;
  const hideY = useSharedValue(hidden ? hideDistance : 0);
  useEffect(() => {
    hideY.value = withSpring(hidden ? hideDistance : 0, SPRING);
  }, [hidden, hideDistance, hideY]);

  useEffect(() => {
    onPeekChange?.(collapsedHeight + pinned + unpadded);
  }, [collapsedHeight, pinned, unpadded, onPeekChange]);

  useEffect(() => {
    if (!onCoverChange || expanded === undefined) return;
    onCoverChange(hidden ? 0 : (expanded ? expandedHeight : collapsedHeight) + pinned + unpadded);
  }, [hidden, expanded, expandedHeight, collapsedHeight, pinned, unpadded, onCoverChange]);

  const requestHide = useCallback(() => onHiddenChange?.(true), [onHiddenChange]);
  const canHide = onHiddenChange != null;

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
      // Dragged on past closed, the whole sheet and its footer follow the
      // finger down, the way it will leave if let go.
      if (canHide) hideY.value = Math.max(0, next - travel);
    })
    .onEnd((event) => {
      // Velocity first, position second. A deliberate flick should open the
      // sheet even from a few pixels of travel, which is what it feels like a
      // flick ought to do.
      const flungOpen = event.velocityY < -400;
      const flungShut = event.velocityY > 400;
      // Down from closed, or dragged well past closed: off the screen. A flick
      // down from open only closes it, so one flick never throws it away.
      const pastClosed = startY.value + event.translationY - travel;
      const startedClosed = startY.value >= travel - 1;
      if (canHide && (pastClosed > 48 || (flungShut && startedClosed))) {
        translateY.value = withSpring(travel, SPRING);
        hideY.value = withSpring(hideDistance, SPRING);
        runOnJS(settle)(false);
        runOnJS(requestHide)();
        return;
      }
      hideY.value = withSpring(0, SPRING);
      const isOpen = flungOpen ? true : flungShut ? false : translateY.value < travel / 2;
      translateY.value = withSpring(isOpen ? 0 : travel, SPRING);
      runOnJS(settle)(isOpen);
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value + hideY.value }],
  }));
  const footerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: hideY.value }],
  }));
  // Off screen is out of reach for touch and for the screen reader alike.
  const hiddenProps = hidden
    ? ({ pointerEvents: 'none', importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const)
    : ({ pointerEvents: 'auto', importantForAccessibility: 'auto', accessibilityElementsHidden: false } as const);

  // With a footer, the sheet stands on top of it and the footer takes the
  // bottom inset. Without one, the sheet takes it, as it always did.
  const sheetPadding = footer ? 0 : safeBottom + bottomInset;
  return (
    <>
      <Animated.View
        style={[
          styles.sheet,
          {
            bottom: pinned,
            height: expandedHeight + sheetPadding,
            paddingBottom: sheetPadding,
          },
          sheetStyle,
        ]}
        testID="bottom-sheet"
        {...hiddenProps}
      >
        {/* Only the handle area drags. The body below it scrolls normally. */}
        <GestureDetector gesture={pan}>
          <View style={styles.handleArea} accessibilityRole="adjustable">
            <View style={styles.handle} />
          </View>
        </GestureDetector>
        <View style={styles.body}>{children}</View>
      </Animated.View>
      {footer ? (
        <Animated.View
          style={[styles.footer, { paddingBottom: safeBottom + bottomInset }, footerStyle]}
          onLayout={onFooterLayout}
          testID="bottom-sheet-footer"
          {...hiddenProps}
        >
          {footer}
        </Animated.View>
      ) : null}
    </>
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
    elevation: Elevation.bottomSheet,
  },
  handleArea: {
    alignItems: 'center',
    justifyContent: 'center',
    // Comfortably past the 48dp minimum: this is the grab target, and it is
    // being aimed at one-handed by someone who has just stopped a motorcycle.
    minHeight: SHEET_HANDLE_HEIGHT,
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
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.bgWhite,
    // Above the sliding sheet, which passes behind it. On Android elevation,
    // not tree order, decides that.
    elevation: Elevation.bottomSheet + 1,
    zIndex: 1,
  },
});

export default BottomSheet;
