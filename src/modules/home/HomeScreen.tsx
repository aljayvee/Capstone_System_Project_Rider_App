import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useRiderDoubleTapBackToExit } from '../../hooks/useRiderBackHandler';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Navigation, ChevronLeft, ChevronRight } from 'lucide-react-native';
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
import { ScreenLayout } from '../../config/screenLayout';

type HomeScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Home'>,
  StackNavigationProp<AuthedStackParamList>
>;

/**
 * The decision screen: what has been offered, and whether to take it.
 *
 * Everything a rider does after saying yes now lives on the dedicated full-screen
 * Task view. When an errand is accepted, a navigation button appears on Home
 * allowing quick re-entry into navigation.
 */
export default function HomeScreen() {
  const mission = useRiderMissionContext();
  const { isOnline } = useRiderAuth();
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const maintenanceNotice = useMaintenanceNotice();
  const [selectedOfferId, setSelectedOfferId] = React.useState<string | null>(null);
  const [declineOfferId, setDeclineOfferId] = React.useState<string | null>(null);

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
  const selectedOfferIndex = Math.max(0, offeredErrands.findIndex((offer) => offer.id === selectedOfferId));
  const showOffers = !isOffline && phase !== 'loading' && phase !== 'error'
    && !(phase === 'completed' && errand) && offeredErrands.length > 0;

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

  const handleDecline = React.useCallback((offerId: string) => {
    setDeclineOfferId(offerId);
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

    return <WaitingCard hasActiveErrand={mission.isMissionAccepted} isOnDuty={isOnline} />;
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <RiderHeader mission={mission} />
      {/* Outside the ScrollView: a confirmation the rider has scrolled past is a
          confirmation they never saw. */}
      <StatusBanner banner={mission.banner} onDismiss={mission.dismissBanner} />
      <MaintenanceNoticeBanner notice={maintenanceNotice} />
      {showOffers ? (
        <View style={styles.offerWorkspace}>
          {offeredErrands.length > 1 && (
            <View style={styles.offerSelector}>
              <TouchableOpacity
                style={styles.offerArrow}
                accessibilityRole="button"
                accessibilityLabel="Previous offer"
                accessibilityState={{ disabled: selectedOfferIndex === 0 || mission.isAccepting }}
                disabled={selectedOfferIndex === 0 || mission.isAccepting}
                onPress={() => setSelectedOfferId(offeredErrands[selectedOfferIndex - 1].id)}
              >
                <ChevronLeft size={22} color={selectedOfferIndex === 0 ? Colors.textLight : Colors.navy} />
              </TouchableOpacity>
              <Text style={styles.offersHeading} maxFontSizeMultiplier={1.25} accessibilityLiveRegion="polite">
                Offer {selectedOfferIndex + 1} of {offeredErrands.length}
              </Text>
              <TouchableOpacity
                style={styles.offerArrow}
                accessibilityRole="button"
                accessibilityLabel="Next offer"
                accessibilityState={{ disabled: selectedOfferIndex === offeredErrands.length - 1 || mission.isAccepting }}
                disabled={selectedOfferIndex === offeredErrands.length - 1 || mission.isAccepting}
                onPress={() => setSelectedOfferId(offeredErrands[selectedOfferIndex + 1].id)}
              >
                <ChevronRight size={22} color={selectedOfferIndex === offeredErrands.length - 1 ? Colors.textLight : Colors.navy} />
              </TouchableOpacity>
            </View>
          )}
          {/* Keep all countdowns mounted while showing one complete offer.
              Each offer retains its own slider and acceptance callback. */}
          {offeredErrands.map((offer, index) => (
            <View
              key={offer.id}
              style={index === selectedOfferIndex ? styles.offerPage : styles.hiddenOffer}
              accessibilityElementsHidden={index !== selectedOfferIndex}
              importantForAccessibility={index === selectedOfferIndex ? 'auto' : 'no-hide-descendants'}
            >
              <NewTaskCard
                errand={offer}
                onAccept={() => handleAccept(offer.id)}
                onDecline={() => handleDecline(offer.id)}
                onExpire={() => mission.expireOffer(offer.id)}
                isAccepting={mission.isAccepting}
                feeDetails={<FeeBreakdownPanel errand={offer} variant="offer" />}
              />
            </View>
          ))}
        </View>
      ) : (
        <ScrollView
          testID="home-scroll"
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {renderBody()}
        </ScrollView>
      )}

      <DeclineModal
        visible={mission.showDeclineModal}
        reason={mission.declineReason}
        setReason={mission.setDeclineReason}
        onClose={() => mission.setShowDeclineModal(false)}
        onSubmit={() => {
          if (declineOfferId) void mission.declineMission(declineOfferId);
        }}
      />
      {errand && (
        <WaybillModal
          visible={mission.showWaybill}
          onClose={() => setShowWaybill(false)}
          errand={errand}
        />
      )}

      {/* A sibling of the scroll viewport, so offers never pass behind it.
          The navigator already reserves the tab bar and bottom safe area. */}
      {mission.isMissionAccepted && (
        <View
          style={styles.taskDock}
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    ...ScreenLayout.content,
    gap: moderateScale(20, 0.5),
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
  offerWorkspace: {
    flex: 1,
    backgroundColor: HomeColors.surface,
  },
  offerPage: {
    flex: 1,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  },
  hiddenOffer: {
    display: 'none',
  },
  offerSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: moderateScale(12, 0.5),
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    flexShrink: 0,
  },
  offerArrow: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskDock: {
    ...ScreenLayout.actionDock,
    backgroundColor: HomeColors.surface,
    borderTopColor: HomeColors.divider,
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
