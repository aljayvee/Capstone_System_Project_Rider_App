import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bike } from 'lucide-react-native';
import { useThemeContext } from '../context/ThemeContext';
import { FontSizes, Spacing, scaledFontSize, moderateScale } from '../config/theme';

interface AnimatedSplashScreenProps {
  /** Triggered once the exit transition finishes to unmount the splash layer */
  onAnimationComplete: () => void;
  /** True when core rider application prerequisites (session check, auth state) have resolved */
  isAppReady: boolean;
}

// Timing Invariants
const MIN_PERCEPTION_MS = 1400; // Minimum duration to display branding cleanly without flash-of-splash
const HARD_TIMEOUT_MS = 3500;   // Safety circuit breaker to prevent infinite boot lockups if network/GPS hangs

export default function AnimatedSplashScreen({
  onAnimationComplete,
  isAppReady,
}: AnimatedSplashScreenProps) {
  const { colors, isDark } = useThemeContext();
  const insets = useSafeAreaInsets();

  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const hasFinishedRef = useRef(false);

  // Animation values
  const logoScale = useRef(new Animated.Value(0.75)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const pulseWave = useRef(new Animated.Value(0)).current;
  const textFade = useRef(new Animated.Value(0)).current;
  const textTranslateY = useRef(new Animated.Value(14)).current;

  // Exit transition values
  const exitScale = useRef(new Animated.Value(1)).current;
  const exitOpacity = useRef(new Animated.Value(1)).current;

  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // 1. Entrance animation & continuous breathing wave ping
  useEffect(() => {
    // Emblem spring entrance
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        damping: 14,
        stiffness: 130,
        mass: 0.9,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      // Staggered wordmark fade
      Animated.sequence([
        Animated.delay(180),
        Animated.parallel([
          Animated.timing(textFade, {
            toValue: 1,
            duration: 380,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(textTranslateY, {
            toValue: 0,
            duration: 380,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();

    // Subtle continuous breathing halo loop
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseWave, {
          toValue: 1,
          duration: 1600,
          easing: Easing.out(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseWave, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoopRef.current = pulseLoop;
    pulseLoop.start();

    // Enforce minimum perception threshold
    const minTimer = setTimeout(() => {
      setMinTimeElapsed(true);
    }, MIN_PERCEPTION_MS);

    // Hard timeout circuit breaker to avoid infinite splash freeze
    const safetyTimer = setTimeout(() => {
      triggerExit();
    }, HARD_TIMEOUT_MS);

    return () => {
      pulseLoopRef.current?.stop();
      clearTimeout(minTimer);
      clearTimeout(safetyTimer);
    };
  }, []);

  // 2. Trigger exit once both isAppReady and minimum threshold have elapsed
  useEffect(() => {
    if (isAppReady && minTimeElapsed) {
      triggerExit();
    }
  }, [isAppReady, minTimeElapsed]);

  const triggerExit = () => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    pulseLoopRef.current?.stop();

    Animated.parallel([
      Animated.timing(exitScale, {
        toValue: 1.06,
        duration: 280,
        easing: Easing.bezier(0.4, 0.0, 0.2, 1.0),
        useNativeDriver: true,
      }),
      Animated.timing(exitOpacity, {
        toValue: 0,
        duration: 280,
        easing: Easing.bezier(0.4, 0.0, 0.2, 1.0),
        useNativeDriver: true,
      }),
    ]).start();

    setTimeout(() => {
      onAnimationComplete();
    }, 280);
  };

  // Interpolations for pulsing wave ping
  const waveScale = pulseWave.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.45],
  });

  const waveOpacity = pulseWave.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0.65, 0.35, 0],
  });

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        styles.container,
        {
          backgroundColor: isDark ? colors.bgDark : colors.bgWhite,
          opacity: exitOpacity,
          transform: [{ scale: exitScale }],
        },
      ]}
      renderToHardwareTextureAndroid
      pointerEvents="auto"
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      <View style={styles.centerStage}>
        {/* Breathing Outer Halo Ping Wave */}
        <Animated.View
          style={[
            styles.pulseHalo,
            {
              borderColor: colors.primary,
              opacity: waveOpacity,
              transform: [{ scale: waveScale }],
            },
          ]}
        />

        {/* Operational Emblem Badge */}
        <Animated.View
          style={[
            styles.emblemBadge,
            {
              backgroundColor: colors.primary,
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          <Bike size={46} color="#FFFFFF" strokeWidth={2.4} />
        </Animated.View>

        {/* Operational Brand Wordmark & Field Subtitle */}
        <Animated.View
          style={[
            styles.textContainer,
            {
              opacity: textFade,
              transform: [{ translateY: textTranslateY }],
            },
          ]}
        >
          <Text style={[styles.brandTitle, { color: colors.textDark }]} maxFontSizeMultiplier={1.15}>
            SUGO RIDER
          </Text>
          <Text style={[styles.brandTagline, { color: colors.textGray }]} maxFontSizeMultiplier={1.15}>
            Fleet Operations & Dispatch
          </Text>
        </Animated.View>
      </View>

      {/* Bottom Logistics Attribution */}
      <Animated.View
        style={[
          styles.footerContainer,
          {
            paddingBottom: Math.max(insets.bottom, 20),
            opacity: textFade,
          },
        ]}
      >
        <Text style={[styles.footerText, { color: colors.textLight }]} maxFontSizeMultiplier={1.15}>
          Tacurong City Logistics
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerStage: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  pulseHalo: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 2,
  },
  emblemBadge: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 18,
    elevation: 8,
  },
  textContainer: {
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  brandTitle: {
    fontWeight: '800',
    fontSize: scaledFontSize(FontSizes.xl + 2, 0.2),
    letterSpacing: 2.2,
  },
  brandTagline: {
    fontWeight: '500',
    fontSize: scaledFontSize(FontSizes.sm, 0.2),
    marginTop: 6,
    letterSpacing: 0.4,
  },
  footerContainer: {
    position: 'absolute',
    bottom: 0,
    alignItems: 'center',
  },
  footerText: {
    fontWeight: '500',
    fontSize: scaledFontSize(FontSizes.xs, 0.2),
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
