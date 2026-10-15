import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights } from '../config/theme';

export interface HalfPaymentSettledModalProps {
  /** Null hides it. */
  notice: { customer: string; balanceDue: number } | null;
  /** The front errand is still waiting at the last shop: this moves it on. */
  onHeadOut: () => void;
  onClose: () => void;
}

/**
 * "The customer settled the payment with the dispatcher."
 *
 * The rider has been standing at the last shop waiting for this, so it is said
 * outright rather than left for them to notice a button change colour. It also
 * answers the next question before they ask it: how much to collect at the
 * door, which is the other half of the goods plus every fee.
 */
export default function HalfPaymentSettledModal({ notice, onHeadOut, onClose }: HalfPaymentSettledModalProps) {
  return (
    <Modal visible={notice !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card} testID="half-payment-settled-modal">
          <View style={styles.iconCircle}>
            <CheckCircle2 size={32} color={Colors.success} strokeWidth={2} />
          </View>

          <Text style={styles.title} maxFontSizeMultiplier={1.2}>
            Payment settled
          </Text>

          <Text style={styles.body} maxFontSizeMultiplier={1.2}>
            {notice?.customer ?? 'The customer'} settled the half-payment with the dispatcher.
          </Text>

          <Text style={styles.body} maxFontSizeMultiplier={1.2}>
            Collect{' '}
            <Text style={styles.bold}>₱{(notice?.balanceDue ?? 0).toFixed(2)}</Text>{' '}
            at the door: the other half of the items plus the fees.
          </Text>

          <TouchableOpacity
            testID="half-payment-head-out"
            style={styles.primaryBtn}
            accessibilityRole="button"
            accessibilityLabel="Head to the customer"
            onPress={onHeadOut}
          >
            <Text style={styles.primaryBtnText} maxFontSizeMultiplier={1.15}>
              Head to the customer
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="half-payment-settled-close"
            style={styles.secondaryBtn}
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
          >
            <Text style={styles.secondaryBtnText} maxFontSizeMultiplier={1.15}>
              Not yet
            </Text>
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
    backgroundColor: Colors.successBg,
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
  primaryBtn: {
    width: '100%',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginTop: Spacing.md,
    minHeight: 48,
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: Colors.textWhite,
    fontWeight: FontWeights.bold as any,
    fontSize: FontSizes.md,
  },
  secondaryBtn: {
    width: '100%',
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    marginTop: Spacing.sm,
    minHeight: 48,
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: Colors.textGray,
    fontWeight: FontWeights.semibold as any,
    fontSize: FontSizes.md,
  },
});
