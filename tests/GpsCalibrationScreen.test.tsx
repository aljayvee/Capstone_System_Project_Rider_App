import React from 'react';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import GpsCalibrationScreen from '../src/modules/profile/GpsCalibrationScreen';
import { GPS_CALIBRATION_STORAGE_KEY, liveStabilizer } from '../src/services/gpsSteadying';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
}));

// The shared setup mocks expo-location without these two.
const mockedLocation = Location as unknown as Record<string, jest.Mock>;
mockedLocation.getProviderStatusAsync = jest.fn();
mockedLocation.enableNetworkProviderAsync = jest.fn(() => Promise.resolve());

const BASE = { latitude: 6.6906, longitude: 124.6772 };

function providerStatus(over: Partial<Location.LocationProviderStatus> = {}) {
  return {
    locationServicesEnabled: true,
    backgroundModeEnabled: true,
    gpsAvailable: true,
    networkAvailable: true,
    passiveAvailable: true,
    ...over,
  };
}

/** Lets pending promises (permission, provider status, subscription) settle. */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

describe('GPS calibration screen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-25T04:00:00Z'));
    mockGoBack.mockClear();
    mockedLocation.getProviderStatusAsync.mockResolvedValue(providerStatus());
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockClear().mockResolvedValue({ status: 'granted' });
    (Location.watchPositionAsync as jest.Mock).mockReset();
    (AsyncStorage.setItem as jest.Mock).mockClear();
    liveStabilizer.configure({ lockRadiusMeters: 12 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows a preparation modal before asking for permission or starting GPS', async () => {
    const view = await render(<GpsCalibrationScreen />);
    await flush();
    await fireEvent.press(view.getByTestId('gps-calibration-start'));
    await flush();

    expect(view.getByText('Ready to calibrate?')).toBeTruthy();
    expect(within(view.getByTestId('gps-calibration-start-modal')).getByText(/Keep it still for 30 seconds/)).toBeTruthy();
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(Location.watchPositionAsync).not.toHaveBeenCalled();

    await fireEvent.press(view.getByLabelText('Not now'));
    await flush();
    expect(view.queryByText('Ready to calibrate?')).toBeNull();
    expect(view.getByTestId('gps-calibration-start')).toBeTruthy();
    expect(Location.watchPositionAsync).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('dismisses the preparation modal on the Android back request without starting', async () => {
    const view = await render(<GpsCalibrationScreen />);
    await flush();
    await fireEvent.press(view.getByTestId('gps-calibration-start'));
    await fireEvent(view.getByTestId('gps-calibration-start-modal'), 'requestClose');
    await flush();
    expect(view.queryByText('Ready to calibrate?')).toBeNull();
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  });

  it('shows the phone\'s location settings and offers to turn on Google Location Accuracy', async () => {
    mockedLocation.getProviderStatusAsync.mockResolvedValue(providerStatus({ networkAvailable: false }));
    const view = await render(<GpsCalibrationScreen />);
    await flush();

    expect(view.getByText('Google Location Accuracy')).toBeTruthy();
    expect(view.getByText('Off')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Turn on location accuracy'));
    await flush();
    expect(mockedLocation.enableNetworkProviderAsync).toHaveBeenCalled();
  });

  it('measures a still phone, shows the pin held still, and saves the lock radius', async () => {
    let onFix: ((loc: unknown) => void) | null = null;
    (Location.watchPositionAsync as jest.Mock).mockImplementation(async (_options, callback) => {
      onFix = callback;
      return { remove: jest.fn() };
    });

    const view = await render(<GpsCalibrationScreen />);
    await flush();
    await fireEvent.press(view.getByTestId('gps-calibration-start'));
    await fireEvent.press(view.getByTestId('gps-calibration-confirm-start'));
    await flush();

    expect((Location.watchPositionAsync as jest.Mock).mock.calls[0][0]).toMatchObject({
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 1000,
    });
    expect(view.getByText('Keep the phone still')).toBeTruthy();
    expect(view.getByText(/Waiting for the satellites/)).toBeTruthy();

    // Thirty still fixes scattered a few metres around one spot.
    const start = Date.now();
    await act(async () => {
      for (let i = 0; i < 30; i++) {
        const angle = (i / 30) * 2 * Math.PI;
        onFix!({
          coords: {
            latitude: BASE.latitude + (Math.sin(angle) * 4) / 111_320,
            longitude: BASE.longitude + (Math.cos(angle) * 4) / 110_600,
            accuracy: 5,
            speed: 0.2,
            heading: null,
          },
          timestamp: start + 1000 + i * 1000,
          mocked: false,
        });
      }
    });
    expect(view.getByText('Positions received')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(31_000);
    });
    await flush();

    expect(view.getByText('GPS is steady')).toBeTruthy();
    expect(view.getByText('Your GPS is working well here. Nothing to change.')).toBeTruthy();
    expect(view.getByText(/Saved\. Your pin now holds still within 8\.0 m/)).toBeTruthy();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(GPS_CALIBRATION_STORAGE_KEY, expect.any(String));
    expect(liveStabilizer.lockRadiusMeters).toBe(8);

    (Location.watchPositionAsync as jest.Mock).mockClear();
    await fireEvent.press(view.getByLabelText('Run again'));
    expect(view.getByText('Ready to calibrate?')).toBeTruthy();
    expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  });

  it('explains a refused permission and offers to try again', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    const view = await render(<GpsCalibrationScreen />);
    await flush();
    await fireEvent.press(view.getByTestId('gps-calibration-start'));
    await fireEvent.press(view.getByTestId('gps-calibration-confirm-start'));
    await flush();

    expect(view.getByText('Location permission is off')).toBeTruthy();
    expect(view.getByLabelText('Try again')).toBeTruthy();
    expect(Location.watchPositionAsync).not.toHaveBeenCalled();
    await fireEvent.press(view.getByLabelText('Try again'));
    expect(view.getByText('Ready to calibrate?')).toBeTruthy();
  });

  it('asks to turn Location on when it is off, before listening', async () => {
    mockedLocation.getProviderStatusAsync.mockResolvedValue(providerStatus({ locationServicesEnabled: false }));
    const view = await render(<GpsCalibrationScreen />);
    await flush();
    await fireEvent.press(view.getByTestId('gps-calibration-start'));
    await fireEvent.press(view.getByTestId('gps-calibration-confirm-start'));
    await flush();

    expect(view.getByText('Location is switched off')).toBeTruthy();
    expect(Location.watchPositionAsync).not.toHaveBeenCalled();

    await fireEvent.press(view.getByLabelText('Turn on Location'));
    await flush();
    expect(view.getByText('Ready to calibrate?')).toBeTruthy();
    expect(Location.watchPositionAsync).not.toHaveBeenCalled();

    mockedLocation.getProviderStatusAsync.mockResolvedValue(providerStatus());
    (Location.watchPositionAsync as jest.Mock).mockResolvedValue({ remove: jest.fn() });
    await fireEvent.press(view.getByTestId('gps-calibration-confirm-start'));
    await flush();
    expect(view.getByText('Keep the phone still')).toBeTruthy();
    expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1);
  });
});
