import React, { useCallback, useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { Camera, X, ShieldAlert } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '../../../config/theme';
import { riderApiService } from '../../../config/apiConfig';
import { TaskSheetColors } from '../../../config/taskSheetTheme';

interface PaymentProofViewerProps {
  errandId: string;
}

interface ProofListItem {
  id: number;
  capturedAt: string;
  supersededAt?: string | null;
  extraction?: { referenceNo?: string | null; extractedTotal?: number | null } | null;
}

/**
 * Lets the rider check the customer's GCash/Maya receipt at the door.
 *
 * The customer's upload was validated server-side at the moment it arrived —
 * same reference number, same amount, same calendar day. What that check
 * cannot catch is a customer showing the RIDER a stale screenshot of a real
 * payment sent on a different day, or for a different errand. Seeing the
 * actual photo and its capture date is the rider's own, human check on top of
 * the machine one.
 */
export function PaymentProofViewer({ errandId }: PaymentProofViewerProps) {
  const [current, setCurrent] = useState<ProofListItem | null | undefined>(undefined);
  const [openImage, setOpenImage] = useState<{ mimeType: string; imageData: string } | null>(null);
  const [isViewing, setIsViewing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    riderApiService.listProofImages(errandId, 'PAYMENT_PROOF').then((result: ProofListItem[]) => {
      if (cancelled) return;
      // Ordered oldest-first by the server; the current one is whichever
      // non-superseded row is last — there is ever only one at a time.
      const live = result.filter((img) => !img.supersededAt).pop();
      setCurrent(live ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [errandId]);

  const view = useCallback(async () => {
    if (!current) return;
    setIsViewing(true);
    const full = await riderApiService.getProofImage(errandId, current.id);
    if (full) setOpenImage({ mimeType: full.mimeType, imageData: full.imageData });
    setIsViewing(false);
  }, [errandId, current]);

  // Nothing uploaded yet, or still loading — nothing to show either way.
  if (!current) return null;

  const capturedDate = new Date(current.capturedAt);
  const isToday = capturedDate.toDateString() === new Date().toDateString();

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.card}
        onPress={() => void view()}
        disabled={isViewing}
        accessibilityRole="button"
        accessibilityLabel="View the customer's payment receipt"
        testID="view-customer-payment-proof"
      >
        {isViewing ? (
          <ActivityIndicator color={Colors.navy} size="small" />
        ) : (
          <Camera size={18} color={Colors.navy} />
        )}
        <View style={styles.textCol}>
          <Text style={styles.title}>View the customer's payment receipt</Text>
          <Text style={[styles.subtitle, !isToday && styles.subtitleWarning]}>
            {isToday ? 'Captured today' : `Captured ${capturedDate.toLocaleDateString()} — check this closely`}
            {current.extraction?.referenceNo ? ` · Ref ${current.extraction.referenceNo}` : ''}
          </Text>
        </View>
        {!isToday && <ShieldAlert size={16} color={Colors.warning} />}
      </TouchableOpacity>

      <Modal
        visible={Boolean(openImage)}
        transparent
        animationType="fade"
        onRequestClose={() => setOpenImage(null)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => setOpenImage(null)}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <X size={22} color={Colors.textWhite} />
          </TouchableOpacity>
          {openImage && (
            <Image
              source={{ uri: `data:${openImage.mimeType};base64,${openImage.imageData}` }}
              style={styles.fullImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: TaskSheetColors.accentSurface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: TaskSheetColors.accentBorder,
    minHeight: 48,
  },
  textCol: { flex: 1 },
  title: { fontSize: FontSizes.sm, fontWeight: FontWeights.semibold as any, color: Colors.textDark },
  subtitle: { fontSize: FontSizes.xs, color: Colors.textMedium, marginTop: 1 },
  subtitleWarning: { color: Colors.warning, fontWeight: FontWeights.semibold as any },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  closeBtn: {
    position: 'absolute',
    top: 48,
    right: 20,
    padding: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    zIndex: 1,
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullImage: { width: '100%', height: '80%' },
});
