import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { useRiderMissionSocket } from '../src/hooks/useRiderMissionSocket';

const mockHandlers = new Map<string, (...args: any[]) => void>();
const mockSocket = {
  connected: true,
  emit: jest.fn(),
  volatile: { emit: jest.fn() },
  on: jest.fn((event, handler) => mockHandlers.set(event, handler)),
  onAny: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
};
jest.mock('socket.io-client', () => ({ io: () => mockSocket }));
jest.mock('../src/config/apiBaseUrl', () => ({ API_BASE_URL: 'https://example.test/api' }));
jest.mock('../src/services/apiClient', () => ({ resolveRiderSocketToken: jest.fn() }));
jest.mock('../src/utils/formatErrandId', () => ({ rememberErrandReferences: jest.fn() }));
jest.mock('../src/services/liveLocationSocket', () => ({
  currentLiveLocationSocket: () => mockSocket,
  registerLiveLocationSocket: jest.fn(),
}));
jest.mock('../src/services/notificationEvents', () => ({ notificationArrived: { emit: jest.fn() } }));

let appChange: (state: AppStateStatus) => void;
const initialState = AppState.currentState;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockHandlers.clear();
  mockSocket.connected = true;
  AppState.currentState = 'active';
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, fn) => {
    appChange = fn;
    return { remove: jest.fn() };
  });
});
afterEach(() => {
  AppState.currentState = initialState;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it('pauses foreground heartbeats when backgrounded, and resumes when active', async () => {
  const view = await renderHook(() => useRiderMissionSocket(3, jest.fn()));
  await act(async () => { mockHandlers.get('connect')!(); });
  expect(mockSocket.volatile.emit).toHaveBeenCalledWith('rider:heartbeat');
  await act(async () => {
    AppState.currentState = 'background';
    appChange('background');
  });
  expect(mockSocket.emit).toHaveBeenCalledWith('rider:heartbeat_pause');
  const sent = mockSocket.volatile.emit.mock.calls.length;
  await act(async () => { jest.advanceTimersByTime(5_000); });
  expect(mockSocket.volatile.emit).toHaveBeenCalledTimes(sent);
  await act(async () => {
    AppState.currentState = 'active';
    appChange('active');
  });
  expect(mockSocket.volatile.emit).toHaveBeenCalledTimes(sent + 1);
  await view.unmount();
});

it('repeats the pause after a reconnect while still backgrounded', async () => {
  AppState.currentState = 'background';
  const view = await renderHook(() => useRiderMissionSocket(3, jest.fn()));
  await act(async () => { mockHandlers.get('connect')!(); });
  expect(mockSocket.emit).toHaveBeenCalledWith('rider:heartbeat_pause');
  expect(mockSocket.volatile.emit).not.toHaveBeenCalled();
  await view.unmount();
});
