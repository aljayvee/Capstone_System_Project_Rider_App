import { Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { storageAdapter } from '../adapters/storageAdapter';

/**
 * The alarm that makes sure a rider actually hears about an errand.
 *
 * An offer stands for 45 seconds and is then re-dispatched. Two things have to
 * work inside that window, and they are NOT the same mechanism:
 *
 *  1. The push that says an errand has arrived. That is FCM, and it reaches a
 *     sleeping phone only if it is sent at high priority — see the `urgent` flag
 *     on the server's push sender. No alarm is involved.
 *
 *  2. A second nudge if the first went unanswered. That is a LOCAL notification
 *     scheduled for a moment in the future, and on Android a future notification
 *     is an AlarmManager alarm. expo-notifications schedules it with
 *     setExactAndAllowWhileIdle when SCHEDULE_EXACT_ALARM is granted, and quietly
 *     downgrades to setAndAllowWhileIdle when it is not (ExpoSchedulingDelegate.kt).
 *     The inexact form is batched by Doze and can land minutes late — long after
 *     the errand has gone to someone else.
 *
 * Which is why the permission matters: without it this reminder still schedules,
 * still reports success, and still arrives too late to be worth anything.
 */

/** Fires while the rider still has time to accept, not as the offer expires. */
const REMINDER_AFTER_SECONDS = 15;

const GRANT_PROMPTED_KEY = '@sugo_rider_exact_alarm_prompted';

/** Identifier so a reminder can be cancelled the moment the offer is answered. */
const REMINDER_ID = 'errand-offer-reminder';

/**
 * Opens Settings > Alarms & reminders for this app.
 *
 * Android 14 denies SCHEDULE_EXACT_ALARM by default to apps that are not clocks
 * or calendars, so declaring it in the manifest is not enough — the rider has to
 * turn it on, and this is the only screen that can do it. Uses a plain intent
 * rather than pulling in expo-intent-launcher for one call.
 */
export async function openExactAlarmSettings(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    await Linking.sendIntent('android.settings.REQUEST_SCHEDULE_EXACT_ALARM');
    await storageAdapter.setJSON(GRANT_PROMPTED_KEY, { prompted: true, at: Date.now() });
    return true;
  } catch {
    // Some OEM builds do not expose the per-app screen. App settings is the
    // fallback: it is one level up, and better than a dead button.
    try {
      await Linking.openSettings();
      await storageAdapter.setJSON(GRANT_PROMPTED_KEY, { prompted: true, at: Date.now() });
      return true;
    } catch {
      return false;
    }
  }
}

/** Whether the rider has already been sent to the settings screen at least once. */
export async function hasBeenPromptedForExactAlarms(): Promise<boolean> {
  const stored = await storageAdapter.getJSON<{ prompted: boolean }>(GRANT_PROMPTED_KEY);
  return Boolean(stored?.prompted);
}

/**
 * Schedules the follow-up nudge for an offer the rider has not answered.
 *
 * Safe to call repeatedly — the previous one is cancelled first, so a second
 * offer arriving does not leave two reminders racing.
 */
export async function scheduleOfferReminder(errandId: string): Promise<void> {
  await cancelOfferReminder();
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_ID,
      content: {
        title: 'An errand is waiting for you',
        body: 'Open Sugo to accept it before it goes to another rider.',
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
        data: { errandId, type: 'ERRAND_OFFER_REMINDER' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: REMINDER_AFTER_SECONDS,
        channelId: 'default',
      },
    });
  } catch (err) {
    // A reminder that cannot be scheduled must never take the offer down with it.
    console.warn('[offerAlarm] Could not schedule the offer reminder:', err);
  }
}

/** Called the moment the offer is accepted, declined, or withdrawn. */
export async function cancelOfferReminder(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
  } catch {
    // Nothing scheduled under that id. Not a problem worth a log line.
  }
}
