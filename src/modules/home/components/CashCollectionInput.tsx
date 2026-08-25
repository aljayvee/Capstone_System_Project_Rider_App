import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Banknote, AlertTriangle } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '../../../config/theme';
import { formatPeso } from '../../../utils/format';
import type { Errand, MergedErrand } from '../../../types/rider';

interface CashCollectionProps {
  errand?: MergedErrand | Errand | null;
  /** True once the rider confirms the full amount came back. */
  collectedInFull: boolean;
  onCollectedInFull: () => void;
  onReportShort: () => void;
  /** True once the rider has said the customer paid less than the total. */
  shortPayment?: boolean;
  shortAmount?: string;
  onShortAmountChange?: (value: string) => void;
  visible?: boolean;
}

/**
 * What the rider must collect at the door.
 *
 * This was a free-text box reading "ENTER COLLECTED AMOUNT", which asked the
 * rider to type a number the server already knew — and a number they were then
 * settled against. Typing a smaller one was the whole exploit, and no amount of
 * UI discipline closes a hole shaped like a text field.
 *
 * So the figure is presented and confirmed. The client no longer sends an amount
 * on this path at all; the server fills in the errand's own total, which means a
 * tampered app cannot under-report either.
 *
 * A genuine shortfall is still reachable, deliberately as an exception: it is
 * typed, because a customer who paid short is the one case with no other source
 * for the figure, and it lands as a flagged SHORT settlement rather than
 * disappearing into a total nobody questions.
 */
export function CashCollectionInput({
  errand,
  collectedInFull,
  onCollectedInFull,
  onReportShort,
  shortPayment = false,
  shortAmount = '',
  onShortAmountChange,
  visible = true,
}: CashCollectionProps) {
  if (!visible) return null;

  const breakdown = errand?.feeBreakdown ?? null;
  const due = breakdown?.grandTotal ?? errand?.amount ?? 0;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Banknote size={16} color={Colors.greenDark} />
          <Text style={styles.label}>COLLECT FROM CUSTOMER</Text>
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

        {shortPayment ? (
          /* The exception. Typed because nothing else knows what actually
             changed hands — and flagged, which is what makes it reviewable
             rather than a quietly smaller number. */
          <View style={styles.shortPanel}>
            <View style={styles.header}>
              <AlertTriangle size={14} color={Colors.amberDark} />
              <Text style={styles.shortHeading}>How much did they hand over?</Text>
            </View>
            <View style={styles.shortRow}>
              <Text style={styles.peso}>₱</Text>
              <TextInput
                style={styles.shortInput}
                value={shortAmount}
                onChangeText={onShortAmountChange}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={Colors.textLight}
                testID="cash-short-amount"
              />
            </View>
            <Text style={styles.shortNote}>
              This is recorded as a shortfall and sent to your dispatcher.
            </Text>
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.confirmBtn, collectedInFull && styles.confirmBtnDone]}
              onPress={onCollectedInFull}
              disabled={collectedInFull}
              testID="cash-collected-in-full"
            >
              <Text style={styles.confirmBtnText}>
                {collectedInFull ? 'Collected in full ✓' : `Collected ${formatPeso(due)} in full`}
              </Text>
            </TouchableOpacity>

            {!collectedInFull && (
              <TouchableOpacity style={styles.shortBtn} onPress={onReportShort} testID="cash-report-short">
                <AlertTriangle size={13} color={Colors.amberDark} />
                <Text style={styles.shortText}>Customer paid short</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: Spacing.md },
  card: {
    backgroundColor: Colors.bgWhite,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  label: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold as any,
    color: Colors.greenDark,
    letterSpacing: 0.5,
  },
  amount: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
  },
  lines: { gap: 2 },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  lineLabel: { fontSize: FontSizes.sm, color: Colors.textMedium },
  lineValue: { fontSize: FontSizes.sm, color: Colors.textMedium },
  confirmBtn: {
    marginTop: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.greenDark,
    alignItems: 'center',
  },
  confirmBtnDone: { backgroundColor: Colors.greenBg, opacity: 0.9 },
  confirmBtnText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold as any,
    color: Colors.textWhite,
  },
  shortPanel: {
    gap: Spacing.xs,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.amberBg,
    borderWidth: 1,
    borderColor: Colors.borderYellow,
  },
  shortHeading: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold as any,
    color: Colors.amberDark,
  },
  shortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgWhite,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
  },
  peso: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold as any,
    color: Colors.textMedium,
  },
  shortInput: {
    flex: 1,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
    paddingVertical: Spacing.sm,
    paddingLeft: Spacing.xs,
  },
  shortNote: { fontSize: FontSizes.xs, color: Colors.amberDark },
  shortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  shortText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold as any,
    color: Colors.amberDark,
    textDecorationLine: 'underline',
  },
});
