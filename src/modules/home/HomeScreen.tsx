import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useRiderMission } from '../../hooks/useRiderMission';
import RiderHeader from '../../components/RiderHeader';
import {
  StatsGrid,
  OfflineCard,
  WaitingCard,
  NewTaskCard,
  MerchantDetailsPanel,
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
import { Package, ChevronRight } from 'lucide-react-native';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../config/theme';
import { STEP_META } from '../../types/rider';

export default function HomeScreen() {
  const mission = useRiderMission();
  
  const {
    isOffline,
    activeMissions,
    isMissionAccepted,
    showComplete,
    currentStatus,
    errand,
    completedSubtasks,
    stepIndex,
    paymentMode,
    collectedAmount,
    advanceStatus,
    setShowWaybill,
    isDelivered,
  } = mission;

  // action button disable logic
  const sectionsCount = errand.details ? errand.details.split(" | ").length : 1;
  const completedCount = Object.keys(completedSubtasks).length;
  const isActionable = currentStatus === "At Store" ? completedCount === sectionsCount : true;

  return (
    <SafeAreaView style={styles.container}>
      <RiderHeader mission={mission} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {isOffline ? (
          <OfflineCard setShowWaybill={setShowWaybill} />
        ) : (
          <>
            {!activeMissions ? (
              <>
                <StatsGrid earnings={mission.riderEarnings.today} />
                <WaitingCard />
              </>
            ) : !isMissionAccepted ? (
              <>
                <StatsGrid earnings={mission.riderEarnings.today} />
                <NewTaskCard errand={errand} onAccept={mission.acceptMission} onDecline={() => mission.setShowDeclineModal(true)} />
              </>
            ) : !showComplete ? (
              <>
                <StatsGrid earnings={mission.riderEarnings.today} />
                <View style={styles.trackerCard}>
                  <View style={styles.trackerHeader}>
                    <View style={styles.headerLeft}>
                      <Package size={16} color={Colors.textWhite} />
                      <Text style={styles.headerTitle}>Current Assignment</Text>
                    </View>
                    <View style={styles.headerRight}>
                      <TouchableOpacity style={styles.detailsBtn} onPress={() => setShowWaybill(true)}>
                        <Text style={styles.detailsBtnText}>📄 Customer Details</Text>
                      </TouchableOpacity>
                      <View style={styles.idBadge}>
                        <Text style={styles.idBadgeText}>{errand.id}</Text>
                      </View>
                    </View>
                  </View>
                  
                  <View style={styles.trackerBody}>
                    <View style={styles.badgesRow}>
                      <View style={styles.typeBadge}>
                        <Text style={styles.typeBadgeText}>{errand.type}</Text>
                      </View>
                      <View style={styles.paymentBadge}>
                        <Text style={styles.paymentBadgeText}>{errand.paymentMode}</Text>
                      </View>
                    </View>

                    {(errand.type === "Pabili" || errand.type === "Bills Payment") && errand.merchantId && (
                      <MerchantDetailsPanel merchantId={errand.merchantId} merchants={mission.merchants} />
                    )}

                    <CustomerDetailsPanel errand={errand} />
                    
                    {(errand.payload || errand.details) && (
                      <RequestItemsPanel 
                        errand={errand} 
                        currentStatus={currentStatus} 
                        completedSubtasks={completedSubtasks} 
                        uploadingSubtask={mission.uploadingSubtask}
                        onUpload={mission.startSubtaskUpload}
                      />
                    )}

                    <FeeBreakdownPanel errand={errand} />
                    
                    <ProgressSteps currentStatus={currentStatus} stepIndex={stepIndex} />

                    {currentStatus === "En Route" && paymentMode === "Cash on Delivery" && (
                      <CashCollectionInput amount={collectedAmount} onChange={mission.setCollectedAmount} />
                    )}

                    {!isDelivered && (
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
              </>
            ) : (
              <>
                <StatsGrid earnings={mission.riderEarnings.today} />
                <CompletedCard errand={errand} onAcceptNext={mission.resetForNextErrand} />
              </>
            )}
          </>
        )}
      </ScrollView>

      <FloatingChatButton onPress={() => mission.setShowDRChat(true)} unread={mission.unreadDR} />
      <DispatcherChatModal 
        visible={mission.showDRChat} 
        onClose={() => mission.setShowDRChat(false)} 
        messages={mission.drMessages} 
        onSend={mission.sendDispatcherMessage} 
        errandId={errand.id}
        errandType={errand.type}
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
      <WaybillModal 
        visible={mission.showWaybill} 
        onClose={() => mission.setShowWaybill(false)} 
        errand={errand} 
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgGray,
  },
  scrollContent: {
    padding: Spacing.xl,
    gap: Spacing.xl,
    paddingBottom: Spacing.huge * 2,
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
