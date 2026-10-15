import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Camera, Zap, ZapOff, RefreshCw, Check, X } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '../config/theme';
import {
  captureAndUpload,
  scanReceipt,
  saveScannedReceipt,
  ProofCaptureError,
  type ProofImageKind,
  type ScannedProof,
} from '../services/proofCapture';
import { retrying } from '../services/requestCache';

interface ReceiptCaptureScreenProps {
  errandId: string;
  kind?: ProofImageKind;
  pinpointId?: number | null;
  /**
   * `pending` is set when the screen closes before its upload has finished
   * (the save behind an optimistic tick); the caller owns undoing the tick if
   * it rejects. Without it, the upload is already done and `imageId` is real.
   */
  onDone: (result: {
    confirmedTotal: number;
    imageId: number | null;
    riderNote?: string;
    pending?: Promise<unknown>;
  }) => void;
  onCancel: () => void;
}

/** A receipt save behind an optimistic tick is tried again after these waits. */
const SAVE_RETRY_DELAYS_MS = [1500, 4000];

const NOTE_PRESETS: Partial<
  Record<ProofImageKind, { label: string; placeholder: string; chips: string[] }>
> = {
  NO_RECEIPT: {
    label: 'Reason / Note for Dispatcher',
    placeholder: 'e.g. Walang receipt tong mga items na toh...',
    chips: [
      'Walang receipt tong mga items na toh',
      'Palengke / Sari-sari stall',
      'Handwritten list lang',
      'Sira printer ng store',
    ],
  },
  CASH_COLLECTED: {
    label: 'Reason / Note for Dispatcher',
    placeholder: 'e.g. Cash nalang daw / Walang barya...',
    chips: [
      'Cash nalang daw',
      'Walang barya si customer',
      'Keep the change (Tip)',
      'Nag-GCash/Maya sa pinto',
    ],
  },
  RECEIPT: {
    label: 'Note if total differs (Optional)',
    placeholder: 'e.g. May dagdag na plastic / malabo print...',
    chips: [
      'Malabo / kupas ang print',
      'May dagdag na plastic/fee',
      'May pina-add si customer',
      'Ibang branch binilhan',
    ],
  },
};

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
  // The customer's own GCash/Maya receipt, shown at the door. One-shot: the
  // server either accepts it (reference number, amount and date all check
  // out against the balance due) or refuses it outright, so there is nothing
  // for the rider to confirm or correct — unlike RECEIPT, a mismatch here
  // means retake, not "close enough".
  RIDER_BALANCE_PROOF: {
    heading: "Photograph their receipt",
    hint: 'Open the GCash, Maya or bank confirmation the customer is showing you and fit the whole thing in the frame.',
    cta: 'Take photo',
  },
  // Physical cash. Nothing to read — the rider counts it and types the figure.
  CASH_COLLECTED: {
    heading: 'What did they hand you?',
    hint: 'Photograph the cash, then enter the amount.',
    cta: 'Photograph the cash',
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
  // A read receipt the server is holding unsaved. A retake drops it, and only
  // Confirm writes it to the errand, so retakes never pile up as copies.
  const [scan, setScan] = useState<ScannedProof | null>(null);
  // Held back for NO_RECEIPT: nothing uploads until the rider states the amount.
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [riderNote, setRiderNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  // How much of the photo has gone up. A receipt takes a while on a weak line,
  // and a bar that moves is what tells the rider it is working.
  const [sent, setSent] = useState<number | null>(null);

  const copy = COPY[kind] ?? COPY.RECEIPT;
  const notePreset = NOTE_PRESETS[kind];

  const backToCamera = useCallback(() => {
    setPhase('camera');
    setPreview(null);
    setScan(null);
    setPendingUri(null);
    setAmount('');
    setRiderNote('');
    setError(null);
    setSent(null);
  }, []);

  React.useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (phase === 'reading') {
        // Upload or OCR in progress: ignore hardware back to avoid race conditions
        return true;
      }
      if (phase === 'confirm') {
        backToCamera();
        return true;
      }
      onCancel();
      return true;
    });
    return () => sub.remove();
  }, [phase, backToCamera, onCancel]);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current) return;
    setError(null);
    setSent(null);
    setPhase('reading');

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 1 });
      if (!photo?.uri) throw new ProofCaptureError('The camera did not return a photo. Try again.');
      setPreview(photo.uri);

      // A handover carries no amount and nothing to read, so the rider is not
      // kept watching it upload: the step ticks now, the photo goes up behind
      // it, and the errand undoes the tick if it does not arrive
      // (useRiderMission.completeReceiptCapture).
      if (kind === 'PROOF_OF_DELIVERY') {
        const pending = captureAndUpload(errandId, kind, photo.uri, pinpointId);
        onDone({ confirmedTotal: 0, imageId: null, pending });
        return;
      }

      // A receiptless shop — or cash in hand — has nothing to read, so the
      // rider is asked for the figure before anything is uploaded. It is
      // part of the record, not a correction to one.
      if (kind === 'NO_RECEIPT' || kind === 'CASH_COLLECTED') {
        setPendingUri(photo.uri);
        setPhase('confirm');
        return;
      }

      // The customer's GCash/Maya receipt is validated server-side against
      // the exact balance due — a mismatch is refused outright (surfaced
      // below via the catch block), so a successful upload IS the finished
      // state. Nothing for the rider to confirm or correct.
      if (kind === 'RIDER_BALANCE_PROOF') {
        const uploaded = await captureAndUpload(errandId, kind, photo.uri, pinpointId, undefined, setSent);
        onDone({
          confirmedTotal: uploaded.extraction?.extractedTotal ?? 0,
          imageId: uploaded.id,
        });
        return;
      }

      // Read, not saved: the photo is only stored once the total is confirmed.
      const scanned = await scanReceipt(errandId, kind, photo.uri, pinpointId, setSent);
      setScan(scanned);
      // Pre-fill when OCR found a total; leave blank when it did not, so the
      // rider types what they see rather than editing a wrong number.
      setAmount(
        scanned.extraction?.extractedTotal != null
          ? String(scanned.extraction.extractedTotal.toFixed(2))
          : ''
      );
      setPhase('confirm');
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong. Please try again.');
      setPhase('camera');
      setPreview(null);
    }
  }, [errandId, kind, pinpointId, onDone]);

  const handleConfirm = useCallback(async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError(
        kind === 'NO_RECEIPT'
          ? 'Enter what you paid at this shop.'
          : kind === 'CASH_COLLECTED'
            ? 'Enter what they handed you.'
            : 'Enter the total printed on the receipt.'
      );
      return;
    }

    const trimmedNote = riderNote.trim() || undefined;
    setError(null);

    // Optimistic for the shopping evidence: the section ticks the moment the
    // rider confirms, and the save finishes behind it. It used to hold them
    // here behind a spinner for a request whose answer changes nothing they
    // see. If it fails the errand undoes the tick and says what to retake.
    if (kind === 'NO_RECEIPT') {
      if (!pendingUri) {
        setError('The photo went missing. Please retake it.');
        return;
      }
      const pending = captureAndUpload(errandId, kind, pendingUri, pinpointId, value, undefined, trimmedNote);
      onDone({ confirmedTotal: value, imageId: null, riderNote: trimmedNote, pending });
      return;
    }
    if (kind !== 'CASH_COLLECTED') {
      if (!scan) {
        setError('That photo was not uploaded. Please retake it.');
        return;
      }
      // Safe to send again: the server applies the total to the photo it
      // already saved rather than saving it twice. So a dropped line is tried
      // again on its own; a photo the server let go of (410) is not.
      const scanId = scan.scanId;
      const pending = retrying(
        () =>
          trimmedNote
            ? saveScannedReceipt(errandId, scanId, value, trimmedNote)
            : saveScannedReceipt(errandId, scanId, value),
        SAVE_RETRY_DELAYS_MS,
        (err) => !(err instanceof ProofCaptureError) || (err.retryable && err.status !== 410)
      );
      onDone({ confirmedTotal: value, imageId: null, riderNote: trimmedNote, pending });
      return;
    }

    // Cash in hand stays here until it lands: the settlement filed at the
    // door carries this photo's id, and there is none until the server
    // answers. Shown as progress on the button, not a spinner.
    setIsSaving(true);
    setSent(0);
    try {
      if (!pendingUri) throw new Error('The photo went missing. Please retake it.');
      const declared = await captureAndUpload(errandId, kind, pendingUri, pinpointId, value, setSent, trimmedNote);
      onDone({ confirmedTotal: value, imageId: declared.id, riderNote: trimmedNote });
    } catch (err: any) {
      // The server let go of the photo (it waited too long, or the server
      // restarted). Nothing was saved, so the only way on is a fresh photo.
      if (err instanceof ProofCaptureError && err.status === 410) {
        backToCamera();
        setError(err.message);
        return;
      }
      setError(err?.message ?? 'Could not save that. Check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  }, [amount, backToCamera, errandId, kind, pendingUri, pinpointId, riderNote, scan, onDone]);

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
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={requestPermission}
          accessibilityRole="button"
          accessibilityLabel="Allow camera access"
        >
          <Text style={styles.primaryBtnText}>Allow camera</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Confirm ──────────────────────────────────────────────────────────────
  if (phase === 'confirm' && (scan || pendingUri)) {
    const extracted = scan?.extraction?.extractedTotal ?? null;
    const declaring = kind === 'NO_RECEIPT' || kind === 'CASH_COLLECTED';

    return (
      <SafeAreaView style={styles.container}>
        {/* Was behavior={undefined} on Android: under edge-to-edge the window never
            shrinks for the keyboard, so that meant no avoidance at all. The total
            and note fields sat under the number pad. */}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.confirmScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.heading}>{copy.heading}</Text>

            {preview && <Image source={{ uri: preview }} style={styles.preview} resizeMode="contain" />}

            <Text style={styles.readLabel}>
              {kind === 'CASH_COLLECTED'
                ? 'Enter what they handed you. It will be recorded alongside the photo.'
                : declaring
                  ? 'This shop gives no receipt, so enter the amount you paid. It will be recorded as unverified.'
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

            {notePreset && (
              <View style={styles.noteSection}>
                <Text style={styles.noteLabel}>{notePreset.label}</Text>
                <View style={styles.chipRow}>
                  {notePreset.chips.map((chip) => {
                    const selected = riderNote.trim().toLowerCase() === chip.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={chip}
                        style={[styles.presetChip, selected && styles.presetChipActive]}
                        onPress={() => setRiderNote(selected ? '' : chip)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`Quick note: ${chip}`}
                      >
                        <Text
                          style={[styles.presetChipText, selected && styles.presetChipTextActive]}
                          maxFontSizeMultiplier={1.15}
                        >
                          {chip}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TextInput
                  style={styles.noteInput}
                  value={riderNote}
                  onChangeText={setRiderNote}
                  placeholder={notePreset.placeholder}
                  placeholderTextColor={Colors.textLight}
                  maxLength={240}
                  testID="receipt-rider-note-input"
                />
              </View>
            )}

            {error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={backToCamera}
              disabled={isSaving}
              accessibilityRole="button"
              accessibilityState={{ disabled: isSaving }}
              accessibilityLabel="Retake the photo"
            >
              <RefreshCw size={16} color={Colors.textDark} />
              <Text style={styles.secondaryBtnText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, styles.grow]}
              onPress={handleConfirm}
              disabled={isSaving}
              testID="receipt-confirm-button"
              accessibilityRole="button"
              accessibilityState={{ disabled: isSaving, busy: isSaving }}
              accessibilityLabel={isSaving ? 'Saving' : 'Confirm this total'}
            >
              {/* Only cash waits here (it needs the photo's id); it shows how
                  far the photo has got rather than a spinner. */}
              {isSaving ? (
                <Text style={styles.primaryBtnText}>
                  {sent !== null && sent < 1 ? `Saving… ${Math.round(sent * 100)}%` : 'Saving…'}
                </Text>
              ) : (
                <>
                  <Check size={18} color={Colors.textWhite} />
                  <Text style={styles.primaryBtnText}>Confirm total</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
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

        {/* What the rider photographed stays on screen while it is read, with
            a bar that fills as it goes up. No spinner: the photo itself says
            what is happening to it, and the bar says how far along it is. */}
        {phase === 'reading' && (
          <View style={styles.readingOverlay} testID="receipt-reading">
            {preview && (
              <Image source={{ uri: preview }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            )}
            <View style={styles.readingPanel}>
              <Text style={styles.readingText} testID="receipt-reading-status">
                {sent !== null && sent < 1
                  ? `Sending the photo… ${Math.round(sent * 100)}%`
                  : kind === 'RECEIPT' || kind === 'TRANSFER' || kind === 'RIDER_BALANCE_PROOF'
                    ? 'Reading the receipt…'
                    : 'Saving the photo…'}
              </Text>
              <View
                style={styles.progressTrack}
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: 100, now: Math.round((sent ?? 0) * 100) }}
              >
                <View style={[styles.progressFill, { width: `${Math.round((sent ?? 0) * 100)}%` }]} />
              </View>
            </View>
          </View>
        )}
      </View>

      <Text style={styles.hint}>{copy.hint}</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={onCancel}
          disabled={phase === 'reading'}
          accessibilityRole="button"
          accessibilityState={{ disabled: phase === 'reading' }}
          accessibilityLabel="Cancel and go back"
        >
          <X size={20} color={Colors.textDark} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryBtn, styles.grow]}
          onPress={handleCapture}
          disabled={phase === 'reading'}
          testID="receipt-capture-button"
          accessibilityRole="button"
          accessibilityState={{ disabled: phase === 'reading', busy: phase === 'reading' }}
          accessibilityLabel={phase === 'reading' ? 'Reading the photo' : copy.cta}
        >
          <Camera size={18} color={Colors.textWhite} />
          <Text style={styles.primaryBtnText}>
            {phase === 'reading' ? 'Working…' : copy.cta}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => setTorch((on) => !on)}
          accessibilityRole="button"
          accessibilityState={{ checked: torch }}
          accessibilityLabel={torch ? 'Turn the light off' : 'Turn the light on'}
        >
          {torch ? <Zap size={20} color={Colors.warning} /> : <ZapOff size={20} color={Colors.textDark} />}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgLight, padding: Spacing.lg, gap: Spacing.md },
  confirmScroll: { gap: Spacing.md, paddingBottom: Spacing.md },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  heading: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold as any, color: Colors.textDark },
  cameraWrap: { flex: 1, borderRadius: BorderRadius.lg, overflow: 'hidden', backgroundColor: Colors.viewfinder },
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
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  readingText: { color: Colors.textWhite, fontSize: FontSizes.base, fontWeight: FontWeights.semibold as any },
  readingPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: Colors.textWhite },
  preview: { width: '100%', height: 180, borderRadius: BorderRadius.md, backgroundColor: Colors.viewfinder },
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
  noteSection: {
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  noteLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold as any,
    color: Colors.textDark,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  presetChip: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.bgWhite,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 40,
    justifyContent: 'center',
  },
  presetChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySurface,
  },
  presetChipText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium as any,
    color: Colors.textDark,
  },
  presetChipTextActive: {
    color: Colors.primary,
    fontWeight: FontWeights.bold as any,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.bgWhite,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: FontSizes.base,
    color: Colors.textDark,
    minHeight: 48,
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
    minHeight: 48,
  },
  primaryBtnText: {
    // flexShrink: in its row a long CTA otherwise kept its one-line width and
    // ran past the button's edges (React Native's flexShrink defaults to 0).
    flexShrink: 1,
    textAlign: 'center',
    color: Colors.textWhite,
    fontWeight: FontWeights.bold as any,
    fontSize: FontSizes.md,
  },
  secondaryBtn: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: 48,
    justifyContent: 'center',
  },
  secondaryBtnText: {
    flexShrink: 1,
    textAlign: 'center',
    color: Colors.textDark,
    fontWeight: FontWeights.semibold as any,
    fontSize: FontSizes.base,
  },
  iconBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    minHeight: 48,
    minWidth: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  error: {
    fontSize: FontSizes.sm,
    color: Colors.primaryStrong,
    backgroundColor: 'rgba(185,28,28,0.08)',
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
  },
  permissionTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold as any, color: Colors.textDark },
  permissionBody: { fontSize: FontSizes.base, color: Colors.textMedium, textAlign: 'center' },
});
