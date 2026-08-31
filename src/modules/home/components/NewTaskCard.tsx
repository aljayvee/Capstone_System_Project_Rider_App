import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Zap, Clock, Store, MapPin, DollarSign, User, ShieldCheck } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius, scaledFontSize, moderateScale } from '../../../config/theme';
import { SlideToConfirm } from '../../../components/SlideToConfirm';
import { formatErrandId } from '../../../utils/formatErrandId';
import { Errand, MergedErrand } from '../../../types/rider';
import { formatEarnings } from '../../../utils/earnings';

interface NewTaskCardProps {
  errand: MergedErrand | Errand;
  onAccept: () => void;
  onDecline: () => void;
  isAccepting?: boolean;
}

const TOTAL_COUNTDOWN_SECONDS = 45;

export function NewTaskCard({ errand, onAccept, onDecline, isAccepting = false }: NewTaskCardProps) {
  const [secondsRemaining, setSecondsRemaining] = useState(TOTAL_COUNTDOWN_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setSecondsRemaining(TOTAL_COUNTDOWN_SECONDS);
    progressAnim.setValue(1);

    Animated.timing(progressAnim, {
      toValue: 0,
      duration: TOTAL_COUNTDOWN_SECONDS * 1000,
      useNativeDriver: false,
    }).start();

    timerRef.current = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          onDecline();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [errand.id]);

  const pinpoints = errand.pinpoints || [];
  // The rider's actual share, not the gross delivery fee this used to show.
  const earnings = formatEarnings(errand);

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
            <Text style={styles.incomingBadgeText} maxFontSizeMultiplier={1.15}>NEW ERRAND</Text>
          </View>
          <View style={styles.countdownBadge}>
            <Clock size={13} color={Colors.primary}/>
            <Text style={styles.countdownText} maxFontSizeMultiplier={1.15}>{secondsRemaining}s</Text>
          </View>
        </View>

        <View style={styles.titleSection}>
          <Text style={styles.orderIdText} maxFontSizeMultiplier={1.15}>Order #{formatErrandId(errand.id)}</Text>
          <Text style={styles.typeText} maxFontSizeMultiplier={1.2}>{errand.type} Delivery</Text>
        </View>
      </View>

      {/* EARNINGS HERO BANNER */}
      <View style={styles.earningsHero}>
        <View>
          <Text style={styles.earningsLabel} maxFontSizeMultiplier={1.15}>GUARANTEED EARNINGS</Text>
          <Text style={styles.earningsAmount} maxFontSizeMultiplier={1.2}>{earnings}</Text>
        </View>
        <View style={styles.earningsIconBox}>
          <DollarSign size={24} color={Colors.success}/>
        </View>
      </View>

      {/* Where the rider is going, in the order they will go there. */}
      <View style={styles.detailsContainer}>
        {/* Customer Info */}
        <View style={styles.detailRow}>
          <View style={styles.iconCircleNavy}>
            <User size={13} color={Colors.textWhite}/>
          </View>
          <View style={styles.detailTextWrapper}>
            <Text style={styles.detailTitle} maxFontSizeMultiplier={1.15}>Customer</Text>
            <Text style={styles.detailContent} numberOfLines={1} maxFontSizeMultiplier={1.15}>{errand.customer || 'Customer'}</Text>
          </View>
        </View>

        {/* The stores, numbered in visiting order. */}
        {pinpoints.length > 0 ? (
          pinpoints.map((p, idx) => (
            <View key={p.id || idx} style={styles.detailRow}>
              <View style={styles.iconCircleRed}>
                <Store size={13} color={Colors.textWhite}/>
              </View>
              <View style={styles.detailTextWrapper}>
                <Text style={styles.detailTitle} maxFontSizeMultiplier={1.15}>Store {idx + 1}</Text>
                <Text style={styles.detailContent} numberOfLines={2} maxFontSizeMultiplier={1.15}>{p.storeName}</Text>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.detailRow}>
            <View style={styles.iconCircleRed}>
              <Store size={13} color={Colors.textWhite}/>
            </View>
            <View style={styles.detailTextWrapper}>
              <Text style={styles.detailTitle} maxFontSizeMultiplier={1.15}>Store</Text>
              <Text style={styles.detailContent} numberOfLines={2} maxFontSizeMultiplier={1.15}>{errand.type} Partner Store</Text>
            </View>
          </View>
        )}

        {/* Drop-off Location */}
        <View style={styles.detailRow}>
          <View style={styles.iconCircleGreen}>
            <MapPin size={13} color={Colors.textWhite}/>
          </View>
          <View style={styles.detailTextWrapper}>
            <Text style={styles.detailTitle} maxFontSizeMultiplier={1.15}>Customer Address</Text>
            <Text style={styles.detailContent} numberOfLines={2} maxFontSizeMultiplier={1.15}>{errand.address}</Text>
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
          <Text style={styles.declineText} maxFontSizeMultiplier={1.15}>Decline</Text>
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
    borderWidth: 2,
    borderColor: Colors.navy,
    elevation: 6,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 12,
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
  },
  earningsIconBox: {
    width: moderateScale(40, 0.20),
    height: moderateScale(40, 0.20),
    borderRadius: moderateScale(20, 0.20),
    backgroundColor: Colors.successBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsContainer: {
    padding: Spacing.lg,
    gap: Spacing.sm,
    backgroundColor: Colors.bgLight,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.bgWhite,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconCircleNavy: {
    width: moderateScale(28, 0.20),
    height: moderateScale(28, 0.20),
    borderRadius: moderateScale(14, 0.20),
    backgroundColor: Colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleRed: {
    width: moderateScale(28, 0.20),
    height: moderateScale(28, 0.20),
    borderRadius: moderateScale(14, 0.20),
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleGreen: {
    width: moderateScale(28, 0.20),
    height: moderateScale(28, 0.20),
    borderRadius: moderateScale(14, 0.20),
    backgroundColor: Colors.successAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailTextWrapper: {
    flex: 1,
  },
  detailTitle: {
    fontSize: scaledFontSize(10, 0.20),
    color: Colors.textGray,
    fontWeight: FontWeights.bold as any,
    textTransform: 'uppercase',
  },
  detailContent: {
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    color: Colors.textDark,
    fontWeight: FontWeights.semibold as any,
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

