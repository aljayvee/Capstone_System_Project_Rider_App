import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { API_BASE_URL } from '../config/apiBaseUrl';
import { resolveRiderSocketToken } from '../services/apiClient';

const SOCKET_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');

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
export function useRiderMissionSocket(riderId: number | undefined, onMatchingErrandEvent: () => void) {
  const [connected, setConnected] = useState(false);
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
    });

    const handleOrderEvent = (payload: OrderEventPayload) => {
      if (payload && String(payload.riderId) === String(riderId)) {
        callbackRef.current();
      }
    };

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (err) => {
      console.warn('[useRiderMissionSocket] connect_error:', err.message);
    });
    socket.on('order:updated', handleOrderEvent);
    socket.on('order:claimed', handleOrderEvent);

    // React Native can suspend Socket.IO's own reconnection timers while the
    // app is backgrounded, so foregrounding alone doesn't reliably reconnect —
    // force a reconnect attempt the instant the app becomes active again.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !socket.connected) {
        socket.connect();
      }
    });

    return () => {
      appStateSub.remove();
      socket.disconnect();
      setConnected(false);
    };
  }, [riderId]);

  return { connected };
}
