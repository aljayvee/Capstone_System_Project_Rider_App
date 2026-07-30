import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ClipboardList, Camera } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '../../../config/theme';
import { StatusStep, Errand, MergedErrand } from '../../../types/rider';

interface RequestItemsPanelProps {
  errand?: MergedErrand | Errand;
  payload?: { name: string; items: string[] }[];
  details?: string;
  currentStatus: StatusStep;
  completedSubtasks: Record<number, boolean>;
  uploadingSubtask: number | null;
  onStartUpload?: (index: number, sectionName: string) => void;
  onUpload?: (index: number, sectionName: string) => void;
}

export function RequestItemsPanel({
  errand,
  payload: propPayload,
  details: propDetails,
  currentStatus,
  completedSubtasks,
  uploadingSubtask,
  onStartUpload,
  onUpload
}: RequestItemsPanelProps) {
  const payload = errand ? errand.payload : propPayload;
  const details = errand ? errand.details : propDetails;
  const handleUpload = onUpload || onStartUpload || (() => {});

  if (!payload && !details) return null;


  const isAtStore = currentStatus === 'At Store';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ClipboardList size={14} color={Colors.amberDark} />
        <Text style={styles.headerTitle}>Request Items & Instructions</Text>
      </View>
      <View style={styles.content}>
        {payload ? (
          payload.map((cat, idx) => {
            const isCompleted = completedSubtasks[idx];
            const isUploading = uploadingSubtask === idx;
            
            return (
              <View key={idx} style={styles.itemBox}>
                <Text style={styles.itemText}>📌 {cat.name}</Text>
                {cat.items.map((item, itemIdx) => (
                  <Text key={itemIdx} style={styles.itemText}>• {item}</Text>
                ))}
                {isAtStore && (
                  <TouchableOpacity
                    disabled={isCompleted || isUploading}
                    onPress={() => handleUpload(idx, cat.name)}
                    style={[
                      styles.uploadButton,
                      isCompleted ? styles.uploadSuccess : styles.uploadPending,
                      { opacity: isUploading ? 0.6 : 1 }
                    ]}
                  >
                    <Camera size={14} color={isCompleted ? Colors.greenDark : Colors.amberDark} />
                    <Text style={[styles.uploadText, { color: isCompleted ? Colors.greenDark : Colors.amberDark }]}>
                      {isCompleted ? '✓ Verified' : isUploading ? 'Uploading...' : 'Upload Photo'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        ) : (
          details?.split(' | ').map((section, idx) => {
            const isCompleted = completedSubtasks[idx];
            const isUploading = uploadingSubtask === idx;
            const formatted = section
              .replace(/; /g, '\n')
              .replace(/\(Pabili\) /, '🛒 Pabili:\n')
              .replace(/\(Padala\) /, '📦 Padala:\n')
              .replace(/\(Bills\) /, '💳 Bills:\n');

            return (
              <View key={idx} style={styles.itemBox}>
                <Text style={styles.itemText}>{formatted}</Text>
                {isAtStore && (
                  <TouchableOpacity
                    disabled={isCompleted || isUploading}
                    onPress={() => handleUpload(idx, formatted.split(':')[0])}

                    style={[
                      styles.uploadButton,
                      isCompleted ? styles.uploadSuccess : styles.uploadPending,
                      { opacity: isUploading ? 0.6 : 1 }
                    ]}
                  >
                    <Camera size={14} color={isCompleted ? Colors.greenDark : Colors.amberDark} />
                    <Text style={[styles.uploadText, { color: isCompleted ? Colors.greenDark : Colors.amberDark }]}>
                      {isCompleted ? '✓ Verified' : isUploading ? 'Uploading...' : 'Upload Photo'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.amberBg,
    borderWidth: 1,
    borderColor: Colors.borderYellow,
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  headerTitle: {
    color: Colors.amberDark,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold as any,
  },
  content: {
    gap: Spacing.md,
  },
  itemBox: {
    backgroundColor: Colors.bgWhite,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.borderYellow,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  itemText: {
    color: '#451A03',
    fontSize: FontSizes.base,
    marginBottom: 2,
  },
  uploadButton: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  uploadSuccess: {
    backgroundColor: Colors.greenLight,
    borderColor: Colors.greenMedium,
  },
  uploadPending: {
    backgroundColor: Colors.amberLight,
    borderColor: Colors.amber,
  },
  uploadText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold as any,
  },
});
