import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useRiderMissionContext } from '../../context/RiderMissionContext';
import type { MainTabParamList } from '../../navigation/AuthedNavigator';
import RiderHeader from '../../components/RiderHeader';
import { StatusBanner } from '../../components/StatusBanner';
import { FeeBreakdownPanel } from '../../components/FeeBreakdownPanel';
import { WaybillModal } from '../../components/WaybillModal';
import { OfflineCard, WaitingCard, NewTaskCard, CompletedCard, DeclineModal } from './components';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, scaledFontSize, moderateScale, MAX_CONTENT_WIDTH } from '../../config/theme';
import { formatErrandId } from '../../utils/formatErrandId';

/**
 * The decision screen: what has been offered, and whether to take it.
 *
 * This used to be the whole app. Six hundred lines switching on `phase` to be,
 * in turn, the offer card, the queue switcher, the customer panel, the shopping
 * list, the fee breakdown, the progress stepper, the cash input and the advance
 * button — so a rider halfway to a store scrolled past an accept/decline card
 * for a different errand, and a rider deciding whether to accept scrolled past a
 * progress stepper for one already in hand.
 *
 * Everything a rider does after saying yes now lives on the Task tab. What is
 * left here is the one question this screen exists to ask.
 */
export default function HomeScreen() {
  const mission = useRiderMissionContext();
  // The nearest navigator here is the TAB navigator, not the outer stack —
  // useNavigation resolves to whichever encloses this screen. Typing it as the
  // stack compiled only because the jump below was cast to `never`.
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();

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
  const handleAccept = React.useCallback(async () => {
    await mission.acceptMission();
    navigation.navigate('Task');
  }, [mission, navigation]);

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
          errand={errand}
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
              onAccept={handleAccept}
              onDecline={handleDecline}
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
      <ScrollView contentContainerStyle={styles.scrollContent}>{renderBody()}</ScrollView>

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
});
