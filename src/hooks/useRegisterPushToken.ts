import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { riderApiService } from '../config/apiConfig';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Requests notification permission and registers this device's Expo push
 * token with the backend so `POST /errands/:id/assign-rider` can push a
 * background notification on assignment. Fails soft on permission denial,
 * simulator/emulator environments, or a missing EAS project id — matching
 * the rest of the app's location/permission handling.
 */
export function useRegisterPushToken(riderId: number | undefined, onNotificationTapped?: () => void): void {
  const tappedRef = useRef(onNotificationTapped);
  tappedRef.current = onNotificationTapped;

  useEffect(() => {
    if (!riderId) return;
    let cancelled = false;

    // getExpoPushTokenAsync() requires a real EAS project id (from `eas init`)
    // to know which Expo project to register against — this app hasn't been
    // through that setup yet. Skip the whole permission/channel dance rather
    // than attempting a call guaranteed to fail with a full stack trace on
    // every mount (including every dev Fast Refresh).
    const projectId = Constants.expoConfig?.extra?.eas?.projectId || (Constants as any).easConfig?.projectId;
    if (!projectId) {
      return;
    }

    (async () => {
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.HIGH,
          });
        }

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== 'granted' || cancelled) return;

        const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
        if (cancelled) return;

        await riderApiService.registerPushToken(tokenResponse.data);
      } catch (err) {
        console.warn('[useRegisterPushToken] Could not register push token:', err);
      }
    })();

    const subscription = Notifications.addNotificationResponseReceivedListener(() => {
      tappedRef.current?.();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [riderId]);
}
