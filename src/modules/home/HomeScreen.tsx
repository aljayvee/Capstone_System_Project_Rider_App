import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useRiderDoubleTapBackToExit } from '../../hooks/useRiderBackHandler';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Navigation, ChevronRight } from 'lucide-react-native';
import { useRiderMissionContext } from '../../context/RiderMissionContext';
import type { AuthedStackParamList, MainTabParamList } from '../../navigation/AuthedNavigator';
import RiderHeader from '../../components/RiderHeader';
import { StatusBanner } from '../../components/StatusBanner';
import { MaintenanceNoticeBanner } from '../../components/MaintenanceNoticeBanner';
import { useMaintenanceNotice } from '../../hooks/useMaintenanceNotice';
import { FeeBreakdownPanel } from '../../components/FeeBreakdownPanel';
import { WaybillModal } from '../../components/WaybillModal';
import { OfflineCard, WaitingCard, NewTaskCard, CompletedCard, DeclineModal } from './components';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, FontFamily, scaledFontSize, moderateScale, MAX_CONTENT_WIDTH } from '../../config/theme';
import { formatErrandId } from '../../utils/formatErrandId';

type HomeScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Home'>,
  StackNavigationProp<AuthedStackParamList>
>;

/**
 * The decision screen: what has been offered, and whether to take it.
 *
 * Everything a rider does after saying yes now lives on the dedicated full-screen
 * Task view. When an errand is accepted, a floating action button appears on Home
 * allowing quick re-entry into navigation.
 */
export default function HomeScreen() {
  const mission = useRiderMissionContext();
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const maintenanceNotice = useMaintenanceNotice();
  const insets = useSafeAreaInsets();

  useRiderDoubleTapBackToExit(
    true,
    mission.isMissionAccepted
      ? 'Active errand in progress. Press back again to exit.'
      : 'Press back again to exit'
  );

  const {
    phase,
    isOffline,
    offeredErrands,
    errand,
    errorMessage,
    refresh,
    setShowWaybill,
  } = mission;

  // Accepting means the rider is about to start driving, so the map is the next
  // thing they need. Navigation lives here rather than in useRiderMission so the
  // hook stays free of routing concerns.
  //
  // Takes the specific offer's id — this used to be a no-arg closure shared by
  // every offer card, so accepting one of two simultaneous offers silently
  // accepted both, and doing this while an earlier errand was already in
  // progress reset that errand's status too.
  const handleAccept = React.useCallback(
    (offerId: string) => {
      mission.acceptMission(offerId);
      navigation.navigate('Task');
    },
    [mission, navigation]
  );

  const handleDecline = React.useCallback(() => {
    mission.setShowDeclineModal(true);
  }, [mission]);

  const renderBody = () => {
    if (isOffline) return <OfflineCard setShowWaybill={setShowWaybill} />;

    if (phase === 'loading') {
      return (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      );
    }

    if (phase === 'error') {
      return (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={refresh}
            accessibilityRole="button"
            accessibilityLabel="Try loading your errand again"
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (phase === 'completed' && errand) {
      return (
        <CompletedCard
          // The errand just delivered, not the merged card: with a second one
          // still queued, that summed both payouts into one "you earned".
          errand={mission.workingErrand ?? errand}
          riderFirstName={mission.riderProfile?.name?.split(' ')[0]}
          onAcceptNext={mission.resetForNextErrand}
        />
      );
    }

    if (offeredErrands.length === 0) return <WaitingCard />;

    // One card per offer rather than one merged card. A rider offered two
    // errands was previously shown a single blended one and had to accept or
    // decline both together, with a fee figure that was the sum of two jobs.
    return (
      <>
        {offeredErrands.length > 1 && (
          <Text style={styles.offersHeading}>
            {offeredErrands.length} errands offered to you
          </Text>
        )}
        {offeredErrands.map((offer) => (
          <View key={offer.id} style={styles.offerBlock}>
            <NewTaskCard
              errand={offer}
              onAccept={() => handleAccept(offer.id)}
              onDecline={handleDecline}
              onExpire={() => mission.expireOffer(offer.id)}
              isAccepting={mission.isAccepting}
            />
            {/* The breakdown sits with the offer, not behind a tap. What the
                errand pays is the whole basis of the decision being asked for. */}
            <View style={styles.breakdownWrap}>
              <View style={styles.breakdownHeader}>
                <Text style={styles.breakdownId}>{formatErrandId(offer.id)}</Text>
              </View>
              <FeeBreakdownPanel errand={offer} />
            </View>
          </View>
        ))}
      </>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <RiderHeader mission={mission} />
      {/* Outside the ScrollView: a confirmation the rider has scrolled past is a
          confirmation they never saw. */}
      <StatusBanner banner={mission.banner} onDismiss={mission.dismissBanner} />
      <MaintenanceNoticeBanner notice={maintenanceNotice} />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 72 + Math.max(insets.bottom, Spacing.sm) + Spacing.md },
        ]}
      >
        {renderBody()}
      </ScrollView>

      <DeclineModal
        visible={mission.showDeclineModal}
        reason={mission.declineReason}
        setReason={mission.setDeclineReason}
        onClose={() => mission.setShowDeclineModal(false)}
        onSubmit={mission.declineMission}
      />
      {errand && (
        <WaybillModal
          visible={mission.showWaybill}
          onClose={() => setShowWaybill(false)}
          errand={errand}
        />
      )}

      {/* Floating Action Button: Appears only when an errand is accepted */}
      {mission.isMissionAccepted && (
        <TouchableOpacity
          style={[
            styles.floatingTaskFab,
            { bottom: Math.max(insets.bottom, Spacing.sm) + 64 + Spacing.md },
          ]}
          onPress={() => navigation.navigate('Task')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Open active task in navigation"
          testID="home-active-task-fab"
        >
          <View style={styles.fabIconWrap}>
            <Navigation size={18} color={Colors.onPrimary} strokeWidth={2.4} />
          </View>
          <Text style={styles.fabText} maxFontSizeMultiplier={1.15}>
            Active Task
          </Text>
          <ChevronRight size={18} color={Colors.onPrimary} strokeWidth={2.2} />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgGray,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.lg,
    maxWidth: MAX_CONTENT_WIDTH,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: moderateScale(110, 0.20),
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.huge * 2,
    gap: Spacing.lg,
  },
  errorText: {
    color: Colors.textGray,
    fontSize: scaledFontSize(FontSizes.base, 0.20),
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryBtnText: {
    color: Colors.onPrimary,
    fontWeight: FontWeights.bold as any,
    fontSize: scaledFontSize(FontSizes.base, 0.20),
  },
  offersHeading: {
    fontSize: scaledFontSize(FontSizes.md, 0.20),
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
  },
  offerBlock: {
    gap: Spacing.md,
  },
  breakdownWrap: {
    gap: Spacing.xs,
  },
  breakdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breakdownId: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.bold as any,
    color: Colors.textGray,
    letterSpacing: 0.4,
  },
  floatingTaskFab: {
    position: 'absolute',
    bottom: Spacing.xl,
    right: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary,
    paddingVertical: moderateScale(12, 0.20),
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
    minHeight: 48,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 50,
  },
  fabIconWrap: {
    marginRight: 2,
  },
  fabText: {
    flexShrink: 1,
    fontFamily: FontFamily.bold,
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    fontWeight: FontWeights.bold as any,
    color: Colors.onPrimary,
    letterSpacing: 0.2,
  },
});
