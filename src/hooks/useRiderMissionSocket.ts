import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { API_BASE_URL } from '../config/apiBaseUrl';
import { resolveRiderSocketToken } from '../services/apiClient';
import { currentLiveLocationSocket, registerLiveLocationSocket } from '../services/liveLocationSocket';

const SOCKET_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');

/** Matches HEARTBEAT_INTERVAL_MS in server/src/lib/riderLiveLink.ts. */
const HEARTBEAT_INTERVAL_MS = 1000;

interface OrderEventPayload {
  riderId?: number | string | null;
  [key: string]: unknown;
}

/**
 * Listens for the server's existing `order:updated` / `order:claimed` Socket.IO
 * events (already emitted on assignment — see server/src/services/errandService.ts)
 * and calls `onMatchingErrandEvent` whenever an event concerns this rider. This is
 * a "wake up and refetch" signal — it doesn't carry mission state itself, callers
 * are expected to re-fetch (e.g. via useRiderMission's `refresh()`).
 *
 * Also identifies this socket to the server as a rider connection (via the JWT
 * in the `auth` handshake) so the backend's presence store can track this as a
 * live background connection — see server/src/lib/socket.ts.
 */
export interface ItemSubstituteNotice {
  errandId: string;
  itemId: number;
  itemName: string;
  status: 'PENDING' | 'DECLINED';
  storeName?: string;
}

export function useRiderMissionSocket(riderId: number | undefined, onMatchingErrandEvent: () => void) {
  const [connected, setConnected] = useState(false);
  const [substituteNotice, setSubstituteNotice] = useState<ItemSubstituteNotice | null>(null);
  const callbackRef = useRef(onMatchingErrandEvent);
  callbackRef.current = onMatchingErrandEvent;

  useEffect(() => {
    if (!riderId) return;

    // No forced transport — allow the default polling-then-upgrade so a
    // network that blocks a raw WebSocket upgrade still falls back instead of
    // silently never connecting (matches the dispatcher web client's behavior).
    const socket: Socket = io(SOCKET_BASE_URL, {
      // Async resolver rather than the raw in-memory token: it checks expiry and
      // refreshes when needed, so a reconnect after the app has been asleep
      // comes back authenticated instead of silently anonymous.
      auth: async (cb) => {
        const token = await resolveRiderSocketToken();
        cb(token ? { token } : {});
      },
      // Back within two seconds of the network returning, not five: the
      // dispatcher board shows this rider as signal lost until it reconnects.
      reconnectionDelayMax: 2000,
    });

    // The one-second heartbeat (server: lib/riderLiveLink.ts). It is how the
    // dispatcher, owner and customer learn within about three seconds that
    // this phone lost its connection, instead of 25 to 75 seconds later from
    // the HTTP beacon. A WebSocket frame, so it never touches the API rate
    // limiter. Volatile: a heartbeat that cannot go now is dropped, never
    // queued and replayed late.
    //
    // Only while the app is in the foreground. Android may slow a background
    // app's timers, and a late heartbeat would read as a lost signal, so the
    // server is told to stop expecting it and the background task's beacons
    // carry the rider until the app is opened again.
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    const startHeartbeat = () => {
      if (heartbeatTimer || AppState.currentState !== 'active') return;
      socket.volatile.emit('rider:heartbeat');
      heartbeatTimer = setInterval(() => {
        if (socket.connected) socket.volatile.emit('rider:heartbeat');
      }, HEARTBEAT_INTERVAL_MS);
    };
    const stopHeartbeat = () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    };

    const handleOrderEvent = (payload: OrderEventPayload) => {
      if (payload && String(payload.riderId) === String(riderId)) {
        callbackRef.current();
      }
    };

    // A reconnect means events may have been missed while the socket was down
    // (a network switch, the phone dozing), so it refetches. Not on the first
    // connect: the mission has only just loaded.
    let hasConnectedBefore = false;
    socket.on('connect', () => {
      setConnected(true);
      startHeartbeat();
      if (hasConnectedBefore) callbackRef.current();
      hasConnectedBefore = true;
    });
    socket.on('disconnect', () => {
      setConnected(false);
      stopHeartbeat();
    });
    socket.on('connect_error', (err) => {
      console.warn('[useRiderMissionSocket] connect_error:', err.message);
    });
    socket.on('order:updated', handleOrderEvent);
    socket.on('order:claimed', handleOrderEvent);

    // Money moving on this rider's errands: the half being asked for, the
    // customer's receipt, the dispatcher's confirmation. These go to the
    // rider's own room, which this socket joins by authenticating, so arriving
    // here is already the filter. The rider app heard none of them before, which
    // is why it only caught up when reopened.
    const handleOwnErrandEvent = () => callbackRef.current();
    socket.on('errand:payment_updated', handleOwnErrandEvent);
    socket.on('errand:half_payment_requested', handleOwnErrandEvent);

    const handleSubstitutePending = (payload: any) => {
      if (payload) {
        setSubstituteNotice({
          errandId: String(payload.errandId || ''),
          itemId: Number(payload.itemId || 0),
          itemName: String(payload.itemName || 'Item'),
          status: 'PENDING',
          storeName: payload.storeName ? String(payload.storeName) : undefined,
        });
        callbackRef.current();
      }
    };

    const handleSubstituteDeclined = (payload: any) => {
      if (payload) {
        setSubstituteNotice({
          errandId: String(payload.errandId || ''),
          itemId: Number(payload.itemId || 0),
          itemName: String(payload.itemName || 'Item'),
          status: 'DECLINED',
        });
        callbackRef.current();
      }
    };

    socket.on('errand:substitute_pending', handleSubstitutePending);
    socket.on('errand:substitute_declined', handleSubstituteDeclined);

    // React Native can suspend Socket.IO's own reconnection timers while the
    // app is backgrounded, so foregrounding alone doesn't reliably reconnect —
    // force a reconnect attempt the instant the app becomes active again.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !socket.connected) {
        socket.connect();
      }
      if (state === 'active') {
        if (socket.connected) startHeartbeat();
      } else if (heartbeatTimer) {
        stopHeartbeat();
        if (socket.connected) socket.emit('rider:heartbeat_pause');
      }
    });

    // Lends this connection to the live GPS stream (services/liveLocationSocket).
    registerLiveLocationSocket(socket);

    return () => {
      stopHeartbeat();
      appStateSub.remove();
      // Only clear the registration if it is still ours, so a remount that has
      // already registered its new socket is not undone by the old cleanup.
      if (currentLiveLocationSocket() === socket) registerLiveLocationSocket(null);
      socket.disconnect();
      setConnected(false);
    };
  }, [riderId]);

  return {
    connected,
    substituteNotice,
    dismissSubstituteNotice: () => setSubstituteNotice(null),
  };
}
