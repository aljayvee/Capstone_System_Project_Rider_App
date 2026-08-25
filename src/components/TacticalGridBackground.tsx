import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Path, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

export const TacticalGridBackground = () => {
  const { width, height } = useWindowDimensions();

  const accentHeight = Math.max(260, height * 0.36);

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {/* Base Clean White Canvas */}
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#FFFFFF' }]} />

      {/* Top Dynamic Curved Fleet Accent Container (Similar to Customer App with Rider Fleet Styling) */}
      <View style={[styles.topAccentContainer, { height: accentHeight }]}>
        {/* Layer 1: Soft Primary Gradient Curve with Asymmetric Fleet Arc */}
        <LinearGradient
          colors={['#FEE2E2', '#FFF1F2', 'rgba(255, 245, 245, 0.4)', 'transparent']}
          locations={[0, 0.45, 0.8, 1]}
          style={styles.primaryGradientAccent}
        />

        {/* Layer 2: Vector Fleet Wave & Dispatch Route Arcs */}
        <Svg width={width} height={accentHeight} style={StyleSheet.absoluteFillObject}>
          <Defs>
            <SvgGradient id="waveFill" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#DC2626" stopOpacity="0.08" />
              <Stop offset="50%" stopColor="#EF4444" stopOpacity="0.04" />
              <Stop offset="100%" stopColor="#DC2626" stopOpacity="0.0" />
            </SvgGradient>

            <SvgGradient id="routeLine" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#DC2626" stopOpacity="0.25" />
              <Stop offset="50%" stopColor="#EF4444" stopOpacity="0.35" />
              <Stop offset="100%" stopColor="#DC2626" stopOpacity="0.1" />
            </SvgGradient>
          </Defs>

          {/* Dynamic Asymmetrical Route Arc */}
          <Path
            d={`M 0,0 L ${width},0 L ${width},${accentHeight * 0.72} Q ${width * 0.6},${accentHeight * 0.95} ${width * 0.25},${accentHeight * 0.82} T 0,${accentHeight * 0.65} Z`}
            fill="url(#waveFill)"
          />

          {/* Subtle Dynamic Guideline Track */}
          <Path
            d={`M -20,${accentHeight * 0.58} Q ${width * 0.4},${accentHeight * 0.88} ${width + 20},${accentHeight * 0.68}`}
            fill="none"
            stroke="url(#routeLine)"
            strokeWidth="1.8"
            strokeDasharray="4 6"
          />

          {/* Route Dispatch Anchor Points */}
          <Circle cx={width * 0.22} cy={accentHeight * 0.7} r={4.5} fill="#DC2626" opacity={0.6} />
          <Circle cx={width * 0.22} cy={accentHeight * 0.7} r={10} fill="none" stroke="#DC2626" strokeWidth="1" opacity={0.25} />

          <Circle cx={width * 0.76} cy={accentHeight * 0.76} r={3.5} fill="#DC2626" opacity={0.5} />
          <Circle cx={width * 0.76} cy={accentHeight * 0.76} r={8} fill="none" stroke="#DC2626" strokeWidth="1" opacity={0.2} />
        </Svg>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  topAccentContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  primaryGradientAccent: {
    ...StyleSheet.absoluteFillObject,
    borderBottomLeftRadius: 140,
    borderBottomRightRadius: 80,
  },
});
