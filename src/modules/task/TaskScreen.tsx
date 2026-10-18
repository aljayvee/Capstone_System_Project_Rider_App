import React from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LayoutChangeEvent } from 'react-native';
import {
  ChevronRight,
  Info,
  Camera,
  MapPin,
  Package,
  Phone,
  MessageCircle,
  Navigation,
  AlertCircle,
  ArrowLeft,
  ArrowRightLeft,
} from 'lucide-react-native';
import { useRiderMissionContext } from '../../context/RiderMissionContext';
import { LiveErrandMap } from '../../components/LiveErrandMap';
import { BottomSheet, SHEET_HANDLE_HEIGHT } from '../../components/BottomSheet';
import { EmptyState } from '../../components/EmptyState';
import { Badge } from '../../components/Badge';
import { StatusBanner } from '../../components/StatusBanner';
import { RouteQualityBanner } from '../../components/RouteQualityBanner';
import { FeeBreakdownPanel } from '../../components/FeeBreakdownPanel';
import { WaybillModal } from '../../components/WaybillModal';
import {
  CustomerDetailsPanel,
  RequestItemsPanel,
  ProgressSteps,
  CashCollectionInput,
  PaymentProofViewer,
  UploadModal,
  FeeCapsuleBar,
  ErrandQueueList,
} from './components';
import { canSwitchWorkingErrand, queuePositionLabel } from '../../services/errandQueue';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { AuthedStackParamList } from '../../navigation/AuthedNavigator';
import ReceiptCaptureScreen from '../../screens/ReceiptCaptureScreen';
import { useLiveRoute } from '../../hooks/useLiveRoute';
import { useOsmTilesAvailable } from '../../config/mapTiles';
import { lineFitsMap, useMapChoice, type MapStyle } from '../../config/mapChoice';
import { toCoordinate } from '../../utils/coords';
import { routePhaseFor, type RoutePhase } from '../../services/routePhase';
import type { RouteStep } from '../../services/directionsService';
import { errandGate, nextAction, isCashCollected } from '../../services/errandGate';
import { merchantCategoryLabel } from '../../services/merchantCategory';
import {
  nearestOutstandingStop,
  isStoreEligibleForDelay,
  STORE_DELAY_THRESHOLD_MS,
} from '../../services/storeArrival';
import { STEP_META, STATUS_STEPS } from '../../types/rider';
import { formatErrandId } from '../../utils/formatErrandId';
import { formatPeso } from '../../utils/format';
import {
  Colors,
  Spacing,
  BorderRadius,
  FontSizes,
  FontWeights,
  FontFamily,
  scaledFontSize,
  moderateScale,
} from '../../config/theme';

/**
 * How much of the sheet peeks above its pinned action dock when closed, until
 * the header has been measured; after that the peek is exactly the handle and
 * the header, so a large system font can never clip the header.
 */
const COLLAPSED_SHEET_HEIGHT = moderateScale(148, 0.20);

// The floating layers keep at least these offsets below the top inset (the
// zero-overlap stacking in CLAUDE.md), and move further down whenever the
// turn-by-turn panel is taller than they allow: it grows a line when the next
// turn is close ("Then: turn right"), and with the system font size.
const CAPSULE_MIN_TOP_WITH_HUD = 82;
const BANNER_MIN_TOP_WITH_HUD = 138;
const BANNER_MIN_TOP = 76;

/**
 * The most of the screen the open sheet and its action dock may cover. It used
 * to rise to 72% of the screen plus the dock, up to the fee capsules, so opening
 * it to check an item hid the rider and the road ahead entirely. What it leaves
 * is where the navigation camera keeps the rider (see LiveErrandMap bottomInset).
 */
const SHEET_MAX_COVER_RATIO = 0.58;

/** No turn-by-turn while the line on screen is waiting for its own map's engine. */
const NO_STEPS: RouteStep[] = [];

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
  const navigation = useNavigation<StackNavigationProp<AuthedStackParamList>>();
  const mission = useRiderMissionContext();
  const insets = useSafeAreaInsets();
  // Whether our OpenStreetMap tile server answers (probed, cached five minutes).
  const osmTilesUp = useOsmTilesAvailable(true);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [sheetExpanded, setSheetExpanded] = React.useState(false);
  // The Task tab stays mounted behind the others; the compass runs only here.
  const isFocused = useIsFocused();

  // Measured layout: what the collapsed sheet and its dock cover at the
  // bottom, where the navigation panel and the fee capsules end at the top,
  // and the screen itself. Every floating layer is placed from these rather
  // than from fixed numbers that the content outgrew.
  const [sheetPeek, setSheetPeek] = React.useState(COLLAPSED_SHEET_HEIGHT);
  // What the sheet covers now, open or closed. The camera keeps the rider in
  // whatever is left above it.
  const [sheetCover, setSheetCover] = React.useState(COLLAPSED_SHEET_HEIGHT);
  const [headerHeight, setHeaderHeight] = React.useState(0);
  const [hudBottom, setHudBottom] = React.useState(0);
  const [capsuleHeight, setCapsuleHeight] = React.useState(0);
  const [screenHeight, setScreenHeight] = React.useState(0);
  const measure = (set: (n: number) => void) => (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.height);
    set(next);
  };
  // The navigation panel's bottom edge only ever moves the layers below it
  // down while it is showing, never back up: one step's instruction fits a
  // line and the next needs two, and following each change made the fee
  // capsules hop up and down at every turn. 0 (no panel) resets it.
  const noteHudBottom = React.useCallback((bottom: number) => {
    setHudBottom((prev) => (bottom <= 0 ? 0 : Math.max(prev, bottom)));
  }, []);

  const handleOpenDispatcherChat = React.useCallback(() => {
    mission.setUnreadDR(false);
    navigation.navigate('DispatcherChat');
  }, [navigation, mission]);

  const {
    phase,
    isOffline,
    currentStatus,
    errand,
    activeErrands,
    workingErrand,
    progressFor,
    startErrandFirst,
    completedSubtasks,
    paymentMode,
    collectedAmount,
    advanceStatus,
    riderLocation,
    isDelivered,
    setShowWaybill,
    deferredStoreIds,
    departedStoreIds,
    deferStore,
    finishStoreShopping,
    storeArrivalTimestamp,
    dueAtDoor,
    substituteNotice,
    dismissSubstituteNotice,
  } = mission;

  // Clamp rather than let a stale index outlive the errand it pointed at — an
  // errand finishing shortens this list underneath the selection.
  const safeIndex = Math.min(selectedIndex, Math.max(activeErrands.length - 1, 0));
  // Only accepted errands. An unanswered offer belongs on Home, and falling
  // back to the merged card here showed one as if it were being run.
  const displayErrand = activeErrands[safeIndex] ?? null;
  // A queued errand is shown for reference, with its OWN progress. The sheet
  // used to give every card the front errand's step and ticked sections, which
  // are keyed by section index: section 0 of a queued errand read "Receipt
  // saved" because section 0 of the errand in hand had one.
  const isQueuedView = safeIndex !== 0;
  const displayProgress = progressFor(displayErrand?.id);
  const displayStatus = isQueuedView ? displayProgress.currentStatus : currentStatus;
  const displayCompleted = isQueuedView ? displayProgress.completedSubtasks : completedSubtasks;
  const displayDeparted = isQueuedView ? displayProgress.departedStoreIds ?? [] : departedStoreIds;

  // What kind of shop, not what kind of service. Null when no stop carries a
  // category, in which case the badge is omitted rather than guessed at.
  const storeKind = merchantCategoryLabel(displayErrand?.merchantCategories);

  // A receipt is filed against a real errand id, and only ever the one in hand:
  // the step it advances is that errand's. `errand` can be the merged card,
  // whose id is every underlying id joined with " + ", which no endpoint can
  // resolve.
  const captureErrandId = workingErrand?.id ?? null;

  // The map routes the errand in hand, not the merged card. Merged, its stops
  // were every errand's at once: finishing the only store of the first errand
  // "went to the next store", which was the second errand's, while the step and
  // the receipts still belonged to the first.
  const destination = workingErrand
    ? toCoordinate(workingErrand.deliveryLatitude, workingErrand.deliveryLongitude)
    : null;
  const pinpoints = React.useMemo(() => workingErrand?.pinpoints ?? [], [workingErrand?.pinpoints]);
  // The errands waiting behind the one in hand, in the order they come next.
  const queuedErrands = activeErrands.slice(1);

  const [now, setNow] = React.useState<number>(Date.now());
  const [lockedStoreId, setLockedStoreId] = React.useState<number | null>(null);

  // Progressive Single Active Leg Engine:
  // Route phase: 'shopping' while Traveling or At Store; 'delivering' while Delivering or Delivered.
  const isShopping = routePhaseFor(currentStatus) === 'shopping';
  const activePhase: RoutePhase = isShopping ? 'shopping' : 'delivering';

  // Map mode: while the rider is riding a leg, the sheet and its action dock
  // are off the screen and the whole map is the directions. The capsule at the
  // top brings them back; tapping it again, or swiping the sheet down, puts
  // them away. They come back on their own when there is something to do
  // there: reaching a store (the checklist, the receipt) or the customer's
  // door (the handover), or being inside a stop's circle before auto-arrival
  // fires (the manual "Confirm arrival").
  const riding = currentStatus === 'Traveling' || currentStatus === 'Delivering';
  const [sheetHidden, setSheetHidden] = React.useState(riding);
  React.useEffect(() => {
    setSheetHidden(riding);
    if (riding) setSheetExpanded(false);
    // A new step decides afresh; a toggle in between is the rider's own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStatus]);
  const nearStop = Boolean(mission.storeArrival?.arrivingAt);
  React.useEffect(() => {
    if (nearStop) setSheetHidden(false);
  }, [nearStop]);

  // The full task view: one errand's task over the whole screen, opened from
  // its fee capsule under the directions panel (which replaced the "Show task
  // / Hide task" capsule) and left by the back button in its header or the
  // phone's back key. The map stays mounted underneath, so going back is the
  // same map, never a new one.
  const [fullTask, setFullTask] = React.useState(false);
  const hiddenBeforeFullRef = React.useRef(false);
  const openFullTask = React.useCallback(
    (index: number) => {
      hiddenBeforeFullRef.current = sheetHidden;
      setSelectedIndex(index);
      setSheetHidden(false);
      setSheetExpanded(true);
      setFullTask(true);
    },
    [sheetHidden]
  );
  const closeFullTask = React.useCallback(() => {
    setFullTask(false);
    setSheetExpanded(false);
    // Back to the map as it was: still riding, the sheet goes away again; at a
    // stop (arrived meanwhile, or inside its circle) it stays for the next step.
    setSheetHidden(hiddenBeforeFullRef.current && riding && !nearStop);
  }, [riding, nearStop]);
  // Dragged shut, swiped away, or put away by a new step: no longer full.
  React.useEffect(() => {
    if (fullTask && (!sheetExpanded || sheetHidden)) setFullTask(false);
  }, [fullTask, sheetExpanded, sheetHidden]);
  // Hardware back key safety hierarchy:
  // 1. If full task view is open -> close full task view back to the map.
  // 2. If bottom sheet is expanded -> collapse bottom sheet to peek height.
  // 3. If bottom sheet is shown while riding -> hide sheet to restore turn-by-turn map view.
  // 4. Otherwise -> navigate back safely to Tabs without crashing or dropping mission state.
  React.useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (fullTask) {
        closeFullTask();
        return true;
      }
      if (sheetExpanded) {
        setSheetExpanded(false);
        return true;
      }
      if (!sheetHidden && riding) {
        setSheetHidden(true);
        return true;
      }
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('Tabs');
      }
      return true;
    });
    return () => sub.remove();
  }, [fullTask, closeFullTask, sheetExpanded, sheetHidden, riding, navigation]);

  // Multi-Store Nearest Target Calculation:
  // Pick the store pin that is nearest to the rider's location,
  // excluding departed and deferred stores. If all remaining stores are deferred,
  // picks from the deferred pool so the rider routes back to them.
  const dynamicNearestTarget = React.useMemo(() => {
    if (!isShopping) return null;
    return nearestOutstandingStop(
      pinpoints,
      riderLocation,
      new Set(deferredStoreIds),
      new Set(departedStoreIds),
      { includeArrived: currentStatus === 'At Store' }
    );
  }, [isShopping, pinpoints, riderLocation, deferredStoreIds, departedStoreIds, currentStatus]);

  // Lock to the current store while shopping inside it to prevent GPS jitter from switching
  React.useEffect(() => {
    if (currentStatus === 'At Store') {
      if (!lockedStoreId && dynamicNearestTarget) {
        setLockedStoreId(dynamicNearestTarget.id);
      }
      const timer = setInterval(() => {
        setNow(Date.now());
      }, 10_000);
      return () => clearInterval(timer);
    } else {
      setLockedStoreId(null);
    }
  }, [currentStatus, dynamicNearestTarget, lockedStoreId]);

  const activeStoreTarget = React.useMemo(() => {
    if (!isShopping) return null;
    if (currentStatus === 'At Store' && lockedStoreId != null) {
      return pinpoints.find((p) => p.id === lockedStoreId) ?? dynamicNearestTarget;
    }
    return dynamicNearestTarget;
  }, [isShopping, currentStatus, lockedStoreId, pinpoints, dynamicNearestTarget]);

  // Store Delay Dwell Tracking (12m threshold for Cafe/Pharmacy, Grocery exempt)
  const dwellTimeMs = storeArrivalTimestamp ? now - storeArrivalTimestamp : 0;
  const isDelayedStore =
    currentStatus === 'At Store' &&
    activeStoreTarget != null &&
    isStoreEligibleForDelay(activeStoreTarget.storeCategory ?? storeKind) &&
    dwellTimeMs >= STORE_DELAY_THRESHOLD_MS;

  const otherCandidateStores = React.useMemo(() => {
    if (!activeStoreTarget) return [];
    return pinpoints.filter(
      (p) =>
        p.id !== activeStoreTarget.id &&
        !p.departedAt &&
        !departedStoreIds.includes(p.id)
    );
  }, [pinpoints, activeStoreTarget, departedStoreIds]);

  const nextSwitchStore = React.useMemo(() => {
    if (otherCandidateStores.length === 0) return null;
    return nearestOutstandingStop(otherCandidateStores, riderLocation);
  }, [otherCandidateStores, riderLocation]);

  // Either another stop of this errand, or another errand altogether, can fill
  // the wait while this shop prepares the order.
  const showDelayAlert = isDelayedStore && (otherCandidateStores.length > 0 || queuedErrands.length > 0);

  const handleDeferCurrentStore = React.useCallback(() => {
    if (!activeStoreTarget) return;
    setLockedStoreId(null);
    deferStore(activeStoreTarget.id);
  }, [activeStoreTarget, deferStore]);

  // Remaining uncompleted stores after the current one
  const remainingStoresAfterCurrent = React.useMemo(() => {
    if (!activeStoreTarget) return [];
    return pinpoints.filter(
      (p) =>
        p.id !== activeStoreTarget.id &&
        !p.departedAt &&
        !departedStoreIds.includes(p.id)
    );
  }, [pinpoints, activeStoreTarget, departedStoreIds]);

  const hasStoresRemaining = remainingStoresAfterCurrent.length > 0;

  const handleFinishStoreShopping = React.useCallback(() => {
    if (!activeStoreTarget) return;
    setLockedStoreId(null);
    finishStoreShopping(activeStoreTarget.id);
  }, [activeStoreTarget, finishStoreShopping]);

  // The single active destination to navigate and draw:
  // Store coordinate during shopping phase; Customer destination during delivery phase.
  const activeTargetCoord = isShopping && activeStoreTarget
    ? toCoordinate(activeStoreTarget.latitude, activeStoreTarget.longitude)
    : destination;

  const activeTargetName = isShopping
    ? (activeStoreTarget?.storeName ?? merchantCategoryLabel(workingErrand?.merchantCategories) ?? 'Store')
    : workingErrand?.customer;

  const canStartAnotherFirst = queuedErrands.length > 0 && canSwitchWorkingErrand(currentStatus);

  const confirmStartFirst = React.useCallback(
    (target: { id: string; customer?: string }) => {
      if (!workingErrand) return;
      Alert.alert(
        `Start ${formatErrandId(target.id)} first?`,
        `${formatErrandId(workingErrand.id)} for ${workingErrand.customer || 'the customer'} is set aside and ` +
          `becomes next in your queue. The dispatcher is told.`,
        [
          { text: 'Keep current', style: 'cancel' },
          {
            text: 'Start this first',
            onPress: () => {
              const leavingStoreId = currentStatus === 'At Store' ? activeStoreTarget?.id ?? null : null;
              if (startErrandFirst(target.id, { leavingStoreId })) {
                setLockedStoreId(null);
                setSelectedIndex(0);
              }
            },
          },
        ]
      );
    },
    [workingErrand, currentStatus, activeStoreTarget?.id, startErrandFirst]
  );

  // The map already chosen, as of the last render. Read before the route is
  // asked for, which comes first; the choice never changes once made, so a
  // render's lag is only ever the render that made it.
  const chosenMapRef = React.useRef<MapStyle | null>(null);
  const chosenMap = chosenMapRef.current;

  const {
    // The road exactly, not the corner-rounded display copy: at navigation
    // zoom the rounded one leaves the road at every junction.
    roadCoordinates: routeCoordinates,
    steps,
    distanceMeters,
    durationSeconds,
    isFallback,
    isRerouting,
    lastFailure,
    selection: routeSelection,
    provider: routeProvider,
    unroutable: routeUnroutable,
  } = useLiveRoute(riderLocation, activeTargetCoord, [], {
    // The server decides, not the rider: both engines are asked, the lower ETA
    // wins (the shorter road when the two are within a minute), and with no
    // map named the winner comes back drawn on its own roads
    // (server: lib/routing/bestRoute.ts). The map below then shows that
    // engine's map, so line and roads are always one dataset.
    //
    // Except while our OpenStreetMap tiles are not loading: then only Google
    // can be shown, so Google's roads are asked for, and the winning path is
    // redrawn on them where Google can follow it, else Google's own route is.
    //
    // Once a map is on screen it is kept (mapChoice), so every later route is
    // asked for on that map's roads, and the hook accepts no other engine's
    // line for it: Google's map gets Google Directions' line, OpenStreetMap
    // gets OSRM's.
    provider:
      chosenMap === 'osm' ? 'osrm' : chosenMap === 'google' || osmTilesUp === false ? 'google' : undefined,
    choose: 'fastest',
  });

  // The map to show: the engine whose roads the server drew the line on,
  // chosen once. Null until the server has said, and no map is drawn until
  // then (see config/mapChoice.ts for the Huawei Petal bug this prevents).
  const mapStyle = useMapChoice({
    wanted: Boolean(destination) || pinpoints.length > 0,
    drawnWith: routeSelection?.drawnWith ?? routeProvider ?? null,
    // A failed request, or a straight-line guess because no engine answered.
    routeFailed: lastFailure != null || (isFallback && !routeSelection),
    osmTilesUp,
    // This map's engine could not route at all: move to the other map, once.
    unroutable: routeUnroutable,
  });
  chosenMapRef.current = mapStyle;

  // A road line is drawn only on its own engine's map. They differ only
  // between a map being chosen or changed and that map's own line arriving,
  // already asked for (a route drawn on OpenStreetMap while our tiles do not
  // answer, so Google is shown): the line waits rather than lie beside the
  // roads under it. A dashed straight-line guess follows no roads and may
  // stand on either.
  const lineOffMap = !lineFitsMap(mapStyle, routeSelection?.drawnWith ?? routeProvider, isFallback);
  const mapRouteCoordinates = lineOffMap ? null : routeCoordinates;
  const mapSteps = lineOffMap ? NO_STEPS : steps;

  // One rule, shared with the advance button and the blocked note beside it.
  // Always the errand in hand: it is the only one the dock can advance.
  const gate = errandGate(workingErrand, currentStatus, completedSubtasks, {
    handoverCaptured: mission.handoverCaptured,
    paymentMode,
    collectedAmount,
    // Server-derived, attached to every errand response beside feeBreakdown.
    // Null on a COD errand, which leaves the gate exactly as it was.
    paymentPlan: workingErrand?.paymentPlan ?? null,
    activeStoreTargetId: activeStoreTarget?.id ?? null,
    hasStoresRemaining,
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

  // The sheet describes the errand selected in it, with that errand's own step.
  const isShoppingView = routePhaseFor(displayStatus) === 'shopping';
  const displayStepIndex = STATUS_STEPS.indexOf(displayStatus);
  const displayVisitedIds = (displayErrand.pinpoints ?? [])
    .filter((p) => p.arrivedAt || displayDeparted.includes(p.id))
    .map((p) => p.id);

  // The next step, pinned below the sheet so it is on screen whether the
  // sheet is open or not. It used to sit at the bottom of the sheet, which
  // closed shows only its top: the rider could not press "Arrived at
  // store" or "Delivered" without first dragging the sheet open.
  const actionDock =
    isQueuedView ? (
      <View style={styles.stickyActionDock} testID="queued-dock">
        <Text style={styles.queuedNote} maxFontSizeMultiplier={1.25}>
          {queuePositionLabel(safeIndex)} in your queue. Finish{' '}
          {workingErrand ? `${formatErrandId(workingErrand.id)} for ${workingErrand.customer || 'the customer'}` : 'your current errand'}{' '}
          first.
        </Text>
        {canStartAnotherFirst ? (
          <TouchableOpacity
            style={styles.switchErrandBtn}
            onPress={() => confirmStartFirst(displayErrand)}
            accessibilityRole="button"
            accessibilityLabel={`Do ${formatErrandId(displayErrand.id)} first`}
            accessibilityHint="Sets your current errand aside. The dispatcher is told."
            testID="start-errand-first-btn"
          >
            <ArrowRightLeft size={16} color={Colors.navy} />
            <Text style={styles.switchErrandText} maxFontSizeMultiplier={1.25}>
              Current errand taking too long? Do this one first
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.queuedHint} maxFontSizeMultiplier={1.25}>
            Your current errand's items are bought, so deliver it before starting this one.
          </Text>
        )}
      </View>
    ) : !isDelivered ? (
      <View style={styles.stickyActionDock}>
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

        {/* Half-payment note: rendered only at the final store stop on upfront payment plans */}
        {!hasStoresRemaining && gate.halfPayment === 'ask' && (
          <View style={styles.nextNote} testID="half-payment-note">
            <Info size={14} color={Colors.info} />
            <Text style={styles.nextText} maxFontSizeMultiplier={1.25}>
              Everything is bought. Ask for the customer's half-payment before heading out.
            </Text>
          </View>
        )}

        {currentStatus === 'Traveling' ? (
          /* Auto-Arrival Action Dock (Requirement 3) */
          <View style={styles.navigatingContainer} testID="navigating-container">
            <View style={styles.navigatingCapsule} testID="navigating-capsule">
              <Navigation size={14} color={Colors.primary} strokeWidth={2.2} />
              <Text style={styles.navigatingText} maxFontSizeMultiplier={1.25}>
                Navigating to {activeTargetName ?? 'Store'} • Auto-detecting arrival
              </Text>
            </View>
            <TouchableOpacity
              style={styles.emergencyArrivalBtn}
              onPress={advanceStatus}
              accessibilityRole="button"
              accessibilityLabel="Confirm arrival manually if GPS is not detecting"
              testID="emergency-arrival-btn"
            >
              <Text style={styles.emergencyArrivalText} maxFontSizeMultiplier={1.25}>
                GPS not detecting? Confirm Arrival
              </Text>
            </TouchableOpacity>
          </View>
        ) : currentStatus === 'At Store' ? (
          /* At Store Action Dock: Multi-Store Progression & Delay Alert (Requirements 5 & 6) */
          <View style={styles.atStoreActionsContainer}>
            {showDelayAlert && (
              <View style={styles.delayAlertCard} testID="delay-alert-card">
                <View style={styles.delayAlertHeader}>
                  <AlertCircle size={15} color={Colors.warning} />
                  <Text style={styles.delayAlertText} maxFontSizeMultiplier={1.25}>
                    Order taking too long at {activeTargetName}?
                  </Text>
                </View>
                {nextSwitchStore && (
                  <TouchableOpacity
                    onPress={handleDeferCurrentStore}
                    style={styles.switchStoreBtn}
                    accessibilityRole="button"
                    accessibilityLabel={`Switch to ${nextSwitchStore.storeName} first`}
                    testID="switch-store-btn"
                  >
                    <Text style={styles.switchStoreBtnText} maxFontSizeMultiplier={1.25}>
                      Switch to {nextSwitchStore.storeName} first
                    </Text>
                  </TouchableOpacity>
                )}
                {/* Another errand in hand can use the wait instead. */}
                {queuedErrands[0] && (
                  <TouchableOpacity
                    onPress={() => confirmStartFirst(queuedErrands[0])}
                    style={styles.switchStoreBtn}
                    accessibilityRole="button"
                    accessibilityLabel={`Do ${formatErrandId(queuedErrands[0].id)} for ${queuedErrands[0].customer || 'the next customer'} while you wait`}
                    testID="delay-start-queued-btn"
                  >
                    <Text style={styles.switchStoreBtnText} maxFontSizeMultiplier={1.25}>
                      Do {formatErrandId(queuedErrands[0].id)} ({queuedErrands[0].customer || 'next customer'}) while you wait
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {hasStoresRemaining ? (
              /* Intermediate Store Stop: Always advance to next store */
              <TouchableOpacity
                style={[styles.actionBtn, !gate.canAdvance && styles.actionBtnDisabled]}
                disabled={!gate.canAdvance}
                onPress={handleFinishStoreShopping}
                accessibilityRole="button"
                accessibilityState={{ disabled: !gate.canAdvance }}
                accessibilityLabel="I've finished shopping, go to the next store"
                accessibilityHint={gate.blockedReason ?? undefined}
                testID="store-finish-btn"
              >
                <Text style={styles.actionBtnText} maxFontSizeMultiplier={1.25}>
                  I've finished shopping, go to the next store
                </Text>
                <ChevronRight size={18} color={Colors.onPrimary} />
              </TouchableOpacity>
            ) : gate.halfPayment === 'ask' ? (
              /* Final Store: Ask for 50% half-payment */
              <TouchableOpacity
                style={[styles.actionBtn, mission.isRequestingHalf && styles.actionBtnDisabled]}
                disabled={mission.isRequestingHalf}
                onPress={mission.requestHalfPayment}
                testID="request-half-payment"
                accessibilityRole="button"
                accessibilityState={{ disabled: mission.isRequestingHalf }}
                accessibilityLabel="Ask for the half-payment"
              >
                <Text style={styles.actionBtnText} maxFontSizeMultiplier={1.25}>
                  {displayErrand?.paymentPlan?.dueUpFront != null
                    ? `Ask for the half-payment (₱${displayErrand.paymentPlan.dueUpFront.toFixed(2)})`
                    : 'Ask for the half-payment'}
                </Text>
                <ChevronRight size={18} color={Colors.onPrimary} />
              </TouchableOpacity>
            ) : gate.halfPayment === 'waiting' ? (
              /* Final Store: Waiting for customer payment */
              <TouchableOpacity
                style={styles.handoverBtn}
                disabled={mission.isRequestingHalf}
                onPress={mission.requestHalfPayment}
                testID="remind-half-payment"
                accessibilityRole="button"
                accessibilityLabel="Remind the customer about the half-payment"
              >
                <Text style={styles.handoverText} maxFontSizeMultiplier={1.25}>
                  {mission.isRequestingHalf ? 'Sending' : 'Send a reminder'}
                </Text>
              </TouchableOpacity>
            ) : (
              /* Final Store: All stores done, start delivery */
              <TouchableOpacity
                style={[styles.actionBtn, !gate.canAdvance && styles.actionBtnDisabled]}
                disabled={!gate.canAdvance}
                onPress={advanceStatus}
                accessibilityRole="button"
                accessibilityState={{ disabled: !gate.canAdvance }}
                accessibilityLabel="I've finished shopping, start delivery"
                accessibilityHint={gate.blockedReason ?? undefined}
                testID="store-finish-btn"
              >
                <Text style={styles.actionBtnText} maxFontSizeMultiplier={1.25}>
                  I've finished shopping, start delivery
                </Text>
                <ChevronRight size={18} color={Colors.onPrimary} />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.deliveringActionContainer}>
            {currentStatus === 'Delivering' && isCashCollected(paymentMode) && (
              <View style={styles.codReminderPill} testID="cod-reminder-pill">
                <Info size={14} color={Colors.warning} />
                <Text style={styles.codReminderText} maxFontSizeMultiplier={1.25}>
                  COD: Collect {formatPeso(dueAtDoor)} cash at customer doorstep
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.actionBtn, !gate.canAdvance && styles.actionBtnDisabled]}
              disabled={!gate.canAdvance}
              onPress={advanceStatus}
              accessibilityRole="button"
              accessibilityState={{ disabled: !gate.canAdvance }}
              accessibilityLabel={STEP_META[currentStatus]?.action ?? 'Continue'}
              accessibilityHint={gate.blockedReason ?? undefined}
            >
              <Text style={styles.actionBtnText} maxFontSizeMultiplier={1.25}>
                {STEP_META[currentStatus]?.action ?? 'Continue'}
              </Text>
              <ChevronRight size={18} color={Colors.onPrimary} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    ) : null;

  const hasHud = mapSteps.length > 0;
  const capsuleTop = hasHud
    ? Math.max(insets.top + CAPSULE_MIN_TOP_WITH_HUD, hudBottom + Spacing.xs)
    : insets.top + moderateScale(56, 0.2);
  const capsuleBottom = capsuleTop + capsuleHeight;
  const bannerTop = Math.max(
    insets.top + (hasHud ? BANNER_MIN_TOP_WITH_HUD : BANNER_MIN_TOP),
    capsuleBottom + Spacing.xs
  );
  const collapsedHeight = headerHeight > 0 ? SHEET_HANDLE_HEIGHT + headerHeight : COLLAPSED_SHEET_HEIGHT;
  // Open, the sheet stops short of the panel and the capsules, which the rider
  // is still navigating by, and never covers more than SHEET_MAX_COVER_RATIO.
  const sheetMaxHeight = screenHeight > 0 ? screenHeight - Math.max(hudBottom, capsuleBottom) - Spacing.sm : undefined;
  // The full task view stops only at the status bar.
  const fullTaskHeight = screenHeight > 0 ? screenHeight - insets.top : undefined;
  // Where the floating layers at the top end: the back bar, the navigation
  // panel, the fee capsules. The whole-route view is fitted below this, and the
  // chase camera places the rider between it and the sheet.
  const topBarBottom = insets.top + Spacing.xs + 48;
  const topCovered = Math.max(topBarBottom, hudBottom, activeErrands.length > 0 ? capsuleBottom : 0);

  return (
    <View style={styles.container} onLayout={measure(setScreenHeight)} testID="task-screen">
      {/* 1st Horizontal Layer: Top Bar with Back Button on the left and the
          errands' ID pills. Not over the full task view, which has its own back. */}
      {!fullTask && (
      <View
        style={[styles.taskTopHeaderBar, { top: insets.top + Spacing.xs }]}
        pointerEvents="box-none"
        testID="task-top-header"
      >
        <TouchableOpacity
          style={styles.floatingBackBtn}
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate('Tabs');
            }
          }}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Go back to Home"
          testID="task-back-btn"
        >
          <ArrowLeft size={20} color={Colors.textWhite} strokeWidth={2.4} />
        </TouchableOpacity>

        {/* Nothing else up here: an errand's task opens in full from its fee
            capsule, under the directions panel. */}
      </View>
      )}

      {/* Layer 1 — the map. A direct child of this View, never inside a scroller. */}
      {hasMapData ? (
        <LiveErrandMap
          riderLocation={riderLocation}
          destination={destination}
          pinpoints={pinpoints}
          routeCoordinates={mapRouteCoordinates}
          pickupLegCoordinates={isShopping ? mapRouteCoordinates : null}
          deliveryLegCoordinates={!isShopping ? mapRouteCoordinates : null}
          steps={mapSteps}
          distanceMeters={distanceMeters}
          durationSeconds={durationSeconds}
          targetStoreName={activeTargetName}
          phase={activePhase}
          isFallback={isFallback}
          targetCoordinate={activeTargetCoord}
          // What the sheet and its action dock cover right now. Closed that is
          // the peek; open, the camera moves the rider up into what is left,
          // instead of leaving them underneath the list being read.
          bottomInset={sheetHidden ? insets.bottom : sheetExpanded ? sheetCover : sheetPeek}
          topInset={topCovered}
          isRerouting={isRerouting}
          routeChosenBy={routeSelection?.chosen ?? null}
          mapStyle={mapStyle}
          controlsVisible={!sheetExpanded}
          // The "In 170 m, turn right" panel would sit on the full task view.
          directionsVisible={!fullTask}
          active={isFocused}
          onHudLayout={noteHudBottom}
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

      {/* Layer 2 — what each errand pays, positioned cleanly below TurnByTurnHUD
          if active. Not over the full task view, where it would sit on its text. */}
      {!fullTask && (
      <View
        style={[styles.capsuleLayer, { top: capsuleTop }]}
        pointerEvents="box-none"
        onLayout={measure(setCapsuleHeight)}
        testID="fee-capsule-layer"
      >
        {/* A capsule opens its errand's task in full; the back button in
            the task's header comes back to the map. The chat button is in that
            header too, so while the sheet is away unread messages show here. */}
        <FeeCapsuleBar
          errands={activeErrands}
          selectedIndex={safeIndex}
          onSelect={openFullTask}
          showUnreadDot={sheetHidden && mission.unreadDR}
        />
      </View>
      )}

      <View
        style={[styles.bannerLayer, { top: bannerTop }]}
        pointerEvents="box-none"
        testID="banner-layer"
      >
        <StatusBanner banner={mission.banner} onDismiss={mission.dismissBanner} />
        {/* A sibling in the existing zero-height layer, never a wrapper around
            the map: children stack downward from here, so this needs no offset
            of its own and leaves the stacking numbers above untouched. */}
        <RouteQualityBanner visible={isFallback} reason={lastFailure} />
      </View>

      {/* Layer 3 — the errand itself. */}
      <BottomSheet
        collapsedHeight={collapsedHeight}
        // In full, the whole screen below the status bar: the map is not
        // being navigated by while the rider reads the task.
        expandedRatio={fullTask ? 1 : undefined}
        expanded={sheetExpanded}
        onExpandedChange={setSheetExpanded}
        onPeekChange={setSheetPeek}
        onCoverChange={setSheetCover}
        maxHeight={fullTask ? fullTaskHeight : sheetMaxHeight}
        maxCoverRatio={fullTask ? undefined : SHEET_MAX_COVER_RATIO}
        hidden={sheetHidden}
        onHiddenChange={setSheetHidden}
        padSafeAreaBottom={true}
        footer={actionDock}
      >
        <View style={styles.sheetHeader} onLayout={measure(setHeaderHeight)} testID="sheet-header">
          {/* Row 1: Customer Name + Action Buttons Group */}
          <View style={styles.sheetHeaderRow1}>
            {/* In full: back to the map, as it was before the pill was tapped. */}
            {fullTask && (
              <TouchableOpacity
                style={styles.headerActionBtn}
                onPress={closeFullTask}
                accessibilityRole="button"
                accessibilityLabel="Back to the map"
                testID="full-task-back-btn"
              >
                <ArrowLeft size={20} color={Colors.navy} strokeWidth={2.4} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.sheetHeaderTitleArea}
              activeOpacity={0.8}
              onPress={() => setSheetExpanded(!sheetExpanded)}
              accessibilityRole="button"
              accessibilityLabel={sheetExpanded ? 'Collapse errand sheet' : 'Expand errand sheet'}
            >
              <Text style={styles.sheetTitle} maxFontSizeMultiplier={1.25}>
                {displayErrand?.customer || 'Active Errand'}
              </Text>
            </TouchableOpacity>
            <View style={styles.headerActionsGroup}>
              {/* Header Chat Button with unread indicator */}
              <TouchableOpacity
                style={styles.headerActionBtn}
                onPress={handleOpenDispatcherChat}
                accessibilityRole="button"
                accessibilityLabel={
                  mission.unreadDR
                    ? 'Message the dispatcher, you have unread messages'
                    : 'Message the dispatcher'
                }
                testID="header-chat-btn"
              >
                <MessageCircle size={18} color={Colors.navy} strokeWidth={2.2} />
                {mission.unreadDR && <View style={styles.headerChatBadge} />}
              </TouchableOpacity>
            </View>
          </View>

          {/* Row 2: Compact Errand ID chip + Current Status capsule */}
          <TouchableOpacity
            style={styles.sheetHeaderRow2}
            activeOpacity={0.8}
            onPress={() => setSheetExpanded(!sheetExpanded)}
            accessibilityRole="button"
            accessibilityLabel={sheetExpanded ? 'Collapse errand sheet' : 'Expand errand sheet'}
          >
            <View style={styles.errandIdChip}>
              <Text style={styles.errandIdChipText} maxFontSizeMultiplier={1.25}>
                {formatErrandId(displayErrand?.id)}
              </Text>
            </View>
            <View
              style={[
                styles.statusCapsule,
                { backgroundColor: isQueuedView ? Colors.bgGray : isShoppingView ? Colors.warningBg : Colors.infoBg },
              ]}
            >
              <Text
                style={[
                  styles.statusCapsuleText,
                  { color: isQueuedView ? Colors.textMedium : isShoppingView ? Colors.warning : Colors.info },
                ]}
                maxFontSizeMultiplier={1.25}
                testID="sheet-status-label"
              >
                {isQueuedView
                  ? `Queued, ${queuePositionLabel(safeIndex)}`
                  : STEP_META[currentStatus]?.label ?? currentStatus}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.sheetScrollView}
          contentContainerStyle={styles.sheetBody}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.badgesRow}>
            {/* The shop's category, not the service type. */}
            {storeKind && <Badge tone="info">{storeKind}</Badge>}
            <Badge tone={displayErrand.paymentMode ? 'warning' : 'neutral'}>
              {displayErrand.paymentMode ?? 'Payment not confirmed'}
            </Badge>
          </View>

          {/* Two or more errands in hand: which one to ride to first. */}
          <ErrandQueueList
            errands={activeErrands}
            progressFor={progressFor}
            selectedIndex={safeIndex}
            onSelect={setSelectedIndex}
          />

          {/* STAGE 1: SHOPPING / PICKUP PHASE */}
          {isShoppingView ? (
            <>
              {/* Compact Customer Preview Pill during shopping */}
              <View style={styles.customerPreviewPill}>
                <View style={styles.customerPreviewLeft}>
                  <Text style={styles.customerPreviewName} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                    Drop-off: {displayErrand.customer}
                  </Text>
                  <Text style={styles.customerPreviewAddr} numberOfLines={1} maxFontSizeMultiplier={1.15}>
                    {displayErrand.address}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.customerCallBtn}
                  onPress={() => displayErrand.customerPhone && Linking.openURL(`tel:${displayErrand.customerPhone}`)}
                  disabled={!displayErrand.customerPhone}
                  accessibilityRole="button"
                  accessibilityLabel="Call customer"
                >
                  <Phone size={15} color={displayErrand.customerPhone ? Colors.success : Colors.textLight} />
                </TouchableOpacity>
              </View>

              {/* Store arrival notices & manual arrival override: the errand in hand only */}
              {!isQueuedView && mission.storeArrival.advancedAutomatically && currentStatus === 'At Store' && (
                <View style={styles.arrivalNote}>
                  <MapPin size={14} color={Colors.success} />
                  <Text style={styles.arrivalNoteText} maxFontSizeMultiplier={1.15}>
                    Arrived automatically: you reached the store.
                  </Text>
                </View>
              )}

              {!isQueuedView && mission.storeArrival.arrivingAt && currentStatus === 'Traveling' && (
                <View style={styles.arrivalPending}>
                  <View style={styles.arrivalPendingLeft}>
                    <MapPin size={14} color={Colors.warning} />
                    <Text style={styles.arrivalPendingText} maxFontSizeMultiplier={1.15}>
                      Near {mission.storeArrival.arrivingAt.storeName}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.manualArrivalChip}
                    onPress={advanceStatus}
                    accessibilityRole="button"
                    accessibilityLabel="Confirm arrival at store"
                  >
                    <Text style={styles.manualArrivalText} maxFontSizeMultiplier={1.15}>Confirm Arrival</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Substitute Status Notification Banner */}
              {substituteNotice && substituteNotice.errandId === displayErrand?.id && (
                <View
                  style={[
                    styles.substituteBanner,
                    substituteNotice.status === 'DECLINED' && styles.substituteBannerDeclined,
                  ]}
                  testID="substitute-notice-banner"
                >
                  <View style={styles.substituteHeaderRow}>
                    <AlertCircle
                      size={16}
                      color={substituteNotice.status === 'DECLINED' ? Colors.info : Colors.warning}
                    />
                    <Text
                      style={[
                        styles.substituteTitle,
                        substituteNotice.status === 'DECLINED' && styles.substituteTitleDeclined,
                      ]}
                      maxFontSizeMultiplier={1.15}
                    >
                      {substituteNotice.status === 'PENDING'
                        ? `Dispatcher is processing a substitute for ${substituteNotice.itemName}`
                        : `Customer declined substitute for ${substituteNotice.itemName}`}
                    </Text>
                  </View>
                  <Text style={styles.substituteBody} maxFontSizeMultiplier={1.15}>
                    {substituteNotice.status === 'PENDING'
                      ? 'Please pause purchasing this item while the dispatcher contacts the customer.'
                      : 'The customer opted not to replace this item. Please proceed with the remaining items.'}
                  </Text>
                  <TouchableOpacity
                    style={styles.substituteDismissBtn}
                    onPress={dismissSubstituteNotice}
                    accessibilityRole="button"
                    accessibilityLabel="Acknowledge substitute update"
                  >
                    <Text style={styles.substituteDismissText} maxFontSizeMultiplier={1.15}>
                      Understood
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Elevated Request Items & Checkable List */}
              {(displayErrand.payload || displayErrand.details) && (
                <RequestItemsPanel
                  errand={displayErrand}
                  currentStatus={displayStatus}
                  completedSubtasks={displayCompleted}
                  uploadingSubtask={mission.uploadingSubtask}
                  onUpload={mission.openReceiptCapture}
                  onNoReceipt={mission.openNoReceiptCapture}
                  activeStoreTargetId={isQueuedView ? null : activeStoreTarget?.id ?? null}
                  visitedPinpointIds={displayVisitedIds}
                  collapsible={false}
                  readOnly={isQueuedView}
                />
              )}

              <ProgressSteps currentStatus={displayStatus} stepIndex={displayStepIndex} />
              <FeeBreakdownPanel errand={displayErrand} />

              {displayErrand?.paymentPlan?.hasLedger && (
                <PaymentProofViewer errandId={displayErrand.id} />
              )}

              {displayErrand?.paymentPlan?.state === 'AWAITING_BALANCE' && (
                <View style={styles.arrivalPending}>
                  <MapPin size={14} color={Colors.warning} />
                  <Text style={styles.arrivalPendingText} maxFontSizeMultiplier={1.15}>
                    Collect ₱{displayErrand.paymentPlan.balanceDue.toFixed(2)} in cash at the door,
                    unless the customer's balance receipt is already confirmed.
                  </Text>
                </View>
              )}
            </>
          ) : (
            /* STAGE 2: DELIVERY & HANDOVER PHASE */
            <>
              {/* Elevated Full Customer Details Panel */}
              <CustomerDetailsPanel errand={displayErrand} />

              {/* Cash collection input: the door being ridden to, never a queued one */}
              {!isQueuedView && isCashCollected(paymentMode) && (
                <CashCollectionInput
                  errand={displayErrand}
                  collectedInFull={Boolean(collectedAmount)}
                  proofKind={mission.paymentProofKind}
                  shortPayment={mission.shortPayment}
                  shortAmount={mission.shortPayment ? collectedAmount : ''}
                  riderNote={mission.riderNote}
                  onCaptureBalanceProof={mission.openBalanceProofCapture}
                  onCaptureCashProof={mission.openCashProofCapture}
                />
              )}

              {/* Handover photo at the door */}
              {!isQueuedView && (
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

              {/* Collapsed Store Items Summary Accordion */}
              {(displayErrand.payload || displayErrand.details) && (
                <RequestItemsPanel
                  errand={displayErrand}
                  currentStatus={displayStatus}
                  completedSubtasks={displayCompleted}
                  uploadingSubtask={mission.uploadingSubtask}
                  onUpload={mission.openReceiptCapture}
                  onNoReceipt={mission.openNoReceiptCapture}
                  activeStoreTargetId={isQueuedView ? null : activeStoreTarget?.id ?? null}
                  visitedPinpointIds={displayVisitedIds}
                  collapsible={true}
                  defaultCollapsed={true}
                  readOnly={isQueuedView}
                />
              )}

              <ProgressSteps currentStatus={displayStatus} stepIndex={displayStepIndex} />
              <FeeBreakdownPanel errand={displayErrand} />

              {displayErrand?.paymentPlan?.hasLedger && (
                <PaymentProofViewer errandId={displayErrand.id} />
              )}
            </>
          )}
        </ScrollView>

      </BottomSheet>

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
            // The figure completeReceiptCapture judges full-or-short against.
            expectedAmount={mission.receiptTarget.kind === 'CASH_COLLECTED' ? mission.dueAtDoor : undefined}
            onDone={mission.completeReceiptCapture}
            onCancel={mission.cancelReceiptCapture}
          />
        )}
      </Modal>

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
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: Spacing.xs,
  },
  sheetHeaderRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  sheetHeaderTitleArea: {
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
  sheetTitle: {
    fontSize: scaledFontSize(FontSizes.md, 0.20),
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
  },
  headerActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerActionBtn: {
    width: 48,
    height: 48,
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.bgGray,
  },
  waybillBtn: {
    backgroundColor: Colors.primarySurface,
  },
  headerChatBadge: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
    borderWidth: 1.5,
    borderColor: Colors.bgWhite,
  },
  sheetHeaderRow2: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: 2,
  },
  errandIdChip: {
    backgroundColor: Colors.bgLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  errandIdChipText: {
    fontFamily: FontFamily.monoBold,
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    color: Colors.textDark,
  },
  statusCapsule: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  statusCapsuleText: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.bold as any,
  },
  sheetScrollView: {
    flex: 1,
  },
  sheetBody: {
    padding: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // Wraps because both badges now carry real text: "Fast Food & Restaurant"
    // beside "Payment not confirmed" runs off a 360dp screen otherwise.
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  customerPreviewPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.bgLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  customerPreviewLeft: {
    flex: 1,
    paddingRight: Spacing.sm,
  },
  customerPreviewName: {
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
  },
  customerPreviewAddr: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    color: Colors.textGray,
    marginTop: 2,
  },
  customerCallBtn: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.successBg,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 48,
    minHeight: 48,
  },
  actionBlock: {
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  stickyActionDock: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    backgroundColor: Colors.bgWhite,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
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
    textAlign: 'center',
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
    justifyContent: 'space-between',
    gap: Spacing.xs,
    backgroundColor: Colors.warningSubtle,
    borderColor: Colors.warningBorder,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
  },
  arrivalPendingLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  manualArrivalChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.warning,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  manualArrivalText: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.bold as any,
    color: Colors.textWhite,
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
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
    minHeight: 48,
  },
  actionBtnDisabled: {
    backgroundColor: Colors.textLight,
  },
  actionBtnText: {
    // React Native's flexShrink defaults to 0, so in this row "I've finished
    // shopping, go to the next store" kept its one-line width and ran out past
    // both edges of the button, pushing the chevron off it, whenever the
    // screen was narrow or the system font large. Shrinking lets it wrap
    // inside the button instead.
    flexShrink: 1,
    textAlign: 'center',
    color: Colors.onPrimary,
    fontSize: scaledFontSize(FontSizes.md, 0.20),
    fontWeight: FontWeights.bold as any,
  },
  queuedNote: {
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    fontWeight: FontWeights.semibold as any,
    color: Colors.textMedium,
    textAlign: 'center',
    paddingTop: Spacing.xs,
  },
  queuedHint: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    color: Colors.textGray,
    textAlign: 'center',
    paddingBottom: Spacing.xs,
  },
  switchErrandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    minHeight: 48,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.navy,
    backgroundColor: Colors.bgWhite,
  },
  switchErrandText: {
    flexShrink: 1,
    textAlign: 'center',
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    fontWeight: FontWeights.bold as any,
    color: Colors.navy,
  },
  navigatingContainer: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  navigatingCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.infoSubtle,
    paddingVertical: moderateScale(10, 0.20),
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  navigatingText: {
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    fontWeight: FontWeights.semibold as any,
    color: Colors.navy,
    flexShrink: 1,
    textAlign: 'center',
  },
  emergencyArrivalBtn: {
    minHeight: 48,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xs,
  },
  emergencyArrivalText: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.semibold as any,
    color: Colors.textGray,
    textDecorationLine: 'underline',
  },
  atStoreActionsContainer: {
    width: '100%',
    gap: Spacing.sm,
  },
  delayAlertCard: {
    backgroundColor: Colors.warningSubtle,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  delayAlertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  delayAlertText: {
    flex: 1,
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.semibold as any,
    color: Colors.warning,
  },
  switchStoreBtn: {
    backgroundColor: Colors.bgWhite,
    borderWidth: 1,
    borderColor: Colors.warning,
    borderRadius: BorderRadius.sm,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  switchStoreBtnText: {
    textAlign: 'center',
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.bold as any,
    color: Colors.warning,
  },
  deliveringActionContainer: {
    width: '100%',
    gap: Spacing.sm,
  },
  codReminderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.warningSubtle,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 40,
  },
  codReminderText: {
    flex: 1,
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.bold as any,
    color: Colors.warning,
  },
  taskTopHeaderBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    zIndex: 25,
  },
  floatingBackBtn: {
    width: moderateScale(44, 0.2),
    height: moderateScale(44, 0.2),
    minWidth: 48,
    minHeight: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  substituteBanner: {
    backgroundColor: Colors.warningSubtle,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  substituteBannerDeclined: {
    backgroundColor: Colors.infoSubtle,
    borderColor: Colors.infoBg,
  },
  substituteHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  substituteTitle: {
    flex: 1,
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.bold as any,
    color: Colors.warning,
  },
  substituteTitleDeclined: {
    color: Colors.info,
  },
  substituteBody: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    color: Colors.textGray,
    lineHeight: 18,
  },
  substituteDismissBtn: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.bgWhite,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
  },
  substituteDismissText: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.semibold as any,
    color: Colors.textDark,
  },
});
