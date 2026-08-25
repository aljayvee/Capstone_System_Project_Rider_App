import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Zap, Clock, Store, MapPin, DollarSign, User, ShieldCheck } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '../../../config/theme';
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
            <Zap size={14} color="#FFFFFF" />
            <Text style={styles.incomingBadgeText}>INCOMING MISSION OFFER</Text>
          </View>
          <View style={styles.countdownBadge}>
            <Clock size={13} color="#DC2626" />
            <Text style={styles.countdownText}>{secondsRemaining}s</Text>
          </View>
        </View>

        <View style={styles.titleSection}>
          <Text style={styles.orderIdText}>Order #{formatErrandId(errand.id)}</Text>
          <Text style={styles.typeText}>{errand.type} Delivery</Text>
        </View>
      </View>

      {/* EARNINGS HERO BANNER */}
      <View style={styles.earningsHero}>
        <View>
          <Text style={styles.earningsLabel}>GUARANTEED EARNINGS</Text>
          <Text style={styles.earningsAmount}>{earnings}</Text>
        </View>
        <View style={styles.earningsIconBox}>
          <DollarSign size={24} color="#10B981" />
        </View>
      </View>

      {/* MISSION WAYPOINTS & DETAILS */}
      <View style={styles.detailsContainer}>
        {/* Customer Info */}
        <View style={styles.detailRow}>
          <View style={styles.iconCircleNavy}>
            <User size={13} color="#FFFFFF" />
          </View>
          <View style={styles.detailTextWrapper}>
            <Text style={styles.detailTitle}>Customer</Text>
            <Text style={styles.detailContent}>{errand.customer || 'Customer'}</Text>
          </View>
        </View>

        {/* Numbered Store Waypoints */}
        {pinpoints.length > 0 ? (
          pinpoints.map((p, idx) => (
            <View key={p.id || idx} style={styles.detailRow}>
              <View style={styles.iconCircleRed}>
                <Store size={13} color="#FFFFFF" />
              </View>
              <View style={styles.detailTextWrapper}>
                <Text style={styles.detailTitle}>Store Waypoint #{idx + 1}</Text>
                <Text style={styles.detailContent}>{p.storeName}</Text>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.detailRow}>
            <View style={styles.iconCircleRed}>
              <Store size={13} color="#FFFFFF" />
            </View>
            <View style={styles.detailTextWrapper}>
              <Text style={styles.detailTitle}>Store Waypoint #1</Text>
              <Text style={styles.detailContent}>{errand.type} Partner Store</Text>
            </View>
          </View>
        )}

        {/* Drop-off Location */}
        <View style={styles.detailRow}>
          <View style={styles.iconCircleGreen}>
            <MapPin size={13} color="#FFFFFF" />
          </View>
          <View style={styles.detailTextWrapper}>
            <Text style={styles.detailTitle}>Delivery Destination</Text>
            <Text style={styles.detailContent} numberOfLines={2}>{errand.address}</Text>
          </View>
        </View>
      </View>

      {/* ACTION CONTROLS */}
      <View style={styles.actionContainer}>
        <SlideToConfirm
          label={isAccepting ? 'Accepting Mission…' : 'Slide to Accept Mission'}
          onSlideComplete={onAccept}
          disabled={isAccepting}
        />

        <TouchableOpacity
          style={styles.declineButton}
          onPress={onDecline}
          disabled={isAccepting}
        >
          <Text style={styles.declineText}>Decline Offer</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#1E3A5F',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    marginVertical: Spacing.sm,
  },
  timerBarContainer: {
    height: 5,
    backgroundColor: '#E2E8F0',
    width: '100%',
  },
  timerBarFill: {
    height: '100%',
    backgroundColor: '#DC2626',
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: '#1E3A5F',
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
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
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: FontWeights.bold as any,
    letterSpacing: 0.5,
  },
  countdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  countdownText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: FontWeights.extrabold as any,
  },
  titleSection: {
    marginTop: 2,
  },
  orderIdText: {
    color: '#93C5FD',
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold as any,
  },
  typeText: {
    color: '#FFFFFF',
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.extrabold as any,
  },
  earningsHero: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderBottomWidth: 1,
    borderBottomColor: '#A7F3D0',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  earningsLabel: {
    color: '#047857',
    fontSize: 10,
    fontWeight: FontWeights.bold as any,
    letterSpacing: 0.5,
  },
  earningsAmount: {
    color: '#065F46',
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.black as any,
  },
  earningsIconBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsContainer: {
    padding: Spacing.xl,
    gap: Spacing.md,
    backgroundColor: '#F8FAFC',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: '#FFFFFF',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  iconCircleNavy: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1E3A5F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleRed: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleGreen: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailTextWrapper: {
    flex: 1,
  },
  detailTitle: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: FontWeights.bold as any,
    textTransform: 'uppercase',
  },
  detailContent: {
    fontSize: FontSizes.sm,
    color: '#1E293B',
    fontWeight: FontWeights.semibold as any,
  },
  actionContainer: {
    padding: Spacing.xl,
    backgroundColor: '#FFFFFF',
    gap: Spacing.sm,
  },
  declineButton: {
    width: '100%',
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
  },
  declineText: {
    color: '#64748B',
    fontWeight: FontWeights.semibold as any,
    fontSize: FontSizes.sm,
  },
});

