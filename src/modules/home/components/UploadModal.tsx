import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Camera, CheckCircle, X } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '../../../config/theme';

interface UploadModalProps {
  visible: boolean;
  progress: number;
  onClose: () => void;
}

export function UploadModal({ visible, progress, onClose }: UploadModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {progress < 100 ? "Uploading Receipt..." : "Upload Complete"}
            </Text>
            {progress === 100 && (
              <TouchableOpacity style={styles.closeIcon} onPress={onClose}>
                <X size={18} color={Colors.textGray} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.imageBox}>
            {progress < 100 ? (
              <View style={styles.progressContainer}>
                <View style={styles.iconContainer}>
                  <Camera size={32} color={Colors.blue} />
                </View>
                <Text style={styles.scanningText}>Scanning document...</Text>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
                </View>
                <Text style={styles.progressText}>{progress}%</Text>
              </View>
            ) : (
              <View style={styles.successContainer}>
                <View style={styles.successIconBox}>
                  <CheckCircle size={24} color={Colors.textWhite} />
                </View>
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedText}>VERIFIED</Text>
                </View>
              </View>
            )}
          </View>

          {progress === 100 ? (
            <TouchableOpacity style={styles.continueButton} onPress={onClose}>
              <Text style={styles.continueText}>Continue to Delivery</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.encryptionText}>ENCRYPTION IN PROGRESS...</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlayBlur,
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
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xxxl,
  },
  title: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
  },
  closeIcon: {
    padding: Spacing.xs,
    backgroundColor: Colors.bgLight,
    borderRadius: BorderRadius.full,
  },
  imageBox: {
    aspectRatio: 3/4,
    backgroundColor: Colors.bgLight,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xxxl,
    overflow: 'hidden',
  },
  progressContainer: {
    alignItems: 'center',
    padding: Spacing.xxxl,
    width: '100%',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.blueLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  scanningText: {
    fontSize: FontSizes.sm,
    color: Colors.textGray,
    fontWeight: FontWeights.medium as any,
  },
  progressBarBg: {
    height: 8,
    width: 200,
    backgroundColor: Colors.border,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.xxxl,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.blue,
  },
  progressText: {
    marginTop: Spacing.md,
    fontSize: 10,
    fontWeight: FontWeights.bold as any,
    color: Colors.blue,
  },
  successContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(22, 163, 74, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.greenMedium,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  verifiedBadge: {
    backgroundColor: Colors.greenMedium,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  verifiedText: {
    color: Colors.textWhite,
    fontSize: 10,
    fontWeight: FontWeights.black as any,
    letterSpacing: 1,
  },
  continueButton: {
    width: '100%',
    paddingVertical: Spacing.xl,
    backgroundColor: Colors.textDark,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  continueText: {
    color: Colors.textWhite,
    fontWeight: FontWeights.bold as any,
    fontSize: FontSizes.sm,
  },
  encryptionText: {
    textAlign: 'center',
    fontSize: 10,
    color: Colors.textLight,
    fontWeight: FontWeights.medium as any,
    letterSpacing: 1,
  },
});
