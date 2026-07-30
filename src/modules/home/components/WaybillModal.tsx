import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { X } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '../../../config/theme';
import { MergedErrand } from '../../../types/rider';

interface WaybillModalProps {
  visible: boolean;
  errand: MergedErrand;
  onClose: () => void;
}

export function WaybillModal({ visible, errand, onClose }: WaybillModalProps) {
  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.logoBox}>
                <Text style={styles.logoText}>S</Text>
              </View>
              <Text style={styles.headerTitle}>DIGITAL Customer Information</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <X size={18} color={Colors.textDark} />
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <View style={styles.idBox}>
              <Text style={styles.errandId}>{errand.id}</Text>
            </View>

            <View style={styles.infoSection}>
              <View style={styles.infoBlock}>
                <Text style={styles.infoLabel}>CUSTOMER</Text>
                <Text style={styles.infoValue}>{errand.customer}</Text>
              </View>
              <View style={styles.infoBlock}>
                <Text style={styles.infoLabel}>DESTINATION</Text>
                <Text style={styles.infoValue}>{errand.address}</Text>
              </View>

              <View style={styles.feeBox}>
                <View style={styles.feeRow}>
                  <Text style={styles.feeText}>Service Fee</Text>
                  <Text style={styles.feeAmount}>₱{errand.serviceFee}</Text>
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgLight,
  },
  scrollContent: {
    padding: Spacing.xxxl,
    gap: Spacing.xxxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.xxxl,
  },
  headerLeft: {
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
  },
  card: {
    backgroundColor: Colors.bgWhite,
    padding: Spacing.xxxl,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
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
