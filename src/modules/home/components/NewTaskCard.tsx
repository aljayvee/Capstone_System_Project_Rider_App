import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Zap, Clock, Store, MapPin, DollarSign, User, ShieldCheck } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius, scaledFontSize, moderateScale } from '../../../config/theme';
import { SlideToConfirm } from '../../../components/SlideToConfirm';
import { formatErrandId } from '../../../utils/formatErrandId';
import { Errand, MergedErrand } from '../../../types/rider';
import { formatEarnings } from '../../../utils/earnings';
import { merchantCategoryLabel } from '../../../services/merchantCategory';

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

export function NewTaskCard({ errand, onAccept, onDecline, onExpire, isAccepting = false }: NewTaskCardProps) {
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

      {/* HEADER WITH HIGH CONTRAST BADGE & TIMER */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.incomingBadge}>
            <Zap size={14} color={Colors.textWhite}/>
            <Text style={styles.incomingBadgeText} maxFontSizeMultiplier={1.25}>NEW ERRAND</Text>
          </View>
          <View style={styles.countdownBadge}>
            <Clock size={13} color={Colors.primary}/>
            <Text style={styles.countdownText} maxFontSizeMultiplier={1.25}>{secondsRemaining}s</Text>
          </View>
        </View>

        <View style={styles.titleSection}>
          <Text style={styles.orderIdText} maxFontSizeMultiplier={1.25}>Order #{formatErrandId(errand.id)}</Text>
          {/* The shop's category, not the service type — which is always
              "Pabili" and told a rider nothing about where they were going. */}
          <Text style={styles.typeText} maxFontSizeMultiplier={1.25}>
            {storeKind ? `${storeKind} Delivery` : 'Errand Delivery'}
          </Text>
        </View>
      </View>

      {/* EARNINGS HERO BANNER */}
      <View style={styles.earningsHero}>
        <View>
          <Text style={styles.earningsLabel} maxFontSizeMultiplier={1.25}>GUARANTEED EARNINGS</Text>
          <Text style={styles.earningsAmount} maxFontSizeMultiplier={1.25}>{earnings}</Text>
        </View>
        <View style={styles.earningsIconBox}>
          <DollarSign size={24} color={Colors.success}/>
        </View>
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
            <Text style={styles.timelineRole} maxFontSizeMultiplier={1.25}>CUSTOMER</Text>
            <Text style={styles.timelineTitle} numberOfLines={1} maxFontSizeMultiplier={1.25}>
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
                  STORE {idx + 1}
                </Text>
                <Text style={styles.timelineTitle} numberOfLines={2} maxFontSizeMultiplier={1.25}>
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
              <Text style={styles.timelineRole} maxFontSizeMultiplier={1.25}>STORE</Text>
              <Text style={styles.timelineTitle} numberOfLines={2} maxFontSizeMultiplier={1.25}>
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
            <Text style={styles.timelineRole} maxFontSizeMultiplier={1.25}>CUSTOMER DROP-OFF</Text>
            <Text style={styles.timelineTitle} numberOfLines={2} maxFontSizeMultiplier={1.25}>
              {errand.address}
            </Text>
          </View>
        </View>
      </View>

      {/* ACTION CONTROLS */}
      <View style={styles.actionContainer}>
        <SlideToConfirm
          label={isAccepting ? 'Accepting…' : 'Slide to accept'}
          onSlideComplete={onAccept}
          disabled={isAccepting}
        />

        <TouchableOpacity
          style={styles.declineButton}
          accessibilityRole="button"
          accessibilityState={{ disabled: isAccepting }}
          accessibilityLabel="Decline this offer"
          onPress={onDecline}
          disabled={isAccepting}
        >
          <Text style={styles.declineText} maxFontSizeMultiplier={1.25}>Decline</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    backgroundColor: Colors.bgWhite,
    borderWidth: 1,
    borderColor: Colors.border,
    elevation: 3,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    marginVertical: Spacing.xs,
  },
  timerBarContainer: {
    height: 5,
    backgroundColor: Colors.border,
    width: '100%',
  },
  timerBarFill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.navy,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  incomingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  incomingBadgeText: {
    color: Colors.textWhite,
    fontSize: scaledFontSize(10, 0.20),
    fontWeight: FontWeights.bold as any,
    letterSpacing: 0.5,
  },
  countdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.dangerBg,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.primarySurface,
  },
  countdownText: {
    color: Colors.primary,
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.extrabold as any,
  },
  titleSection: {
    marginTop: 2,
  },
  orderIdText: {
    color: Colors.navyLight,
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.bold as any,
  },
  typeText: {
    color: Colors.textWhite,
    fontSize: scaledFontSize(FontSizes.xl, 0.20),
    fontWeight: FontWeights.extrabold as any,
  },
  earningsHero: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    backgroundColor: Colors.successSubtle,
    borderBottomWidth: 1,
    borderBottomColor: Colors.successBorder,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  earningsLabel: {
    color: Colors.success,
    fontSize: scaledFontSize(10, 0.20),
    fontWeight: FontWeights.bold as any,
    letterSpacing: 0.5,
  },
  earningsAmount: {
    color: Colors.success,
    fontSize: scaledFontSize(FontSizes.xxl, 0.20),
    fontWeight: FontWeights.black as any,
    fontVariant: ['tabular-nums'],
  },
  earningsIconBox: {
    width: moderateScale(40, 0.20),
    height: moderateScale(40, 0.20),
    borderRadius: moderateScale(20, 0.20),
    backgroundColor: Colors.successBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itineraryContainer: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xs,
    backgroundColor: Colors.bgLight,
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
    backgroundColor: Colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotRed: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotGreen: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.successAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 18,
    backgroundColor: Colors.border,
    marginVertical: 2,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: Spacing.sm,
  },
  timelineRole: {
    fontSize: scaledFontSize(9, 0.20),
    color: Colors.textGray,
    fontWeight: FontWeights.bold as any,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  timelineTitle: {
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    color: Colors.textDark,
    fontWeight: FontWeights.semibold as any,
    marginTop: 1,
  },
  actionContainer: {
    padding: Spacing.lg,
    backgroundColor: Colors.bgWhite,
    gap: Spacing.sm,
  },
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
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
  },
});

