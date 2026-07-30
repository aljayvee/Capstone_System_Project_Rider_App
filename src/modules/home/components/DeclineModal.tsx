import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '../../../config/theme';

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
          <Text style={styles.title}>Decline Task?</Text>
          <Text style={styles.subtitle}>Please provide a reason for declining this errand.</Text>

          <TextInput
            style={styles.input}
            value={reason}
            onChangeText={handleReasonChange}
            placeholder="Reason..."
            multiline
            textAlignVertical="top"
          />

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.confirmButton, !reason.trim() && styles.disabledButton]} 
              onPress={handleConfirm}
              disabled={!reason.trim()}
            >
              <Text style={styles.confirmText}>Confirm</Text>
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
    maxWidth: 320,
    backgroundColor: Colors.bgWhite,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxxl,
    alignItems: 'center',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSizes.sm,
    color: Colors.textGray,
    textAlign: 'center',
    marginBottom: Spacing.xxl,
  },
  input: {
    width: '100%',
    height: 96,
    backgroundColor: Colors.bgLight,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    fontSize: FontSizes.sm,
    marginBottom: Spacing.lg,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.lg,
    width: '100%',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.bgGray,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  cancelText: {
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
  confirmText: {
    fontWeight: FontWeights.bold as any,
    color: Colors.textWhite,
  },
});
