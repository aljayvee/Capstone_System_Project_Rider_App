import React from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, TouchableOpacity, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { ChevronLeft, ReceiptText, ImageOff } from 'lucide-react-native';
import { useRiderMissionContext } from '../../context/RiderMissionContext';
import type { AuthedStackParamList } from '../../navigation/AuthedNavigator';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { riderApiService, type ProofImageMeta } from '../../config/apiConfig';
import { requestSections } from '../../services/requestSections';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, scaledFontSize, moderateScale, MAX_CONTENT_WIDTH } from '../../config/theme';
import { formatErrandId } from '../../utils/formatErrandId';
import { formatPeso, formatTimestamp } from '../../utils/format';

/** What each kind of photo is called on a screen a rider reads. */
const PROOF_LABELS: Record<ProofImageMeta['kind'], string> = {
  RECEIPT: 'Receipt',
  NO_RECEIPT: 'Goods photographed — shop gave no receipt',
  TRANSFER: 'Payment transfer',
  PROOF_OF_DELIVERY: 'Handover at the door',
};

/**
 * One finished errand, in full: what was bought, what was photographed, what it paid.
 *
 * The photos are fetched in two steps because the list endpoint deliberately
 * omits the blobs — a history screen showing ten past errands would otherwise
 * download ten megabytes of base64 to draw ten thumbnails.
 */
export default function ErrandDetailsScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<AuthedStackParamList, 'ErrandDetails'>>();
  const { errandId } = route.params;
  const { deliveredErrands } = useRiderMissionContext();

  const errand = React.useMemo(
    () => deliveredErrands.find((e) => e.id === errandId) ?? null,
    [deliveredErrands, errandId]
  );

  const [images, setImages] = React.useState<ProofImageMeta[]>([]);
  const [imageData, setImageData] = React.useState<Record<number, string | null>>({});
  const [loadingImages, setLoadingImages] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoadingImages(true);
      const list = await riderApiService.fetchProofImages(errandId);
      if (cancelled) return;
      setImages(list);

      // Sequential rather than Promise.all: these are megabyte-scale base64
      // payloads over a rider's mobile connection, and firing four at once is
      // how the whole screen ends up waiting on the slowest of them.
      for (const meta of list) {
        const data = await riderApiService.fetchProofImage(errandId, meta.id);
        if (cancelled) return;
        setImageData((prev) => ({ ...prev, [meta.id]: data }));
      }
      if (!cancelled) setLoadingImages(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [errandId]);

  const sections = requestSections(errand);
  const earnings = errand?.riderEarnings;
  const breakdown = errand?.feeBreakdown;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back to your history"
        >
          <ChevronLeft size={22} color={Colors.textDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} maxFontSizeMultiplier={1.2}>{formatErrandId(errandId)}</Text>
        <View style={styles.backBtn} />
      </View>

      {!errand ? (
        <EmptyState
          Icon={ImageOff}
          title="That errand is not in your history"
          hint="It may still be in progress, or it belongs to another rider."
        />
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Card style={styles.card}>
            <View style={styles.summaryTop}>
              <View style={styles.summaryLeft}>
                <Text style={styles.customer} maxFontSizeMultiplier={1.2}>{errand.customer}</Text>
                <Text style={styles.address} numberOfLines={2} maxFontSizeMultiplier={1.15}>{errand.address}</Text>
              </View>
              <Badge tone="success">Delivered</Badge>
            </View>
            <Text style={styles.timestamp} maxFontSizeMultiplier={1.15}>{formatTimestamp(errand.updatedAt)}</Text>
          </Card>

          {/* ── What was bought ─────────────────────────────────────────── */}
          <Text style={styles.sectionHeading} maxFontSizeMultiplier={1.2}>Items bought</Text>
          {sections.length === 0 ? (
            <Card style={styles.card}>
              <Text style={styles.muted} maxFontSizeMultiplier={1.15}>No item list was filed for this errand.</Text>
            </Card>
          ) : (
            sections.map((section, idx) => (
              <Card key={idx} style={styles.card}>
                {section.title && <Text style={styles.storeName} maxFontSizeMultiplier={1.2}>{section.title}</Text>}
                {section.storeCategory && (
                  <Text style={styles.storeCategory} maxFontSizeMultiplier={1.15}>{section.storeCategory}</Text>
                )}
                {section.lines.map((line, lineIdx) => (
                  <Text key={lineIdx} style={styles.itemLine} maxFontSizeMultiplier={1.15}>
                    {section.title ? `• ${line}` : line}
                  </Text>
                ))}
              </Card>
            ))
          )}

          {/* ── What was photographed ───────────────────────────────────── */}
          <Text style={styles.sectionHeading} maxFontSizeMultiplier={1.2}>Captured proof</Text>
          {loadingImages && images.length === 0 ? (
            <ActivityIndicator color={Colors.primary} style={styles.loading} />
          ) : images.length === 0 ? (
            <Card style={styles.card}>
              <Text style={styles.muted} maxFontSizeMultiplier={1.15}>No photos were filed against this errand.</Text>
            </Card>
          ) : (
            images.map((meta) => {
              const data = imageData[meta.id];
              return (
                <Card key={meta.id} style={styles.card}>
                  <View style={styles.proofHeader}>
                    <ReceiptText size={14} color={Colors.textGray} />
                    <Text style={styles.proofLabel} maxFontSizeMultiplier={1.15}>{PROOF_LABELS[meta.kind] ?? meta.kind}</Text>
                    {/* An unverified figure is the rider's own word rather than
                        a total read off a printed receipt. Saying so here is the
                        difference between a record and a claim. */}
                    {!meta.verified && <Badge tone="warning">Unverified</Badge>}
                  </View>

                  {data === undefined ? (
                    <ActivityIndicator color={Colors.primary} style={styles.thumbLoading} />
                  ) : data === null ? (
                    <Text style={styles.muted} maxFontSizeMultiplier={1.15}>This photo could not be loaded.</Text>
                  ) : (
                    <Image
                      source={{ uri: data }}
                      style={styles.proofImage}
                      // contain, not cover: a receipt is a tall narrow document
                      // and cropping it to fill the box hides the totals, which
                      // are the only reason a rider opens this screen.
                      resizeMode="contain"
                      accessibilityLabel={PROOF_LABELS[meta.kind] ?? 'Proof photo'}
                    />
                  )}

                  <Text style={styles.proofMeta} maxFontSizeMultiplier={1.15}>{formatTimestamp(meta.capturedAt)}</Text>
                  {meta.declaredTotal != null && meta.declaredTotal > 0 && (
                    <Text style={styles.proofMeta} maxFontSizeMultiplier={1.15}>
                      Declared total: {formatPeso(meta.declaredTotal)}
                    </Text>
                  )}
                </Card>
              );
            })
          )}

          {/* ── What it came to ─────────────────────────────────────────── */}
          <Text style={styles.sectionHeading} maxFontSizeMultiplier={1.2}>Totals</Text>
          <Card style={styles.card}>
            {breakdown && (
              <>
                <Row label="Items" value={formatPeso(breakdown.itemsSubtotal)} />
                <Row label="Delivery fees" value={formatPeso(breakdown.fees.subtotal)} />
                {breakdown.tip > 0 && <Row label="Tip" value={formatPeso(breakdown.tip)} />}
                <Row label="Customer paid" value={formatPeso(breakdown.grandTotal)} emphasis />
              </>
            )}
            {earnings ? (
              <View style={styles.earningsBlock}>
                <Row
                  label={`Your share (${Math.round(earnings.commissionRate * 100)}%)`}
                  value={formatPeso(earnings.deliveryFee * earnings.commissionRate)}
                />
                {earnings.tip > 0 && (
                  <Row label="Tip (yours in full)" value={formatPeso(earnings.tip)} />
                )}
                <Row label="You earned" value={formatPeso(earnings.riderShare)} emphasis success />
              </View>
            ) : (
              <Text style={styles.muted} maxFontSizeMultiplier={1.15}>Earnings for this errand are not available.</Text>
            )}
          </Card>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Row({
  label,
  value,
  emphasis,
  success,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  success?: boolean;
}) {
  return (
    <View style={[styles.row, emphasis && styles.rowEmphasis]}>
      <Text style={[styles.rowLabel, emphasis && styles.rowLabelEmphasis]} maxFontSizeMultiplier={1.15}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          emphasis && styles.rowValueEmphasis,
          success && styles.rowValueSuccess,
        ]}
        maxFontSizeMultiplier={1.2}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgGray,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.bgWhite,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    maxWidth: MAX_CONTENT_WIDTH,
    width: '100%',
    alignSelf: 'center',
  },
  backBtn: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: scaledFontSize(FontSizes.lg, 0.20),
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
    maxWidth: MAX_CONTENT_WIDTH,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: moderateScale(110, 0.20),
  },
  card: {
    gap: Spacing.xs,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  summaryLeft: {
    flex: 1,
    gap: 2,
  },
  customer: {
    fontSize: scaledFontSize(FontSizes.md, 0.20),
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
  },
  address: {
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    color: Colors.textGray,
  },
  timestamp: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    color: Colors.textLight,
    marginTop: Spacing.xs,
  },
  sectionHeading: {
    fontSize: scaledFontSize(FontSizes.base, 0.20),
    fontWeight: FontWeights.bold as any,
    color: Colors.textMedium,
    marginTop: Spacing.md,
  },
  storeName: {
    fontSize: scaledFontSize(FontSizes.base, 0.20),
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
  },
  storeCategory: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.semibold as any,
    color: Colors.textGray,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  itemLine: {
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    color: Colors.textDark,
    lineHeight: 20,
  },
  muted: {
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    color: Colors.textGray,
  },
  loading: {
    marginVertical: Spacing.lg,
  },
  thumbLoading: {
    marginVertical: Spacing.xxl,
  },
  proofHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  proofLabel: {
    flex: 1,
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    fontWeight: FontWeights.semibold as any,
    color: Colors.textMedium,
  },
  proofImage: {
    width: '100%',
    height: moderateScale(220, 0.20),
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.bgGray,
  },
  proofMeta: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    color: Colors.textLight,
    marginTop: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  rowEmphasis: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
    marginTop: Spacing.sm,
  },
  rowLabel: {
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    color: Colors.textGray,
    flexShrink: 1,
    paddingRight: Spacing.sm,
  },
  rowLabelEmphasis: {
    color: Colors.textDark,
    fontWeight: FontWeights.semibold as any,
  },
  rowValue: {
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    color: Colors.textDark,
    fontWeight: FontWeights.semibold as any,
  },
  rowValueEmphasis: {
    fontSize: scaledFontSize(FontSizes.md, 0.20),
    fontWeight: FontWeights.bold as any,
  },
  rowValueSuccess: {
    color: Colors.success,
  },
  earningsBlock: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderTopColor: Colors.successBorder,
  },
});
