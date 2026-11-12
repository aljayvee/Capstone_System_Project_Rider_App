import React from 'react';
import { fireEvent, render, within } from '@testing-library/react-native';
import NotificationsScreen from '../src/modules/notifications/NotificationsScreen';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockMarkRead = jest.fn(async () => undefined);
const mockMarkAllRead = jest.fn(async () => undefined);
const mockRefresh = jest.fn(async () => undefined);
const mockState: { notifications: any[]; isLoading: boolean; error: boolean } = {
  notifications: [],
  isLoading: false,
  error: false,
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('../src/context/ThemeContext', () => ({
  useThemeContext: () => ({ colors: require('../src/config/theme').Colors, isDark: false }),
}));
jest.mock('../src/context/RiderMissionContext', () => ({
  useRiderMissionContext: () => ({ activeErrands: [{ id: 'e-active' }] }),
}));
jest.mock('../src/context/RiderNotificationContext', () => ({
  useRiderNotifications: () => ({
    notifications: mockState.notifications,
    unreadCount: mockState.notifications.filter((n) => !n.isRead).length,
    isLoading: mockState.isLoading,
    error: mockState.error,
    markRead: mockMarkRead,
    markAllRead: mockMarkAllRead,
    refresh: mockRefresh,
  }),
}));

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const LIST = [
  { id: 1, type: 'ERRAND_ASSIGNED', title: 'New Errand Assigned', body: 'Errand 261022-ABCDE-0001, Gaisano', isRead: false, createdAt: minutesAgo(2), topic: 'OFFER', actionNeeded: true, errandId: 'e-new' },
  { id: 2, type: 'ITEMS_UPDATED', title: 'Items list changed', body: 'Check the list before you buy.', isRead: false, createdAt: minutesAgo(10), topic: 'ERRAND', actionNeeded: true, errandId: 'e-active' },
  { id: 3, type: 'RIDER_PAYMENT_CONFIRMED', title: 'Payment confirmed', body: 'Nothing to collect.', isRead: false, createdAt: minutesAgo(20), topic: 'PAYMENT', actionNeeded: false, errandId: 'e-old' },
  // Three days back: "Earlier" at any hour. It was 40 hours, which is
  // "Yesterday" from 16:00 to midnight, so "groups by day" failed every
  // evening (2026-11-06).
  { id: 4, type: 'DISPATCHER_CHAT', title: 'Message from Ana (2 new)', body: 'Nasa store ka na?', isRead: true, createdAt: minutesAgo(60 * 72), topic: 'CHAT', actionNeeded: false, dispatcherId: 7 },
];

async function setup(state: Partial<typeof mockState> = {}) {
  mockState.notifications = state.notifications ?? LIST;
  mockState.isLoading = state.isLoading ?? false;
  mockState.error = state.error ?? false;
  return (await render(<NotificationsScreen />)) as any;
}

beforeEach(() => jest.clearAllMocks());

describe('Rider Notifications screen', () => {
  it('counts each topic live, with no All chip', async () => {
    const view = await setup();
    const count = (key: string) => view.getByTestId(`notifications-filter-count-${key}`).props.children;
    expect(view.queryByTestId('notifications-filter-ALL')).toBeNull();
    expect(view.getByText('4 notifications')).toBeTruthy();
    expect(count('ACTION')).toBe(2);
    expect(count('OFFER')).toBe(1);
    expect(count('ERRAND')).toBe(1);
    expect(count('PAYMENT')).toBe(1);
    expect(count('CHAT')).toBe(1);
  });

  it('filters by a topic and clears it on a second tap', async () => {
    const view = await setup();
    await fireEvent.press(view.getByTestId('notifications-filter-ACTION'));
    expect(view.getByText('2 of 4')).toBeTruthy();
    expect(view.queryByTestId('notifications-row-3')).toBeNull();
    expect(view.getByTestId('notifications-action-1')).toBeTruthy();
    await fireEvent.press(view.getByTestId('notifications-filter-ACTION'));
    expect(view.getByTestId('notifications-row-3')).toBeTruthy();
  });

  it('sorts from the Sort by menu', async () => {
    const view = await setup();
    expect(view.getByText('Sort by: Newest first')).toBeTruthy();
    await fireEvent.press(view.getByTestId('notifications-sort-button'));
    await fireEvent.press(view.getByTestId('notifications-sort-ACTION'));
    expect(view.getByText('Sort by: Action needed first')).toBeTruthy();
    expect(view.getByTestId('notifications-section-Action needed')).toBeTruthy();
    expect(view.getByTestId('notifications-section-Everything else')).toBeTruthy();
  });

  it('groups by day', async () => {
    const view = await setup();
    expect(view.getByTestId('notifications-section-Today')).toBeTruthy();
    expect(view.getByTestId('notifications-section-Earlier')).toBeTruthy();
  });

  it('searches and offers to clear a search with no match', async () => {
    const view = await setup();
    await fireEvent.changeText(view.getByTestId('notifications-search'), 'zzz');
    expect(within(view.getByTestId('notifications-empty')).getByText('No matches')).toBeTruthy();
    await fireEvent.press(view.getByTestId('notifications-empty-clear-search'));
    expect(view.getByTestId('notifications-row-1')).toBeTruthy();
  });

  it('stays light when the phone is in dark mode (the rider app has no dark theme)', async () => {
    const RN = require('react-native');
    const spy = jest.spyOn(RN, 'useColorScheme').mockReturnValue('dark');
    const { Colors } = require('../src/config/theme');
    const view = await setup();
    const flat = (style: any) => require('react-native').StyleSheet.flatten(style);
    expect(flat(view.getByTestId('notifications-search').props.style).color).toBe(Colors.textDark);
    expect(flat(view.getByTestId('notifications-filter-OFFER').props.style).backgroundColor).toBe(Colors.card);
    spy.mockRestore();
  });

  it('marks everything read', async () => {
    const view = await setup();
    await fireEvent.press(view.getByTestId('notifications-read-all'));
    expect(mockMarkAllRead).toHaveBeenCalled();
  });

  it('shows skeleton rows on the first load', async () => {
    const view = await setup({ notifications: [], isLoading: true });
    expect(view.getByTestId('notifications-skeleton')).toBeTruthy();
  });

  it('offers a retry when nothing loaded', async () => {
    const view = await setup({ notifications: [], error: true });
    await fireEvent.press(view.getByTestId('notifications-error-retry'));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('keeps a stale list with a notice when only a refresh failed', async () => {
    const view = await setup({ error: true });
    expect(view.getByTestId('notifications-refresh-error')).toBeTruthy();
    expect(view.getByTestId('notifications-row-1')).toBeTruthy();
  });

  it('routes a tap: offer to Home, errand in hand to Task, other errand to details, chat to chat', async () => {
    const view = await setup();
    await fireEvent.press(view.getByTestId('notifications-row-1'));
    expect(mockMarkRead).toHaveBeenCalledWith(1);
    expect(mockNavigate).toHaveBeenLastCalledWith('Tabs');
    await fireEvent.press(view.getByTestId('notifications-row-2'));
    expect(mockNavigate).toHaveBeenLastCalledWith('Task');
    await fireEvent.press(view.getByTestId('notifications-row-3'));
    expect(mockNavigate).toHaveBeenLastCalledWith('ErrandDetails', { errandId: 'e-old' });
    await fireEvent.press(view.getByTestId('notifications-row-4'));
    expect(mockNavigate).toHaveBeenLastCalledWith('DispatcherChat');
  });
});
