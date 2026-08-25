import { useEffect, useRef, useState } from 'react';
import type { RiderOwnLocation } from './useRiderLocationBroadcast';
import type { ErrandPinpoint, StatusStep } from '../types/rider';
import { IDLE_WATCH, isDeliveryWaypoint, nextWaypoint, observeFix, type ArrivalWatch } from '../services/storeArrival';

interface UseStoreArrivalOptions {
  /** The stops for the errand in hand. */
  pinpoints: ErrandPinpoint[] | undefined;
  /** The customer's door — the final waypoint, once every stop is done. */
  destination: { latitude: number; longitude: number } | null | undefined;
  /** Live position, already streaming at 2 s / 3 m from the broadcast hook. */
  location: RiderOwnLocation | null;
  currentStatus: StatusStep;
  /** True once the rider has accepted — nothing fires before that. */
  isActive: boolean;
  /** The existing advance, so arrival takes exactly the manual path. */
  onArrived: () => void;
}

export interface StoreArrivalState {
  /** The waypoint being watched, once the rider is inside its circle. */
  arrivingAt: ErrandPinpoint | null;
  /** True when the waypoint being watched is the customer, not a shop. */
  arrivingAtCustomer: boolean;
  /** True on the step that auto-arrival moved, so the UI can say why. */
  advancedAutomatically: boolean;
  acknowledge: () => void;
}

/**
 * Moves the rider to "At Store" when they actually reach one.
 *
 * The server already derives arrival from uploaded breadcrumbs, but that answer
 * lands a batch late and needs signal — no use to a rider standing at the
 * counter watching a screen that still says "Traveling". This runs the same rule
 * against the live GPS the app is already streaming, so the step moves at the
 * door.
 *
 * It never becomes the only way through. The manual button stays exactly as it
 * was, because a rider inside a mall with no GPS lock has to be able to finish
 * the errand — the same reason the breadcrumb buffer and the settlement queue
 * exist.
 *
 * Advancing goes through the caller's own `onArrived`, which is the button's
 * handler. There is deliberately no second state machine here: the server PATCH,
 * the subtask reset and the socket emit all happen once, in one place, whether a
 * human or the geofence triggered them.
 */
export function useStoreArrival({
  pinpoints,
  destination,
  location,
  currentStatus,
  isActive,
  onArrived,
}: UseStoreArrivalOptions): StoreArrivalState {
  const watchRef = useRef<ArrivalWatch>(IDLE_WATCH);
  const [arrivingAt, setArrivingAt] = useState<ErrandPinpoint | null>(null);
  const [advancedAutomatically, setAdvancedAutomatically] = useState(false);

  // Kept in a ref so a new closure each render does not restart the watch.
  const onArrivedRef = useRef(onArrived);
  onArrivedRef.current = onArrived;

  // Watched through the whole run, not only while "Traveling".
  //
  // Gating on that one step meant arrival fired exactly once per errand: after
  // the first shop the status was "At Store" and the watch stopped, so stores 2
  // and 3 were never detected and neither was the customer's door.
  const watching = isActive && currentStatus !== 'Delivered';

  useEffect(() => {
    if (!watching) {
      watchRef.current = IDLE_WATCH;
      setArrivingAt(null);
      return;
    }

    // Back to travelling means a fresh leg — or a fresh errand. The "arrived
    // automatically" note belongs to the stop that triggered it, not to every
    // stop after it.
    setAdvancedAutomatically(false);

    const stop = nextWaypoint(pinpoints, destination);
    if (!stop || !location) return;

    // The door only counts once the shopping is done. Reaching it mid-errand —
    // the customer lives past the store — must not end the delivery.
    if (isDeliveryWaypoint(stop) && currentStatus !== 'Delivering') return;

    const result = observeFix(watchRef.current, stop, {
      latitude: location.latitude,
      longitude: location.longitude,
      accuracyMeters: location.accuracyMeters,
      at: location.updatedAt,
    });

    watchRef.current = result.watch;
    setArrivingAt(result.watch.insideSince !== null ? stop : null);

    if (result.arrived) {
      setAdvancedAutomatically(true);
      onArrivedRef.current();
    }
    // Driven by each new fix. `pinpoints` is included because a dispatcher can
    // re-pin mid-errand, which changes which stop is next.
  }, [
    watching,
    location?.updatedAt,
    location?.latitude,
    location?.longitude,
    pinpoints,
    destination?.latitude,
    destination?.longitude,
    currentStatus,
  ]);

  return {
    arrivingAt,
    arrivingAtCustomer: isDeliveryWaypoint(arrivingAt),
    advancedAutomatically,
    acknowledge: () => setAdvancedAutomatically(false),
  };
}
