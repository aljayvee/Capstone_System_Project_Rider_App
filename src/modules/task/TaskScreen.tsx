import React from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, FileText, Info, Camera, MapPin, Package } from 'lucide-react-native';
import { useRiderMissionContext } from '../../context/RiderMissionContext';
import { LiveErrandMap } from '../../components/LiveErrandMap';
import { BottomSheet } from '../../components/BottomSheet';
import { EmptyState } from '../../components/EmptyState';
import { Badge } from '../../components/Badge';
import { StatusBanner } from '../../components/StatusBanner';
import { FeeBreakdownPanel } from '../../components/FeeBreakdownPanel';
import { WaybillModal } from '../../components/WaybillModal';
import {
  CustomerDetailsPanel,
  RequestItemsPanel,
  ProgressSteps,
  CashCollectionInput,
  UploadModal,
  FeeCapsuleBar,
} from './components';
import FloatingChatButton from '../chat/FloatingChatButton';
import DispatcherChatModal from '../chat/DispatcherChatModal';
import ReceiptCaptureScreen from '../../screens/ReceiptCaptureScreen';
import { useLiveRoute } from '../../hooks/useLiveRoute';
import { toCoordinate } from '../../utils/coords';
import { routePhaseFor, type RoutePhase } from '../../services/routePhase';
import { errandGate, nextAction } from '../../services/errandGate';
import { STEP_META } from '../../types/rider';
import { formatErrandId } from '../../utils/formatErrandId';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, scaledFontSize, moderateScale } from '../../config/theme';

/** How much of the sheet peeks above the tab bar when it is closed. */
const COLLAPSED_SHEET_HEIGHT = moderateScale(148, 0.20);

/**
 * The errand in hand, on the map the rider is following.
 *
 * The map used to be a modal reached from a button two-thirds of the way down
 * Home, underneath an accept/decline card for a different errand. It was a modal
 * because a MapView cannot live inside a ScrollView — so here the map is a plain
 * sibling of the sheet, and only the sheet's contents scroll.
 *
 * Three layers, bottom to top: the map, the fee capsules pinned over it, and the
 * draggable sheet holding the errand itself.
 */
export default function TaskScreen() {
  const mission = useRiderMissionContext();
  const insets = useSafeAreaInsets();
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [sheetExpanded, setSheetExpanded] = React.useState(false);

  const {
    phase,
    isOffline,
    currentStatus,
    errand,
    activeErrands,
    completedSubtasks,
    stepIndex,
    paymentMode,
    collectedAmount,
    advanceStatus,
    riderLocation,
    isDelivered,
    setShowWaybill,
  } = mission;

  // Clamp rather than let a stale index outlive the errand it pointed at — an
  // errand finishing shortens this list underneath the selection.
  const safeIndex = Math.min(selectedIndex, Math.max(activeErrands.length - 1, 0));
  const displayErrand = activeErrands[safeIndex] ?? errand;

  // A receipt is filed against a real errand id. `errand` can be the merged card,
  // whose id is every underlying id joined with " + " — a string no endpoint
  // can resolve.
  const captureErrandId = activeErrands[safeIndex]?.id ?? null;

  // The map follows the whole run, not the selected card: a rider carrying three
  // errands is driving one route through all of them.
  const destination = errand ? toCoordinate(errand.deliveryLatitude, errand.deliveryLongitude) : null;
  const pinpoints = errand?.pinpoints ?? [];

  // Progressive Single Active Leg Engine:
  // Identify outstanding uncompleted store pinpoints in optimal sequence.
  const outstandingPinpoints = pinpoints.filter(
    (p) => !p.departedAt && !p.arrivedAt && !completedSubtasks[p.id]
  );
  const isShopping = outstandingPinpoints.length > 0;
  const activePhase: RoutePhase = isShopping ? 'shopping' : 'delivering';
  const activeStoreTarget = outstandingPinpoints[0];

  // The single active destination to navigate and draw:
  // Store coordinate during shopping phase; Customer destination during delivery phase.
  const activeTargetCoord = isShopping && activeStoreTarget
    ? toCoordinate(activeStoreTarget.latitude, activeStoreTarget.longitude)
    : destination;

  const activeTargetName = isShopping && activeStoreTarget
    ? activeStoreTarget.storeName
    : displayErrand?.customer;

  const {
    coordinates: routeCoordinates,
    steps,
    distanceMeters,
    durationSeconds,
    isFallback,
  } = useLiveRoute(riderLocation, activeTargetCoord, []);

  // One rule, shared with the advance button and the blocked note beside it.
  const gate = errandGate(displayErrand, currentStatus, completedSubtasks, {
    handoverCaptured: mission.handoverCaptured,
    paymentMode,
    collectedAmount,
  });
  const whatIsNext = nextAction(currentStatus, { handoverCaptured: mission.handoverCaptured });

  if (phase === 'loading') {
    return (
      <View style={[styles.container, styles.centerState]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!displayErrand) {
    return (
      <View style={[styles.container, styles.centerState]}>
        <EmptyState
          Icon={Package}
          title="No errand in hand"
          hint="Accept an errand on Home and it will appear here, on the map."
        />
      </View>
    );
  }

  const hasMapData = Boolean(destination) || pinpoints.length > 0;

  return (
    <View style={styles.container}>
      {/* Layer 1 — the map. A direct child of this View, never inside a scroller. */}
      {hasMapData ? (
        <LiveErrandMap
          riderLocation={riderLocation}
          destination={destination}
          pinpoints={pinpoints}
          routeCoordinates={routeCoordinates}
          pickupLegCoordinates={isShopping ? routeCoordinates : null}
          deliveryLegCoordinates={!isShopping ? routeCoordinates : null}
          steps={steps}
          distanceMeters={distanceMeters}
          durationSeconds={durationSeconds}
          targetStoreName={activeTargetName}
          phase={activePhase}
          isFallback={isFallback}
        />
      ) : (
        <View style={[styles.container, styles.centerState]}>
          <EmptyState
            Icon={MapPin}
            title="No stores pinned yet"
            hint="The dispatcher has not pinned the stores or the customer for this errand."
          />
        </View>
      )}

      {/* Layer 2 — what each errand pays, positioned cleanly below TurnByTurnHUD if active */}
      <View
        style={[styles.capsuleLayer, { top: insets.top + (steps.length > 0 ? 82 : Spacing.xs) }]}
        pointerEvents="box-none"
      >
        <FeeCapsuleBar
          errands={activeErrands}
          selectedIndex={safeIndex}
          onSelect={(i) => {
            setSelectedIndex(i);
            setSheetExpanded(true);
          }}
        />
      </View>

      <View
        style={[styles.bannerLayer, { top: insets.top + (steps.length > 0 ? 138 : 76) }]}
        pointerEvents="box-none"
      >
        <StatusBanner banner={mission.banner} onDismiss={mission.dismissBanner} />
      </View>

      {/* Layer 3 — the errand itself. */}
      <BottomSheet
        collapsedHeight={COLLAPSED_SHEET_HEIGHT}
        expanded={sheetExpanded}
        onExpandedChange={setSheetExpanded}
      >
        <View style={styles.sheetHeader}>
          <View style={styles.sheetHeaderLeft}>
            <Text style={styles.sheetTitle} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {displayErrand.customer}
            </Text>
            <Text style={styles.sheetSubtitle} numberOfLines={1} maxFontSizeMultiplier={1.15}>
              {formatErrandId(displayErrand.id)} · {STEP_META[currentStatus].label}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.customerBtn}
            onPress={() => setShowWaybill(true)}
            accessibilityRole="button"
            accessibilityLabel="Show customer details"
          >
            <FileText size={14} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.sheetBody} showsVerticalScrollIndicator={false}>
          <View style={styles.badgesRow}>
            <Badge tone="info">{displayErrand.type}</Badge>
            <Badge tone="warning">{displayErrand.paymentMode}</Badge>
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

          <ProgressSteps currentStatus={currentStatus} stepIndex={stepIndex} />

          <FeeBreakdownPanel errand={displayErrand} />

          {/* Why the step moved, or is about to. A status that advances with no
              visible cause reads as a glitch, and a rider who does not trust the
              screen goes back to tapping buttons at random. */}
          {mission.storeArrival.advancedAutomatically && currentStatus === 'At Store' && (
            <View style={styles.arrivalNote}>
              <MapPin size={14} color={Colors.success} />
              <Text style={styles.arrivalNoteText} maxFontSizeMultiplier={1.15}>
                Arrived automatically — you reached the store.
              </Text>
            </View>
          )}

          {mission.storeArrival.arrivingAt && currentStatus === 'Traveling' && (
            <View style={styles.arrivalPending}>
              <MapPin size={14} color={Colors.warning} />
              <Text style={styles.arrivalPendingText} maxFontSizeMultiplier={1.15}>
                You are at {mission.storeArrival.arrivingAt.storeName}. Stay put a moment and this
                will move on its own — or tap below.
              </Text>
            </View>
          )}

          {currentStatus === 'Delivering' && paymentMode === 'Cash on Delivery' && (
            <CashCollectionInput
              errand={displayErrand}
              collectedInFull={Boolean(collectedAmount)}
              onCollectedInFull={() => mission.setCollectedAmount('FULL')}
              onReportShort={mission.reportShortPayment}
              shortPayment={mission.shortPayment}
              shortAmount={mission.shortPayment ? collectedAmount : ''}
              onShortAmountChange={mission.setCollectedAmount}
            />
          )}

          {/* The handover photo, taken at the door. The only evidence that exists
              if a customer later says nothing arrived. */}
          {currentStatus === 'Delivering' && (
            <TouchableOpacity
              style={[styles.handoverBtn, mission.handoverCaptured && styles.handoverBtnDone]}
              onPress={mission.openHandoverCapture}
              disabled={mission.handoverCaptured}
              testID="handover-photo"
              accessibilityRole="button"
              accessibilityState={{ disabled: mission.handoverCaptured }}
              accessibilityLabel={
                mission.handoverCaptured
                  ? 'Handover photo already taken'
                  : 'Take the handover photo'
              }
            >
              <Text style={styles.handoverText} maxFontSizeMultiplier={1.15}>
                {mission.handoverCaptured ? 'Handover photo taken' : 'Take handover photo'}
              </Text>
            </TouchableOpacity>
          )}

          {!isDelivered && safeIndex === 0 && (
            <View style={styles.actionBlock}>
              {/* Says what is missing NEXT TO the button rather than leaving a
                  greyed rectangle to explain itself. A disabled control gives no
                  feedback on tap and cannot show a tooltip on a touch screen. */}
              {!gate.canAdvance && gate.blockedReason && (
                <View style={styles.blockedNote} testID="blocked-reason">
                  <Info size={14} color={Colors.warning} />
                  <Text style={styles.blockedText} maxFontSizeMultiplier={1.15}>{gate.blockedReason}</Text>
                </View>
              )}
              {gate.canAdvance && whatIsNext && (
                <View style={styles.nextNote} testID="next-action">
                  <Camera size={14} color={Colors.info} />
                  <Text style={styles.nextText} maxFontSizeMultiplier={1.15}>{whatIsNext}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.actionBtn, !gate.canAdvance && styles.actionBtnDisabled]}
                disabled={!gate.canAdvance}
                onPress={advanceStatus}
                accessibilityRole="button"
                accessibilityState={{ disabled: !gate.canAdvance }}
                accessibilityLabel={STEP_META[currentStatus].action}
                accessibilityHint={gate.blockedReason ?? undefined}
              >
                <Text style={styles.actionBtnText} maxFontSizeMultiplier={1.15}>{STEP_META[currentStatus].action}</Text>
                <ChevronRight size={18} color={Colors.onPrimary} />
              </TouchableOpacity>
            </View>
          )}

          {safeIndex !== 0 && (
            <Text style={styles.queuedNote} maxFontSizeMultiplier={1.15}>
              This one is queued. Finish the errand at the front of your list first.
            </Text>
          )}
        </ScrollView>
      </BottomSheet>

      {mission.isMissionAccepted && !!errand && !isOffline && (
        <FloatingChatButton
          onPress={() => mission.setShowDRChat(true)}
          unread={mission.unreadDR}
          bottomOffset={COLLAPSED_SHEET_HEIGHT + Spacing.lg}
        />
      )}

      {/* Takes over the screen while a receipt is photographed — the rider is
          aiming a camera at a piece of paper and needs the whole viewfinder.

          A Modal, not an absolutely-positioned View. Two things beat plain tree
          order here: on Android `elevation` decides what paints on top, so the
          sheet below (elevation 12) covered the camera even though the camera
          came later in the tree; and the tab bar is rendered by the navigator
          OUTSIDE this screen, so nothing inside it can cover the tab bar. A
          Modal gets its own native window and clears both. */}
      <Modal
        visible={Boolean(mission.receiptTarget && captureErrandId)}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent
        // The Android hardware back button. Without this the rider is shut in
        // the viewfinder with only the on-screen cancel to find.
        onRequestClose={mission.cancelReceiptCapture}
      >
        {mission.receiptTarget && captureErrandId && (
          <ReceiptCaptureScreen
            errandId={captureErrandId}
            kind={mission.receiptTarget.kind}
            pinpointId={mission.receiptTarget.pinpointId}
            onDone={mission.completeReceiptCapture}
            onCancel={mission.cancelReceiptCapture}
          />
        )}
      </Modal>

      <DispatcherChatModal
        visible={mission.showDRChat}
        onClose={() => mission.setShowDRChat(false)}
        messages={mission.drMessages}
        onSend={mission.sendDispatcherMessage}
        errandId={errand?.id ?? ''}
        errandType={errand?.type ?? ''}
      />
      <UploadModal
        visible={mission.showUploadModal}
        onClose={() => mission.setShowUploadModal(false)}
        progress={mission.uploadProgress}
      />
      {errand && (
        <WaybillModal
          visible={mission.showWaybill}
          onClose={() => setShowWaybill(false)}
          errand={errand}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgGray,
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  capsuleLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  bannerLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  sheetHeaderLeft: {
    flex: 1,
  },
  sheetTitle: {
    fontSize: scaledFontSize(FontSizes.md, 0.20),
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
  },
  sheetSubtitle: {
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    color: Colors.textGray,
    marginTop: 2,
  },
  customerBtn: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primarySurface,
  },
  sheetBody: {
    padding: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: moderateScale(110, 0.20),
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  actionBlock: {
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  blockedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.warningSubtle,
    borderColor: Colors.warningBorder,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: moderateScale(10, 0.20),
  },
  blockedText: {
    flex: 1,
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    fontWeight: FontWeights.semibold as any,
    color: Colors.warning,
  },
  nextNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.infoSubtle,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: moderateScale(10, 0.20),
  },
  nextText: {
    flex: 1,
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    fontWeight: FontWeights.semibold as any,
    color: Colors.info,
  },
  handoverBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: moderateScale(12, 0.20),
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgWhite,
    minHeight: 48,
  },
  handoverBtnDone: {
    borderColor: Colors.success,
    backgroundColor: Colors.successSubtle,
  },
  handoverText: {
    fontSize: scaledFontSize(FontSizes.base, 0.20),
    fontWeight: FontWeights.semibold as any,
    color: Colors.textDark,
  },
  arrivalNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.successSubtle,
    borderColor: Colors.success,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
  },
  arrivalNoteText: {
    flex: 1,
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    fontWeight: FontWeights.semibold as any,
    color: Colors.success,
  },
  arrivalPending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.warningSubtle,
    borderColor: Colors.warningBorder,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
  },
  arrivalPendingText: {
    flex: 1,
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    fontWeight: FontWeights.semibold as any,
    color: Colors.warning,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: moderateScale(12, 0.20),
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
    minHeight: 48,
  },
  actionBtnDisabled: {
    backgroundColor: Colors.textLight,
  },
  actionBtnText: {
    color: Colors.onPrimary,
    fontSize: scaledFontSize(FontSizes.md, 0.20),
    fontWeight: FontWeights.bold as any,
  },
  queuedNote: {
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    color: Colors.textGray,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
});
