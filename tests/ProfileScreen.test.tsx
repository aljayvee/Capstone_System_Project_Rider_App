import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import ProfileScreen from '../src/modules/profile/ProfileScreen';
import { riderApiService } from '../src/config/apiConfig';
import type { RiderProfile } from '../src/types/rider';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('../src/config/apiConfig', () => ({
  riderApiService: { fetchProfilePhoto: jest.fn(), uploadProfilePhoto: jest.fn() },
}));

const mockNavigate = jest.fn();
const mockLogout = jest.fn();
const mockToggleShift = jest.fn();
const mockRefresh = jest.fn();
let mockOnline = true;
let mockProfile: RiderProfile;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('../src/context/RiderMissionContext', () => ({
  useRiderMissionContext: () => ({ riderProfile: mockProfile, phase: 'active', refresh: mockRefresh }),
}));
jest.mock('../src/context/RiderAuthContext', () => ({
  useRiderAuth: () => ({ logout: mockLogout, isOnline: mockOnline, toggleShiftStatus: mockToggleShift }),
}));

const profile: RiderProfile = {
  id: 'rider-1',
  name: 'Alexandria Maria Dela Cruz',
  firstName: 'Alexandria Maria',
  lastName: 'Dela Cruz',
  initials: 'AC',
  riderId: 'RIDER-104',
  phone: '09171234567',
  email: 'alexandria.maria.delacruz@example.com',
  joinDate: 'October 1, 2026',
  status: 'Active',
};

const flush = () => act(async () => { await Promise.resolve(); });

beforeEach(() => {
  jest.clearAllMocks();
  mockOnline = true;
  mockProfile = { ...profile };
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (riderApiService.fetchProfilePhoto as jest.Mock).mockResolvedValue('data:image/jpeg;base64,previous');
  (riderApiService.uploadProfilePhoto as jest.Mock).mockResolvedValue(undefined);
  (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///chosen.jpg', fileName: 'chosen.jpg' }],
  });
  (ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValue({ uri: 'file:///resized.jpg', base64: 'YWJj' });
});

describe('profile actions after the layout update', () => {
  it('shows rider identity, hides account details and keeps editing, GPS and sign-out connected', async () => {
    const view = await render(<ProfileScreen />);
    await flush();
    expect(view.getByLabelText(profile.name)).toBeTruthy();
    expect(view.queryByText(profile.email)).toBeNull();
    expect(view.queryByText(profile.phone)).toBeNull();
    expect(view.queryByText('Account details')).toBeNull();
    expect(view.queryByText('Edit Account')).toBeNull();
    expect(view.queryByText('RIDER-104')).toBeNull();
    await fireEvent.press(view.getByTestId('edit-account'));
    await fireEvent.press(view.getByTestId('gps-calibration'));
    await fireEvent.press(view.getByLabelText('Sign out'));
    expect(mockNavigate.mock.calls).toEqual([['EditProfile'], ['GpsCalibration']]);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('shows availability from the auth context and sends the duty change to it', async () => {
    const view = await render(<ProfileScreen />);
    await flush();
    expect(view.getByText('Online')).toBeTruthy();
    expect(view.queryByText('Offline')).toBeNull();
    expect(view.queryByText('Available Online')).toBeNull();
    expect(view.getByText('You can receive errands when turned on and while location is set to "Allow all the time".')).toBeTruthy();
    expect(view.getByLabelText('Go offline').props.value).toBe(true);
    await fireEvent(view.getByLabelText('Go offline'), 'valueChange', false);
    expect(mockToggleShift).toHaveBeenCalledWith(false);
    mockOnline = false;
    await view.rerender(<ProfileScreen />);
    expect(view.getByText('Offline')).toBeTruthy();
    expect(view.queryByText('Online')).toBeNull();
    expect(view.getByLabelText('Go online').props.value).toBe(false);
  });

  it('hides the alert chime control without overwriting the saved sound preference', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('false');
    const view = await render(<ProfileScreen />);
    await flush();
    expect(view.queryByTestId('toggle-sounds-switch')).toBeNull();
    expect(view.queryByText('Audible Alert Chimes')).toBeNull();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('continues to resize and upload a chosen profile photo, then refreshes the profile', async () => {
    const view = await render(<ProfileScreen />);
    await flush();
    await act(async () => { await fireEvent.press(view.getByTestId('change-photo')); });
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file:///chosen.jpg', [{ resize: { width: 1024 } }],
      { compress: 0.8, format: 'jpeg', base64: true }
    );
    expect(riderApiService.uploadProfilePhoto).toHaveBeenCalledWith(profile.id, {
      photoData: 'data:image/jpeg;base64,YWJj', mimeType: 'image/jpeg', fileSize: 3, fileName: 'chosen.jpg',
    });
    expect(view.getByTestId('avatar-image').props.source.uri).toBe('data:image/jpeg;base64,YWJj');
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('keeps the previous photo and reports the existing error when an upload fails', async () => {
    mockProfile.photoUpdatedAt = '2026-10-20T01:00:00Z';
    (riderApiService.uploadProfilePhoto as jest.Mock).mockRejectedValue(new Error('offline'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    try {
      const view = await render(<ProfileScreen />);
      await flush();
      await act(async () => { await fireEvent.press(view.getByTestId('change-photo')); });
      expect(view.getByTestId('avatar-image').props.source.uri).toBe('data:image/jpeg;base64,previous');
      expect(alert).toHaveBeenCalledWith('Picture not saved', expect.any(String));
      expect(mockRefresh).not.toHaveBeenCalled();
    } finally {
      alert.mockRestore();
    }
  });
});
