import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View, ViewStyle, StyleProp, LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export interface ShimmerWaveProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * Ported from the CustomerApp (src/components/ShimmerWave.tsx) on 2026-10-22
 * for the rider Notifications screen: the rider app had no skeleton component.
 *
 * 60 / 90 / 120 FPS hardware-accelerated smooth wave shimmer placeholder.
 * Sweeps a linear gradient wave horizontally across the container using native driver transforms.
 */
export default function ShimmerWave({
  width = '100%',
  height = 20,
  borderRadius = 4,
  style,
  children,
}: ShimmerWaveProps) {
  // Light only: the rider app has no dark mode (the CustomerApp original follows the system theme).
  const isDark = false;
  const [layoutWidth, setLayoutWidth] = useState<number>(typeof width === 'number' ? width : 320);
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(animatedValue, {
        toValue: 1,
        duration: 1350,
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [animatedValue]);

  const translateX = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [-layoutWidth * 1.5, layoutWidth * 1.5],
  });

  const baseBg = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
  const shimmerColors = isDark
    ? (['transparent', 'rgba(255, 255, 255, 0.10)', 'transparent'] as const)
    : (['transparent', 'rgba(255, 255, 255, 0.65)', 'transparent'] as const);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - layoutWidth) > 5) {
      setLayoutWidth(w);
    }
  };

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.container,
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: baseBg,
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            width: layoutWidth * 1.5,
            transform: [{ translateX }],
          },
        ]}
      >
        <LinearGradient
          colors={shimmerColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    position: 'relative',
  },
});
