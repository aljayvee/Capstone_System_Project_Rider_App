import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Banknote, Camera, CheckCircle2, AlertTriangle } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius, scaledFontSize, moderateScale } from '../../../config/theme';
import { formatPeso } from '../../../utils/format';
import type { Errand, MergedErrand, PaymentPlan } from '../../../types/rider';
import type { PaymentProofKind } from '../../../services/missionProgress';
import { TaskSheetColors } from '../../../config/taskSheetTheme';

interface CashCollectionProps {
  errand?: MergedErrand | Errand | null;
  /** True once a photo (GCash/Maya receipt, or cash in hand) is on file. */
  collectedInFull: boolean;
  /** Which of the two that photo is. Null when not known. */
  proofKind?: PaymentProofKind | null;
  /** True once the rider has said the customer paid less than the total. */
  shortPayment?: boolean;
  /** The rider's own count, once a cash photo comes back short. */
  shortAmount?: string;
  /** Opens the camera on the customer's GCash/Maya receipt — OCR'd against the balance. */
  onCaptureBalanceProof: () => void;
  /** Opens the camera on physical cash — the rider types what they were handed. */
  onCaptureCashProof: () => void;
  /** Optional note entered by the rider ("Cash nalang daw", "Walang barya si customer"). */
  riderNote?: string;
  visible?: boolean;
}

/**
 * What the rider must collect at the door.
 *
 * This used to be a plain "Collected in full" button — a claim with nothing
 * behind it. Every cash collection now needs a photo first: the customer's
 * GCash/Maya receipt when there's a balance to confirm electronically, or the
 * cash itself otherwise — COD included. The photo is the evidence; the figure
 * next to it is what the rider counted, not a number typed into a bare field.
 */
export function CashCollectionInput({
  errand,
  collectedInFull,
  proofKind = null,
  shortPayment = false,
  shortAmount = '',
  onCaptureBalanceProof,
  onCaptureCashProof,
  riderNote = '',
  visible = true,
}: CashCollectionProps) {
  if (!visible) return null;

  const breakdown = errand?.feeBreakdown ?? null;
  const plan = (errand as { paymentPlan?: PaymentPlan | null } | null)?.paymentPlan ?? null;

  // Since 2026-10-08 a GCash/Maya or bank errand pays the whole bill here, like
  // COD, so the balance is normally the grand total. It still wins: an errand
  // that paid the retired 50% plan has part of the bill in already, money that
  // never passed through the rider, and the grand total would collect it twice.
  const due = plan?.hasLedger
    ? plan.balanceDue
    : breakdown?.grandTotal ?? errand?.amount ?? 0;

  // What the photo on file is, not what the customer first chose: a GCash/Maya
  // errand paid in cash at the door is cash. The plan is only the fallback
  // when the kind is not known.
  const receiptConfirmed = proofKind ? proofKind === 'RIDER_BALANCE_PROOF' : Boolean(plan?.hasLedger);

  // Paid in cash instead, the non-COD fee is not charged (cashDueAtDoorFor).
  const nonCodFee = plan?.hasLedger ? Math.max(0, breakdown?.fees?.nonCodFee ?? 0) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Banknote size={18} color={Colors.navy} />
          <Text style={styles.label} maxFontSizeMultiplier={1.25}>Collect from customer</Text>
        </View>

        <Text style={styles.amount} testID="cash-amount-due">
          {formatPeso(due)}
        </Text>

        {breakdown && (
          <View style={styles.lines}>
            <View style={styles.line}>
              <Text style={styles.lineLabel}>Items</Text>
              <Text style={styles.lineValue}>{formatPeso(breakdown.itemsSubtotal)}</Text>
            </View>
            <View style={styles.line}>
              <Text style={styles.lineLabel}>Delivery fee</Text>
              <Text style={styles.lineValue}>{formatPeso(breakdown.fees.subtotal)}</Text>
            </View>
          </View>
        )}

        {collectedInFull ? (
          <View style={styles.doneBlock}>
            <View style={styles.doneRow}>
              <CheckCircle2 size={16} color={Colors.success} />
              <Text style={styles.doneText}>
                {shortPayment
                  ? `Photographed — ${formatPeso(Number(shortAmount) || 0)} recorded as short`
                  : receiptConfirmed
                    ? 'Receipt confirmed ✓'
                    : 'Cash photographed ✓'}
              </Text>
            </View>
            {Boolean(riderNote.trim()) && (
              <Text style={styles.notePreviewText}>
                Note: "{riderNote.trim()}"
              </Text>
            )}
          </View>
        ) : plan?.hasLedger ? (
          <>
            <TouchableOpacity
              style={styles.confirmBtn}
              accessibilityRole="button"
              accessibilityLabel="Photograph the customer's GCash, Maya or bank transfer receipt"
              onPress={onCaptureBalanceProof}
              testID="cash-capture-balance-proof"
            >
              <Camera size={18} color={Colors.navy} />
              <Text style={styles.confirmBtnText} maxFontSizeMultiplier={1.25}>Photograph their GCash, Maya or bank receipt</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.shortBtn}
              onPress={onCaptureCashProof}
              accessibilityRole="button"
              accessibilityLabel="They're paying cash instead"
              testID="cash-capture-cash-instead"
            >
              <AlertTriangle size={14} color={Colors.textGray} />
              <Text style={styles.shortText} maxFontSizeMultiplier={1.25}>They're paying cash instead</Text>
            </TouchableOpacity>
            {nonCodFee > 0 && (
              <Text style={styles.cashInsteadNote} testID="cash-instead-amount">
                In cash: {formatPeso(Math.max(0, due - nonCodFee))}, without the {formatPeso(nonCodFee)} non-COD fee.
              </Text>
            )}
          </>
        ) : (
          <TouchableOpacity
            style={styles.confirmBtn}
            accessibilityRole="button"
            accessibilityLabel={`Photograph the ${formatPeso(due)} collected in cash`}
            onPress={onCaptureCashProof}
            testID="cash-capture-cash-proof"
          >
            <Camera size={18} color={Colors.navy} />
            <Text style={styles.confirmBtnText} maxFontSizeMultiplier={1.25}>Photograph the cash you collected</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.sm },
  card: {
    backgroundColor: TaskSheetColors.surface,
    gap: moderateScale(12),
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  label: {
    flexShrink: 1,
    fontSize: scaledFontSize(FontSizes.base, 0.35),
    fontWeight: FontWeights.bold as any,
    color: Colors.navy,
  },
  amount: {
    fontSize: scaledFontSize(FontSizes.xxl, 0.35),
    fontWeight: FontWeights.bold as any,
    color: Colors.navy,
  },
  lines: { gap: 2 },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  lineLabel: { flexShrink: 1, fontSize: FontSizes.sm, color: Colors.textMedium },
  lineValue: { fontSize: FontSizes.sm, color: Colors.textMedium },
  confirmBtn: {
    marginTop: Spacing.xs,
    flexDirection: 'row',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: TaskSheetColors.accentSurface,
    borderWidth: 1,
    borderColor: TaskSheetColors.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    minHeight: 48,
  },
  confirmBtnText: {
    flexShrink: 1,
    textAlign: 'center',
    fontSize: scaledFontSize(FontSizes.base, 0.35),
    fontWeight: FontWeights.bold as any,
    color: Colors.navy,
  },
  doneBlock: {
    marginTop: Spacing.xs,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.successSubtle,
    gap: Spacing.xs,
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  doneText: {
    flexShrink: 1,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
  },
  notePreviewText: {
    fontSize: FontSizes.xs,
    color: Colors.textMedium,
    fontStyle: 'italic',
  },
  shortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    minHeight: 48,
  },
  shortText: {
    flexShrink: 1,
    textAlign: 'center',
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold as any,
    color: Colors.textMedium,
    textDecorationLine: 'underline',
  },
  cashInsteadNote: {
    textAlign: 'center',
    fontSize: FontSizes.xs,
    color: Colors.textMedium,
  },
});
