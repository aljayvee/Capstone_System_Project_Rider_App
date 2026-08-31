import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius, scaledFontSize, moderateScale } from '../../../config/theme';

interface DeclineModalProps {
  visible: boolean;
  reason: string;
  onReasonChange?: (reason: string) => void;
  setReason?: (reason: string) => void;
  onCancel?: () => void;
  onClose?: () => void;
  onConfirm?: () => void;
  onSubmit?: () => void;
}

export function DeclineModal({
  visible,
  reason,
  onReasonChange,
  setReason,
  onCancel,
  onClose,
  onConfirm,
  onSubmit,
}: DeclineModalProps) {
  const handleReasonChange = onReasonChange || setReason || (() => {});
  const handleCancel = onCancel || onClose || (() => {});
  const handleConfirm = onConfirm || onSubmit || (() => {});

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconContainer}>
            <AlertCircle size={32} color={Colors.primary} />
          </View>
          <Text style={styles.title} maxFontSizeMultiplier={1.2}>Decline Task?</Text>
          <Text style={styles.subtitle} maxFontSizeMultiplier={1.15}>Please provide a reason for declining this errand.</Text>

          <TextInput
            style={styles.input}
            value={reason}
            onChangeText={handleReasonChange}
            placeholder="Reason..."
            multiline
            textAlignVertical="top"
          />

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancel}
              accessibilityRole="button"
              accessibilityLabel="Keep this errand">
              <Text style={styles.cancelText} maxFontSizeMultiplier={1.15}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.confirmButton, !reason.trim() && styles.disabledButton]} 
              accessibilityRole="button"
              accessibilityLabel="Confirm and decline this errand"
              onPress={handleConfirm}
              disabled={!reason.trim()}
            >
              <Text style={styles.confirmText} maxFontSizeMultiplier={1.15}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlayHeavy,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: Colors.bgWhite,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  iconContainer: {
    width: moderateScale(60, 0.20),
    height: moderateScale(60, 0.20),
    borderRadius: moderateScale(30, 0.20),
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: scaledFontSize(FontSizes.xl, 0.20),
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    color: Colors.textGray,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  input: {
    width: '100%',
    height: moderateScale(90, 0.20),
    backgroundColor: Colors.bgLight,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    marginBottom: Spacing.lg,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: moderateScale(12, 0.20),
    backgroundColor: Colors.bgGray,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  cancelText: {
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
    fontSize: scaledFontSize(FontSizes.base, 0.20),
  },
  confirmButton: {
    flex: 1,
    paddingVertical: moderateScale(12, 0.20),
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
  confirmText: {
    fontWeight: FontWeights.bold as any,
    color: Colors.textWhite,
    fontSize: scaledFontSize(FontSizes.base, 0.20),
  },
});
