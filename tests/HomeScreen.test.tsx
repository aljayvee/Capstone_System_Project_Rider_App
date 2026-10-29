import React from 'react';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import HomeScreen from '../src/modules/home/HomeScreen';
import { formatEarnings } from '../src/utils/earnings';
import { riderApiService } from '../src/config/apiConfig';

const mockNavigate = jest.fn();
const mockMarkRead = jest.fn();
let mockOnline = true;
let mockMission: any;

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../src/context/ThemeContext', () => ({
  useThemeContext: () => ({ colors: require('../src/config/theme').Colors, isDark: false }),
}));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }), useIsFocused: () => true }));
jest.mock('../src/context/RiderMissionContext', () => ({ useRiderMissionContext: () => mockMission }));
jest.mock('../src/context/RiderAuthContext', () => ({ useRiderAuth: () => ({ isOnline: mockOnline }) }));
jest.mock('../src/config/apiConfig', () => ({
  riderApiService: { fetchProfilePhoto: jest.fn() },
}));
jest.mock('../src/hooks/useMaintenanceNotice', () => ({ useMaintenanceNotice: () => ({ isActive: false }) }));
jest.mock('../src/hooks/useNotifications', () => ({
  useNotifications: () => ({
    notifications: [{ id: 1, title: 'Dispatch update', body: 'Your dispatcher sent an update.', createdAt: '2026-10-22T01:00:00Z', isRead: false }],
    unreadCount: 1, isLoading: false, markRead: mockMarkRead,
  }),
}));
jest.mock('../src/components/WaybillModal', () => ({ WaybillModal: () => null }));
// Exercise offer callbacks without substituting a tap for a real swipe in the app.
jest.mock('../src/components/SlideToConfirm', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return {
    SlideToConfirm: ({ label, disabled, onSlideComplete }: any) => (
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onSlideComplete}>
        <Text>{label}</Text>
      </TouchableOpacity>
    ),
  };
});

const offer = (id: string, customer: string, riderShare = 35) => ({
  id, customer, address: 'Poblacion, Tacurong City, near the public market',
  status: 'Assigned', assignedAt: '2026-10-22T01:00:00Z',
  merchantCategories: [], pinpoints: [{ id: 1, storeName: `Store for ${customer}` }],
  riderEarnings: { deliveryFee: 70, commissionRate: 0.5, riderShare, tip: 0, itemCostExcluded: 200 },
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-22T01:00:00Z'));
  mockOnline = true;
  (riderApiService.fetchProfilePhoto as jest.Mock).mockReset().mockResolvedValue(null);
  mockMission = {
    phase: 'waiting', isOffline: false, offeredErrands: [], errand: null, workingErrand: null,
    isMissionAccepted: false, isAccepting: false, errorMessage: '', banner: null,
    riderProfile: { id: 'rider-1', name: 'Maria Santos', riderId: 'RIDER-RDR-104', initials: 'MS' },
    showDeclineModal: false, declineReason: '', showWaybill: false,
    acceptMission: jest.fn(), expireOffer: jest.fn(), setShowDeclineModal: jest.fn(),
    setDeclineReason: jest.fn(), declineMission: jest.fn(), refresh: jest.fn(),
    setShowWaybill: jest.fn(), dismissBanner: jest.fn(), resetForNextErrand: jest.fn(),
  };
});
afterEach(() => { jest.useRealTimers(); });

describe('Home screen actions and states', () => {
  it('hides the rider ID and shows initials when no profile photo exists', async () => {
    const view = await render(<HomeScreen />);
    expect(view.getByText('Maria Santos')).toBeTruthy();
    expect(view.getByText('MS')).toBeTruthy();
    expect(view.queryByText(/RIDER-/)).toBeNull();
    expect(view.queryByTestId('home-avatar-image')).toBeNull();
    expect(riderApiService.fetchProfilePhoto).not.toHaveBeenCalled();
  });

  it('loads the Profile photo API and refreshes the Home image after a photo change', async () => {
    mockMission.riderProfile.photoUpdatedAt = '2026-10-22T01:00:00Z';
    const photoApi = riderApiService.fetchProfilePhoto as jest.Mock;
    photoApi.mockResolvedValue('data:image/jpeg;base64,first');
    const view = await render(<HomeScreen />);
    expect(photoApi).toHaveBeenCalledWith('rider-1');
    expect(view.getByTestId('home-avatar-image').props.source.uri).toBe('data:image/jpeg;base64,first');
    photoApi.mockResolvedValue('data:image/jpeg;base64,updated');
    mockMission.riderProfile.photoUpdatedAt = '2026-10-22T02:00:00Z';
    await view.rerender(<HomeScreen />);
    expect(photoApi).toHaveBeenCalledTimes(2);
    expect(view.getByTestId('home-avatar-image').props.source.uri).toBe('data:image/jpeg;base64,updated');
    await fireEvent(view.getByTestId('home-avatar-image'), 'error');
    expect(view.getByText('MS')).toBeTruthy();
    expect(view.queryByTestId('home-avatar-image')).toBeNull();
  });

  it('ignores a late photo response for a different rider and keeps initials on failure', async () => {
    let resolveOldPhoto!: (uri: string) => void;
    const photoApi = riderApiService.fetchProfilePhoto as jest.Mock;
    photoApi.mockImplementationOnce(() => new Promise<string>(resolve => { resolveOldPhoto = resolve; }));
    mockMission.riderProfile.photoUpdatedAt = '2026-10-22T01:00:00Z';
    const view = await render(<HomeScreen />);
    photoApi.mockRejectedValueOnce(new Error('offline'));
    mockMission.riderProfile = { ...mockMission.riderProfile, id: 'rider-2', name: 'Alex Cruz', initials: 'AC' };
    await view.rerender(<HomeScreen />);
    await act(async () => { resolveOldPhoto('data:image/jpeg;base64,old-rider'); });
    expect(photoApi).toHaveBeenLastCalledWith('rider-2');
    expect(view.getByText('AC')).toBeTruthy();
    expect(view.queryByTestId('home-avatar-image')).toBeNull();
  });

  it('accepts only the selected offer and keeps each fee breakdown with its offer', async () => {
    mockMission.offeredErrands = [offer('offer-a', 'Customer A'), offer('offer-b', 'Customer B', 40)];
    const view = await render(<HomeScreen />);
    expect(view.getAllByText('Fee Breakdown')).toHaveLength(2);
    expect(view.getByText('Customer A')).toBeTruthy();
    expect(view.getByText('Customer B')).toBeTruthy();
    await fireEvent.press(view.getAllByLabelText('Slide to accept')[1]);
    expect(mockMission.acceptMission.mock.calls).toEqual([['offer-b']]);
    expect(mockNavigate.mock.calls).toEqual([['Task']]);
  });

  it('keeps the decline reason, cancellation and submission connected to the existing modal', async () => {
    mockMission.offeredErrands = [offer('offer-a', 'Customer A')];
    const view = await render(<HomeScreen />);
    await fireEvent.press(view.getByLabelText('Decline this offer'));
    expect(mockMission.setShowDeclineModal).toHaveBeenCalledWith(true);
    mockMission.showDeclineModal = true;
    await view.rerender(<HomeScreen />);
    await fireEvent.changeText(view.getByLabelText('Reason for declining'), 'Vehicle needs repair');
    expect(mockMission.setDeclineReason).toHaveBeenCalledWith('Vehicle needs repair');
    mockMission.declineReason = 'Vehicle needs repair';
    await view.rerender(<HomeScreen />);
    await fireEvent.press(view.getByLabelText('Confirm and decline this errand'));
    expect(mockMission.declineMission).toHaveBeenCalledTimes(1);
    await fireEvent.press(view.getByLabelText('Keep this errand'));
    expect(mockMission.setShowDeclineModal).toHaveBeenCalledWith(false);
  });

  it('expires each unanswered offer through its own callback', async () => {
    mockMission.offeredErrands = [offer('offer-a', 'Customer A'), offer('offer-b', 'Customer B')];
    await render(<HomeScreen />);
    await act(async () => { jest.advanceTimersByTime(46_000); });
    expect(mockMission.expireOffer.mock.calls).toEqual([['offer-a'], ['offer-b']]);
    expect(mockMission.setShowDeclineModal).not.toHaveBeenCalled();
  });

  it('resumes the active errand and reserves scrolling space for the measured navigation dock', async () => {
    mockMission.isMissionAccepted = true;
    mockMission.errand = offer('current', 'Current customer');
    const view = await render(<HomeScreen />);
    expect(view.getByText('Your errand is in progress')).toBeTruthy();
    expect(view.queryByText('Ready for next errand')).toBeNull();
    const dock = view.getByTestId('home-task-dock');
    await fireEvent(dock, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 84 } } });
    const bottom = StyleSheet.flatten(dock.props.style).bottom as number;
    const padding = StyleSheet.flatten(view.getByTestId('home-scroll').props.contentContainerStyle).paddingBottom as number;
    expect(padding).toBeGreaterThanOrEqual(bottom + 84);
    await fireEvent.press(within(dock).getByLabelText('Open active task in navigation'));
    expect(mockNavigate).toHaveBeenCalledWith('Task');
  });

  it('distinguishes off duty from no connection and only offers saved details when an errand exists', async () => {
    mockOnline = false;
    const view = await render(<HomeScreen />);
    expect(view.getByText("You're off duty")).toBeTruthy();
    expect(view.queryByText('Available for dispatch')).toBeNull();
    mockMission.isOffline = true;
    await view.rerender(<HomeScreen />);
    expect(view.getByText('No connection')).toBeTruthy();
    expect(view.queryByLabelText('See what to buy, saved on this phone')).toBeNull();
    mockMission.errand = offer('current', 'Current customer');
    await view.rerender(<HomeScreen />);
    await fireEvent.press(view.getByLabelText('See what to buy, saved on this phone'));
    expect(mockMission.setShowWaybill).toHaveBeenCalledWith(true);
  });

  it('retries a failed load through the existing refresh handler', async () => {
    mockMission.phase = 'error';
    mockMission.errorMessage = 'Please check your connection.';
    const view = await render(<HomeScreen />);
    await fireEvent.press(view.getByLabelText('Try loading your errand again'));
    expect(mockMission.refresh).toHaveBeenCalledTimes(1);
  });

  it('shows the delivered errand earnings and keeps the next-errand action connected', async () => {
    mockMission.phase = 'completed';
    mockMission.errand = offer('merged', 'Merged customers', 99);
    mockMission.workingErrand = offer('delivered', 'Delivered customer');
    const view = await render(<HomeScreen />);
    expect(view.getByText(formatEarnings(mockMission.workingErrand))).toBeTruthy();
    expect(view.queryByText(formatEarnings(mockMission.errand))).toBeNull();
    await fireEvent.press(view.getByLabelText('Take the next errand'));
    expect(mockMission.resetForNextErrand).toHaveBeenCalledTimes(1);
  });

  it('opens the Notifications screen from the bell, which shows the unread count', async () => {
    const view = await render(<HomeScreen />);
    expect(view.getByLabelText('Notifications, 1 unread')).toBeTruthy();
    await fireEvent.press(view.getByTestId('rider-notification-bell'));
    expect(mockNavigate).toHaveBeenCalledWith('Notifications');
  });
});
