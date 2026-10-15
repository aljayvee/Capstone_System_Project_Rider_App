/**
 * Native modules stubbed so components can actually mount.
 *
 * Every mock here stands in for something with no JS implementation off a
 * device. Kept as small as the app's real usage requires — a mock richer than
 * the thing it replaces is a second implementation to keep in step.
 */

// Official mock — without it SafeAreaProvider never resolves an onLayout
// measurement under the test renderer and renders with zero children.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default
);

// The library's own shipped mock. The real module is native and has no JS
// implementation under the test renderer; the CustomerApp uses the same one.
jest.mock('react-native-keyboard-controller', () =>
  require('react-native-keyboard-controller/jest')
);

// ─── maps ────────────────────────────────────────────────────────────────────
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');

  // forwardRef so LiveErrandMap can call the imperative camera methods it uses
  // to frame a route. Without these the ref is a plain View and every
  // mapRef.current?.fitToCoordinates(...) throws on mount.
  const MockMapView = React.forwardRef((props, ref) => {
    // One handle per map, left on global.__mapHandle so a test can see which
    // camera calls were made: setCamera is instant, animateCamera is not.
    const handle = React.useRef(null);
    if (!handle.current) {
      handle.current = {
        animateToRegion: jest.fn(),
        animateCamera: jest.fn(),
        setCamera: jest.fn(),
        fitToCoordinates: jest.fn(),
        fitToElements: jest.fn(),
        getCamera: jest.fn(() => Promise.resolve({ center: { latitude: 0, longitude: 0 }, zoom: 15 })),
      };
      global.__mapHandle = handle.current;
    }
    React.useImperativeHandle(ref, () => handle.current);
    // The real map reports ready some time after mounting. A test can hold it
    // back with global.__holdMapReady to see what is sent before then, which is
    // what crashed the Task tab on Android (see LiveErrandMap's MapView props).
    const { onMapReady } = props;
    React.useEffect(() => {
      if (!global.__holdMapReady && onMapReady) onMapReady();
    }, []);
    return React.createElement(View, { ...props, testID: props.testID || 'mock-map-view' }, props.children);
  });
  MockMapView.displayName = 'MockMapView';

  const passthrough = (name) => {
    const C = (props) => React.createElement(View, { ...props, testID: props.testID || name }, props.children);
    C.displayName = name;
    return C;
  };

  return {
    __esModule: true,
    default: MockMapView,
    MapView: MockMapView,
    Marker: passthrough('mock-marker'),
    Polyline: passthrough('mock-polyline'),
    Circle: passthrough('mock-circle'),
    Callout: passthrough('mock-callout'),
    UrlTile: passthrough('mock-url-tile'),
    PROVIDER_GOOGLE: 'google',
  };
});

// ─── reanimated ──────────────────────────────────────────────────────────────
// The real module pulls in react-native-worklets, which reaches for a native
// module that does not exist under the test renderer and throws before any test
// body runs. Reanimated 4 ships a mock, but that mock imports its own index and
// drags the same native module back in — hence a hand-written one covering what
// this app actually uses.
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  const identity = (v) => v;
  return {
    __esModule: true,
    default: { View, Text, createAnimatedComponent: (C) => C },
    View,
    Text,
    createAnimatedComponent: (C) => C,
    useSharedValue: (init) => ({ value: init }),
    useAnimatedStyle: (fn) => {
      try {
        return fn();
      } catch {
        return {};
      }
    },
    useDerivedValue: (fn) => ({ value: fn() }),
    withTiming: identity,
    withSpring: identity,
    withDelay: (_d, v) => v,
    withRepeat: identity,
    withSequence: (...v) => v[0],
    cancelAnimation: jest.fn(),
    runOnJS: (fn) => fn,
    runOnUI: (fn) => fn,
    interpolate: () => 0,
    Easing: { linear: identity, ease: identity, bezier: () => identity, out: identity, inOut: identity },
  };
});

// ─── expo native modules ─────────────────────────────────────────────────────
jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  const CameraView = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      takePictureAsync: jest.fn(() => Promise.resolve({ uri: 'file:///mock.jpg', base64: '' })),
    }));
    return React.createElement(View, { ...props, testID: props.testID || 'mock-camera' }, props.children);
  });
  CameraView.displayName = 'MockCameraView';
  return {
    CameraView,
    useCameraPermissions: () => [{ granted: true, status: 'granted' }, jest.fn()],
  };
});

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestBackgroundPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(() =>
    Promise.resolve({ coords: { latitude: 6.6925, longitude: 124.6764, accuracy: 5 } })
  ),
  watchPositionAsync: jest.fn(() => Promise.resolve({ remove: jest.fn() })),
  hasStartedLocationUpdatesAsync: jest.fn(() => Promise.resolve(false)),
  startLocationUpdatesAsync: jest.fn(() => Promise.resolve()),
  stopLocationUpdatesAsync: jest.fn(() => Promise.resolve()),
  Accuracy: { Balanced: 3, High: 4, BestForNavigation: 6 },
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(() => Promise.resolve(false)),
  unregisterTaskAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ data: 'ExponentPushToken[mock]' })),
  getDevicePushTokenAsync: jest.fn(() => Promise.resolve({ type: 'android', data: 'fcm-device-token-mock' })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('mock-notif-id')),
  AndroidImportance: { MAX: 5 },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(() => Promise.resolve({ uri: 'file:///mock.jpg', base64: '' })),
  SaveFormat: { JPEG: 'jpeg' },
}));

jest.mock('expo-battery', () => ({
  getBatteryLevelAsync: jest.fn(() => Promise.resolve(0.85)),
  getPowerStateAsync: jest.fn(() => Promise.resolve({ lowPowerMode: false })),
}));

// ─── the OCR module this upgrade put at risk ─────────────────────────────────
// Mocked as WORKING here. The fail-soft path (a throwing reader degrading to
// Cloud Vision) is covered by tests/proofLegibility.test.ts against the rule
// itself; this stub just lets screens that import proofCapture mount at all.
jest.mock('@react-native-ml-kit/text-recognition', () => ({
  __esModule: true,
  default: { recognize: jest.fn(() => Promise.resolve({ text: '' })) },
}));

// ─── network and realtime ────────────────────────────────────────────────────
jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    connected: false,
  })),
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true })),
}));
