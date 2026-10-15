import type { Socket } from 'socket.io-client';

/**
 * Streams this rider's live GPS fixes to the server over Socket.IO, next to the
 * Firebase RTDB write that has always carried them.
 *
 * The server re-broadcasts each fix as `rider:location` to the dispatcher and
 * owner maps and to the customer of the errand being worked (see
 * server/src/lib/riderLocationBroadcast.ts). Those maps merge it with RTDB and
 * draw whichever fix is newer, so when one path is slow or refused the pin
 * still moves on the other.
 *
 * It borrows the connection useRiderMissionSocket already holds rather than
 * opening a second one: one handshake and one heartbeat on a weak signal, not
 * two.
 */

let activeSocket: Socket | null = null;
const socketListeners = new Set<(socket: Socket | null) => void>();

/** Called by useRiderMissionSocket as its socket comes and goes. */
export function registerLiveLocationSocket(socket: Socket | null): void {
  activeSocket = socket;
  socketListeners.forEach((cb) => {
    try {
      cb(socket);
    } catch {}
  });
}

/** Subscribe to active socket lifecycle changes without opening new connections. */
export function onActiveSocketChange(cb: (socket: Socket | null) => void): () => void {
  socketListeners.add(cb);
  if (activeSocket) cb(activeSocket);
  return () => {
    socketListeners.delete(cb);
  };
}

/** The socket currently registered, for an owner that must only clear its own. */
export function currentLiveLocationSocket(): Socket | null {
  return activeSocket;
}

export interface LiveLocationFix {
  latitude: number;
  longitude: number;
  heading: number | null;
  accuracyMeters: number | null;
  speedMps: number | null;
  /** Device clock at the fix, epoch ms. */
  recordedAt: number;
}

/**
 * Sends one fix, or does nothing. Never throws and never queues.
 *
 * Volatile: while the link is down or backed up the fix is dropped rather than
 * buffered. A live pin wants the newest position, and a backlog of old ones
 * flushed on reconnect would replay a trip the rider has already made. The
 * durable breadcrumb (the offline track queue) is what keeps history.
 */
export function emitLiveLocation(fix: LiveLocationFix): void {
  try {
    if (!activeSocket?.connected) return;
    activeSocket.volatile.emit('rider:location', fix);
  } catch {
    // Telemetry must never be able to break the location watcher.
  }
}
