import { renderHook, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useRegisterPushToken } from '../src/hooks/useRegisterPushToken';
import { riderApiService } from '../src/config/apiConfig';

/**
 * Which token the rider's phone hands the server.
 *
 * Every send to an Expo token failed with InvalidCredentials (the Expo project
 * holds no FCM key), so an errand offer never reached a rider whose app was
 * closed. On Android the phone now registers its own FCM token, which the
 * server sends to directly.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// app.json's EAS project id, which the Expo token (iOS) needs and Android does not.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: '275be8ea-14b0-4ac6-90dc-168df39618a1' } } } },
}));

jest.mock('../src/config/apiConfig', () => ({
  riderApiService: { registerPushToken: jest.fn(() => Promise.resolve(true)) },
}));

const originalOS = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
});

afterAll(() => {
  Platform.OS = originalOS;
});

describe('registering the rider for pushes', () => {
  it('registers the FCM device token on Android', async () => {
    Platform.OS = 'android';
    (Notifications.getDevicePushTokenAsync as jest.Mock).mockResolvedValueOnce({
      type: 'android',
      data: 'fcm-rider-token',
    });

    await renderHook(() => useRegisterPushToken(12));

    await waitFor(() => expect(riderApiService.registerPushToken).toHaveBeenCalledWith('fcm-rider-token'));
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('still sets up the offers channel the server sends assignments on', async () => {
    Platform.OS = 'android';
    await renderHook(() => useRegisterPushToken(12));

    await waitFor(() =>
      expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith('orders', expect.anything())
    );
  });

  it('registers the Expo token elsewhere', async () => {
    Platform.OS = 'ios';
    await renderHook(() => useRegisterPushToken(12));

    await waitFor(() =>
      expect(riderApiService.registerPushToken).toHaveBeenCalledWith('ExponentPushToken[mock]')
    );
    expect(Notifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
  });

  it('registers nothing before a rider is signed in', async () => {
    Platform.OS = 'android';
    await renderHook(() => useRegisterPushToken(undefined));
    expect(riderApiService.registerPushToken).not.toHaveBeenCalled();
  });
});
