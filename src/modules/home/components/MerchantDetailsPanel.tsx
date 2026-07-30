import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '../../../config/theme';
import { Merchant } from '../../../types/rider';

interface MerchantDetailsPanelProps {
  merchant?: Merchant;
  merchantId?: number;
  merchants?: Merchant[];
}

export function MerchantDetailsPanel({ merchant: propMerchant, merchantId, merchants }: MerchantDetailsPanelProps) {
  const merchant = propMerchant || (merchants && merchantId ? merchants.find(m => m.id === merchantId) : undefined);
  if (!merchant) return null;


  return (
    <View style={styles.container}>
      <Text style={styles.headerText}>🏪 MERCHANT DETAILS</Text>
      <Text style={styles.businessName}>{merchant.businessName}</Text>
      <Text style={styles.address}>
        {merchant.purok}, {merchant.street}, {merchant.barangay}
      </Text>
      {merchant.landmark ? (
        <Text style={styles.landmark}>📍 {merchant.landmark}</Text>
      ) : null}
      <Text style={styles.operatingHours}>
        🕐 Operating: {merchant.operatingHours.open} – {merchant.operatingHours.close}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.blueBg,
    borderWidth: 1,
    borderColor: Colors.blueBorder,
    marginBottom: Spacing.md,
  },
  headerText: {
    color: Colors.blue,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold as any,
    marginBottom: Spacing.sm,
    letterSpacing: 0.5,
  },
  businessName: {
    color: Colors.textDark,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold as any,
  },
  address: {
    color: Colors.textMedium,
    fontSize: FontSizes.sm,
    marginTop: 2,
  },
  landmark: {
    color: Colors.textGray,
    fontSize: FontSizes.sm,
    marginTop: 2,
  },
  operatingHours: {
    color: Colors.textMedium,
    fontSize: FontSizes.sm,
    marginTop: Spacing.xs,
  },
});
