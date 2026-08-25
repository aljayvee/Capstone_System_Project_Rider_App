import React, { createContext, useContext } from 'react';
import { useRiderMission, type UseRiderMissionReturn } from '../hooks/useRiderMission';
import { useRiderLocationBroadcast, type RiderOwnLocation } from '../hooks/useRiderLocationBroadcast';
import { useRiderMissionSocket } from '../hooks/useRiderMissionSocket';
import { useRegisterPushToken } from '../hooks/useRegisterPushToken';
import { useStoreArrival, type StoreArrivalState } from '../hooks/useStoreArrival';
import { useRiderAuth } from './RiderAuthContext';

interface RiderMissionContextValue extends UseRiderMissionReturn {
  riderLocation: RiderOwnLocation | null;
  socketConnected: boolean;
  /** Whether the rider is inside a store's circle, and whether that moved them. */
  storeArrival: StoreArrivalState;
}

const RiderMissionContext = createContext<RiderMissionContextValue | undefined>(undefined);

// Hoists the single copy of mission state, the GPS watch, and the real-time
// socket listener so every screen (Home, Tasks, the live map) observes the
// same data instead of each mounting its own independent useRiderMission().
export const RiderMissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { rider, isOnline: isOnDuty } = useRiderAuth();
  const mission = useRiderMission();

  // Destructure the new shape: `location` (GPS data) + `ModalElement` (the
  // background-location consent modal rendered at provider level so it floats
  // over any screen without prop-drilling). Tracking now runs for the whole
  // on-duty session (not just an active delivery) via a background task, with
  // `mission.phase === 'active'` only controlling its update cadence.
  const { location: riderLocation, ModalElement: BgLocationModal } = useRiderLocationBroadcast(
    rider?.id,
    isOnDuty,
    mission.phase === 'active',
    mission.errand?.id
  );

  const { connected: socketConnected } = useRiderMissionSocket(rider?.id, mission.refresh);
  useRegisterPushToken(rider?.id, mission.refresh);

  // Reaching a store advances the step on its own. Hoisted here beside the GPS
  // watch so it runs once for the session rather than per screen — mounting it
  // in a component would arrive twice whenever two screens were alive at once.
  const storeArrival = useStoreArrival({
    pinpoints: mission.errand?.pinpoints,
    // The customer's door is the last waypoint of the run.
    destination:
      mission.errand?.deliveryLatitude != null && mission.errand?.deliveryLongitude != null
        ? { latitude: mission.errand.deliveryLatitude, longitude: mission.errand.deliveryLongitude }
        : null,
    location: riderLocation,
    currentStatus: mission.currentStatus,
    isActive: mission.phase === 'active' && mission.isMissionAccepted,
    onArrived: mission.advanceStatus,
  });

  return (
    <RiderMissionContext.Provider value={{ ...mission, riderLocation, socketConnected, storeArrival }}>
      {children}
      {/* Rendered at provider level — floats above all screens without prop-drilling */}
      {BgLocationModal}
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

