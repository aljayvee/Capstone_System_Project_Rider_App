import { useEffect, useRef } from 'react';
import { BackHandler, ToastAndroid, Platform } from 'react-native';

/**
 * Android Three-Key Navigation: Double-tap back button to exit the application.
 * Prevents accidental application termination when pressing the physical Back key on root screens.
 */
export function useRiderDoubleTapBackToExit(
  enabled: boolean = true,
  message: string = 'Press back again to exit'
) {
  const lastPressRef = useRef<number>(0);

  useEffect(() => {
    if (Platform.OS !== 'android' || !enabled) return;

    const onBackPress = () => {
      const now = Date.now();
      if (now - lastPressRef.current < 2000) {
        BackHandler.exitApp();
        return true;
      }
      lastPressRef.current = now;
      ToastAndroid.show(message, ToastAndroid.SHORT);
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [enabled, message]);
}

/**
 * Android Three-Key Navigation: Custom hardware back action hook.
 */
export function useHardwareBackAction(handler: () => boolean, enabled: boolean = true) {
  useEffect(() => {
    if (Platform.OS !== 'android' || !enabled) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => subscription.remove();
  }, [handler, enabled]);
}
