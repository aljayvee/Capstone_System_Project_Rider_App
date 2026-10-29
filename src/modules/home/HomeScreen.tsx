import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useRiderDoubleTapBackToExit } from '../../hooks/useRiderBackHandler';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Navigation, ChevronRight } from 'lucide-react-native';
import { useRiderMissionContext } from '../../context/RiderMissionContext';
import { useRiderAuth } from '../../context/RiderAuthContext';
import type { AuthedStackParamList, MainTabParamList } from '../../navigation/AuthedNavigator';
import RiderHeader from '../../components/RiderHeader';
import { StatusBanner } from '../../components/StatusBanner';
import { MaintenanceNoticeBanner } from '../../components/MaintenanceNoticeBanner';
import { useMaintenanceNotice } from '../../hooks/useMaintenanceNotice';
import { FeeBreakdownPanel } from '../../components/FeeBreakdownPanel';
import { WaybillModal } from '../../components/WaybillModal';
import { OfflineCard, WaitingCard, NewTaskCard, CompletedCard, DeclineModal } from './components';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, FontFamily, scaledFontSize, moderateScale, MAX_CONTENT_WIDTH } from '../../config/theme';
import { HomeColors } from './homeTheme';

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
  const { isOnline } = useRiderAuth();
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const maintenanceNotice = useMaintenanceNotice();
  const insets = useSafeAreaInsets();
  const [actionDockHeight, setActionDockHeight] = React.useState(0);

  // Only while Home is the screen in front. Home stays mounted under every
  // pushed screen (Notifications, Task, ErrandDetails), and without this its
  // "press back again to exit" swallowed Android back on all of them.
  const homeFocused = useIsFocused();
  useRiderDoubleTapBackToExit(
    homeFocused,
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
    if (isOffline) return <OfflineCard setShowWaybill={setShowWaybill} hasErrand={Boolean(errand)} />;

    if (phase === 'loading') {
      return (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={HomeColors.accent} accessibilityLabel="Loading your errands" />
        </View>
      );
    }

    if (phase === 'error') {
      return (
        <View style={styles.centerState}>
          <Text style={styles.offersHeading} accessibilityRole="header" maxFontSizeMultiplier={1.25}>Errands could not load</Text>
          <Text style={styles.errorText} maxFontSizeMultiplier={1.25}>{errorMessage}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={refresh}
            accessibilityRole="button"
            accessibilityLabel="Try loading your errand again"
          >
            <Text style={styles.retryBtnText} maxFontSizeMultiplier={1.25}>Retry</Text>
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

    if (offeredErrands.length === 0) return <WaitingCard hasActiveErrand={mission.isMissionAccepted} isOnDuty={isOnline} />;

    // One card per offer rather than one merged card. A rider offered two
    // errands was previously shown a single blended one and had to accept or
    // decline both together, with a fee figure that was the sum of two jobs.
    return (
      <>
        <Text style={styles.offersHeading} accessibilityRole="header" maxFontSizeMultiplier={1.25}>
          {offeredErrands.length === 1 ? 'Your offer' : `${offeredErrands.length} errands offered to you`}
        </Text>
        {offeredErrands.map((offer) => (
          <View key={offer.id} style={styles.offerBlock}>
            <NewTaskCard
              errand={offer}
              onAccept={() => handleAccept(offer.id)}
              onDecline={handleDecline}
              onExpire={() => mission.expireOffer(offer.id)}
              isAccepting={mission.isAccepting}
              feeDetails={<FeeBreakdownPanel errand={offer} variant="offer" />}
            />
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
        testID="home-scroll"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 72 + Math.max(insets.bottom, Spacing.sm) + Spacing.md + (mission.isMissionAccepted ? actionDockHeight + Spacing.md : 0) },
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

      {/* The navigation action has its own space above the tab bar. */}
      {mission.isMissionAccepted && (
        <View
          style={[styles.taskDock, { bottom: Math.max(insets.bottom, Spacing.sm) + 64 + Spacing.md }]}
          onLayout={(event) => {
            const next = Math.round(event.nativeEvent.layout.height);
            setActionDockHeight((previous) => previous === next ? previous : next);
          }}
          testID="home-task-dock"
        >
          <TouchableOpacity
            style={styles.navigationButton}
            onPress={() => navigation.navigate('Task')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Open active task in navigation"
            testID="home-active-task-fab"
          >
            <View style={styles.fabIconWrap}>
              <Navigation size={18} color={Colors.onPrimary} strokeWidth={2.4} />
            </View>
            <Text style={styles.fabText} maxFontSizeMultiplier={1.25}>
              Open navigation
            </Text>
            <ChevronRight size={18} color={Colors.onPrimary} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: HomeColors.background,
  },
  scrollContent: {
    padding: moderateScale(20, 0.5),
    gap: moderateScale(20, 0.5),
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
    fontSize: scaledFontSize(FontSizes.base, 0.35),
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
    fontSize: scaledFontSize(FontSizes.base, 0.35),
  },
  offersHeading: {
    fontSize: scaledFontSize(FontSizes.md, 0.35),
    fontWeight: FontWeights.bold as any,
    color: Colors.navy,
  },
  offerBlock: {
    marginBottom: moderateScale(12, 0.5),
  },
  taskDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingVertical: moderateScale(12, 0.5),
    paddingHorizontal: moderateScale(20, 0.5),
    backgroundColor: HomeColors.surface,
    borderTopWidth: 1,
    borderTopColor: HomeColors.divider,
    zIndex: 50,
  },
  navigationButton: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH - moderateScale(40, 0.5),
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: HomeColors.accent,
    paddingVertical: moderateScale(14, 0.5),
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    minHeight: Math.max(52, moderateScale(54, 0.5)),
  },
  fabIconWrap: {
    marginRight: 2,
  },
  fabText: {
    flexShrink: 1,
    fontFamily: FontFamily.bold,
    fontSize: scaledFontSize(FontSizes.base, 0.35),
    fontWeight: FontWeights.bold as any,
    color: Colors.onPrimary,
    letterSpacing: 0.2,
  },
});
