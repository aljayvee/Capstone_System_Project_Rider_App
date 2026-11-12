import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import HalfPaymentSettledModal from '../components/HalfPaymentSettledModal';
import { useRiderMission, type UseRiderMissionReturn } from '../hooks/useRiderMission';
import { useRiderLocationBroadcast, type RiderOwnLocation } from '../hooks/useRiderLocationBroadcast';
import { useRiderMissionSocket, type ItemSubstituteNotice } from '../hooks/useRiderMissionSocket';
import { useRegisterPushToken } from '../hooks/useRegisterPushToken';
import { useStoreArrival, type StoreArrivalState } from '../hooks/useStoreArrival';
import { useOfferReminder } from '../hooks/useOfferReminder';
import { useRiderAuth } from './RiderAuthContext';
import { reportStoreArrival } from '../services/arrivalQueue';

interface RiderMissionContextValue extends UseRiderMissionReturn {
  riderLocation: RiderOwnLocation | null;
  socketConnected: boolean;
  /** Whether the rider is inside a store's circle, and whether that moved them. */
  storeArrival: StoreArrivalState;
  substituteNotice: ItemSubstituteNotice | null;
  dismissSubstituteNotice: () => void;
}

const RiderMissionContext = createContext<RiderMissionContextValue | undefined>(undefined);

// Hoists the single copy of mission state, the GPS watch, and the real-time
// socket listener so every screen (Home, Task, History, Profile) observes the
// same data instead of each mounting its own independent useRiderMission().
export const RiderMissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { rider, isOnline: isOnDuty } = useRiderAuth();
  const mission = useRiderMission();

  // Destructure the new shape: `location` (GPS data) + `ModalElement` (the
  // background-location consent modal rendered at provider level so it floats
  // over any screen without prop-drilling). Tracking now runs for the whole
  // on-duty session (not just an active delivery) via a background task, with
  // `mission.phase === 'active'` only controlling its update cadence.
  // The errand in hand, never the merged card: with two errands its id is
  // "A + B", which no breadcrumb upload (/errands/:id/track) and no viewer
  // matching riders/{id}.activeErrandId can resolve. An offer's id only when
  // nothing is accepted yet, as before.
  const { location: riderLocation, ModalElement: BgLocationModal } = useRiderLocationBroadcast(
    rider?.id,
    isOnDuty,
    mission.phase === 'active',
    mission.workingErrand?.id ?? mission.offeredErrands[0]?.id
  );

  const {
    connected: socketConnected,
    substituteNotice,
    dismissSubstituteNotice,
  } = useRiderMissionSocket(rider?.id, mission.refresh);
  useRegisterPushToken(rider?.id, mission.refresh);

  // The nudge for an offer nobody has looked at yet. Here rather than on Home so
  // it survives the rider being on another tab, or the app being backgrounded —
  // which is the only situation it exists for.
  useOfferReminder(mission.phase === 'offered', mission.errand?.id);

  // Reaching a store advances the step on its own. Hoisted here beside the GPS
  // watch so it runs once for the session rather than per screen — mounting it
  // in a component would arrive twice whenever two screens were alive at once.
  // Watches the errand in hand only. Fed the merged card, it watched every
  // queued errand's shops too, so riding past a queued errand's store moved
  // the errand in hand to "At Store".
  const working = mission.workingErrand;
  const storeArrival = useStoreArrival({
    pinpoints: working?.pinpoints,
    // The customer's door is the last waypoint of the run.
    destination:
      working?.deliveryLatitude != null && working?.deliveryLongitude != null
        ? { latitude: working.deliveryLatitude, longitude: working.deliveryLongitude }
        : null,
    location: riderLocation,
    currentStatus: mission.currentStatus,
    isActive: mission.phase === 'active' && mission.isMissionAccepted,
    onArrived: async (stop) => {
      if (working && stop.id > 0 && mission.currentStatus === 'Traveling') {
        await reportStoreArrival(working.id, stop.id);
      }
      // Guard: arrival only ever moves Traveling -> At Store. Never At Store
      // (already inside), and never Delivering -> Delivered: only the rider's
      // "I've handed it over" completes a delivery (useStoreArrival does not
      // arrive at the door; this holds even if it ever did).
      if (mission.currentStatus === 'Traveling') {
        mission.advanceStatus();
      }
    },
    deferredStopIds: mission.deferredStoreIds,
    completedStopIds: mission.departedStoreIds,
  });

  // "The customer settled the payment with the dispatcher." Raised when the
  // front errand's half moves from owed to paid, however the app learned it:
  // the socket's refresh, or the refresh on coming back to the foreground. So a
  // rider whose phone was in their pocket at that moment still sees it.
  // Here rather than on a screen, so it reaches them on any tab.
  const [settledNotice, setSettledNotice] = useState<{
    errandId: string;
    customer: string;
    balanceDue: number;
  } | null>(null);
  const lastPlanState = useRef<Record<string, string>>({});
  const frontErrand = mission.workingErrand;
  const frontPlan = frontErrand?.paymentPlan;
  useEffect(() => {
    if (!frontErrand || !frontPlan?.hasLedger) return;
    const previous = lastPlanState.current[frontErrand.id];
    lastPlanState.current[frontErrand.id] = frontPlan.state;
    const nowPaid = frontPlan.state === 'AWAITING_BALANCE' || frontPlan.state === 'SETTLED';
    if (previous === 'AWAITING_UPFRONT' && nowPaid && frontPlan.halfPaymentRequestedAt) {
      setSettledNotice({
        errandId: frontErrand.id,
        customer: frontErrand.customer || 'The customer',
        balanceDue: frontPlan.balanceDue,
      });
    }
  }, [frontErrand?.id, frontPlan?.state]);

  const headOut = () => {
    const notice = settledNotice;
    setSettledNotice(null);
    // Only moves the errand it was about, and only off the step it was held
    // on. Anywhere else, closing it is all that is wanted.
    if (notice && mission.workingErrand?.id === notice.errandId && mission.currentStatus === 'At Store') {
      mission.advanceStatus();
    }
  };

  return (
    <RiderMissionContext.Provider
      value={{
        ...mission,
        riderLocation,
        socketConnected,
        storeArrival,
        substituteNotice,
        dismissSubstituteNotice,
      }}
    >
      {children}
      {/* Rendered at provider level — floats above all screens without prop-drilling */}
      {BgLocationModal}
      <HalfPaymentSettledModal
        notice={settledNotice}
        onHeadOut={headOut}
        onClose={() => setSettledNotice(null)}
      />
    </RiderMissionContext.Provider>
  );
};

export const useRiderMissionContext = (): RiderMissionContextValue => {
  const context = useContext(RiderMissionContext);
  if (!context) {
    throw new Error('useRiderMissionContext must be used within a RiderMissionProvider');
  }
  return context;
};

