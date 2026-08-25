/**
 * useRiderMission — Central business logic hook for the Rider Mobile App.
 * Encapsulates ALL state management and action handlers from RiderPortal.tsx.
 * Zero business logic in UI components per separation-of-concerns rules.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Alert } from "react-native";
import { StatusStep, STATUS_STEPS, ChatMessage, Errand, MergedErrand, RiderProfile } from "../types/rider";
import { useRiderAuth } from "../context/RiderAuthContext";
import { riderApiService } from "../config/apiConfig";
import { shouldPersistStatusChange, STEP_TO_API } from "../services/errandStatus";
import { useConnectivity } from "./useConnectivity";
import { storageAdapter, WAYBILL_CACHE_KEY } from "../adapters/storageAdapter";
import { submitSettlement, flushPendingSettlements } from "../services/settlementQueue";
import { ref, push, onValue } from "firebase/database";
import { database } from "../firebase/config";
import { formatEarnings, mergeEarnings } from '../utils/earnings';
import type { RequestSection } from '../services/requestSections';

/** Which section of the shopping list the open camera is filing a receipt for. */
export interface ReceiptTarget {
  index: number;
  name: string;
  pinpointId: number | null;
  /**
   * What the camera is capturing. RECEIPT reads the paper; NO_RECEIPT
   * photographs the goods at a shop that prints nothing; PROOF_OF_DELIVERY is
   * the handover at the customer's door.
   */
  kind: 'RECEIPT' | 'NO_RECEIPT' | 'PROOF_OF_DELIVERY';
}

interface WaybillCache {
  prof: any;
  errandList: Errand[];
}

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
  isMissionAccepted: boolean;
  isAccepting: boolean;
  showDeclineModal: boolean;
  declineReason: string;
  showWaybill: boolean;
  showDRChat: boolean;
  drMessages: ChatMessage[];
  paymentMode: string;
  unreadDR: boolean;
  collectedAmount: string;
  showUploadModal: boolean;
  uploadProgress: number;
  errorMessage: string | null;

  // Computed
  stepIndex: number;
  isDelivered: boolean;
  errand: MergedErrand | null;
  completedToday: number;
  riderProfile: RiderProfile | null;
  deliveredErrands: Errand[];

  // Actions
  refresh: () => void;
  advanceStatus: () => void;
  acceptMission: () => void;
  declineMission: () => Promise<void>;
  resetForNextErrand: () => void;
  /** The section awaiting a receipt photo, or null when the camera is closed. */
  receiptTarget: ReceiptTarget | null;
  /** True once the door photo is taken, which is what releases "Delivered". */
  handoverCaptured: boolean;
  openReceiptCapture: (section: RequestSection, index: number) => void;
  openNoReceiptCapture: (section: RequestSection, index: number) => void;
  openHandoverCapture: () => void;
  reportShortPayment: () => void;
  /** True once the rider has said the customer paid less than the total. */
  shortPayment: boolean;
  completeReceiptCapture: () => void;
  cancelReceiptCapture: () => void;
  sendDispatcherMessage: (text: string) => void;
  setDeclineReason: (reason: string) => void;
  setCollectedAmount: (amount: string) => void;
  setShowDeclineModal: (show: boolean) => void;
  setShowWaybill: (show: boolean) => void;
  setShowDRChat: (show: boolean) => void;
  setShowUploadModal: (show: boolean) => void;
  setActiveMissions: (missions: Errand[] | null) => void;
}

const ACTIVE_STATUSES: Errand["status"][] = ["Assigned", "Traveling"];

export function useRiderMission(): UseRiderMissionReturn {
  const { rider } = useRiderAuth();

  // ─── Core State ────────────────────────────────────────────────────────────
  const [currentStatus, setCurrentStatus] = useState<StatusStep>("Traveling");
  const [showComplete, setShowComplete] = useState(false);
  const [completedSubtasks, setCompletedSubtasks] = useState<Record<number, boolean>>({});
  const [uploadingSubtask, setUploadingSubtask] = useState<number | null>(null);
  const [receiptTarget, setReceiptTarget] = useState<ReceiptTarget | null>(null);
  // The door photo, which gates the final tap.
  const [handoverCaptured, setHandoverCaptured] = useState(false);
  // True when the rider reported a shortfall rather than confirming the total.
  const [shortPayment, setShortPayment] = useState(false);
  const [activeMissions, setActiveMissions] = useState<Errand[] | null>(null);
  const [isMissionAccepted, setIsMissionAccepted] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [showWaybill, setShowWaybill] = useState(false);
  const [showDRChat, setShowDRChat] = useState(false);
  const [drMessages, setDrMessages] = useState<ChatMessage[]>([]);
  const [paymentMode, setPaymentMode] = useState<string>("Cash on Delivery");
  const [unreadDR, setUnreadDR] = useState(false);
  const [collectedAmount, setCollectedAmount] = useState<string>("");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Real data fetched from the backend — no mock fallbacks. Both start
  // genuinely unknown (null) until the fetch resolves.
  const [riderProfile, setRiderProfile] = useState<RiderProfile | null>(null);
  const [deliveredErrands, setDeliveredErrands] = useState<Errand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const refresh = useCallback(() => setRefreshCounter((c) => c + 1), []);

  // Real device connectivity — replaces the old manually-toggled simulation.
  // Tied to the first active mission, since that's the errand a connectivity
  // incident during an active delivery should be attributed to.
  const { isConnected } = useConnectivity(rider?.id, activeMissions?.[0]?.id);
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
    (prof: any, errandList: Errand[]) => {
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
      setIsMissionAccepted(active.length > 0 && active[0].status !== "Assigned");
    },
    [rider]
  );

  useEffect(() => {
    if (!rider?.id) {
      setIsLoading(false);
      return;
    }
    let isMounted = true;
    setIsLoading(true);
    setErrorMessage(null);

    Promise.all([
      riderApiService.fetchRiderProfile(rider.id),
      riderApiService.fetchRiderErrands(rider.id),
    ])
      .then(([prof, errandList]) => {
        if (!isMounted) return;
        applyFetchedData(prof, errandList);
        // Cache the live waybill so a later fetch failure (e.g. the device
        // going offline mid-shift) has real, recent data to fall back to
        // instead of a bare error — see the catch branch below.
        void storageAdapter.setJSON<WaybillCache>(WAYBILL_CACHE_KEY, { prof, errandList });
      })
      .catch(async () => {
        if (!isMounted) return;
        const cached = await storageAdapter.getJSON<WaybillCache>(WAYBILL_CACHE_KEY);
        if (cached) {
          applyFetchedData(cached.prof, cached.errandList);
        } else {
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
      id: activeMissions.map((e) => e.id).join(" + "),
      details: activeMissions.map((e) => e.details).filter(Boolean).join(" | "),
    };
  }, [activeMissions]);

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

  const advanceStatus = useCallback(async () => {
    if (!errand || !activeMissions || activeMissions.length === 0) return;
    if (currentStatus === "Delivering" && paymentMode === "Cash on Delivery" && !collectedAmount) {
      Alert.alert("Validation Error", "Please enter the collected amount.");
      return;
    }

    const currentIndex = STATUS_STEPS.indexOf(currentStatus);
    if (currentIndex >= STATUS_STEPS.length - 1) return;
    const next = STATUS_STEPS[currentIndex + 1];

    if (shouldPersistStatusChange(currentStatus, next)) {
      // Operate on each underlying errand's real id — `errand.id` here may be a
      // "id1 + id2" string joined for display when 2+ missions are merged into
      // one card, which the backend can never resolve as a single errand id.
      const results = await Promise.all(
        activeMissions.map((m) => riderApiService.updateErrandStatus(m.id, STEP_TO_API[next]))
      );
      if (results.some((ok) => !ok)) {
        Alert.alert("Error", "Failed to update the errand status on the server. Please try again.");
        return;
      }
    }

    // Separate from the coarse status PATCH above — "Delivering" doesn't change
    // the underlying ErrandStatus (both stay IN_TRANSIT per STEP_TO_API), but
    // the customer's tracking screen needs to know this moment happened, so it
    // gets its own persisted signal (itemsPurchasedAt).
    if (next === "Delivering") {
      const results = await Promise.all(
        activeMissions.map((m) => riderApiService.markItemsPurchased(m.id))
      );
      if (results.some((ok) => !ok)) {
        Alert.alert("Error", "Failed to record items purchased on the server. Please try again.");
        return;
      }
    }

    setCurrentStatus(next);
    setCompletedSubtasks({});

    if (next === "Delivered") {
      setShowComplete(true);
      // The rider's share, not the gross fee this used to announce.
      Alert.alert("Errand Delivered!", `Earnings of ${formatEarnings(errand)} recorded.`);

      if (paymentMode === "Cash on Delivery" && collectedAmount) {
        if (!shortPayment) {
          // The ordinary case. No amount is sent at all — the server settles
          // each errand at its own total, which is why a tampered client cannot
          // report a smaller one.
          for (const m of activeMissions) {
            void submitSettlement(m.id, { collectedInFull: true });
          }
        } else {
          const totalCollected = parseFloat(collectedAmount);

          // A reported shortfall. Split across each real underlying errand in
          // proportion to what each expects — SettlementRecord is one row per
          // real errand, and posting the combined figure against every one of
          // them would multiply the cash that actually changed hands.
          if (!isNaN(totalCollected) && totalCollected >= 0) {
            const totalExpected = activeMissions.reduce((s, m) => s + m.amount, 0);
            for (const m of activeMissions) {
              const share =
                totalExpected > 0
                  ? (m.amount / totalExpected) * totalCollected
                  : totalCollected / activeMissions.length;
              void submitSettlement(m.id, {
                collectedAmount: Math.round(share * 100) / 100,
                shortReason: "Reported short by the rider at handover.",
              });
            }
          }
        }
      }
    } else {
      Alert.alert("Status Updated", `Status updated: ${next}`);
    }
  }, [currentStatus, paymentMode, collectedAmount, shortPayment, errand, activeMissions]);

  const acceptMission = useCallback(async () => {
    if (!activeMissions || activeMissions.length === 0 || isAccepting) return;
    setIsAccepting(true);
    try {
      // Accept every underlying errand by its real id, not the merged display id.
      await Promise.all(activeMissions.map((m) => riderApiService.acceptErrand(m.id)));
      setIsMissionAccepted(true);
      setCurrentStatus("Traveling");
      Alert.alert("Task Accepted!", "Drive safely.");
    } catch {
      Alert.alert("Error", "Failed to accept the errand. Please try again.");
    } finally {
      setIsAccepting(false);
    }
  }, [activeMissions, isAccepting]);

  const declineMission = useCallback(async () => {
    if (!declineReason.trim() || !activeMissions || activeMissions.length === 0) return;
    try {
      // Decline every underlying errand by its real id, not the merged display id.
      await Promise.all(activeMissions.map((m) => riderApiService.declineErrand(m.id, declineReason.trim())));
    } catch {
      Alert.alert("Error", "Failed to decline the errand. Please try again.");
      return;
    }
    Alert.alert("Task Declined", "The dispatcher has been notified.");
    setShowDeclineModal(false);
    setDeclineReason("");
    setActiveMissions(null);
    setIsMissionAccepted(false);
  }, [declineReason, activeMissions]);

  const resetForNextErrand = useCallback(() => {
    setShowComplete(false);
    setCurrentStatus("Traveling");
    // Evidence belongs to one errand. Carrying it forward would let the next
    // delivery close on the previous one's door photo.
    setHandoverCaptured(false);
    setActiveMissions(null);
    setIsMissionAccepted(false);
    setCompletedSubtasks({});
    setCollectedAmount("");
    refresh();
    Alert.alert("Ready!", "Stand by for the dispatcher's assignment.");
  }, [refresh]);

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
  /**
   * The customer paid less than the total.
   *
   * Flips the panel into its exception state; the amount is entered there
   * rather than through Alert.prompt, which exists only on iOS and would have
   * left this path dead on the platform every rider actually uses.
   *
   * This is the one figure the rider still types, because nothing else knows
   * what changed hands. It is an exception that gets flagged and reviewed, not
   * the default the old free-text field made it.
   */
  const reportShortPayment = useCallback(() => {
    setShortPayment(true);
    setCollectedAmount("");
  }, []);

  const openHandoverCapture = useCallback(() => {
    setReceiptTarget({ index: -1, name: 'Handover', pinpointId: null, kind: 'PROOF_OF_DELIVERY' });
  }, []);

  const completeReceiptCapture = useCallback(() => {
    setReceiptTarget((target) => {
      // A handover has no section to tick off, so index -1 marks nothing.
      if (target && target.index >= 0) {
        setCompletedSubtasks((prev) => ({ ...prev, [target.index]: true }));
      }
      if (target?.kind === 'PROOF_OF_DELIVERY') setHandoverCaptured(true);
      return null;
    });
  }, []);

  const cancelReceiptCapture = useCallback(() => setReceiptTarget(null), []);

  // ─── Firebase Realtime Database: Rider ↔ Dispatcher Chat ──────────────────
  const activeErrandId = activeMissions?.[0]?.id;

  useEffect(() => {
    if (!activeErrandId) {
      setDrMessages([]);
      return;
    }

    const messagesRef = ref(database, `rider_chats/${activeErrandId}/messages`);
    const unsubscribe = onValue(messagesRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setDrMessages([]);
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
          id: item.timestamp || Date.now() + index,
          from: item.role === "dispatcher" ? "dispatcher" : "rider",
          text: item.text || "",
          timestamp: ts,
        };
      });

      list.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
      setDrMessages(list);

      // If new message is from dispatcher and chat modal is closed, mark unread
      const lastMsg = list[list.length - 1];
      if (lastMsg && lastMsg.from === "dispatcher" && !showDRChat) {
        setUnreadDR(true);
      }
    });

    return () => unsubscribe();
  }, [activeErrandId, showDRChat]);

  const sendDispatcherMessage = useCallback((text: string) => {
    if (!text.trim() || !activeErrandId) return;

    const riderName = rider?.name || (riderProfile?.name ?? "Rider");
    const messagesRef = ref(database, `rider_chats/${activeErrandId}/messages`);

    push(messagesRef, {
      senderId: String(rider?.id || "rider-1"),
      senderName: riderName,
      role: "rider",
      text: text.trim(),
      timestamp: Date.now(),
    });

    // Update meta summary
    const metaRef = ref(database, `rider_chats/${activeErrandId}/meta`);
    push(metaRef, {
      lastMessage: text.trim(),
      lastSender: "rider",
      updatedAt: Date.now(),
    });
  }, [activeErrandId, rider, riderProfile]);

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
    reportShortPayment,
    shortPayment,
    completeReceiptCapture,
    cancelReceiptCapture,
    uploadingSubtask,
    activeMissions,
    isMissionAccepted,
    isAccepting,
    showDeclineModal,
    declineReason,
    showWaybill,
    showDRChat,
    drMessages,
    paymentMode,
    unreadDR,
    collectedAmount,
    showUploadModal,
    uploadProgress,
    errorMessage,

    // Computed
    stepIndex,
    isDelivered,
    errand,
    completedToday,
    riderProfile,
    deliveredErrands,

    // Actions
    refresh,
    advanceStatus,
    acceptMission,
    declineMission,
    resetForNextErrand,
    sendDispatcherMessage,
    setDeclineReason,
    setCollectedAmount,
    setShowDeclineModal,
    setShowWaybill,
    setShowDRChat,
    setShowUploadModal,
    setActiveMissions,
  };
}
