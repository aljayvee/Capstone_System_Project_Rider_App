import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, BorderRadius, FontSizes, FontWeights, Elevation, Spacing } from '../config/theme';
import { cardinal, cardinalName, normalizeDegrees } from '../utils/compass';
import { headingDelta } from '../utils/navigationCamera';

export type MapOrientation = 'heading-up' | 'north-up';

interface Props {
  /** Which way the map itself is turned: its camera heading, 0 is north up. */
  mapBearing: number;
  /** Where the rider faces or rides, for the readout. Null before any heading is known. */
  facingHeading: number | null;
  orientation: MapOrientation;
  onPress: () => void;
  /** The compass is the heading in use but reports low accuracy. */
  needsCalibration?: boolean;
}

/**
 * The compass rose on the rider's map: the red needle always points to true
 * north, however the map is turned, and the readout says which way the rider
 * is facing ("NE 42°"). Tapping it switches between a map that turns with the
 * rider (heading up) and one with north fixed at the top, as in Google Maps.
 *
 * The needle turns the short way round: from 350 to 10 degrees it moves 20
 * degrees clockwise, not 340 the other way.
 */
export function CompassButton({ mapBearing, facingHeading, orientation, onPress, needsCalibration = false }: Props) {
  const rotation = useRef(new Animated.Value(-mapBearing)).current;
  const unwrapped = useRef(-mapBearing);
  const lastBearing = useRef(mapBearing);

  useEffect(() => {
    // The rose turns against the map: map turned 90 to the east puts north on the left.
    unwrapped.current -= headingDelta(lastBearing.current, mapBearing);
    lastBearing.current = mapBearing;
    Animated.timing(rotation, {
      toValue: unwrapped.current,
      duration: 300,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [mapBearing, rotation]);

  const spin = rotation.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'], extrapolate: 'extend' });
  const facing = facingHeading == null ? null : Math.round(normalizeDegrees(facingHeading)) % 360;
  const label =
    orientation === 'heading-up'
      ? `Compass. The map turns with you${facing != null ? `, facing ${cardinalName(facing)}` : ''}. Tap to put north up.`
      : `Compass. North is up${facing != null ? `, you are facing ${cardinalName(facing)}` : ''}. Tap to turn the map with you.`;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[styles.pill, orientation === 'north-up' && styles.pillNorthUp]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID="rider-map-compass"
    >
      <View style={styles.rose}>
        <Animated.View style={[styles.needleFrame, { transform: [{ rotate: spin }] }]} testID="compass-needle">
          <Text style={styles.north} maxFontSizeMultiplier={1}>
            N
          </Text>
          <View style={styles.needleNorth} />
          <View style={styles.needleSouth} />
        </Animated.View>
      </View>
      {facing != null && (
        <View style={styles.readout}>
          <Text style={styles.readoutCardinal} maxFontSizeMultiplier={1.1} testID="compass-cardinal">
            {cardinal(facing)}
          </Text>
          <Text style={styles.readoutDegrees} maxFontSizeMultiplier={1.1}>
            {facing}°
          </Text>
        </View>
      )}
      {needsCalibration && <View style={styles.calibrationDot} testID="compass-needs-calibration" />}
    </TouchableOpacity>
  );
}

const ROSE = 38;

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: 48,
    minWidth: 48,
    paddingLeft: 5,
    paddingRight: Spacing.sm,
    backgroundColor: Colors.bgWhite,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    elevation: Elevation.floatingControls,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  pillNorthUp: {
    borderColor: Colors.navy,
  },
  rose: {
    width: ROSE,
    height: ROSE,
    borderRadius: ROSE / 2,
    backgroundColor: Colors.bgLight,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  needleFrame: {
    width: ROSE,
    height: ROSE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  north: {
    position: 'absolute',
    top: 0,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: FontWeights.extrabold as any,
    color: Colors.primary,
  },
  // Two triangles meeting at the centre, drawn with borders.
  needleNorth: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 11,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: Colors.primary,
    marginTop: 4,
  },
  needleSouth: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 11,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: Colors.navy,
  },
  readout: {
    alignItems: 'flex-start',
  },
  readoutCardinal: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.extrabold as any,
    color: Colors.textDark,
    lineHeight: 16,
  },
  readoutDegrees: {
    fontSize: FontSizes.xxs,
    fontWeight: FontWeights.semibold as any,
    color: Colors.textGray,
    fontVariant: ['tabular-nums'],
    lineHeight: 13,
  },
  calibrationDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.maneuverAlert,
  },
});

export default CompassButton;
