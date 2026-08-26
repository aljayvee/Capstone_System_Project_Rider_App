import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ClipboardList, Camera } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '../../../config/theme';
import { StatusStep, Errand, MergedErrand } from '../../../types/rider';
import { requestSections, type RequestSection } from '../../../services/requestSections';

interface RequestItemsPanelProps {
  errand?: MergedErrand | Errand;
  currentStatus: StatusStep;
  completedSubtasks: Record<number, boolean>;
  uploadingSubtask: number | null;
  onUpload?: (section: RequestSection, index: number) => void;
  /** The shop printed nothing — see the no-receipt path in proofCapture. */
  onNoReceipt?: (section: RequestSection, index: number) => void;
}

export function RequestItemsPanel({
  errand,
  currentStatus,
  completedSubtasks,
  uploadingSubtask,
  onUpload,
  onNoReceipt,
}: RequestItemsPanelProps) {
  const sections = requestSections(errand);
  if (sections.length === 0) return null;

  // The receipt is filed when the shopping is done, so the button only appears
  // once the rider is at the store. Before that there is nothing to photograph.
  const isAtStore = currentStatus === 'At Store';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ClipboardList size={14} color={Colors.warning} />
        <Text style={styles.headerTitle}>Request Items & Instructions</Text>
      </View>
      <View style={styles.content}>
        {sections.map((section, idx) => {
          const isCompleted = completedSubtasks[idx];
          const isUploading = uploadingSubtask === idx;

          return (
            <View key={idx} style={styles.itemBox}>
              {section.title && <Text style={styles.itemTitle}>{section.title}</Text>}
              {section.lines.map((line, lineIdx) => (
                <Text key={lineIdx} style={styles.itemText}>
                  {section.title ? `• ${line}` : line}
                </Text>
              ))}

              {isAtStore && (
                <TouchableOpacity
                  disabled={isCompleted || isUploading}
                  onPress={() => onUpload?.(section, idx)}
                  style={[
                    styles.uploadButton,
                    isCompleted ? styles.uploadSuccess : styles.uploadPending,
                    { opacity: isUploading ? 0.6 : 1 },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isCompleted || isUploading, busy: isUploading }}
                  // Carries the store name: on a three-stop errand a screen
                  // reader would otherwise read three identical buttons.
                  accessibilityLabel={
                    isCompleted
                      ? `Receipt saved for ${section.title ?? 'this stop'}`
                      : isUploading
                        ? 'Reading the receipt'
                        : `Photograph the receipt for ${section.title ?? 'this stop'}`
                  }
                >
                  <Camera size={14} color={isCompleted ? Colors.success : Colors.warning} />
                  <Text
                    style={[
                      styles.uploadText,
                      { color: isCompleted ? Colors.success : Colors.warning },
                    ]}
                  >
                    {isCompleted ? 'Receipt saved' : isUploading ? 'Reading…' : 'Photograph receipt'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* A sari-sari store or a market stall prints nothing. Without this
                  the rider photographed the goods, was told the sharp photo was
                  "too blurry to read", and could not finish the errand at all. */}
              {isAtStore && !isCompleted && (
                <TouchableOpacity
                  disabled={isUploading}
                  onPress={() => onNoReceipt?.(section, idx)}
                  style={styles.noReceiptButton}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isUploading }}
                  accessibilityLabel={`This shop gives no receipt — photograph the goods for ${section.title ?? 'this stop'} instead`}
                  testID={`no-receipt-${idx}`}
                >
                  <Text style={styles.noReceiptText}>This shop gives no receipt</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.warningSubtle,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  headerTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold as any,
    color: Colors.warning,
  },
  content: { gap: Spacing.sm },
  itemBox: {
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.bgWhite,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
    gap: 2,
  },
  itemTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
    marginBottom: 2,
  },
  itemText: {
    fontSize: FontSizes.base,
    color: Colors.textDark,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    minHeight: 48,
  },
  uploadPending: {
    backgroundColor: Colors.warningSubtle,
    borderColor: Colors.warningBorder,
  },
  uploadSuccess: {
    backgroundColor: Colors.successSubtle,
    borderColor: Colors.success,
  },
  noReceiptButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
    paddingVertical: Spacing.xs,
    minHeight: 48,
  },
  noReceiptText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold as any,
    color: Colors.textMedium,
    textDecorationLine: 'underline',
  },
  uploadText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold as any,
  },
});
