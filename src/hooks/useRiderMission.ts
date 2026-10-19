/**
 * useRiderMission — Central business logic hook for the Rider Mobile App.
 * Encapsulates ALL state management and action handlers from RiderPortal.tsx.
 * Zero business logic in UI components per separation-of-concerns rules.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Alert, Platform, Vibration } from "react-native";
import {
  StatusStep, STATUS_STEPS, ChatMessage, Errand, MergedErrand, RiderProfile,
  BANNER_DURATION_MS, type BannerTone, type RiderBanner,
} from "../types/rider";
import { useRiderAuth } from "../context/RiderAuthContext";
import { riderApiService } from "../config/apiConfig";
import { shouldPersistStatusChange, STEP_TO_API } from "../services/errandStatus";
import { useConnectivity } from "./useConnectivity";
import { storageAdapter, WAYBILL_CACHE_KEY } from "../adapters/storageAdapter";
import { submitSettlement, flushPendingSettlements } from "../services/settlementQueue";
import { ref, onValue } from "firebase/database";
import { database } from "../firebase/config";
import { onRealtimeAuthChange, realtimeAuthState } from "../firebase/realtimeSession";
import {
  pickReplyThread,
  riderMessagesPath,
  sendRiderMessage,
  subscribeRiderChatMode,
  subscribeRiderInbox,
  type DispatcherThread,
  type RiderChatMode,
} from "../firebase/dispatcherChat";
import { formatEarnings, mergeEarnings } from '../utils/earnings';
import { isCashCollected } from '../services/errandGate';
import { applyDeliveryHolds, canSwitchWorkingErrand, deliveryHolds, orderErrandQueue } from '../services/errandQueue';
import { routePhaseFor } from '../services/routePhase';
import { formatErrandId } from '../utils/formatErrandId';
import { requestSections, type RequestSection } from '../services/requestSections';
import {
  cashDueAtDoorFor,
  deriveErrandProgress,
  dueAtDoorFor,
  DEFAULT_PROGRESS,
  type ErrandProgress,
  type PaymentProofKind,
  type ProofImageSummary,
} from '../services/missionProgress';
import { hasPending, trackPending, whenSettled } from '../services/requestCache';
import { proofRollbackMessage, undoHandover, undoSectionReceipt } from '../services/proofRollback';
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";

/** Which section of the shopping list the open camera is filing a receipt for. */
export interface ReceiptTarget {
  index: number;
  name: string;
  pinpointId: number | null;
  /**
   * What the camera is capturing. RECEIPT reads the paper; NO_RECEIPT
   * photographs the goods at a shop that prints nothing; PROOF_OF_DELIVERY is
   * the handover at the customer's door; RIDER_BALANCE_PROOF photographs the
   * customer's GCash/Maya receipt (OCR'd, fraud-checked); CASH_COLLECTED
   * photographs physical cash, with the rider typing what they were handed.
   */
  kind: 'RECEIPT' | 'NO_RECEIPT' | 'PROOF_OF_DELIVERY' | 'RIDER_BALANCE_PROOF' | 'CASH_COLLECTED';
}

/** What a photo capture reports back once it's uploaded (and, for the typed
 * paths, confirmed). Absent entirely for PROOF_OF_DELIVERY, which has neither. */
export interface ReceiptCaptureResult {
  confirmedTotal: number;
  imageId: number | null;
  riderNote?: string;
  /**
   * The upload still going, when the capture screen closed without waiting
   * for it (a receipt's save, a no-receipt photo, the handover). The step is
   * shown done at once and undone if this rejects; anything that needs the
   * photo on the server first waits for it (requestCache.whenSettled).
   */
  pending?: Promise<unknown>;
}

interface WaybillCache {
  prof: any;
  errandList: Errand[];
  /**
   * Cached alongside the waybill so the offline fallback restores the rider's
   * step and ticked sections too, rather than reviving the errand at
   * "Traveling" — which is the same wrong answer this whole mechanism exists to
   * stop. Optional: caches written before this field existed still load.
   */
  proofsByErrand?: Record<string, ProofImageSummary[]>;
}

/**
 * ErrandProgress and DEFAULT_PROGRESS now live in services/missionProgress.ts,
 * beside the function that rebuilds a slot from server truth. They moved
 * because the shape and the rule for restoring it are one concern, and keeping
 * the rule in a pure module is what makes it testable without a device.
 */

export type MissionPhase = "loading" | "idle" | "offered" | "active" | "completed" | "error";

export interface UseRiderMissionReturn {
  // State
  phase: MissionPhase;
  // Derived from real device connectivity (see useConnectivity.ts) — no
  // longer a manual simulation toggle.
  isOffline: boolean;
  currentStatus: StatusStep;
  showComplete: boolean;
  completedSubtasks: Record<number, boolean>;
  uploadingSubtask: number | null;
  activeMissions: Errand[] | null;
  /**
   * Errands the dispatcher has put to this rider that they have not answered yet.
   * These are the Home tab's accept/decline cards.
   *
   * Split out of `activeMissions`, which used to hold offers and accepted work in
   * one array. That single list is why the offer card and the progress tracker
   * had to live on the same screen: nothing could tell them apart.
   */
  offeredErrands: Errand[];
  /**
   * Errands the rider has accepted, in the order they are to be run: the one
   * being worked first, then the rest by when they were accepted. The Task
   * tab's contents. See services/errandQueue.ts.
   */
  activeErrands: Errand[];
  /**
   * The front of that queue: the only errand whose stops are routed to and
   * whose receipts are filed. Never the merged `errand`, whose pinpoints are
   * every errand's at once and whose id is several ids joined by " + ".
   */
  workingErrand: Errand | null;
  /** One errand's own progress. A queued errand is shown with its own, never the front's. */
  progressFor: (errandId: string | null | undefined) => ErrandProgress;
  /**
   * Sets the errand in hand aside and starts `errandId` first, e.g. while a
   * shop is taking too long. Only while the one in hand is still being shopped
   * for (errandQueue.canSwitchWorkingErrand). `leavingStoreId` is the stop the
   * rider walks out of; it is deferred, so the set-aside errand routes back to
   * it last. Returns false when the switch was refused.
   */
  startErrandFirst: (errandId: string, options?: { leavingStoreId?: number | null }) => boolean;
  /**
   * The errand a held one waits for (errandQueue.deliveryHolds): bought, and
   * delivered together with the same customer's other order once that one is
   * bought too. Null when it is not held.
   */
  deliveryHoldFor: (errandId: string) => Errand | null;
  isMissionAccepted: boolean;
  isAccepting: boolean;
  showDeclineModal: boolean;
  declineReason: string;
  showWaybill: boolean;
  showDRChat: boolean;
  drMessages: ChatMessage[];
  /** Whichever dispatcher most recently messaged this rider on the active errand. */
  drDispatcherId: string | number | null;
  drDispatcherName: string | null;
  /** As the catalogue holds it. Null until the customer confirms. */
  paymentMode: string | null;
  unreadDR: boolean;
  collectedAmount: string;
  riderNote: string;
  /** The photo backing `collectedAmount`, once one's been captured. */
  proofImageId: number | null;
  /** What that photo is: their GCash/Maya receipt, or the cash itself. */
  paymentProofKind: PaymentProofKind | null;
  showUploadModal: boolean;
  uploadProgress: number;
  errorMessage: string | null;
  /** Non-blocking confirmation, or null. Replaces the success dialogs. */
  banner: RiderBanner | null;

  // Computed
  stepIndex: number;
  isDelivered: boolean;
  errand: MergedErrand | null;
  dueAtDoor: number;
  /** dueAtDoor paid in cash: less the non-COD fee on a GCash/PayMaya errand. */
  cashDueAtDoor: number;
  completedToday: number;
  riderProfile: RiderProfile | null;
  deliveredErrands: Errand[];

  // Actions
  refresh: () => void;
  advanceStatus: () => void;
  /** Return to Traveling status when moving to the next store in multi-store errands */
  returnToTraveling: () => void;
  deferredStoreIds: number[];
  departedStoreIds: number[];
  storeArrivalTimestamp: number | null;
  deferStore: (storeId: number) => void;
  finishStoreShopping: (storeId: number) => void;
  /**
   * Every item bought on the 50% plan: ask for the customer's half instead of
   * heading out. Safe to press again, which re-sends it as a reminder.
   */
  requestHalfPayment: () => void;
  isRequestingHalf: boolean;
  /** Accepts one specific offer by its real errand id — never the whole batch. */
  acceptMission: (errandId: string) => void;
  declineMission: () => Promise<void>;
  /** One offer's countdown ran out: hand that offer back, no reason asked. */
  expireOffer: (offerId: string) => void;
  resetForNextErrand: () => void;
  /** The section awaiting a receipt photo, or null when the camera is closed. */
  receiptTarget: ReceiptTarget | null;
  /** True once the door photo is taken, which is what releases "Delivered". */
  handoverCaptured: boolean;
  openReceiptCapture: (section: RequestSection, index: number) => void;
  openNoReceiptCapture: (section: RequestSection, index: number) => void;
  openHandoverCapture: () => void;
  /** Photograph the customer's GCash/Maya receipt — OCR'd against the balance due. */
  openBalanceProofCapture: () => void;
  /** Photograph cash in hand — the rider types what they were handed. */
  openCashProofCapture: () => void;
  /** True once the rider has said the customer paid less than the total. */
  shortPayment: boolean;
  completeReceiptCapture: (result?: ReceiptCaptureResult) => void;
  cancelReceiptCapture: () => void;
  sendDispatcherMessage: (text: string, imageUrl?: string) => void;
  /** "threads" once each dispatcher has a private conversation (firebase/dispatcherChat.ts). */
  riderChatMode: RiderChatMode;
  /** This rider's conversations, most recent first. Empty in "shared" mode. */
  dispatcherThreads: DispatcherThread[];
  /** The conversation shown and replied to: a `staff_<id>` key, or null when there is none yet. */
  activeThreadUid: string | null;
  selectDispatcherThread: (staffUid: string) => void;
  setDeclineReason: (reason: string) => void;
  setShowDeclineModal: (show: boolean) => void;
  setShowWaybill: (show: boolean) => void;
  setShowDRChat: (show: boolean) => void;
  setUnreadDR: (unread: boolean) => void;
  setShowUploadModal: (show: boolean) => void;
  setActiveMissions: (missions: Errand[] | null) => void;
  dismissBanner: () => void;
}

// "Assigned" is an offer awaiting an answer; "Traveling" is work in progress.
// ACTIVE_STATUSES keeps both because the merged `errand` and the offline cache
// still operate on the pair — only the per-errand accept/decline/progress
// actions below need to tell them apart.
const OFFERED_STATUSES: Errand["status"][] = ["Assigned"];
const ACCEPTED_STATUSES: Errand["status"][] = ["Traveling"];
const ACTIVE_STATUSES: Errand["status"][] = [...OFFERED_STATUSES, ...ACCEPTED_STATUSES];

/**
 * Which errand the rider chose to start first, per rider. Kept on the device so
 * a relaunch mid-run does not hand the front back to the older errand the rider
 * deliberately set aside. Ignored once that errand is no longer in hand.
 */
const workingErrandKey = (riderId: number | string) => `@sugo_rider_working_errand_v1:${riderId}`;

/** Delivery holds already announced (see the announcement effect), per rider. */
const announcedHoldsKey = (riderId: number | string) => `@sugo_rider_announced_holds_v1:${riderId}`;

/**
 * The photo evidence already on record for each errand the rider is running.
 *
 * Fetched only for ACCEPTED errands: an unanswered offer has no progress to
 * restore, and a delivered one is no longer being worked. That keeps this to a
 * request or two, since a rider carries one errand at a time and occasionally
 * two. listProofImages swallows its own failures and returns [], so a stop
 * whose evidence cannot be fetched degrades to "not photographed yet" — the
 * rider re-takes one photo — rather than failing the whole waybill load.
 */
async function fetchProgressProofs(
  errandList: Errand[]
): Promise<Record<string, ProofImageSummary[]>> {
  const accepted = errandList.filter((e) => ACCEPTED_STATUSES.includes(e.status));
  if (accepted.length === 0) return {};

  const results = await Promise.all(
    accepted.map(async (e) => ({
      id: e.id,
      proofs: (await riderApiService.listProofImages(e.id)) as ProofImageSummary[],
    }))
  );

  const byErrand: Record<string, ProofImageSummary[]> = {};
  for (const { id, proofs } of results) byErrand[id] = proofs;
  return byErrand;
}

export function useRiderMission(): UseRiderMissionReturn {
  const { rider } = useRiderAuth();

  // ─── Core State ────────────────────────────────────────────────────────────
  // Shopping/delivery progress, one slot per accepted errand id — see
  // ErrandProgress above for why this replaced five flat useStates.
  const [progressByErrand, setProgressByErrand] = useState<Record<string, ErrandProgress>>({});
  const [uploadingSubtask, setUploadingSubtask] = useState<number | null>(null);
  const [receiptTarget, setReceiptTarget] = useState<ReceiptTarget | null>(null);
  const [activeMissions, setActiveMissions] = useState<Errand[] | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [showWaybill, setShowWaybill] = useState(false);
  const [showDRChat, setShowDRChatState] = useState(false);
  const [drMessages, setDrMessages] = useState<ChatMessage[]>([]);
  const [drDispatcherId, setDrDispatcherId] = useState<string | number | null>(null);
  const [drDispatcherName, setDrDispatcherName] = useState<string | null>(null);
  const [unreadDR, setUnreadDR] = useState(false);
  const [riderChatMode, setRiderChatMode] = useState<RiderChatMode>("shared");
  const [dispatcherThreads, setDispatcherThreads] = useState<DispatcherThread[]>([]);
  const [chosenThreadUid, setChosenThreadUid] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const previousDrMessageCountRef = useRef<number>(0);
  const previousErrandIdForChatRef = useRef<string | null>(null);
  const showDRChatRef = useRef(showDRChat);
  showDRChatRef.current = showDRChat;
  const drDispatcherNameRef = useRef(drDispatcherName);
  drDispatcherNameRef.current = drDispatcherName;

  const setShowDRChat = useCallback((show: boolean) => {
    setShowDRChatState(show);
    if (show) {
      setUnreadDR(false);
    }
  }, []);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Real data fetched from the backend — no mock fallbacks. Both start
  // genuinely unknown (null) until the fetch resolves.
  const [riderProfile, setRiderProfile] = useState<RiderProfile | null>(null);
  const [deliveredErrands, setDeliveredErrands] = useState<Errand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  // Stale while revalidate. Once anything is on screen, a refresh happens
  // behind it: `isLoading` (the full-screen spinner) is for having nothing at
  // all to show. Every socket event used to flip it, which also unmounted the
  // Task tab's map and created it again, the redraw a Huawei phone's map
  // could not take (config/mapChoice.ts).
  const hasDataRef = useRef(false);
  // Progress slots rebuilt from the cached waybill, before the server has
  // answered. The first fresh answer rebuilds them again, unless the rider has
  // acted on one meanwhile (updateProgress takes it off this list).
  const provisionalSlotsRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(() => setRefreshCounter((c) => c + 1), []);

  // Two halves of one array, each with a screen of its own. Derived rather than
  // stored so there is still exactly one source of truth for what the rider has.
  const offeredErrands = useMemo(
    () => (activeMissions ?? []).filter((e) => OFFERED_STATUSES.includes(e.status)),
    [activeMissions]
  );

  // The errand the rider chose to start first, or null for "first accepted,
  // first run". Restored per rider; see workingErrandKey.
  const [workingErrandId, setWorkingErrandId] = useState<string | null>(null);
  useEffect(() => {
    if (!rider?.id) {
      setWorkingErrandId(null);
      return;
    }
    let alive = true;
    void storageAdapter.getJSON<string>(workingErrandKey(rider.id)).then((stored) => {
      if (alive && typeof stored === "string") setWorkingErrandId(stored);
    });
    return () => {
      alive = false;
    };
  }, [rider?.id]);

  // In run order, not fetch order. The server lists newest first, and taking
  // index 0 of that is how accepting a second errand used to hijack the first
  // one's progress (services/errandQueue.ts).
  const queueOrder = useMemo(
    () =>
      orderErrandQueue(
        (activeMissions ?? []).filter((e) => ACCEPTED_STATUSES.includes(e.status)),
        workingErrandId
      ),
    [activeMissions, workingErrandId]
  );

  // One trip to a customer's door, not two (errandQueue.deliveryHolds). An
  // errand already bought waits while the same customer's other errand for the
  // same door is shopped: that one comes next, and both are delivered together.
  // "Bought" is the rider's own step; for an errand whose slot is not rebuilt
  // yet, what the server recorded.
  //
  // Frozen while a camera is open: the photo is filed against the front
  // errand, which must not change under it.
  const liveHolds = useMemo(
    () =>
      deliveryHolds(queueOrder, (e) => {
        const slot = progressByErrand[e.id];
        return slot ? routePhaseFor(slot.currentStatus) !== 'shopping' : Boolean(e.itemsPurchasedAt);
      }),
    [queueOrder, progressByErrand]
  );
  const holdsRef = useRef(liveHolds);
  if (!receiptTarget) holdsRef.current = liveHolds;
  const holds = holdsRef.current;

  const activeErrands = useMemo(() => applyDeliveryHolds(queueOrder, holds), [queueOrder, holds]);

  // The errand actually being progressed right now — the front of the queue.
  // Everything else in `activeErrands` is queued behind it (see TaskScreen's
  // "This one is queued" note), so its own progress slot is left untouched
  // until it becomes the front.
  const frontErrandId = activeErrands[0]?.id ?? null;
  const frontProgress = (frontErrandId ? progressByErrand[frontErrandId] : undefined) ?? DEFAULT_PROGRESS;

  const progressFor = useCallback(
    (errandId: string | null | undefined) =>
      (errandId ? progressByErrand[errandId] : undefined) ?? DEFAULT_PROGRESS,
    [progressByErrand]
  );
  const {
    currentStatus, completedSubtasks, handoverCaptured, collectedAmount, shortPayment, showComplete,
    proofImageId, paymentProofKind = null, riderNote = '',
  } = frontProgress;

  // True the instant an offer becomes an accepted errand — derived from
  // `activeErrands`, never stored. The old stored version was set from
  // `activeMissions[0].status !== "Assigned"`, so a freshly-arrived offer that
  // happened to sort to index 0 flipped this false even with an in-progress
  // errand sitting elsewhere in the array, snapping the UI back to "offered".
  const isMissionAccepted = activeErrands.length > 0;

  // Merges one errand's progress slot without touching any other id's —
  // the actual fix for the accept-clobbers-progress bug. `patch` may be a
  // partial object or a function of the previous slot, mirroring setState.
  const updateProgress = useCallback(
    (errandId: string | null, patch: Partial<ErrandProgress> | ((prev: ErrandProgress) => Partial<ErrandProgress>)) => {
      if (!errandId) return;
      // The rider's own step: no longer a guess from the cache to be redone.
      provisionalSlotsRef.current.delete(errandId);
      setProgressByErrand((prev) => {
        const current = prev[errandId] ?? DEFAULT_PROGRESS;
        const nextPatch = typeof patch === "function" ? patch(current) : patch;
        return { ...prev, [errandId]: { ...current, ...nextPatch } };
      });
    },
    []
  );

  // Real device connectivity — replaces the old manually-toggled simulation.
  // Tied to the front accepted errand (not activeMissions[0], which can be an
  // unrelated freshly-arrived offer), since that's the errand a connectivity
  // incident during an active delivery should be attributed to.
  const { isConnected } = useConnectivity(rider?.id, frontErrandId ?? undefined);
  const isOffline = !isConnected;

  // "back online" isn't just a UI flag flip — force a live refetch so the
  // rider actually gets back to real, current data instead of continuing to
  // show whatever was cached for however long the outage lasted.
  const wasOfflineRef = useRef(false);
  useEffect(() => {
    if (isConnected) {
      // Idempotent no-op when nothing's queued — safe to call every time
      // we're connected, not just on the offline->online transition, so a
      // settlement left over from a force-killed app still flushes once the
      // app relaunches already online (same reasoning as useConnectivity.ts's
      // own pending-incident flush).
      void flushPendingSettlements();
      if (wasOfflineRef.current) {
        refresh();
      }
    }
    wasOfflineRef.current = !isConnected;
  }, [isConnected, refresh]);

  const applyFetchedData = useCallback(
    (
      prof: any,
      errandList: Errand[],
      proofsByErrand: Record<string, ProofImageSummary[]> = {},
      // True for the cached waybill shown while the server is asked again.
      fromCache = false
    ) => {
      hasDataRef.current = true;
      if (prof) {
        const name = prof.name || (prof.firstName ? `${prof.firstName} ${prof.lastName || ""}`.trim() : rider?.name);
        const initials = (name || "Rider")
          .split(" ")
          .map((n: string) => n[0])
          .join("")
          .toUpperCase()
          .substring(0, 2) || "R";

        setRiderProfile({
          id: String(prof.id ?? rider?.id),
          name,
          // Kept apart from the joined `name` so the edit form can round-trip
          // them. Splitting a display name back into parts guesses wrong on
          // anyone with two given names or a compound surname.
          firstName: prof.firstName || name.split(" ")[0] || "",
          lastName: prof.lastName || name.split(" ").slice(1).join(" ") || "",
          photoUpdatedAt: prof.photoUpdatedAt ?? null,
          initials,
          riderId: `RDR-${String(prof.id ?? rider?.id).padStart(3, "0")}`,
          phone: prof.phone || "",
          email: prof.email || "",
          joinDate: prof.createdAt
            ? new Date(prof.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
            : "—",
          status: prof.status === "Inactive" ? "Inactive" : "Active",
        });
      }

      const active = errandList.filter((e) => ACTIVE_STATUSES.includes(e.status));
      const delivered = errandList.filter((e) => e.status === "Delivered");
      setActiveMissions(active.length > 0 ? active : null);
      setDeliveredErrands(delivered);
      // isMissionAccepted is derived from activeErrands now — nothing to set here.

      // Drop progress slots for ids that no longer exist anywhere in the fetch
      // (declined, reassigned, or long delivered) so this map doesn't grow
      // forever across a shift — then rebuild the ones this device is missing.
      const stillKnown = new Set(errandList.map((e) => e.id));
      setProgressByErrand((prev) => {
        const next: Record<string, ErrandProgress> = {};
        let changed = false;
        for (const [id, value] of Object.entries(prev)) {
          if (stillKnown.has(id)) {
            next[id] = value;
          } else {
            changed = true;
          }
        }

        // Rebuild a slot for every accepted errand that has none on this
        // device, from what the server already recorded — the fix for progress
        // vanishing after a sign-out, a cleared cache or the OS reclaiming a
        // backgrounded app, all of which emptied this map while the database
        // still held every receipt, arrival and purchase confirmation.
        //
        // Only ever fills a MISSING slot. An errand already being worked in
        // this session keeps its live state untouched, because the server is a
        // step behind by design here: three of the four UI steps persist as the
        // same IN_TRANSIT row, so re-deriving over a live slot would drag a
        // rider who just tapped through to "Delivering" back to "At Store".
        //
        // A slot rebuilt from the cache is the exception: it was only ever a
        // stand-in for this answer, so the fresh one rebuilds it.
        const provisional = provisionalSlotsRef.current;
        for (const errandItem of errandList) {
          if (!ACCEPTED_STATUSES.includes(errandItem.status)) continue;
          if (next[errandItem.id] && (fromCache || !provisional.has(errandItem.id))) continue;
          next[errandItem.id] = deriveErrandProgress({
            errand: errandItem,
            proofs: proofsByErrand[errandItem.id] ?? [],
            sections: requestSections(errandItem),
          });
          if (fromCache) provisional.add(errandItem.id);
          else provisional.delete(errandItem.id);
          changed = true;
        }

        return changed ? next : prev;
      });
    },
    [rider]
  );

  useEffect(() => {
    if (!rider?.id) {
      // Signed out: what was on screen was the last rider's.
      hasDataRef.current = false;
      provisionalSlotsRef.current.clear();
      setIsLoading(false);
      return;
    }
    let isMounted = true;
    // The spinner only while there is nothing to show. With a waybill on
    // screen, this is a quiet revalidation behind it.
    if (!hasDataRef.current) setIsLoading(true);
    setErrorMessage(null);

    // Cold start: show the waybill this phone last saw at once, then the
    // server's answer when it lands. Only this rider's, and only if the server
    // has not already answered (a cache that loses the race is never applied
    // over a fresh answer).
    if (!hasDataRef.current) {
      void storageAdapter.getJSON<WaybillCache>(WAYBILL_CACHE_KEY).then((cached) => {
        if (!isMounted || hasDataRef.current || !cached) return;
        if (cached.prof?.id != null && String(cached.prof.id) !== String(rider.id)) return;
        // Not an unanswered offer: it runs on a countdown and may have gone
        // to another rider since. Only the server's answer shows one.
        const inHand = (cached.errandList ?? []).filter((e) => !OFFERED_STATUSES.includes(e.status));
        applyFetchedData(cached.prof, inHand, cached.proofsByErrand ?? {}, true);
        setIsLoading(false);
      });
    }

    Promise.all([
      riderApiService.fetchRiderProfile(rider.id),
      riderApiService.fetchRiderErrands(rider.id),
    ])
      .then(async ([prof, errandList]) => {
        if (!isMounted) return;
        // The evidence already filed against each accepted errand, which is
        // what rebuilds a step and its ticked sections on a device that has
        // none — see fetchProgressProofs and missionProgress.ts.
        const proofsByErrand = await fetchProgressProofs(errandList);
        if (!isMounted) return;
        applyFetchedData(prof, errandList, proofsByErrand);
        // Cache the live waybill so a later fetch failure (e.g. the device
        // going offline mid-shift) has real, recent data to fall back to
        // instead of a bare error — see the catch branch below.
        void storageAdapter.setJSON<WaybillCache>(WAYBILL_CACHE_KEY, {
          prof,
          errandList,
          proofsByErrand,
        });
      })
      .catch(async () => {
        if (!isMounted) return;
        const cached = await storageAdapter.getJSON<WaybillCache>(WAYBILL_CACHE_KEY);
        if (cached) {
          // Marked as from the cache, so the next answer that does arrive
          // rebuilds any slot this filled in.
          applyFetchedData(cached.prof, cached.errandList, cached.proofsByErrand ?? {}, true);
        } else if (!hasDataRef.current) {
          // Only with nothing on screen: a failed refresh behind a waybill
          // already shown leaves it shown.
          setErrorMessage("Unable to reach the server. Pull to refresh once you're back online.");
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [rider, refreshCounter, applyFetchedData]);

  // ─── Computed Values ───────────────────────────────────────────────────────
  const stepIndex = STATUS_STEPS.indexOf(currentStatus);
  const isDelivered = currentStatus === "Delivered";

  const errand: MergedErrand | null = useMemo(() => {
    if (!activeMissions || activeMissions.length === 0) return null;
    if (activeMissions.length === 1) {
      return { ...activeMissions[0] };
    }
    return {
      ...activeMissions[0],
      // Componentwise sum, so the merged card can still show the split.
      riderEarnings: mergeEarnings(activeMissions),
      amount: activeMissions.reduce((s, e) => s + (e.amount || 0), 0),
      type: Array.from(new Set(activeMissions.map((e) => e.type.replace(/\//g, "&")))).join(" & "),
      // A set union, which is the whole reason merchantCategories is a list. The
      // line above joins service types with " & "; a category doing the same
      // would be ambiguous the moment a name contains "&", which several do.
      merchantCategories: Array.from(
        new Set(activeMissions.flatMap((e) => e.merchantCategories ?? []))
      ),
      id: activeMissions.map((e) => e.id).join(" + "),
      details: activeMissions.map((e) => e.details).filter(Boolean).join(" | "),
      // Both concatenated across every bundled mission — this used to just be
      // `...activeMissions[0]`'s copy, so a second bundled errand's stores
      // silently vanished from the map and from the shopping list's fallback
      // view the moment 2+ errands were active at once.
      pinpoints: activeMissions.flatMap((e) => e.pinpoints ?? []),
      payload: activeMissions.flatMap((e) => e.payload ?? []),
    };
  }, [activeMissions]);

  // Derived from the errand in hand, never held separately.
  //
  // This was `useState<string>("Cash on Delivery")` whose setter was never called
  // anywhere in the file, so every errand read as COD regardless of what the
  // customer chose — and the cash panel, the settlement submit and the badge all
  // took their cue from it.
  //
  // The errand in hand's, not the merged card's: that is activeMissions[0],
  // which with two errands (or an offer beside one) is often another errand,
  // so the cash step and the settlement followed the wrong customer's choice.
  const paymentMode = (activeErrands[0] ?? errand)?.paymentMode ?? null;

  // What the front errand actually owes at the door, so a captured cash amount
  // can be judged full-or-short against the same figure the rider was shown.
  // The rule itself lives in dueAtDoorFor, shared with the restore path — two
  // copies of it would eventually disagree about a downpayment balance.
  const frontErrand = activeErrands[0] ?? null;
  const dueAtDoor = dueAtDoorFor(frontErrand);
  // The same, paid in cash: a GCash/PayMaya customer paying cash instead is
  // not charged the non-COD fee (cashDueAtDoorFor).
  const cashDueAtDoor = cashDueAtDoorFor(frontErrand);

  const completedToday = useMemo(() => {
    const todayStr = new Date().toDateString();
    return deliveredErrands.filter((e) => new Date(e.updatedAt).toDateString() === todayStr).length;
  }, [deliveredErrands]);

  const phase: MissionPhase = useMemo(() => {
    if (isLoading) return "loading";
    if (errorMessage) return "error";
    if (!errand) return "idle";
    if (!isMissionAccepted) return "offered";
    if (showComplete) return "completed";
    return "active";
  }, [isLoading, errorMessage, errand, isMissionAccepted, showComplete]);

  // ─── Actions ───────────────────────────────────────────────────────────────

  // ─── non-blocking feedback ─────────────────────────────────────────────────
  //
  // Replaces the five Alert.alert calls that fired on success. Two of those are
  // gone outright rather than converted: the stepper already shows the step it
  // announced, and the waiting card already says the rider is standing by.
  const [banner, setBanner] = useState<RiderBanner | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBanner = useCallback((tone: BannerTone, text: string) => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setBanner({ id: Date.now(), tone, text });
    bannerTimer.current = setTimeout(() => setBanner(null), BANNER_DURATION_MS);
  }, []);

  const dismissBanner = useCallback(() => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setBanner(null);
  }, []);

  // A pending timer holding a setState after the screen is gone is the ordinary
  // way this leaks.
  useEffect(() => () => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
  }, []);

  const advanceStatus = useCallback(async () => {
    // Only the front of the queue ever advances — everything else in
    // activeErrands is queued behind it (TaskScreen's "This one is queued"
    // note already says so). Operating on the whole activeMissions array here
    // used to mean accepting a brand-new offer while this errand was mid-run
    // would silently push ITS status onto the new offer too, and once it
    // reached "Delivering" would mark items purchased / submit settlement for
    // an errand the rider hadn't even started.
    const target = activeErrands[0];
    if (!target || !frontErrandId) return;
    if (currentStatus === "Delivering" && isCashCollected(paymentMode) && !collectedAmount) {
      Alert.alert("Validation Error", "Please enter the collected amount.");
      return;
    }

    const currentIndex = STATUS_STEPS.indexOf(currentStatus);
    if (currentIndex >= STATUS_STEPS.length - 1) return;
    const next = STATUS_STEPS[currentIndex + 1];

    // A photo shown as saved may still be on its way (optimistic uploads, see
    // completeReceiptCapture). The next step waits for it rather than racing
    // it to the server; if it failed, the step it rested on has already been
    // undone and the rider told, so there is nothing to advance from.
    if (hasPending(target.id) && !(await whenSettled(target.id))) return;

    if (shouldPersistStatusChange(currentStatus, next)) {
      const ok = await riderApiService.updateErrandStatus(target.id, STEP_TO_API[next]);
      if (!ok) {
        Alert.alert("Error", "Failed to update the errand status on the server. Please try again.");
        return;
      }
    }

    // Separate from the coarse status PATCH above — "Delivering" doesn't change
    // the underlying ErrandStatus (both stay IN_TRANSIT per STEP_TO_API), but
    // the customer's tracking screen needs to know this moment happened, so it
    // gets its own persisted signal (itemsPurchasedAt).
    if (next === "Delivering") {
      const ok = await riderApiService.markItemsPurchased(target.id);
      if (!ok) {
        Alert.alert("Error", "Failed to record items purchased on the server. Please try again.");
        return;
      }
      if (isCashCollected(paymentMode)) {
        showBanner("info", `On the way to customer. Collect ₱${dueAtDoor.toFixed(2)} COD at doorstep.`);
      } else {
        showBanner("info", "All items purchased. Heading to customer.");
      }
    }

    updateProgress(frontErrandId, (prev) => ({
      currentStatus: next,
      completedSubtasks: next === "Delivered" ? {} : prev.completedSubtasks,
      storeArrivalTimestamp: next === "At Store" ? Date.now() : null,
    }));

    if (next === "Delivered") {
      updateProgress(frontErrandId, { showComplete: true });
      // The rider's share for THIS errand, not a sum across whatever else
      // happens to be active — a second, unrelated errand may still be
      // queued behind it.
      showBanner("success", `Delivered. ${formatEarnings(target)} recorded.`);

      // The same predicate that decided whether to SHOW the cash panel decides
      // whether to record what came back. Two different rules here is how a
      // rider collects money that no settlement record ever sees.
      if (isCashCollected(paymentMode) && collectedAmount) {
        const proofRef = proofImageId ? { proofImageId } : {};
        const trimmedNote = riderNote.trim() || undefined;
        if (!shortPayment) {
          // The ordinary case. No amount is sent at all — the server settles
          // this errand at its own total, which is why a tampered client
          // cannot report a smaller one. The photo (GCash receipt or cash in
          // hand) and any note ("Cash nalang daw") still travel along as evidence.
          void submitSettlement(target.id, {
            collectedInFull: true,
            ...(trimmedNote ? { shortReason: trimmedNote } : {}),
            ...proofRef,
          });
        } else {
          const totalCollected = parseFloat(collectedAmount);
          if (!isNaN(totalCollected) && totalCollected >= 0) {
            void submitSettlement(target.id, {
              collectedAmount: Math.round(totalCollected * 100) / 100,
              shortReason: trimmedNote || "Reported short by the rider at handover.",
              ...proofRef,
            });
          }
        }
      }
    }
    // No announcement for the intermediate steps. ProgressSteps moves to the
    // new step in the same render, which is the feedback — a modal restating it
    // was a tap charged for reading the screen.
  }, [
    activeErrands, frontErrandId, currentStatus, paymentMode, collectedAmount, shortPayment,
    proofImageId, riderNote, showBanner, updateProgress,
  ]);

  const deferredStoreIds = useMemo(
    () => frontProgress.deferredStoreIds ?? [],
    [frontProgress.deferredStoreIds]
  );
  const departedStoreIds = useMemo(
    () => frontProgress.departedStoreIds ?? [],
    [frontProgress.departedStoreIds]
  );
  const storeArrivalTimestamp = frontProgress.storeArrivalTimestamp ?? null;

  const returnToTraveling = useCallback(() => {
    if (!frontErrandId) return;
    updateProgress(frontErrandId, { currentStatus: "Traveling", storeArrivalTimestamp: null });
  }, [frontErrandId, updateProgress]);

  const deferStore = useCallback((storeId: number) => {
    if (!frontErrandId) return;
    updateProgress(frontErrandId, (prev) => {
      const prevDeferred = prev.deferredStoreIds ?? [];
      const nextDeferred = prevDeferred.includes(storeId) ? prevDeferred : [...prevDeferred, storeId];
      return {
        currentStatus: "Traveling",
        deferredStoreIds: nextDeferred,
        storeArrivalTimestamp: null,
      };
    });
  }, [frontErrandId, updateProgress]);

  const finishStoreShopping = useCallback((storeId: number) => {
    if (!frontErrandId) return;
    updateProgress(frontErrandId, (prev) => {
      const prevDeparted = prev.departedStoreIds ?? [];
      const nextDeparted = prevDeparted.includes(storeId) ? prevDeparted : [...prevDeparted, storeId];
      const nextDeferred = (prev.deferredStoreIds ?? []).filter((id) => id !== storeId);
      return {
        currentStatus: "Traveling",
        departedStoreIds: nextDeparted,
        deferredStoreIds: nextDeferred,
        storeArrivalTimestamp: null,
      };
    });
  }, [frontErrandId, updateProgress]);

  const [isRequestingHalf, setIsRequestingHalf] = useState(false);

  const requestHalfPayment = useCallback(() => {
    // The front of the queue only, for the same reason advanceStatus is.
    const target = activeErrands[0];
    if (!target || isRequestingHalf) return;
    setIsRequestingHalf(true);
    void (async () => {
      try {
        // The server works the half out from the receipts on record, and
        // refuses before they are there. One still uploading is waited for;
        // one that failed has been undone and the rider asked to retake it.
        if (!(await whenSettled(target.id))) return;
        const result = await riderApiService.requestHalfPayment(target.id);
        if (!result.ok) {
          Alert.alert(
            "Couldn't ask yet",
            result.message ?? "Check your connection and try again."
          );
          return;
        }
        showBanner(
          "info",
          result.dueUpFront != null
            ? `Asked for ₱${result.dueUpFront.toFixed(2)}. You'll be told here the moment it's paid.`
            : "Asked for the half-payment. You'll be told here the moment it's paid."
        );
        // The plan now carries the request, which is what turns the button
        // into the waiting state.
        refresh();
      } finally {
        setIsRequestingHalf(false);
      }
    })();
  }, [activeErrands, isRequestingHalf, showBanner, refresh]);

  const acceptMission = useCallback(
    (errandId: string) => {
      if (isAccepting) return;
      const offer = (activeMissions ?? []).find((m) => m.id === errandId);
      if (!offer) return;
      setIsAccepting(true);
      void (async () => {
        try {
          const ok = await riderApiService.acceptErrand(errandId);
          if (!ok) throw new Error("accept failed");
          // Optimistic patch: flip just this one entry to "Traveling" so the
          // UI (isMissionAccepted, activeErrands, Task tab) updates instantly
          // without waiting for the next poll — and, critically, without
          // touching any other id already in activeMissions.
          setActiveMissions((prev) =>
            (prev ?? []).map((m) => (m.id === errandId ? { ...m, status: "Traveling" } : m))
          );
          updateProgress(errandId, { ...DEFAULT_PROGRESS });
          showBanner("success", "Accepted. Drive safely.");
        } catch (err: any) {
          // A 409 is the server refusing for a reason retrying cannot fix: the
          // offer expired, was cancelled, or the rider is at capacity. Say which
          // (the API's text is in `error`, not `message`) and reload, which drops
          // the card if the offer is gone and keeps it if it is not.
          if (err?.response?.status === 409) {
            Alert.alert("Can't accept this errand", err.response.data?.error ?? "This offer is no longer available.");
            refresh();
          } else {
            Alert.alert("Error", "Failed to accept the errand. Please try again.");
          }
        } finally {
          setIsAccepting(false);
        }
      })();
    },
    [activeMissions, isAccepting, showBanner, updateProgress, refresh]
  );

  const declineMission = useCallback(async () => {
    // Declines every still-OFFERED errand, never an already-accepted one —
    // this used to sweep the whole (offer + accepted) activeMissions array,
    // so opening the decline modal while a delivery was already in progress
    // could decline that in-progress errand too.
    if (!declineReason.trim() || offeredErrands.length === 0) return;
    try {
      await Promise.all(
        offeredErrands.map((m) => riderApiService.declineErrand(m.id, declineReason.trim()))
      );
    } catch {
      Alert.alert("Error", "Failed to decline the errand. Please try again.");
      return;
    }
    showBanner("info", "Declined. The dispatcher has been notified.");
    setShowDeclineModal(false);
    setDeclineReason("");
    const declinedIds = new Set(offeredErrands.map((m) => m.id));
    setActiveMissions((prev) => {
      const remaining = (prev ?? []).filter((m) => !declinedIds.has(m.id));
      return remaining.length > 0 ? remaining : null;
    });
  }, [declineReason, offeredErrands, showBanner]);

  // Only the offer whose clock ran out, unlike declineMission above, which
  // answers every open offer at once. The card goes immediately; the server
  // call is best-effort, because when it fails (no signal) the server's own
  // expiry takes the offer back about 15 seconds later anyway. A 409 just means
  // that already happened.
  const expireOffer = useCallback(
    (offerId: string) => {
      void riderApiService.declineErrand(offerId, "Offer expired with no answer from the rider").catch(() => undefined);
      setActiveMissions((prev) => {
        const remaining = (prev ?? []).filter((m) => m.id !== offerId);
        return remaining.length > 0 ? remaining : null;
      });
      showBanner("info", "That offer expired and has gone to another rider.");
    },
    [showBanner]
  );

  const resetForNextErrand = useCallback(() => {
    // Clears only the errand that actually reached "Delivered" — any other
    // errand queued behind it keeps its own progress slot and simply becomes
    // the new front once refresh() reconciles with the server.
    if (frontErrandId) {
      setProgressByErrand((prev) => {
        if (!(frontErrandId in prev)) return prev;
        const { [frontErrandId]: _removed, ...rest } = prev;
        return rest;
      });
    }
    refresh();
    // No announcement: resetting drops the rider straight onto WaitingCard,
    // whose whole content is "standing by for an assignment".
  }, [frontErrandId, refresh]);

  // Opening the camera is all this does. The photograph, the reading of it and
  // the rider's confirmation of the total all happen in ReceiptCaptureScreen,
  // which reports back through completeReceiptCapture.
  //
  // This used to be a setInterval counting a random number up to 100, after
  // which the section went green and said "Verified". No camera was opened, no
  // photograph was taken and nothing reached the server — the rider was being
  // shown a progress bar for an upload that did not exist.
  const openReceiptCapture = useCallback((section: RequestSection, index: number) => {
    setReceiptTarget({ index, name: section.name, pinpointId: section.pinpointId, kind: 'RECEIPT' });
  }, []);

  // Same target, different evidence: the photo is of the goods and the rider
  // supplies the figure, because the shop supplied nothing to read.
  const openNoReceiptCapture = useCallback((section: RequestSection, index: number) => {
    setReceiptTarget({ index, name: section.name, pinpointId: section.pinpointId, kind: 'NO_RECEIPT' });
  }, []);

  // The handover. Index -1 because it belongs to no shopping section — it is
  // the errand's own evidence, not a stop's.
  const openHandoverCapture = useCallback(() => {
    setReceiptTarget({ index: -1, name: 'Handover', pinpointId: null, kind: 'PROOF_OF_DELIVERY' });
  }, []);

  // The GCash/Maya path: the rider photographs the receipt the customer shows
  // at the door. Read by Cloud Vision and fraud-checked server-side (same
  // reference-number/amount/same-day rigor the customer's own upload gets) —
  // there is nothing to type here, since a mismatch is refused outright
  // rather than accepted-with-a-flag.
  const openBalanceProofCapture = useCallback(() => {
    setReceiptTarget({ index: -1, name: 'Balance', pinpointId: null, kind: 'RIDER_BALANCE_PROOF' });
  }, []);

  // The cash fallback — for a GCash/Maya customer who insists on paying cash
  // instead, or an ordinary COD delivery. No OCR: the rider photographs the
  // cash and types what they were handed, exactly like NO_RECEIPT's
  // photo-then-typed-amount flow.
  const openCashProofCapture = useCallback(() => {
    setReceiptTarget({ index: -1, name: 'Cash collected', pinpointId: null, kind: 'CASH_COLLECTED' });
  }, []);

  // Read by completeReceiptCapture outside its state updater, where the
  // optimistic upload is tracked exactly once.
  const receiptTargetRef = useRef(receiptTarget);
  receiptTargetRef.current = receiptTarget;

  // A photo the step already showed as saved did not make it. The tick comes
  // off that errand's own slot (whichever is in front by now) and the rider is
  // told what to retake. A slot that is gone (the errand left their hands)
  // has nothing to undo.
  const undoOptimisticProof = useCallback(
    (errandId: string, target: ReceiptTarget, error: unknown) => {
      setProgressByErrand((prev) => {
        const slot = prev[errandId];
        if (!slot) return prev;
        const patch =
          target.kind === 'PROOF_OF_DELIVERY'
            ? undoHandover(slot)
            : undoSectionReceipt(slot, target.index, target.pinpointId);
        return { ...prev, [errandId]: { ...slot, ...patch } };
      });
      showBanner(
        "warning",
        proofRollbackMessage(target.kind === 'PROOF_OF_DELIVERY' ? 'handover' : 'receipt', target.name, error)
      );
    },
    [showBanner]
  );

  const completeReceiptCapture = useCallback((result?: ReceiptCaptureResult) => {
    // Optimistic: the step moves now, the upload finishes behind it.
    const capturing = receiptTargetRef.current;
    if (result?.pending && capturing && frontErrandId) {
      const errandId = frontErrandId;
      trackPending(errandId, result.pending);
      result.pending.catch((err) => undoOptimisticProof(errandId, capturing, err));
    }

    setReceiptTarget((target) => {
      // A handover has no section to tick off, so index -1 marks nothing —
      // same for the two payment-evidence kinds below.
      if (target && target.index >= 0) {
        const targetErrand = activeErrands[0];
        const allPinpoints = targetErrand?.pinpoints ?? [];
        const sections = requestSections(targetErrand);

        updateProgress(frontErrandId, (prev) => {
          const nextCompleted = { ...prev.completedSubtasks, [target.index]: true };
          const prevDeparted = prev.departedStoreIds ?? [];
          const nextDeparted =
            target.pinpointId != null && !prevDeparted.includes(target.pinpointId)
              ? [...prevDeparted, target.pinpointId]
              : prevDeparted;
          const nextDeferred = (prev.deferredStoreIds ?? []).filter((id) => id !== target.pinpointId);

          // Check if more stores remain
          const remainingStores = allPinpoints.length > 0
            ? allPinpoints.filter((p) => !nextDeparted.includes(p.id) && !p.departedAt)
            : sections.filter((_, i) => !nextCompleted[i]);

          const isAllStoresDone = remainingStores.length === 0;

          if (isAllStoresDone) {
            // Final store: automatically transition to Delivering. Told to the
            // server only once the receipts it rests on are there: a save
            // still going is waited for, and one that failed (undone, the
            // rider asked to retake it) means the items are not bought yet.
            if (targetErrand?.id) {
              const purchasedId = targetErrand.id;
              void whenSettled(purchasedId).then((saved) => {
                if (saved) void riderApiService.markItemsPurchased(purchasedId);
              });
            }
            if (isCashCollected(paymentMode)) {
              showBanner("info", `All items purchased. Collect ₱${dueAtDoor.toFixed(2)} COD at doorstep.`);
            } else {
              showBanner("info", "All items purchased. Heading to customer.");
            }
            return {
              completedSubtasks: nextCompleted,
              departedStoreIds: nextDeparted,
              deferredStoreIds: nextDeferred,
              currentStatus: "Delivering" as StatusStep,
              storeArrivalTimestamp: null,
              ...(result?.riderNote ? { riderNote: result.riderNote } : {}),
            };
          } else {
            // Intermediate store: automatically return to Traveling to route to next store
            showBanner("info", "Receipt saved. Routing to next store...");
            return {
              completedSubtasks: nextCompleted,
              departedStoreIds: nextDeparted,
              deferredStoreIds: nextDeferred,
              currentStatus: "Traveling" as StatusStep,
              storeArrivalTimestamp: null,
              ...(result?.riderNote ? { riderNote: result.riderNote } : {}),
            };
          }
        });
      }
      if (target?.kind === 'PROOF_OF_DELIVERY') updateProgress(frontErrandId, { handoverCaptured: true });

      // The GCash/Maya receipt was already validated against the exact
      // balance due — there is no "short" reading of a photo the server
      // would have refused otherwise, so this always counts as collected in
      // full.
      if (target?.kind === 'RIDER_BALANCE_PROOF' && result) {
        updateProgress(frontErrandId, {
          collectedAmount: 'FULL',
          shortPayment: false,
          proofImageId: result.imageId,
          paymentProofKind: 'RIDER_BALANCE_PROOF',
          ...(result.riderNote ? { riderNote: result.riderNote } : {}),
        });
      }

      // Cash, on the other hand, can genuinely come back short — judged
      // against the same due figure CashCollectionInput showed the rider.
      if (target?.kind === 'CASH_COLLECTED' && result) {
        const isFull = Math.abs(result.confirmedTotal - cashDueAtDoor) < 0.01;
        updateProgress(frontErrandId, (prev) => ({
          collectedAmount: isFull ? 'FULL' : String(result.confirmedTotal),
          shortPayment: !isFull,
          proofImageId: result.imageId,
          paymentProofKind: 'CASH_COLLECTED',
          riderNote: result.riderNote ?? prev.riderNote ?? '',
        }));
      }

      return null;
    });
  }, [frontErrandId, activeErrands, dueAtDoor, cashDueAtDoor, paymentMode, showBanner, updateProgress, undoOptimisticProof]);

  const cancelReceiptCapture = useCallback(() => setReceiptTarget(null), []);

  // ─── Firebase Realtime Database: Rider ↔ Dispatcher Chat ──────────────────
  // Persistent 1-to-1 conversation indexed by the rider's account ID,
  // unified across errands and standby periods.
  const riderChatId = rider?.id ? String(rider.id) : null;

  // The chat listeners below may only open once this device has a Firebase
  // identity. The Realtime Database refuses an unauthenticated listen, and the
  // SDK does not retry it when the session arrives later: `refreshAuthToken`
  // re-authenticates the connection but only a reconnect re-sends outstanding
  // listens. A listener opened a moment too early therefore stays dead for the
  // life of the screen, which is precisely how the previous outage stayed
  // invisible.
  const [realtimeReady, setRealtimeReady] = useState(realtimeAuthState() === "signed-in");
  useEffect(
    () => onRealtimeAuthChange((state) => setRealtimeReady(state === "signed-in")),
    []
  );

  // Shared thread or one per dispatcher, switched for every app at once.
  useEffect(() => {
    if (!realtimeReady) return;
    return subscribeRiderChatMode(setRiderChatMode);
  }, [realtimeReady]);

  useEffect(() => {
    if (!riderChatId || !realtimeReady || riderChatMode !== "threads") {
      setDispatcherThreads([]);
      return;
    }
    return subscribeRiderInbox(riderChatId, setDispatcherThreads);
  }, [riderChatId, realtimeReady, riderChatMode]);

  // The conversation on screen: the one the rider picked, else the default.
  const errandDispatcherId = frontErrand?.dispatcherId ?? null;
  const activeThreadUid = useMemo(() => {
    if (riderChatMode !== "threads") return null;
    if (chosenThreadUid) return chosenThreadUid;
    return pickReplyThread(dispatcherThreads, errandDispatcherId);
  }, [riderChatMode, chosenThreadUid, dispatcherThreads, errandDispatcherId]);

  useEffect(() => {
    if (!riderChatId) {
      setDrMessages([]);
      previousDrMessageCountRef.current = 0;
      previousErrandIdForChatRef.current = null;
      return;
    }

    if (!realtimeReady) return;

    const messagesPath = riderMessagesPath(riderChatMode, riderChatId, activeThreadUid);
    if (!messagesPath) {
      setDrMessages([]);
      previousDrMessageCountRef.current = 0;
      previousErrandIdForChatRef.current = null;
      return;
    }
    const messagesRef = ref(database, messagesPath);
    const unsubscribe = onValue(messagesRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setDrMessages([]);
        previousDrMessageCountRef.current = 0;
        return;
      }

      const list: ChatMessage[] = Object.keys(data).map((key, index) => {
        const item = data[key];
        const date = item.timestamp ? new Date(item.timestamp) : new Date();
        const hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const ampm = hours >= 12 ? "PM" : "AM";
        const ts = `${hours > 12 ? hours - 12 : hours}:${minutes} ${ampm}`;

        return {
          id: key || item.timestamp || Date.now() + index,
          from: item.role === "dispatcher" ? "dispatcher" : "rider",
          text: item.text || "",
          imageUrl: item.imageUrl || undefined,
          timestamp: ts,
        };
      });

      list.sort((a, b) => {
        const timeA = typeof a.id === "number" ? a.id : Number(a.id) || 0;
        const timeB = typeof b.id === "number" ? b.id : Number(b.id) || 0;
        return timeA - timeB;
      });
      setDrMessages(list);

      // Check if this is the first snapshot of this conversation or a newly
      // arrived message. Keyed by path: switching threads is a first snapshot.
      if (previousErrandIdForChatRef.current !== messagesPath) {
        previousErrandIdForChatRef.current = messagesPath;
        previousDrMessageCountRef.current = list.length;
      } else if (list.length > previousDrMessageCountRef.current) {
        previousDrMessageCountRef.current = list.length;
        const lastMsg = list[list.length - 1];

        if (lastMsg && lastMsg.from === "dispatcher") {
          // Tactile haptic double-pulse vibration
          try {
            Vibration.vibrate([0, 250, 150, 250]);
          } catch {
            // Ignore vibration error on unsupported platforms/emulators
          }

          // Audible chime via local notification
          AsyncStorage.getItem("@sugo_rider_sounds_enabled")
            .then((storedSounds) => {
              const soundsEnabled = storedSounds !== "false";
              if (soundsEnabled) {
                void Notifications.scheduleNotificationAsync({
                  content: {
                    title: drDispatcherNameRef.current || "Dispatcher",
                    body: lastMsg.text || (lastMsg.imageUrl ? "Sent a photo" : "New message received"),
                    sound: "default",
                    data: { riderId: riderChatId, type: "DISPATCHER_CHAT" },
                    ...(Platform.OS === "android" ? { channelId: "chats" } : {}),
                  },
                  trigger: null,
                }).catch(() => {});
              }
            })
            .catch(() => {});
        }
      } else {
        previousDrMessageCountRef.current = list.length;
      }

      // If new message is from dispatcher and chat modal/screen is closed, mark unread
      const lastMsg = list[list.length - 1];
      if (lastMsg && lastMsg.from === "dispatcher" && !showDRChatRef.current) {
        setUnreadDR(true);
      }
    });

    return () => unsubscribe();
  }, [riderChatId, realtimeReady, riderChatMode, activeThreadUid]);

  // Who the rider is talking to. Shared mode: whichever dispatcher most
  // recently wrote in the one thread. Threads mode: the conversation on
  // screen, or the claiming dispatcher of the errand when none exists yet.
  useEffect(() => {
    if (riderChatMode !== "threads") return;
    const thread = dispatcherThreads.find((t) => t.staffUid === activeThreadUid);
    const fromErrand = activeThreadUid === `staff_${errandDispatcherId}` ? frontErrand?.dispatcherName ?? null : null;
    setDrDispatcherId(activeThreadUid ? activeThreadUid.replace(/^staff_/, "") : null);
    setDrDispatcherName(thread?.dispatcherName ?? fromErrand);
  }, [riderChatMode, dispatcherThreads, activeThreadUid, errandDispatcherId, frontErrand?.dispatcherName]);

  useEffect(() => {
    if (riderChatMode === "threads") return;
    if (!riderChatId) {
      setDrDispatcherId(null);
      setDrDispatcherName(null);
      return;
    }

    if (!realtimeReady) return;

    const dispatcherMetaRef = ref(database, `rider_chats/${riderChatId}/dispatcherMeta`);
    const unsubscribe = onValue(dispatcherMetaRef, (snapshot) => {
      const meta = snapshot.val();
      setDrDispatcherId(meta?.dispatcherId ?? null);
      setDrDispatcherName(meta?.dispatcherName ?? null);
    });

    return () => unsubscribe();
  }, [riderChatId, realtimeReady, riderChatMode]);

  const sendDispatcherMessage = useCallback((text: string, imageUrl?: string) => {
    if ((!text.trim() && !imageUrl) || !riderChatId) return;

    const riderName = rider?.name || (riderProfile?.name ?? "Rider");
    // To the conversation on screen in threads mode; the one shared thread
    // otherwise. Message and summary rows land in one write.
    void sendRiderMessage(riderChatMode, {
      riderId: riderChatId,
      riderName,
      staffUid: activeThreadUid,
      dispatcherName: drDispatcherNameRef.current,
      text: text.trim(),
      imageUrl,
    }).catch((err) => {
      console.warn("[useRiderMission] dispatcher message not sent:", err);
      showBanner("warning", "Message not sent. Check your connection and try again.");
    });
  }, [riderChatId, rider?.name, riderProfile?.name, riderChatMode, activeThreadUid, showBanner]);

  // The errand a held one waits for, or null.
  const deliveryHoldFor = useCallback((errandId: string) => holds.get(errandId) ?? null, [holds]);

  // Holds already told to the rider and dispatcher, as "held>waitingFor", kept
  // per rider so a restart does not tell them again. Null until read.
  const [announcedHolds, setAnnouncedHolds] = useState<string[] | null>(null);
  useEffect(() => {
    setAnnouncedHolds(null);
    if (!rider?.id) return;
    let alive = true;
    void storageAdapter.getJSON<string[]>(announcedHoldsKey(rider.id)).then((stored) => {
      if (alive) setAnnouncedHolds(Array.isArray(stored) ? stored : []);
    });
    return () => {
      alive = false;
    };
  }, [rider?.id]);

  // A hold changes the rider's next stop under them, so it is said when it
  // begins: to the rider, and to the dispatcher, who would otherwise watch an
  // order "on the way" ride off toward a store. When it ends, the rider is told
  // both are ready for the door. Only once errands are loaded, so a launch
  // that has not fetched yet is not read as every hold ending.
  useEffect(() => {
    if (announcedHolds === null || activeMissions === null || !rider?.id) return;
    const current = [...holds].map(([heldId, waitingFor]) => `${heldId}>${waitingFor.id}`);
    const begun = current.filter((key) => !announcedHolds.includes(key));
    const ended = announcedHolds.filter((key) => !current.includes(key));
    if (begun.length === 0 && ended.length === 0) return;

    const inHand = (id: string) => queueOrder.find((e) => e.id === id) ?? null;
    for (const key of begun) {
      const [heldId, waitingForId] = key.split('>');
      const held = inHand(heldId);
      const customer = held?.customer || 'the customer';
      showBanner(
        "info",
        `${formatErrandId(waitingForId)} is ${customer}'s other order. Shop it next. ` +
          `${formatErrandId(heldId)} waits, and both go to the door together.`
      );
      sendDispatcherMessage(
        `Holding ${formatErrandId(heldId)} (${customer}) to deliver it with ${formatErrandId(waitingForId)}, ` +
          `the same customer's order to the same address. Shopping ${formatErrandId(waitingForId)} first.`
      );
    }
    for (const key of ended) {
      const [heldId, waitingForId] = key.split('>');
      // Delivered, cancelled or handed to another rider: nothing to say.
      if (!inHand(heldId) || !inHand(waitingForId)) continue;
      showBanner(
        "success",
        `Both of ${inHand(heldId)?.customer || "the customer"}'s orders are bought. ` +
          `Deliver ${formatErrandId(heldId)} and ${formatErrandId(waitingForId)} together.`
      );
    }

    setAnnouncedHolds(current);
    void storageAdapter.setJSON(announcedHoldsKey(rider.id), current);
  }, [holds, announcedHolds, activeMissions, queueOrder, rider?.id, showBanner, sendDispatcherMessage]);

  const startErrandFirst = useCallback(
    (errandId: string, options?: { leavingStoreId?: number | null }) => {
      const current = activeErrands[0];
      const next = activeErrands.find((e) => e.id === errandId);
      if (!current || !next || current.id === errandId) return false;
      // Held for the same customer's other order: it goes with that one, and
      // starting it first would only be undone by the hold.
      if (holds.has(errandId)) return false;
      // A camera open on the errand in hand would file its photo against the
      // wrong one the moment the front changed.
      if (receiptTarget) return false;
      const currentSlot = progressByErrand[current.id] ?? DEFAULT_PROGRESS;
      if (!canSwitchWorkingErrand(currentSlot.currentStatus)) return false;

      const leaving = options?.leavingStoreId ?? null;
      // Walking out of the shop: the set-aside errand goes back to travelling,
      // and the shop it was waiting on is visited last when it resumes.
      updateProgress(current.id, (prev) => {
        const deferred = prev.deferredStoreIds ?? [];
        return {
          currentStatus: "Traveling",
          storeArrivalTimestamp: null,
          deferredStoreIds:
            leaving != null && !deferred.includes(leaving) ? [...deferred, leaving] : deferred,
        };
      });

      setWorkingErrandId(errandId);
      if (rider?.id) void storageAdapter.setJSON(workingErrandKey(rider.id), errandId);

      showBanner(
        "info",
        `Started ${formatErrandId(next.id)} first. ${formatErrandId(current.id)} is next in your queue.`
      );
      // The dispatcher planned the other order; they are told rather than left
      // to wonder why the rider rode off toward someone else's store.
      sendDispatcherMessage(
        `Starting ${formatErrandId(next.id)} (${next.customer || "customer"}) first. ` +
          `${formatErrandId(current.id)} (${current.customer || "customer"}) is set aside and next in my queue.`
      );
      return true;
    },
    [activeErrands, holds, receiptTarget, progressByErrand, updateProgress, rider?.id, showBanner, sendDispatcherMessage]
  );

  return {
    // State
    phase,
    isOffline,
    currentStatus,
    showComplete,
    completedSubtasks,
    receiptTarget,
    handoverCaptured,
    openReceiptCapture,
    openNoReceiptCapture,
    openHandoverCapture,
    openBalanceProofCapture,
    openCashProofCapture,
    shortPayment,
    completeReceiptCapture,
    cancelReceiptCapture,
    uploadingSubtask,
    activeMissions,
    offeredErrands,
    activeErrands,
    workingErrand: frontErrand,
    progressFor,
    startErrandFirst,
    deliveryHoldFor,
    isMissionAccepted,
    isAccepting,
    showDeclineModal,
    declineReason,
    showWaybill,
    showDRChat,
    drMessages,
    drDispatcherId,
    drDispatcherName,
    riderChatMode,
    dispatcherThreads,
    activeThreadUid,
    selectDispatcherThread: setChosenThreadUid,
    paymentMode,
    unreadDR,
    setUnreadDR,
    collectedAmount,
    riderNote,
    proofImageId,
    paymentProofKind,
    showUploadModal,
    uploadProgress,
    errorMessage,
    banner,

    // Computed
    stepIndex,
    isDelivered,
    errand,
    dueAtDoor,
    cashDueAtDoor,
    completedToday,
    riderProfile,
    deliveredErrands,

    // Actions
    refresh,
    requestHalfPayment,
    isRequestingHalf,
    dismissBanner,
    advanceStatus,
    returnToTraveling,
    deferredStoreIds,
    departedStoreIds,
    storeArrivalTimestamp,
    deferStore,
    finishStoreShopping,
    acceptMission,
    declineMission,
    expireOffer,
    resetForNextErrand,
    sendDispatcherMessage,
    setDeclineReason,
    setShowDeclineModal,
    setShowWaybill,
    setShowDRChat,
    setShowUploadModal,
    setActiveMissions,
  };
}
