import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { shouldEmitHeading, smoothHeading, vectorHeading, type HeadingVector } from '../utils/compass';

export interface DeviceHeading {
  /** Where the top of the phone points, 0-360 from true north, smoothed. Null until the first reading. */
  heading: number | null;
  /** The phone's calibration level: 3 high, 2 medium, 1 low, 0 unreliable. */
  accuracy: number | null;
  /** False when this phone has no compass or the reading could not be started. */
  available: boolean;
}

const NONE: DeviceHeading = { heading: null, accuracy: null, available: true };

/**
 * The phone's compass, while `enabled` and the app is on screen.
 *
 * expo-location's heading is the platform's fused rotation sensor (the
 * accelerometer, magnetometer and gyroscope together on Android), which holds
 * steadier than the raw magnetometer as the phone tilts on a handlebar mount.
 * It is smoothed on the circle (utils/compass.smoothHeading) and passed on at
 * most every 150 ms and only when it moved 2 degrees, because every update
 * re-renders the map.
 *
 * Off unless asked for: the Task tab stays mounted behind the other tabs, and
 * a compass left running there would drain the battery for a map nobody sees.
 */
export function useDeviceHeading(enabled: boolean): DeviceHeading {
  const [state, setState] = useState<DeviceHeading>(NONE);
  // Off only in the background. Not "on only when active": AppState starts as
  // null or "unknown" on some Android launches, and the compass would then
  // never start until the app was sent away and brought back.
  const [appActive, setAppActive] = useState(AppState.currentState !== 'background');

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => setAppActive(next !== 'background'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!enabled || !appActive) return;
    if (typeof Location.watchHeadingAsync !== 'function') {
      setState({ heading: null, accuracy: null, available: false });
      return;
    }

    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    let smoothed: HeadingVector | null = null;
    let lastHeading: number | null = null;
    let lastAccuracy: number | null = null;
    let lastAt = 0;

    Location.watchHeadingAsync((reading) => {
      if (cancelled) return;
      // trueHeading needs a location fix to correct for declination and is -1
      // without one. In Tacurong the difference is under a degree, so the
      // magnetic heading is a fine stand-in until it arrives.
      const raw =
        typeof reading.trueHeading === 'number' && reading.trueHeading >= 0 ? reading.trueHeading : reading.magHeading;
      if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return;
      smoothed = smoothHeading(smoothed, raw);
      const heading = vectorHeading(smoothed);
      const accuracy = typeof reading.accuracy === 'number' ? reading.accuracy : null;
      const now = Date.now();
      if (accuracy === lastAccuracy && !shouldEmitHeading(lastHeading, heading, now - lastAt)) return;
      lastHeading = heading;
      lastAccuracy = accuracy;
      lastAt = now;
      setState({ heading, accuracy, available: true });
    })
      .then((sub) => {
        if (cancelled) sub.remove();
        else subscription = sub;
      })
      .catch(() => {
        if (!cancelled) setState({ heading: null, accuracy: null, available: false });
      });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled, appActive]);

  return enabled ? state : NONE;
}
