import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MapPin } from 'lucide-react-native';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights } from '../config/theme';

export interface BackgroundLocationModalProps {
  visible: boolean;
  onAllow: () => void;
  onSkip: () => void;
}

/**
 * Disclosure modal shown to the rider before requesting
 * ACCESS_BACKGROUND_LOCATION on Android. Google Play policy requires a clear
 * in-app rationale before the system dialog is presented.
 *
 * Tapping "Allow" calls `onAllow` -> the caller then invokes
 * `Location.requestBackgroundPermissionsAsync()`.
 * Tapping "Not Now" calls `onSkip` -- foreground-only GPS still works while
 * the app is in the foreground.
 */
export default function BackgroundLocationModal({
  visible,
  onAllow,
  onSkip,
}: BackgroundLocationModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <MapPin size={32} color={Colors.primary} strokeWidth={2} />
          </View>

          <Text style={styles.title}>Allow Background Location</Text>

          <Text style={styles.body}>
            To show your live position on the customer tracking map and the
            dispatcher fleet view even while the app is minimized, we need
            permission to access your location in the background.
          </Text>

          <Text style={styles.body}>
            Your location is{' '}
            <Text style={styles.bold}>only shared during an active delivery</Text>{' '}
            and is never stored beyond the errand session.
          </Text>

          <TouchableOpacity
            testID="bg-location-allow-btn"
            style={styles.allowBtn}
            onPress={onAllow}
          >
            <Text style={styles.allowBtnText}>Allow Background Location</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="bg-location-skip-btn"
            style={styles.skipBtn}
            onPress={onSkip}
          >
            <Text style={styles.skipBtnText}>Not Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  card: {
    width: '100%',
    backgroundColor: Colors.bgWhite,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FFF1F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  body: {
    fontSize: FontSizes.md,
    color: Colors.textGray,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.sm,
  },
  bold: {
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
  },
  allowBtn: {
    width: '100%',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  allowBtnText: {
    color: Colors.textWhite,
    fontWeight: FontWeights.bold as any,
    fontSize: FontSizes.md,
  },
  skipBtn: {
    width: '100%',
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  skipBtnText: {
    color: Colors.textGray,
    fontSize: FontSizes.md,
  },
});
