import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenLayout, ScreenSpacing } from '../config/screenLayout';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '../config/theme';
import { MergedErrand } from '../types/rider';
import { formatErrandId } from '../utils/formatErrandId';

interface WaybillModalProps {
  visible: boolean;
  errand: MergedErrand;
  onClose: () => void;
}

export function WaybillModal({ visible, errand, onClose }: WaybillModalProps) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.logoBox}>
              <Text style={styles.logoText}>S</Text>
            </View>
            <Text style={styles.headerTitle} maxFontSizeMultiplier={1.25}>DIGITAL Customer Information</Text>
          </View>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close customer details">
            <X size={18} color={Colors.textDark} />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
          <View style={styles.card}>
            <View style={styles.idBox}>
              <Text style={styles.errandId} maxFontSizeMultiplier={1.25} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>Errand #{formatErrandId(errand.id)}</Text>
            </View>

            <View style={styles.infoSection}>
              <View style={styles.infoBlock}>
                <Text style={styles.infoLabel}>CUSTOMER</Text>
                <Text style={styles.infoValue}>{errand.customer}</Text>
              </View>
              <View style={styles.infoBlock}>
                <Text style={styles.infoLabel}>DELIVER TO</Text>
                <Text style={styles.infoValue}>{errand.address}</Text>
              </View>

              <View style={styles.feeBox}>
                <View style={styles.feeRow}>
                  <Text style={styles.feeText}>Service Fee</Text>
                  <Text style={styles.feeAmount}>₱{(errand.riderEarnings?.deliveryFee ?? 0).toFixed(2)}</Text>
                </View>
                <View style={[styles.feeRow, styles.totalRow]}>
                  <Text style={styles.totalLabel}>TOTAL TO COLLECT</Text>
                  <Text style={styles.totalAmount}>₱{errand.amount}</Text>
                </View>
              </View>
            </View>

            <View style={styles.signatureSection}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>SIGNATURE</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgGray,
  },
  scrollContent: {
    ...ScreenLayout.content,
  },
  header: {
    ...ScreenLayout.header,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  logoBox: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    color: Colors.textWhite,
    fontWeight: FontWeights.black as any,
  },
  headerTitle: {
    flex: 1,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
  },
  closeButton: {
    padding: Spacing.md,
    backgroundColor: Colors.bgWhite,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 48,
    minWidth: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    gap: ScreenSpacing.section,
  },
  idBox: {
    alignItems: 'center',
    borderBottomWidth: 2,
    borderStyle: 'dashed',
    borderBottomColor: Colors.border,
    paddingBottom: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  errandId: {
    fontSize: FontSizes.xxxl,
    fontWeight: FontWeights.black as any,
    color: Colors.textDark,
  },
  infoSection: {
    gap: Spacing.xl,
  },
  infoBlock: {
    gap: Spacing.xxs,
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: FontWeights.black as any,
    color: Colors.textLight,
  },
  infoValue: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
  },
  feeBox: {
    backgroundColor: Colors.bgLight,
    padding: Spacing.xl,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  feeText: {
    fontSize: FontSizes.xs,
    color: Colors.textGray,
  },
  feeAmount: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.md,
  },
  totalLabel: {
    flexShrink: 1,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.black as any,
    color: Colors.textDark,
  },
  totalAmount: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.black as any,
    color: Colors.primary,
  },
  signatureSection: {
    marginTop: 48,
    alignItems: 'center',
  },
  signatureLine: {
    width: 80,
    borderBottomWidth: 1,
    borderBottomColor: Colors.textLight,
    marginBottom: Spacing.xs,
  },
  signatureLabel: {
    fontSize: 8,
    fontWeight: FontWeights.bold as any,
    color: Colors.textLight,
  },
});
