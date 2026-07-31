/**
 * useRiderMission — Central business logic hook for the Rider Mobile App.
 * Encapsulates ALL state management and action handlers from RiderPortal.tsx.
 * Zero business logic in UI components per separation-of-concerns rules.
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { Alert } from "react-native";
import {
  StatusStep,
  STATUS_STEPS,
  STEP_META,
  ChatMessage,
  Errand,
  MergedErrand,
  RiderProfile,
} from "../types/rider";
import {
  riderCurrentErrand,
  riderEarnings,
  errands,
  merchants,
  riderProfile,
} from "../data/mockData";
import { useRiderAuth } from "../context/RiderAuthContext";
import { riderApiService } from "../config/apiConfig";

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
  riderProfile: RiderProfile;
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
  const { rider, token } = useRiderAuth();

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
  const [paymentMode, setPaymentMode] = useState<string>("Cash on Delivery");
  const [unreadDR, setUnreadDR] = useState(false);
  const [collectedAmount, setCollectedAmount] = useState<string>("");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Live profile & errand state fetched from errand_system_db via API
  const [liveProfile, setLiveProfile] = useState<RiderProfile | null>(null);
  const [dbActiveErrand, setDbActiveErrand] = useState<Errand | null>(null);

  useEffect(() => {
    if (rider && rider.id) {
      riderApiService.fetchRiderProfile(rider.id, token || undefined).then((prof) => {
        if (prof) {
          const initials = (prof.name || rider.name || "Rider")
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase()
            .substring(0, 2);

          setLiveProfile({
            id: String(prof.id || rider.id),
            name: prof.name || (prof.firstName ? `${prof.firstName} ${prof.lastName || ""}`.trim() : rider.name),
            initials: initials || "R",
            riderId: `RDR-${String(prof.id || rider.id).padStart(3, "0")}`,
            phone: prof.phone || rider.phone || "",
            email: prof.email || `${prof.username || rider.username}@sugo.ph`,
            vehicleType: prof.vehicle || "Motorcycle",
            plateNumber: "ABC-1234",
            rating: 4.8,
            totalTrips: 24,
            joinDate: prof.createdAt ? new Date(prof.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "Active",
            status: prof.status === "Inactive" ? "Inactive" : "Active",
          });
        }
      });

      riderApiService.fetchActiveErrand(rider.id, token || undefined).then((active) => {
        if (active) {
          setDbActiveErrand(active);
          setIsMissionAccepted(true);
        }
      });
    }
  }, [rider, token]);

  const activeProfile: RiderProfile = useMemo(() => {
    if (liveProfile) return liveProfile;
    if (rider) {
      const initials = (rider.name || "Rider")
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .substring(0, 2);
      return {
        id: String(rider.id),
        name: rider.name || "Rider",
        initials: initials || "R",
        riderId: `RDR-${String(rider.id).padStart(3, "0")}`,
        phone: rider.phone || "",
        email: `${rider.username || "rider"}@sugo.ph`,
        vehicleType: rider.vehicle || "Motorcycle",
        plateNumber: "ABC-1234",
        rating: 4.8,
        totalTrips: 12,
        joinDate: "Active",
        status: "Active",
      };
    }
    return riderProfile;
  }, [liveProfile, rider]);

  // ─── Computed Values ───────────────────────────────────────────────────────
  const stepIndex = STATUS_STEPS.indexOf(currentStatus);
  const isDelivered = currentStatus === "Delivered";

  const errand: MergedErrand = useMemo(() => {
    if (dbActiveErrand) {
      return {
        ...dbActiveErrand,
        type: dbActiveErrand.type || "Pabili",
        customer: dbActiveErrand.customerName || dbActiveErrand.customer || "Customer",
        customerPhone: dbActiveErrand.customerPhone || "09170000000",
        address: dbActiveErrand.deliveryAddress || dbActiveErrand.address || "Tacurong City",
        landmark: dbActiveErrand.landmark || "",
        paymentMode: (dbActiveErrand.paymentMethod || dbActiveErrand.paymentMode || "Cash on Delivery") as any,
        status: (dbActiveErrand.status || "Assigned") as any,
        amount: dbActiveErrand.totalCost || dbActiveErrand.amount || 0,
        serviceFee: dbActiveErrand.deliveryFee || dbActiveErrand.serviceFee || 70,
        createdAt: dbActiveErrand.createdAt || "Now",
        updatedAt: dbActiveErrand.updatedAt || "Now",
        distance: dbActiveErrand.distance || "2.5 km",
      };
    }
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
  }, [dbActiveErrand, activeMissions]);

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
    riderProfile: activeProfile,
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
