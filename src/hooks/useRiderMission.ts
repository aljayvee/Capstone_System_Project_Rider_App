/**
 * useRiderMission — Central business logic hook for the Rider Mobile App.
 * Encapsulates ALL state management and action handlers from RiderPortal.tsx.
 * Zero business logic in UI components per separation-of-concerns rules.
 */

import { useState, useCallback, useMemo } from "react";
import { Alert } from "react-native";
import {
  StatusStep,
  STATUS_STEPS,
  STEP_META,
  ChatMessage,
  Errand,
  MergedErrand,
} from "../types/rider";
import {
  riderCurrentErrand,
  riderEarnings,
  errands,
  merchants,
  riderProfile,
} from "../data/mockData";

export interface UseRiderMissionReturn {
  // State
  isOffline: boolean;
  currentStatus: StatusStep;
  showComplete: boolean;
  completedSubtasks: Record<number, boolean>;
  uploadingSubtask: number | null;
  activeMissions: Errand[] | null;
  isMissionAccepted: boolean;
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

  // Computed
  stepIndex: number;
  isDelivered: boolean;
  errand: MergedErrand;
  completedToday: number;
  riderProfile: typeof riderProfile;
  riderEarnings: typeof riderEarnings;
  deliveredErrands: Errand[];
  merchants: typeof merchants;

  // Actions
  toggleOffline: () => void;
  advanceStatus: () => void;
  acceptMission: () => void;
  declineMission: () => void;
  resetForNextErrand: () => void;
  startSubtaskUpload: (index: number, sectionName: string) => void;
  sendDispatcherMessage: (text: string) => void;
  setDeclineReason: (reason: string) => void;
  setCollectedAmount: (amount: string) => void;
  setShowDeclineModal: (show: boolean) => void;
  setShowWaybill: (show: boolean) => void;
  setShowDRChat: (show: boolean) => void;
  setShowUploadModal: (show: boolean) => void;
  setActiveMissions: (missions: Errand[] | null) => void;
}

export function useRiderMission(): UseRiderMissionReturn {
  // ─── Core State ────────────────────────────────────────────────────────────
  const [isOffline, setIsOffline] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<StatusStep>("Traveling");
  const [showComplete, setShowComplete] = useState(false);
  const [completedSubtasks, setCompletedSubtasks] = useState<Record<number, boolean>>({});
  const [uploadingSubtask, setUploadingSubtask] = useState<number | null>(null);
  const [activeMissions, setActiveMissions] = useState<Errand[] | null>(null);
  const [isMissionAccepted, setIsMissionAccepted] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [showWaybill, setShowWaybill] = useState(false);
  const [showDRChat, setShowDRChat] = useState(false);
  const [drMessages, setDrMessages] = useState<ChatMessage[]>([]);
  const [paymentMode, setPaymentMode] = useState<string>(riderCurrentErrand.paymentMode);
  const [unreadDR, setUnreadDR] = useState(false);
  const [collectedAmount, setCollectedAmount] = useState<string>("");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // ─── Computed Values ───────────────────────────────────────────────────────
  const stepIndex = STATUS_STEPS.indexOf(currentStatus);
  const isDelivered = currentStatus === "Delivered";

  const errand: MergedErrand = useMemo(() => {
    if (activeMissions && activeMissions.length > 0) {
      return {
        ...activeMissions[0],
        distance: activeMissions[0].distance || "2.5 km",
        serviceFee: activeMissions.reduce((s, e) => s + e.serviceFee, 0),
        amount: activeMissions.reduce((s, e) => s + (e.amount || 0), 0),
        type: Array.from(new Set(activeMissions.map((e) => e.type.replace(/\//g, "&")))).join(" & "),
        paymentMode: activeMissions[0].paymentMode || "Cash on Delivery",
        customer: activeMissions[0].customer,
        customerPhone: activeMissions[0].customerPhone,
        id: activeMissions.map((e) => e.id).join(" + "),
        details: activeMissions
          .map((e) => e.details)
          .filter(Boolean)
          .join(" | "),
      };
    }
    return riderCurrentErrand as MergedErrand;
  }, [activeMissions]);

  const completedToday = useMemo(
    () => errands.filter((e) => e.status === "Delivered" && e.riderId === 1).length,
    []
  );

  const deliveredErrands = useMemo(
    () => errands.filter((e) => e.status === "Delivered"),
    []
  );

  // ─── Actions ───────────────────────────────────────────────────────────────

  const toggleOffline = useCallback(() => {
    setIsOffline((prev) => {
      const next = !prev;
      Alert.alert(
        next ? "Offline Mode Activated" : "Online — Syncing data...",
        next ? "Accessing cached data." : "Network restored."
      );
      return next;
    });
  }, []);

  const advanceStatus = useCallback(() => {
    if (currentStatus === "En Route" && paymentMode === "Cash on Delivery" && !collectedAmount) {
      Alert.alert("Validation Error", "Please enter the collected amount.");
      return;
    }

    const currentIndex = STATUS_STEPS.indexOf(currentStatus);
    if (currentIndex < STATUS_STEPS.length - 1) {
      const next = STATUS_STEPS[currentIndex + 1];
      setCurrentStatus(next);
      setCompletedSubtasks({});

      if (next === "Delivered") {
        setShowComplete(true);
        Alert.alert("Errand Delivered! 🎉", `Earnings of ₱${errand.serviceFee} recorded.`);
      } else {
        Alert.alert("Status Updated", `Status updated: ${next}`);
      }
    }
  }, [currentStatus, paymentMode, collectedAmount, errand.serviceFee]);

  const acceptMission = useCallback(() => {
    setIsMissionAccepted(true);
    Alert.alert("Task Accepted!", "Drive safely.");
  }, []);

  const declineMission = useCallback(() => {
    if (!declineReason.trim()) return;
    Alert.alert("Task Declined", "The dispatcher has been notified.");
    setShowDeclineModal(false);
    setDeclineReason("");
    setActiveMissions(null);
    setIsMissionAccepted(false);
  }, [declineReason]);

  const resetForNextErrand = useCallback(() => {
    setShowComplete(false);
    setCurrentStatus("Traveling");
    setActiveMissions(null);
    setIsMissionAccepted(false);
    setCompletedSubtasks({});
    setCollectedAmount("");
    Alert.alert("Ready!", "Stand by for the dispatcher's assignment.");
  }, []);

  const startSubtaskUpload = useCallback((index: number, sectionName: string) => {
    setUploadingSubtask(index);
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 15) + 5;
      if (progress >= 100) {
        clearInterval(interval);
        setCompletedSubtasks((prev) => ({ ...prev, [index]: true }));
        setUploadingSubtask(null);
        Alert.alert("Photo Verified", `Photo verified for ${sectionName}`);
      }
    }, 150);
  }, []);

  const sendDispatcherMessage = useCallback((text: string) => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    const ts = `${hours > 12 ? hours - 12 : hours}:${minutes} ${ampm}`;

    const msg: ChatMessage = {
      id: Date.now(),
      from: "rider",
      text,
      timestamp: ts,
    };
    setDrMessages((prev) => [...prev, msg]);
  }, []);

  return {
    // State
    isOffline,
    currentStatus,
    showComplete,
    completedSubtasks,
    uploadingSubtask,
    activeMissions,
    isMissionAccepted,
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

    // Computed
    stepIndex,
    isDelivered,
    errand,
    completedToday,
    riderProfile,
    riderEarnings,
    deliveredErrands,
    merchants,

    // Actions
    toggleOffline,
    advanceStatus,
    acceptMission,
    declineMission,
    resetForNextErrand,
    startSubtaskUpload,
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
