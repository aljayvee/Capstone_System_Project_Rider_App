import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Phone, MapPin } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '../../../config/theme';

import { Errand, MergedErrand } from '../../../types/rider';

interface CustomerDetailsPanelProps {
  errand?: MergedErrand | Errand;
  customer?: string;
  customerPhone?: string;
  address?: string;
  landmark?: string;
}

export function CustomerDetailsPanel({ errand, customer: propCust, customerPhone: propPhone, address: propAddr, landmark: propLandmark }: CustomerDetailsPanelProps) {
  const customer = errand ? errand.customer : propCust ?? "";
  const customerPhone = errand ? errand.customerPhone : propPhone ?? "";
  const address = errand ? errand.address : propAddr ?? "";
  const landmark = errand ? errand.landmark : propLandmark ?? "";

  const handleCall = () => {
    Linking.openURL(`tel:${customerPhone}`);
  };


  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.name}>{customer}</Text>
          <Text style={styles.phone}>{customerPhone}</Text>
        </View>
        <TouchableOpacity style={styles.callButton} onPress={handleCall}>
          <Phone size={16} color={Colors.greenDark} />
        </TouchableOpacity>
      </View>
      <View style={styles.addressRow}>
        <MapPin size={14} color={Colors.textLight} style={styles.mapPin} />
        <View>
          <Text style={styles.address}>{address}</Text>
          <Text style={styles.landmark}>📍 {landmark}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.bgLight,
    marginBottom: Spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  name: {
    color: Colors.textDark,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold as any,
  },
  phone: {
    color: Colors.textGray,
    fontSize: FontSizes.base,
  },
  callButton: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.greenLight,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  mapPin: {
    marginTop: 2,
    flexShrink: 0,
  },
  address: {
    color: Colors.textMedium,
    fontSize: FontSizes.sm,
  },
  landmark: {
    color: Colors.textLight,
    fontSize: FontSizes.sm,
  },
});
