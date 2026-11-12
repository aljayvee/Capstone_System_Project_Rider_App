import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, ScrollView } from 'react-native';
import { Clock, Store, MapPin, User } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius, scaledFontSize, moderateScale } from '../../../config/theme';
import { SlideToConfirm } from '../../../components/SlideToConfirm';
import { formatErrandId } from '../../../utils/formatErrandId';
import { Errand, MergedErrand } from '../../../types/rider';
import { formatEarnings } from '../../../utils/earnings';
import { merchantCategoryLabel } from '../../../services/merchantCategory';
import { HomeColors } from '../homeTheme';
import { ScreenLayout, ScreenSpacing } from '../../../config/screenLayout';

interface NewTaskCardProps {
  errand: MergedErrand | Errand;
  onAccept: () => void;
  onDecline: () => void;
  /**
   * The countdown ran out. Hands the offer back without asking for a reason:
   * this used to open the decline modal, which on an unattended phone sat open
   * and sent nothing, leaving the errand stuck on this rider (2026-10-09).
   */
  onExpire: () => void;
  isAccepting?: boolean;
  feeDetails?: React.ReactNode;
}

const TOTAL_COUNTDOWN_SECONDS = 45;

/**
 * Seconds left on this offer, counted from when the server made it rather than
 * from when this card mounted. The server takes an unanswered offer back 60 s
 * after assignedAt (errandService.OFFER_EXPIRY_MS); counting from mount showed
 * a full 45 s to a rider who opened the app late, on an offer about to vanish.
 */
function secondsLeftOnOffer(assignedAt: string | null | undefined): number {
  const offeredAt = assignedAt ? Date.parse(assignedAt) : NaN;
  if (Number.isNaN(offeredAt)) return TOTAL_COUNTDOWN_SECONDS;
  const elapsed = Math.floor((Date.now() - offeredAt) / 1000);
  return Math.min(TOTAL_COUNTDOWN_SECONDS, Math.max(0, TOTAL_COUNTDOWN_SECONDS - elapsed));
}

export function NewTaskCard({ errand, onAccept, onDecline, onExpire, isAccepting = false, feeDetails }: NewTaskCardProps) {
  const [secondsRemaining, setSecondsRemaining] = useState(() => secondsLeftOnOffer(errand.assignedAt));
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiredRef = useRef(false);
  const progressAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    expiredRef.current = false;
    const startAt = secondsLeftOnOffer(errand.assignedAt);
    setSecondsRemaining(startAt);
    // Already run out: the effect below expires it. No timer to start.
    if (startAt <= 0) return;
    progressAnim.setValue(startAt / TOTAL_COUNTDOWN_SECONDS);

    Animated.timing(progressAnim, {
      toValue: 0,
      duration: startAt * 1000,
      useNativeDriver: false,
    }).start();

    // The updater only counts. The expiry used to be called from inside it,
    // and React may run an updater more than once, which fired it twice: two
    // decline requests for one offer.
    timerRef.current = setInterval(() => {
      setSecondsRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [errand.id]);

  // Exactly once per offer, whichever way the countdown reached zero.
  useEffect(() => {
    if (secondsRemaining > 0 || expiredRef.current) return;
    expiredRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    onExpire();
  }, [secondsRemaining]);

  const pinpoints = errand.pinpoints || [];
  // The rider's actual share, not the gross delivery fee this used to show.
  const earnings = formatEarnings(errand);
  // What kind of shop this errand is. Null when nothing is pinned or filed yet.
  const storeKind = merchantCategoryLabel(errand.merchantCategories);

  return (
    <View style={styles.container}>
      {/* 45-SECOND COUNTDOWN TIMER BAR */}
      <View style={styles.timerBarContainer}>
        <Animated.View
          style={[
            styles.timerBarFill,
            {
              width: progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>

      {/* Offer identity and its real remaining response time. */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Text style={styles.offerTitle} accessibilityRole="header" maxFontSizeMultiplier={1.25}>New errand</Text>
          <View style={styles.countdownBadge} accessible accessibilityLabel={`${secondsRemaining} seconds to respond to this offer`}>
            <Clock size={16} color={HomeColors.accent}/>
            <Text style={styles.countdownText} maxFontSizeMultiplier={1.25}>{secondsRemaining}s</Text>
          </View>
        </View>

        <View style={styles.titleSection}>
          <Text style={styles.orderIdText} maxFontSizeMultiplier={1.25}>Errand {formatErrandId(errand.id)}</Text>
          {/* The shop's category, not the service type — which is always
              "Pabili" and told a rider nothing about where they were going. */}
          <Text style={styles.typeText} maxFontSizeMultiplier={1.25}>
            {storeKind ?? 'Store pickup and delivery'}
          </Text>
        </View>
      </View>

      <ScrollView
        testID={`home-offer-details-${errand.id}`}
        style={styles.details}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.detailsContent}
      >
        <View style={styles.earningsRow}>
          <Text style={styles.earningsLabel} maxFontSizeMultiplier={1.25}>You earn</Text>
          <Text style={styles.earningsAmount} maxFontSizeMultiplier={1.25}>{earnings}</Text>
        </View>

        {/* Connected Route Itinerary Timeline (Zero Nested Cards) */}
        <View style={styles.itineraryContainer}>
          {/* Customer Stop */}
          <View style={styles.timelineItem}>
            <View style={styles.timelineIndicator}>
              <View style={styles.timelineDotNavy}>
                <User size={12} color={Colors.textWhite} />
              </View>
              <View style={styles.timelineLine} />
            </View>
            <View style={styles.timelineContent}>
              <Text style={styles.timelineRole} maxFontSizeMultiplier={1.25}>Customer</Text>
              <Text style={styles.timelineTitle} maxFontSizeMultiplier={1.25}>
                {errand.customer || 'Customer'}
              </Text>
            </View>
          </View>

          {/* Store Stops */}
          {pinpoints.length > 0 ? (
            pinpoints.map((p, idx) => (
              <View key={p.id || idx} style={styles.timelineItem}>
                <View style={styles.timelineIndicator}>
                  <View style={styles.timelineDotRed}>
                    <Store size={12} color={Colors.textWhite} />
                  </View>
                  <View style={styles.timelineLine} />
                </View>
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineRole} maxFontSizeMultiplier={1.25}>
                    Store {idx + 1}
                  </Text>
                  <Text style={styles.timelineTitle} maxFontSizeMultiplier={1.25}>
                    {p.storeName}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.timelineItem}>
              <View style={styles.timelineIndicator}>
                <View style={styles.timelineDotRed}>
                  <Store size={12} color={Colors.textWhite} />
                </View>
                <View style={styles.timelineLine} />
              </View>
              <View style={styles.timelineContent}>
                <Text style={styles.timelineRole} maxFontSizeMultiplier={1.25}>Store</Text>
                <Text style={styles.timelineTitle} maxFontSizeMultiplier={1.25}>
                  {storeKind ?? 'Not pinned yet'}
                </Text>
              </View>
            </View>
          )}

          {/* Drop-off Stop */}
          <View style={styles.timelineItem}>
            <View style={styles.timelineIndicator}>
              <View style={styles.timelineDotGreen}>
                <MapPin size={12} color={Colors.textWhite} />
              </View>
            </View>
            <View style={styles.timelineContent}>
              <Text style={styles.timelineRole} maxFontSizeMultiplier={1.25}>Drop-off</Text>
              <Text style={styles.timelineTitle} maxFontSizeMultiplier={1.25}>
                {errand.address}
              </Text>
            </View>
          </View>
        </View>

        {feeDetails ? <View style={styles.feeDetails}>{feeDetails}</View> : null}
      </ScrollView>

      {/* Always visible below the details viewport, above the navigation dock. */}
      <View style={styles.actionContainer} testID={`home-offer-actions-${errand.id}`}>
        <SlideToConfirm
          label={isAccepting ? 'Accepting…' : 'Slide to accept'}
          onSlideComplete={onAccept}
          disabled={isAccepting || secondsRemaining <= 0}
        />

        <TouchableOpacity
          style={styles.declineButton}
          accessibilityRole="button"
          accessibilityState={{ disabled: isAccepting || secondsRemaining <= 0 }}
          accessibilityLabel="Decline this offer"
          onPress={onDecline}
          disabled={isAccepting || secondsRemaining <= 0}
        >
          <Text style={styles.declineText} maxFontSizeMultiplier={1.25}>Decline</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgWhite,
  },
  details: {
    flex: 1,
  },
  detailsContent: {
    paddingTop: Spacing.sm,
    paddingBottom: moderateScale(16, 0.5),
  },
  timerBarContainer: {
    height: 5,
    backgroundColor: HomeColors.accentSurface,
    width: '100%',
  },
  timerBarFill: {
    height: '100%',
    backgroundColor: HomeColors.accent,
  },
  header: {
    flexShrink: 0,
    paddingHorizontal: ScreenSpacing.horizontal,
    paddingVertical: ScreenSpacing.top,
    backgroundColor: Colors.bgWhite,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  offerTitle: {
    flexShrink: 1,
    color: Colors.navy,
    fontSize: scaledFontSize(FontSizes.lg, 0.35),
    fontWeight: FontWeights.bold,
  },
  countdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: HomeColors.accentSurface,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: HomeColors.accentSurface,
  },
  countdownText: {
    color: HomeColors.accent,
    fontSize: scaledFontSize(FontSizes.sm, 0.35),
    fontWeight: FontWeights.extrabold as any,
  },
  titleSection: {
    marginTop: 2,
  },
  orderIdText: {
    color: HomeColors.accent,
    fontSize: scaledFontSize(FontSizes.sm, 0.35),
    fontWeight: FontWeights.bold as any,
  },
  typeText: {
    color: Colors.textMedium,
    fontSize: scaledFontSize(FontSizes.sm, 0.35),
    marginTop: Spacing.xs,
  },
  earningsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: HomeColors.divider,
    paddingHorizontal: moderateScale(20, 0.5),
    paddingBottom: moderateScale(16, 0.5),
  },
  earningsLabel: {
    color: Colors.textMedium,
    fontSize: scaledFontSize(FontSizes.sm, 0.35),
    fontWeight: FontWeights.bold as any,
  },
  earningsAmount: {
    color: Colors.success,
    fontSize: scaledFontSize(FontSizes.lg, 0.35),
    fontWeight: FontWeights.bold as any,
    fontVariant: ['tabular-nums'],
  },
  itineraryContainer: {
    padding: moderateScale(20, 0.5),
    paddingBottom: Spacing.xs,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 48,
  },
  timelineIndicator: {
    alignItems: 'center',
    width: 26,
    marginRight: Spacing.md,
  },
  timelineDotNavy: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: HomeColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotRed: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: HomeColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotGreen: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: HomeColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 18,
    backgroundColor: HomeColors.divider,
    marginVertical: 2,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: Spacing.sm,
  },
  timelineRole: {
    fontSize: scaledFontSize(FontSizes.xs, 0.35),
    color: Colors.textGray,
    fontWeight: FontWeights.bold as any,
  },
  timelineTitle: {
    fontSize: scaledFontSize(FontSizes.base, 0.35),
    color: Colors.navy,
    fontWeight: FontWeights.semibold as any,
    marginTop: 1,
  },
  actionContainer: {
    ...ScreenLayout.actionDock,
    borderTopColor: HomeColors.divider,
  },
  feeDetails: { paddingHorizontal: moderateScale(20, 0.5) },
  declineButton: {
    width: '100%',
    paddingVertical: moderateScale(12, 0.20),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    minHeight: 48,
  },
  declineText: {
    color: Colors.textGray,
    fontWeight: FontWeights.semibold as any,
    fontSize: scaledFontSize(FontSizes.sm, 0.35),
  },
});

