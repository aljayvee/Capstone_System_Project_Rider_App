/**
 * Two signals the notification feed needs from code that owns other things:
 *
 * - `notification:new` arrives on the mission socket (useRiderMissionSocket),
 *   which already joins this rider's room. A second socket just for the bell
 *   would double the connections the server counts for presence.
 * - A tapped push arrives in useRegisterPushToken, inside the mission provider,
 *   which cannot navigate. The tab navigator listens and routes it
 *   (navigation/AuthedNavigator.tsx).
 *
 * Plain listener sets, no state: nothing is replayed to a late subscriber.
 */

export interface PushTapPayload {
  type?: string;
  errandId?: string;
  dispatcherId?: number | string;
}

type Listener<T> = (payload: T) => void;

function channel<T>() {
  const listeners = new Set<Listener<T>>();
  return {
    emit(payload: T) {
      listeners.forEach((listener) => {
        try {
          listener(payload);
        } catch (err) {
          console.warn('[notificationEvents] listener failed:', err);
        }
      });
    },
    subscribe(listener: Listener<T>): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const notificationArrived = channel<Record<string, unknown>>();
export const notificationTapped = channel<PushTapPayload>();
