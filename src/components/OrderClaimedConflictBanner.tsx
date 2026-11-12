import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AlertTriangle, ArrowRight } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing } from '../config/theme';

interface OrderClaimedConflictBannerProps {
  orderId?: string;
  onDismiss: () => void;
  onViewNext?: () => void;
}

export const OrderClaimedConflictBanner: React.FC<OrderClaimedConflictBannerProps> = ({
  orderId,
  onDismiss,
  onViewNext,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.iconBox}>
          <AlertTriangle size={18} color={Colors.warning} />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.title}>Order Already Assigned</Text>
          <Text style={styles.description}>
            Another rider accepted {orderId ? `order #${orderId}` : 'this errand'} moments earlier.
          </Text>
        </View>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity onPress={onDismiss} style={styles.dismissBtn} accessibilityRole="button" accessibilityLabel="Dismiss errand notice">
          <Text style={styles.dismissText}>Dismiss</Text>
        </TouchableOpacity>

        {onViewNext && (
          <TouchableOpacity onPress={onViewNext} style={styles.nextBtn} accessibilityRole="button" accessibilityLabel="View next errand">
            <Text style={styles.nextText}>View Next Errand</Text>
            <ArrowRight size={14} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.warningBg,
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 16,
    padding: Spacing.md,
    gap: Spacing.sm,
    marginVertical: Spacing.xs,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold as any,
    color: '#92400E',
  },
  description: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.normal as any,
    color: '#B45309',
    lineHeight: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: 2,
  },
  dismissBtn: {
    flex: 1,
    minHeight: 48,
    paddingVertical: Spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold as any,
    color: '#92400E',
  },
  nextBtn: {
    flex: 1.5,
    minHeight: 48,
    paddingVertical: Spacing.sm,
    borderRadius: 10,
    backgroundColor: '#D97706',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  nextText: {
    flexShrink: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold as any,
  },
});

export default OrderClaimedConflictBanner;
