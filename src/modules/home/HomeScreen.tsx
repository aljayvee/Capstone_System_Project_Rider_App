import React from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useRiderMissionContext } from '../../context/RiderMissionContext';
import type { AuthedStackParamList } from '../../navigation/AuthedNavigator';
import RiderHeader from '../../components/RiderHeader';
import {
  OfflineCard,
  WaitingCard,
  NewTaskCard,
  CustomerDetailsPanel,
  RequestItemsPanel,
  FeeBreakdownPanel,
  ProgressSteps,
  CashCollectionInput,
  CompletedCard,
  DeclineModal,
  UploadModal,
  WaybillModal
} from './components';
import FloatingChatButton from '../chat/FloatingChatButton';
import DispatcherChatModal from '../chat/DispatcherChatModal';
import { Package, ChevronRight, Map, FileText, Layers, MapPin } from 'lucide-react-native';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../config/theme';
import { STEP_META } from '../../types/rider';
import { formatErrandId } from '../../utils/formatErrandId';
import { requestSections } from '../../services/requestSections';
import ReceiptCaptureScreen from '../../screens/ReceiptCaptureScreen';

export default function HomeScreen() {
  const mission = useRiderMissionContext();
  const navigation = useNavigation<StackNavigationProp<AuthedStackParamList>>();
  const [selectedMissionIndex, setSelectedMissionIndex] = React.useState(0);

  // Accepting a job means the rider is about to start driving, so the pinned map
  // is the next thing they need — it was previously reachable only by finding a
  // button further down the home screen. Navigation lives here rather than in
  // useRiderMission so the hook stays free of routing concerns.
  const handleAcceptAndNavigate = React.useCallback(async () => {
    await mission.acceptMission();
    navigation.navigate('LiveErrandMap');
  }, [mission, navigation]);

  const {
    phase,
    isOffline,
    currentStatus,
    errand,
    activeMissions,
    completedSubtasks,
    stepIndex,
    paymentMode,
    collectedAmount,
    advanceStatus,
    setShowWaybill,
    isDelivered,
    errorMessage,
    refresh,
    isMissionAccepted,
  } = mission;

  // Selected display errand when multiple queued errands exist
  const displayErrand = (activeMissions && activeMissions[selectedMissionIndex]) || errand;

  // The rider may leave a store once every section of the list has a receipt
  // filed against it. Counted off the SAME array the panel renders its upload
  // buttons from — see requestSections. Counting the flat `details` string here
  // while the panel drew one button per store made this permanently unsatisfiable
  // on any errand whose item count differed from its store count.
  const sections = requestSections(displayErrand);

  // The id a receipt is filed under must be a real errand. `displayErrand` can
  // fall back to the merged card, whose id is every underlying id joined with
  // " + " for display — a string no endpoint can resolve.
  const captureErrandId = activeMissions?.[selectedMissionIndex]?.id ?? null;
  const completedCount = sections.filter((_, idx) => completedSubtasks[idx]).length;
  const isActionable = currentStatus === "At Store" ? completedCount === sections.length : true;

  return (
    <SafeAreaView style={styles.container}>
      <RiderHeader mission={mission} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {isOffline ? (
          <OfflineCard setShowWaybill={setShowWaybill} />
        ) : phase === "loading" ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : phase === "error" ? (
          <View style={styles.centerState}>
            <Text style={styles.errorText}>{errorMessage}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={refresh}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : phase === "idle" ? (
          <WaitingCard />
        ) : phase === "offered" && errand ? (
          <NewTaskCard
            errand={errand}
            onAccept={handleAcceptAndNavigate}
            onDecline={() => mission.setShowDeclineModal(true)}
            isAccepting={mission.isAccepting}
          />
        ) : phase === "completed" && errand ? (
          <CompletedCard
            errand={errand}
            riderFirstName={mission.riderProfile?.name?.split(' ')[0]}
            onAcceptNext={mission.resetForNextErrand}
          />
        ) : displayErrand ? (
          <View style={styles.trackerCard}>
            {/* MULTI-ERRAND QUEUE TAB SWITCHER (UP TO 3 TASKS) */}
            {activeMissions && activeMissions.length > 1 && (
              <View style={styles.multiErrandTabs}>
                <View style={styles.multiErrandLabel}>
                  <Layers size={13} color="#1E3A5F" />
                  <Text style={styles.multiErrandLabelText}>Queue ({activeMissions.length}/3):</Text>
                </View>
                {activeMissions.map((m, idx) => (
                  <TouchableOpacity
                    key={m.id || idx}
                    onPress={() => setSelectedMissionIndex(idx)}
                    style={[
                      styles.multiErrandTab,
                      selectedMissionIndex === idx ? styles.multiErrandTabActive : styles.multiErrandTabInactive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.multiErrandTabText,
                        selectedMissionIndex === idx ? styles.multiErrandTabTextActive : styles.multiErrandTabTextInactive,
                      ]}
                    >
                      {idx === 0 ? `Active (#${formatErrandId(m.id)})` : `Queued ${idx} (#${formatErrandId(m.id)})`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.trackerHeader}>
              <View style={styles.headerLeft}>
                <Package size={16} color={Colors.textWhite} />
                <Text style={styles.headerTitle}>
                  {selectedMissionIndex === 0 ? "Current Assignment" : `Queued Task #${selectedMissionIndex}`}
                </Text>
              </View>
              <View style={styles.headerRight}>
                <TouchableOpacity
                  style={styles.detailsBtn}
                  onPress={() => navigation.navigate('LiveErrandMap')}
                >
                  <Map size={12} color={Colors.textWhite} />
                  <Text style={styles.detailsBtnText}>Live Map</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.detailsBtn} onPress={() => setShowWaybill(true)}>
                  <FileText size={12} color={Colors.textWhite} />
                  <Text style={styles.detailsBtnText}>Customer Details</Text>
                </TouchableOpacity>
                <View style={styles.idBadge}>
                  <Text style={styles.idBadgeText}>{formatErrandId(displayErrand.id)}</Text>
                </View>
              </View>
            </View>

            <View style={styles.trackerBody}>
              <View style={styles.badgesRow}>
                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>{displayErrand.type}</Text>
                </View>
                <View style={styles.paymentBadge}>
                  <Text style={styles.paymentBadgeText}>{displayErrand.paymentMode}</Text>
                </View>
              </View>

              <CustomerDetailsPanel errand={displayErrand} />

              {(displayErrand.payload || displayErrand.details) && (
                <RequestItemsPanel
                  errand={displayErrand}
                  currentStatus={currentStatus}
                  completedSubtasks={completedSubtasks}
                  uploadingSubtask={mission.uploadingSubtask}
                  onUpload={mission.openReceiptCapture}
                  onNoReceipt={mission.openNoReceiptCapture}
                />
              )}

              <FeeBreakdownPanel errand={displayErrand} />

              <ProgressSteps currentStatus={currentStatus} stepIndex={stepIndex} />

              {/* Why the step moved, or is about to. A status that advances with
                  no visible cause reads as a glitch, and a rider who does not
                  trust the screen goes back to tapping buttons at random. */}
              {mission.storeArrival.advancedAutomatically && currentStatus === "At Store" && (
                <View style={styles.arrivalNote}>
                  <MapPin size={14} color={Colors.greenDark} />
                  <Text style={styles.arrivalNoteText}>
                    Arrived automatically — you reached the store.
                  </Text>
                </View>
              )}

              {mission.storeArrival.arrivingAt && currentStatus === "Traveling" && (
                <View style={styles.arrivalPending}>
                  <MapPin size={14} color={Colors.amberDark} />
                  <Text style={styles.arrivalPendingText}>
                    You're at {mission.storeArrival.arrivingAt.storeName}. Stay put a moment and
                    this will move on its own — or tap below.
                  </Text>
                </View>
              )}

              {currentStatus === "Delivering" && paymentMode === "Cash on Delivery" && (
                <CashCollectionInput
                  errand={displayErrand}
                  collectedInFull={Boolean(collectedAmount)}
                  // Records the intent only. The amount itself is filled in by
                  // the server from the errand's own total, so nothing the
                  // device sends can shrink it.
                  onCollectedInFull={() => mission.setCollectedAmount("FULL")}
                  onReportShort={mission.reportShortPayment}
                  shortPayment={mission.shortPayment}
                  shortAmount={mission.shortPayment ? collectedAmount : ''}
                  onShortAmountChange={mission.setCollectedAmount}
                />
              )}

              {/* The handover photo, taken at the door. The only evidence that
                  exists if a customer later says nothing arrived. */}
              {currentStatus === "Delivering" && (
                <TouchableOpacity
                  style={[styles.handoverBtn, mission.handoverCaptured && styles.handoverBtnDone]}
                  onPress={mission.openHandoverCapture}
                  disabled={mission.handoverCaptured}
                  testID="handover-photo"
                >
                  <Text style={styles.handoverText}>
                    {mission.handoverCaptured ? "Handover photo taken ✓" : "Take handover photo"}
                  </Text>
                </TouchableOpacity>
              )}

              {!isDelivered && selectedMissionIndex === 0 && (
                <TouchableOpacity
                  style={[styles.actionBtn, !isActionable && styles.actionBtnDisabled]}
                  disabled={!isActionable}
                  onPress={advanceStatus}
                >
                  <Text style={styles.actionBtnText}>{STEP_META[currentStatus].action}</Text>
                  <ChevronRight size={18} color={Colors.textWhite} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {isMissionAccepted && !!errand && !isOffline && (
        <FloatingChatButton onPress={() => mission.setShowDRChat(true)} unread={mission.unreadDR} />
      )}
      {/* Takes over the screen while a receipt is being photographed. Full-screen
          rather than a sheet: the rider is aiming a camera at a piece of paper
          and needs the whole viewfinder. */}
      {mission.receiptTarget && captureErrandId && (
        <View style={StyleSheet.absoluteFill}>
          <ReceiptCaptureScreen
            errandId={captureErrandId}
            kind={mission.receiptTarget.kind}
            pinpointId={mission.receiptTarget.pinpointId}
            onDone={mission.completeReceiptCapture}
            onCancel={mission.cancelReceiptCapture}
          />
        </View>
      )}

      <DispatcherChatModal
        visible={mission.showDRChat}
        onClose={() => mission.setShowDRChat(false)}
        messages={mission.drMessages}
        onSend={mission.sendDispatcherMessage}
        errandId={errand?.id ?? ''}
        errandType={errand?.type ?? ''}
      />
      <DeclineModal
        visible={mission.showDeclineModal}
        reason={mission.declineReason}
        setReason={mission.setDeclineReason}
        onClose={() => mission.setShowDeclineModal(false)}
        onSubmit={mission.declineMission}
      />
      <UploadModal
        visible={mission.showUploadModal}
        onClose={() => mission.setShowUploadModal(false)}
        progress={mission.uploadProgress}
      />
      {errand && (
        <WaybillModal
          visible={mission.showWaybill}
          onClose={() => mission.setShowWaybill(false)}
          errand={errand}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  handoverBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgWhite,
  },
  handoverBtnDone: {
    borderColor: Colors.greenDark,
    backgroundColor: Colors.greenBg,
  },
  handoverText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold as any,
    color: Colors.textDark,
  },

  arrivalNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.greenBg,
    borderColor: Colors.greenDark,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  arrivalNoteText: {
    flex: 1,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold as any,
    color: Colors.greenDark,
  },
  arrivalPending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.amberBg,
    borderColor: Colors.borderYellow,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  arrivalPendingText: {
    flex: 1,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold as any,
    color: Colors.amberDark,
  },

  container: {
    flex: 1,
    backgroundColor: Colors.bgGray,
  },
  scrollContent: {
    padding: Spacing.xl,
    gap: Spacing.xl,
    paddingBottom: Spacing.huge * 2,
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.huge * 2,
    gap: Spacing.lg,
  },
  errorText: {
    color: Colors.textGray,
    fontSize: FontSizes.base,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  retryBtnText: {
    color: Colors.textWhite,
    fontWeight: FontWeights.bold,
  },
  multiErrandTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    padding: Spacing.sm,
    gap: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexWrap: 'wrap',
  },
  multiErrandLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
  multiErrandLabelText: {
    fontSize: 10,
    fontWeight: FontWeights.bold as any,
    color: '#1E3A5F',
  },
  multiErrandTab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  multiErrandTabActive: {
    backgroundColor: '#1E3A5F',
  },
  multiErrandTabInactive: {
    backgroundColor: '#E2E8F0',
  },
  multiErrandTabText: {
    fontSize: 11,
    fontWeight: FontWeights.bold as any,
  },
  multiErrandTabTextActive: {
    color: '#FFFFFF',
  },
  multiErrandTabTextInactive: {
    color: '#64748B',
  },
  trackerCard: {
    backgroundColor: Colors.bgWhite,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  trackerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerTitle: {
    color: Colors.textWhite,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  detailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.whiteOverlayLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.whiteOverlay,
  },
  detailsBtnText: {
    color: Colors.textWhite,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  idBadge: {
    backgroundColor: Colors.bgWhite,
    paddingHorizontal: Spacing.md,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  idBadgeText: {
    color: Colors.primary,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  trackerBody: {
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  typeBadge: {
    backgroundColor: Colors.blueLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  typeBadgeText: {
    color: Colors.blue,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  paymentBadge: {
    backgroundColor: Colors.amberLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  paymentBadgeText: {
    color: Colors.amberDark,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  actionBtnDisabled: {
    backgroundColor: Colors.textLight,
  },
  actionBtnText: {
    color: Colors.textWhite,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
  },
});
