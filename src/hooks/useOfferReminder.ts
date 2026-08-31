import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { cancelOfferReminder, scheduleOfferReminder } from '../services/offerAlarm';

/**
 * Keeps the offer reminder in step with the offer itself.
 *
 * A rider is offered an errand and has 45 seconds. If they are looking at the
 * screen, the card and its countdown are all they need — a notification for
 * something already in front of them is noise. The reminder is for the other
 * case: the phone is in a pocket or a jacket, the push arrived while the screen
 * was off, and nobody has looked at it.
 *
 * So it is scheduled only while the app is NOT in the foreground, and cancelled
 * the instant the offer stops standing — accepted, declined, timed out, or
 * withdrawn by dispatch. A reminder that outlives its errand tells the rider to
 * hurry for something that is already someone else's.
 */
export function useOfferReminder(isOfferStanding: boolean, errandId: string | undefined) {
  const scheduledForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOfferStanding || !errandId) {
      if (scheduledForRef.current !== null) {
        scheduledForRef.current = null;
        void cancelOfferReminder();
      }
      return;
    }

    const sync = () => {
      const backgrounded = AppState.currentState !== 'active';

      if (backgrounded && scheduledForRef.current !== errandId) {
        scheduledForRef.current = errandId;
        void scheduleOfferReminder(errandId);
        return;
      }

      // Back in the foreground with the card on screen — the reminder has no job
      // left, and firing it now would buzz for something being read.
      if (!backgrounded && scheduledForRef.current !== null) {
        scheduledForRef.current = null;
        void cancelOfferReminder();
      }
    };

    sync();
    const subscription = AppState.addEventListener('change', sync);
    return () => subscription.remove();
  }, [isOfferStanding, errandId]);

  // Nothing should survive the provider unmounting — a signed-out rider must not
  // be buzzed about an errand they can no longer see.
  useEffect(() => {
    return () => {
      void cancelOfferReminder();
    };
  }, []);
}
