import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Phone, MapPin, Signpost, Flag, MessageSquareText } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius, scaledFontSize, moderateScale } from '../../../config/theme';

import { Errand, MergedErrand } from '../../../types/rider';
import { TaskSheetColors } from '../../../config/taskSheetTheme';

interface CustomerDetailsPanelProps {
  errand: MergedErrand | Errand;
}

export function CustomerDetailsPanel({ errand }: CustomerDetailsPanelProps) {
  const { customer, customerPhone, address, deliveryStreetName, deliveryLandmark, deliveryNotes } = errand;

  const handleCall = () => {
    if (customerPhone) Linking.openURL(`tel:${customerPhone}`);
  };

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={{ flex: 1, paddingRight: Spacing.sm }}>
          <Text style={styles.name} numberOfLines={1} maxFontSizeMultiplier={1.2}>{customer}</Text>
          <Text style={styles.phone} maxFontSizeMultiplier={1.15}>{customerPhone || 'No phone on file'}</Text>
        </View>
        <TouchableOpacity
          style={styles.callButton}
          onPress={handleCall}
          accessibilityRole="button"
          accessibilityLabel="Call the customer" disabled={!customerPhone}>
          <Phone size={18} color={customerPhone ? Colors.navy : Colors.textLight} />
        </TouchableOpacity>
      </View>
      <View style={styles.addressRow}>
        <MapPin size={14} color={Colors.textLight} style={styles.mapPin} />
        <Text style={styles.address} maxFontSizeMultiplier={1.15}>{address}</Text>
      </View>

      {/* What the customer saved for the door. A map pin gets the rider to the
          street; these get them to the right gate. Each row appears only when
          the customer filled it in. */}
      {deliveryStreetName ? (
        <View style={styles.detailRow} testID="customer-street-name">
          <Signpost size={14} color={Colors.textLight} style={styles.mapPin} />
          <Text style={styles.detailText} maxFontSizeMultiplier={1.15}>
            <Text style={styles.detailLabel}>Street: </Text>
            {deliveryStreetName}
          </Text>
        </View>
      ) : null}
      {deliveryLandmark ? (
        <View style={styles.detailRow} testID="customer-landmark">
          <Flag size={14} color={Colors.textLight} style={styles.mapPin} />
          <Text style={styles.detailText} maxFontSizeMultiplier={1.15}>
            <Text style={styles.detailLabel}>Landmark: </Text>
            {deliveryLandmark}
          </Text>
        </View>
      ) : null}
      {deliveryNotes ? (
        <View style={styles.notesBox} testID="customer-delivery-notes">
          <MessageSquareText size={14} color={Colors.navy} style={styles.mapPin} />
          <View style={styles.notesBody}>
            <Text style={styles.notesLabel} maxFontSizeMultiplier={1.15}>Customer's note</Text>
            <Text style={styles.notesText} maxFontSizeMultiplier={1.15}>{deliveryNotes}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: moderateScale(20),
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  name: {
    color: Colors.navy,
    fontSize: scaledFontSize(FontSizes.base, 0.20),
    fontWeight: FontWeights.bold as any,
  },
  phone: {
    color: Colors.textGray,
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    marginTop: 2,
  },
  callButton: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: TaskSheetColors.accentSurface,
    minHeight: 48,
    minWidth: 48,
    justifyContent: 'center',
    alignItems: 'center',
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
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    flex: 1,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  detailText: {
    color: Colors.textMedium,
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    flex: 1,
  },
  detailLabel: {
    color: Colors.textGray,
    fontWeight: FontWeights.bold as any,
  },
  // Set apart from the address lines: an instruction the rider must act on
  // ("call when outside") is easy to miss as one more grey line.
  notesBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: TaskSheetColors.mutedSurface,
  },
  notesBody: {
    flex: 1,
  },
  notesLabel: {
    color: Colors.navy,
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.bold as any,
    marginBottom: 2,
  },
  notesText: {
    color: Colors.textDark,
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
  },
});
