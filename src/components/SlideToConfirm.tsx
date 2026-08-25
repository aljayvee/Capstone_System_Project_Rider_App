import React, { useCallback, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ChevronsRight } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, BorderRadius } from '../config/theme';

export interface SlideToConfirmProps {
  label: string;
  onSlideComplete: () => void;
  disabled?: boolean;
  height?: number;
  trackColor?: string;
  thumbColor?: string;
  completeThreshold?: number;
}

const DEFAULT_HEIGHT = 56;
const DEFAULT_THRESHOLD = 0.85;

export function SlideToConfirm({
  label,
  onSlideComplete,
  disabled = false,
  height = DEFAULT_HEIGHT,
  trackColor = Colors.primaryLight,
  thumbColor = Colors.primary,
  completeThreshold = DEFAULT_THRESHOLD,
}: SlideToConfirmProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);
  const firedRef = React.useRef(false);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  }, []);

  const maxTranslate = Math.max(trackWidth - height, 0);

  const fireComplete = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    onSlideComplete();
  }, [onSlideComplete]);

  const pan = Gesture.Pan()
    .enabled(!disabled && trackWidth > 0)
    .onStart(() => {
      startX.value = translateX.value;
    })
    .onUpdate((event) => {
      const next = startX.value + event.translationX;
      translateX.value = Math.min(Math.max(next, 0), maxTranslate);
    })
    .onEnd(() => {
      if (maxTranslate > 0 && translateX.value >= maxTranslate * completeThreshold) {
        translateX.value = withTiming(maxTranslate, { duration: 150 }, () => {
          runOnJS(fireComplete)();
        });
      } else {
        translateX.value = withSpring(0);
      }
    });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const labelStyle = useAnimatedStyle(() => {
    const progress = maxTranslate > 0 ? translateX.value / maxTranslate : 0;
    return { opacity: 1 - progress };
  });

  return (
    <View
      onLayout={handleLayout}
      style={[
        styles.track,
        { height, borderRadius: height / 2, backgroundColor: trackColor },
        disabled && styles.trackDisabled,
      ]}
    >
      <Animated.Text style={[styles.label, labelStyle, { color: thumbColor }]}>{label}</Animated.Text>
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            styles.thumb,
            thumbStyle,
            {
              width: height,
              height,
              borderRadius: height / 2,
              backgroundColor: disabled ? Colors.textLight : thumbColor,
            },
          ]}
        >
          <ChevronsRight size={height * 0.5} color={Colors.textWhite} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  trackDisabled: {
    opacity: 0.6,
  },
  label: {
    position: 'absolute',
    alignSelf: 'center',
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold as any,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
});
