import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Camera, Zap, ZapOff, RefreshCw, Check, X } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '../config/theme';
import {
  captureAndUpload,
  confirmProofTotal,
  ProofCaptureError,
  type ProofImageKind,
  type UploadedProof,
} from '../services/proofCapture';

interface ReceiptCaptureScreenProps {
  errandId: string;
  kind?: ProofImageKind;
  pinpointId?: number | null;
  onDone: (confirmedTotal: number) => void;
  onCancel: () => void;
}

/**
 * What this screen is capturing, and therefore what it asks for.
 *
 * - `RECEIPT` — photograph the paper, a machine reads it, the rider confirms
 *   the total it found.
 * - `NO_RECEIPT` — a sari-sari store or market stall that prints nothing. The
 *   photo is of the GOODS, so there is nothing to read: the rider types what
 *   they paid, and it is stored as their word rather than a reading.
 * - `PROOF_OF_DELIVERY` — the handover. Nothing to read and no amount at all.
 */
const COPY: Record<ProofImageKind, { heading: string; hint: string; cta: string }> = {
  RECEIPT: {
    heading: 'Check the total',
    hint: "Lay the receipt flat and fit the whole thing in the frame. Use the light if it's dim.",
    cta: 'Take photo',
  },
  NO_RECEIPT: {
    heading: 'What did you pay?',
    hint: 'Photograph the items you bought, then enter what you paid for them.',
    cta: 'Photograph the items',
  },
  PROOF_OF_DELIVERY: {
    heading: 'Handover photo',
    hint: 'Photograph the items with the customer, or where you left them.',
    cta: 'Take photo',
  },
  // No screen passes TRANSFER today, but proofCapture routes it through OCR
  // like a receipt, so it can arrive here. Keyed by ProofImageKind rather than
  // string so a new kind cannot reach this screen without copy written for it.
  TRANSFER: {
    heading: 'Check the amount',
    hint: 'Open the GCash or bank confirmation and fit the whole receipt in the frame.',
    cta: 'Take screenshot photo',
  },
};

type Phase = 'camera' | 'reading' | 'confirm';

/**
 * Photograph a receipt, have it read, confirm the total.
 *
 * The rider cannot proceed on a photo nobody could read — that is the point of
 * the feature, and it is why every failure path here loops back to the camera
 * rather than offering a way around. What the screen owes them in exchange is a
 * reason and an instruction, never a bare "failed".
 *
 * The extracted total is a SUGGESTION. It arrives pre-filled and editable
 * because OCR misreads a digit on creased thermal paper often enough that
 * forcing the machine's answer would be worse than trusting the person holding
 * the receipt.
 */
export default function ReceiptCaptureScreen({
  errandId,
  kind = 'RECEIPT',
  pinpointId,
  onDone,
  onCancel,
}: ReceiptCaptureScreenProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [phase, setPhase] = useState<Phase>('camera');
  const [torch, setTorch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [proof, setProof] = useState<UploadedProof | null>(null);
  // Held back for NO_RECEIPT: nothing uploads until the rider states the amount.
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const copy = COPY[kind] ?? COPY.RECEIPT;

  const backToCamera = useCallback(() => {
    setPhase('camera');
    setPreview(null);
    setProof(null);
    setPendingUri(null);
    setAmount('');
    setError(null);
  }, []);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current) return;
    setError(null);
    setPhase('reading');

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 1 });
      if (!photo?.uri) throw new ProofCaptureError('The camera did not return a photo. Try again.');
      setPreview(photo.uri);

      // A handover carries no amount, so it is finished the moment it uploads.
      if (kind === 'PROOF_OF_DELIVERY') {
        await captureAndUpload(errandId, kind, photo.uri, pinpointId);
        onDone(0);
        return;
      }

      // A receiptless shop has nothing to read, so the rider is asked for the
      // figure before anything is uploaded — it is part of the record, not a
      // correction to one.
      if (kind === 'NO_RECEIPT') {
        setPendingUri(photo.uri);
        setPhase('confirm');
        return;
      }

      const uploaded = await captureAndUpload(errandId, kind, photo.uri, pinpointId);
      setProof(uploaded);
      // Pre-fill when OCR found a total; leave blank when it did not, so the
      // rider types what they see rather than editing a wrong number.
      setAmount(
        uploaded.extraction?.extractedTotal != null
          ? String(uploaded.extraction.extractedTotal.toFixed(2))
          : ''
      );
      setPhase('confirm');
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong. Please try again.');
      setPhase('camera');
      setPreview(null);
    }
  }, [errandId, kind, pinpointId]);

  const handleConfirm = useCallback(async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError(
        kind === 'NO_RECEIPT'
          ? 'Enter what you paid at this shop.'
          : 'Enter the total printed on the receipt.'
      );
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      if (kind === 'NO_RECEIPT') {
        if (!pendingUri) throw new Error('The photo went missing. Please retake it.');
        await captureAndUpload(errandId, kind, pendingUri, pinpointId, value);
      } else {
        if (!proof) throw new Error('That photo was not uploaded. Please retake it.');
        await confirmProofTotal(errandId, proof.id, value);
      }
      onDone(value);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ??
          err?.message ??
          'Could not save that. Check your signal and try again.'
      );
    } finally {
      setIsSaving(false);
    }
  }, [amount, errandId, kind, pendingUri, pinpointId, proof, onDone]);

  if (!permission) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={Colors.primary} />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.centered}>
        <Camera size={40} color={Colors.textMedium} />
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionBody}>
          The receipt photo is how the purchase is recorded, so the camera is required to continue.
        </Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
          <Text style={styles.primaryBtnText}>Allow camera</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Confirm ──────────────────────────────────────────────────────────────
  if (phase === 'confirm' && (proof || pendingUri)) {
    const extracted = proof?.extraction?.extractedTotal ?? null;
    const declaring = kind === 'NO_RECEIPT';

    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.heading}>{copy.heading}</Text>

        {preview && <Image source={{ uri: preview }} style={styles.preview} resizeMode="contain" />}

        <Text style={styles.readLabel}>
          {declaring
            ? // No claim is made about reading anything — there was nothing to
              // read, and the figure is going on record as the rider's word.
              'This shop gives no receipt, so enter the amount you paid. It will be recorded as unverified.'
            : extracted === null
              ? "We read the receipt but couldn't find the total — please type it in."
              : `Scanned as ₱${extracted.toFixed(2)}. Correct it if that's wrong.`}
        </Text>

        <View style={styles.amountRow}>
          <Text style={styles.peso}>₱</Text>
          <TextInput
            style={styles.amountInput}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={Colors.textLight}
            testID="receipt-amount-input"
          />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.actions}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={backToCamera} disabled={isSaving}>
            <RefreshCw size={16} color={Colors.textDark} />
            <Text style={styles.secondaryBtnText}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryBtn, styles.grow]}
            onPress={handleConfirm}
            disabled={isSaving}
            testID="receipt-confirm-button"
          >
            {isSaving ? (
              <ActivityIndicator color={Colors.textWhite} size="small" />
            ) : (
              <>
                <Check size={18} color={Colors.textWhite} />
                <Text style={styles.primaryBtnText}>Confirm total</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Camera ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.cameraWrap}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" enableTorch={torch} autofocus="on">
          {/* A frame to aim with. Receipts photographed at an angle still read,
              but a squared-up shot reads faster and more reliably. */}
          <View style={styles.guide} />
        </CameraView>

        {phase === 'reading' && (
          <View style={styles.readingOverlay}>
            <ActivityIndicator color={Colors.textWhite} size="large" />
            <Text style={styles.readingText}>
              {kind === 'RECEIPT' ? 'Reading the receipt…' : 'Saving the photo…'}
            </Text>
          </View>
        )}
      </View>

      <Text style={styles.hint}>{copy.hint}</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.iconBtn} onPress={onCancel} disabled={phase === 'reading'}>
          <X size={20} color={Colors.textDark} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryBtn, styles.grow]}
          onPress={handleCapture}
          disabled={phase === 'reading'}
          testID="receipt-capture-button"
        >
          <Camera size={18} color={Colors.textWhite} />
          <Text style={styles.primaryBtnText}>
            {phase === 'reading' ? 'Working…' : copy.cta}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.iconBtn} onPress={() => setTorch((on) => !on)}>
          {torch ? <Zap size={20} color={Colors.amberDark} /> : <ZapOff size={20} color={Colors.textDark} />}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgLight, padding: Spacing.lg, gap: Spacing.md },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  heading: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold as any, color: Colors.textDark },
  cameraWrap: { flex: 1, borderRadius: BorderRadius.lg, overflow: 'hidden', backgroundColor: '#000' },
  camera: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  guide: {
    width: '80%',
    height: '78%',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.55)',
    borderRadius: BorderRadius.md,
    borderStyle: 'dashed',
  },
  readingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  readingText: { color: Colors.textWhite, fontSize: FontSizes.base, fontWeight: FontWeights.semibold as any },
  preview: { width: '100%', height: 220, borderRadius: BorderRadius.md, backgroundColor: '#000' },
  hint: { fontSize: FontSizes.sm, color: Colors.textMedium, textAlign: 'center' },
  readLabel: { fontSize: FontSizes.base, color: Colors.textMedium },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.bgWhite,
  },
  peso: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold as any, color: Colors.textMedium },
  amountInput: {
    flex: 1,
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
    paddingVertical: Spacing.md,
    paddingLeft: Spacing.sm,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  grow: { flex: 1 },
  primaryBtn: {
    flexDirection: 'row',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  primaryBtnText: { color: Colors.textWhite, fontWeight: FontWeights.bold as any, fontSize: FontSizes.md },
  secondaryBtn: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  secondaryBtnText: { color: Colors.textDark, fontWeight: FontWeights.semibold as any, fontSize: FontSizes.base },
  iconBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  error: {
    fontSize: FontSizes.sm,
    color: Colors.primaryDark,
    backgroundColor: 'rgba(185,28,28,0.08)',
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
  },
  permissionTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold as any, color: Colors.textDark },
  permissionBody: { fontSize: FontSizes.base, color: Colors.textMedium, textAlign: 'center' },
});
