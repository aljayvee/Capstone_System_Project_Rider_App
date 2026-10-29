import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { riderApiService } from '../config/apiConfig';
import { notificationTapped } from '../services/notificationEvents';

/** The tap that launched the app is read once per app process, not per sign-in. */
let coldStartTapHandled = false;

Notifications.setNotificationHandler({
  handleNotification: async () => {
    let soundsEnabled = true;
    try {
      const stored = await AsyncStorage.getItem('@sugo_rider_sounds_enabled');
      if (stored !== null) soundsEnabled = stored === 'true';
    } catch {
      soundsEnabled = true;
    }

    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: soundsEnabled,
      shouldSetBadge: false,
    };
  },
});

/**
 * Requests notification permission and registers this device's push token
 * (FCM on Android, Expo elsewhere) with the backend so
 * `POST /errands/:id/assign-rider` can push a background notification on
 * assignment. Fails soft on permission denial, simulator/emulator
 * environments, or a missing EAS project id — matching the rest of the app's
 * location/permission handling.
 */
export function useRegisterPushToken(riderId: number | undefined, onNotificationTapped?: () => void): void {
  const tappedRef = useRef(onNotificationTapped);
  tappedRef.current = onNotificationTapped;

  useEffect(() => {
    if (!riderId) return;
    let cancelled = false;

    // Set up Android notification channels unconditionally (for both remote push and local notifications)
    if (Platform.OS === 'android') {
      void Notifications.setNotificationChannelAsync('default', {
        name: 'General',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        enableVibrate: true,
        sound: 'default',
      }).catch(() => {});
      void Notifications.setNotificationChannelAsync('orders', {
        name: 'Errand Assignments & Offers',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 200, 500],
        enableVibrate: true,
        sound: 'default',
      }).catch(() => {});
      void Notifications.setNotificationChannelAsync('chats', {
        name: 'Dispatcher Messages',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 150, 250],
        enableVibrate: true,
        sound: 'default',
      }).catch(() => {});
    }

    // getExpoPushTokenAsync() requires a real EAS project id (from `eas init`)
    // to know which Expo project to register against. Android does not use it.
    const projectId = Constants.expoConfig?.extra?.eas?.projectId || (Constants as any).easConfig?.projectId;
    if (!projectId && Platform.OS !== 'android') {
      return;
    }

    (async () => {
      try {

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== 'granted' || cancelled) return;

        // Android: the device's own FCM token, which the server sends to
        // directly with its Firebase service account (server
        // lib/pushNotifications.ts tells the two kinds apart). The Expo token
        // went through Expo's push service, and every send failed there with
        // InvalidCredentials: the Expo project holds no FCM key for this app.
        // So errand offers never reached a rider whose app was closed.
        //
        // Elsewhere the Expo token, as before.
        const token =
          Platform.OS === 'android'
            ? String((await Notifications.getDevicePushTokenAsync()).data)
            : (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        if (cancelled) return;

        await riderApiService.registerPushToken(token);
      } catch (err) {
        console.warn('[useRegisterPushToken] Could not register push token:', err);
      }
    })();

    // A tap refreshes the mission (as before) and is routed to what it is about
    // (AuthedNavigator listens: offer, errand, or the dispatcher chat).
    const routeTap = (response: Notifications.NotificationResponse | null | undefined) => {
      const data = (response?.notification?.request?.content?.data ?? {}) as Record<string, unknown>;
      notificationTapped.emit({
        type: typeof data.type === 'string' ? data.type : undefined,
        errandId: data.errandId != null ? String(data.errandId) : undefined,
        dispatcherId: data.dispatcherId as number | string | undefined,
      });
    };
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      tappedRef.current?.();
      routeTap(response);
    });

    // A tap that opened the app from closed arrives before any listener exists.
    if (!coldStartTapHandled && typeof Notifications.getLastNotificationResponseAsync === 'function') {
      coldStartTapHandled = true;
      void Notifications.getLastNotificationResponseAsync()
        .then((response) => {
          if (response && !cancelled) routeTap(response);
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [riderId]);
}
