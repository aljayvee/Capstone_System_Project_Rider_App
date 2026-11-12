import React from 'react';
jest.mock('../src/services/arrivalQueue', () => ({ reportStoreArrival: jest.fn().mockResolvedValue(undefined) }));
import { DeviceEventEmitter, Text, View } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  NavigationContainer,
  StackRouter,
  createNavigationContainerRef,
  createNavigatorFactory,
  useNavigationBuilder,
} from '@react-navigation/native';

/**
 * Android Back on the dispatcher chat opened from a task (2026-11-06).
 *
 * The task screen's own Back listener stays registered under the chat, and
 * React Native asks the newest listener first; it is set up again on every
 * sheet change, so it is usually the newest. With the errand sheet expanded
 * it collapsed that hidden sheet and claimed the press: the chat stayed open
 * and Back looked dead.
 *
 * The real React Navigation 6 router and container, the real TaskScreen and
 * the real Android BackHandler. The stack is a minimal navigator that keeps
 * every screen mounted, as a stack does, without the JS stack's gesture and
 * animation layer (mocked out in this suite).
 */

jest.setTimeout(60000);

// The real Android BackHandler (jest otherwise loads the iOS no-op).
jest.mock('react-native/Libraries/Utilities/BackHandler', () =>
  jest.requireActual('react-native/Libraries/Utilities/BackHandler.android')
);

let mockMapProps: any = null;
jest.mock('../src/components/LiveErrandMap', () => {
  const { View: MockView } = require('react-native');
  return {
    LiveErrandMap: (props: any) => {
      mockMapProps = props;
      return <MockView testID="map" />;
    },
  };
});

// The real @react-navigation/native: this is about the stack.

jest.mock('react-native-gesture-handler', () => {
  const chain: any = new Proxy({}, { get: () => () => chain });
  return {
    GestureDetector: ({ children }: any) => children,
    Gesture: { Pan: () => chain },
  };
});

jest.mock('../src/hooks/useLiveRoute', () => ({
  useLiveRoute: () => ({
    roadCoordinates: null,
    steps: [],
    distanceMeters: 1200,
    durationSeconds: 180,
    isFallback: false,
    isRerouting: false,
    lastFailure: null,
    selection: null,
  }),
}));

jest.mock('../src/config/mapTiles', () => ({ useOsmTilesAvailable: () => false }));

let mockItemsProps: any[] = [];
jest.mock('../src/modules/task/components', () => {
  const { View: MockView } = require('react-native');
  const none = () => null;
  return {
    CustomerDetailsPanel: none,
    RequestItemsPanel: (props: any) => {
      mockItemsProps.push(props);
      return null;
    },
    ProgressSteps: none,
    CashCollectionInput: none,
    PaymentProofViewer: none,
    UploadModal: none,
    // The real one: its capsules are how an errand's task opens in full.
    FeeCapsuleBar: jest.requireActual('../src/modules/task/components/FeeCapsuleBar').FeeCapsuleBar,
    // The real one: it is how the rider picks the queued errand here.
    ErrandQueueList: jest.requireActual('../src/modules/task/components/ErrandQueueList').ErrandQueueList,
  };
});
jest.mock('../src/components/FeeBreakdownPanel', () => ({ FeeBreakdownPanel: () => null }));
jest.mock('../src/components/WaybillModal', () => ({ WaybillModal: () => null }));
jest.mock('../src/screens/ReceiptCaptureScreen', () => () => null);

const mockStoreA = { id: 11, storeName: 'Store A', latitude: 6.69, longitude: 124.67, sequence: 1 };
const mockStoreB = { id: 21, storeName: 'Store B', latitude: 6.7, longitude: 124.68, sequence: 1 };

const mockErrandA = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  customer: 'Ana Cruz',
  address: 'Poblacion, Tacurong',
  deliveryStreetName: 'Purok 5, Mabini St.',
  deliveryLandmark: 'Blue gate beside the chapel',
  deliveryNotes: 'Call when outside, the dog barks.',
  customerPhone: '',
  deliveryLatitude: 6.691,
  deliveryLongitude: 124.671,
  pinpoints: [mockStoreA],
  payload: [{ name: 'Store A', items: ['Bread'], pinpointId: 11, storeCategory: null }],
  details: 'Bread x1',
  paymentMode: 'COD',
  merchantCategories: [],
};
const mockErrandB = {
  ...mockErrandA,
  id: 'bbbbbbbb-0000-0000-0000-000000000002',
  customer: 'Ben Reyes',
  deliveryLatitude: 6.71,
  deliveryLongitude: 124.69,
  pinpoints: [mockStoreB],
  payload: [{ name: 'Store B', items: ['Milk'], pinpointId: 21, storeCategory: null }],
  details: 'Milk x1',
};

const mockSlot = (overrides: any = {}) => ({
  currentStatus: 'Traveling',
  completedSubtasks: {},
  handoverCaptured: false,
  collectedAmount: '',
  shortPayment: false,
  showComplete: false,
  proofImageId: null,
  departedStoreIds: [],
  deferredStoreIds: [],
  ...overrides,
});

const mockStartErrandFirst = jest.fn(() => true);
let mockFront: any = mockSlot({ currentStatus: 'At Store', completedSubtasks: { 0: true }, departedStoreIds: [] });
let mockSlotB: any = mockSlot();
// Which errand a held one waits for (errandQueue.deliveryHolds). Empty: none held.
let mockHolds: Record<string, any> = {};

jest.mock('../src/context/RiderMissionContext', () => ({
  useRiderMissionContext: () => ({
    phase: 'active',
    isOffline: false,
    currentStatus: mockFront.currentStatus,
    completedSubtasks: mockFront.completedSubtasks,
    departedStoreIds: mockFront.departedStoreIds,
    deferredStoreIds: [],
    // The merged card: both errands' stores at once.
    errand: { ...mockErrandA, id: `${mockErrandA.id} + ${mockErrandB.id}`, pinpoints: [mockStoreA, mockStoreB] },
    activeErrands: [mockErrandA, mockErrandB],
    offeredErrands: [],
    workingErrand: mockErrandA,
    progressFor: (id: string) => (id === mockErrandA.id ? mockFront : mockSlotB),
    startErrandFirst: mockStartErrandFirst,
    deliveryHoldFor: (id: string) => mockHolds[id] ?? null,
    paymentMode: 'COD',
    collectedAmount: '',
    advanceStatus: jest.fn(),
    riderLocation: { latitude: 6.69, longitude: 124.67, heading: null, updatedAt: 0, accuracyMeters: 5 },
    isDelivered: false,
    setShowWaybill: jest.fn(),
    setUnreadDR: jest.fn(),
    unreadDR: false,
    banner: null,
    dismissBanner: jest.fn(),
    storeArrival: { advancedAutomatically: false, arrivingAt: null },
    handoverCaptured: false,
    isMissionAccepted: true,
    receiptTarget: null,
    showUploadModal: false,
    showWaybill: false,
    storeArrivalTimestamp: null,
    deferStore: jest.fn(),
    finishStoreShopping: jest.fn(),
    dueAtDoor: 0,
    substituteNotice: null,
    dismissSubstituteNotice: jest.fn(),
  }),
}));


// eslint-disable-next-line import/first
import TaskScreen from '../src/modules/task/TaskScreen';

function KeepMountedStack({ initialRouteName, children, screenOptions }: any) {
  const { state, descriptors, NavigationContent } = useNavigationBuilder(StackRouter, {
    initialRouteName,
    children,
    screenOptions,
  });
  return (
    <NavigationContent>
      {state.routes.map((route, i) => (
        <View key={route.key} style={{ display: i === state.index ? 'flex' : 'none' }}>
          {descriptors[route.key].render()}
        </View>
      ))}
    </NavigationContent>
  );
}
const Stack = createNavigatorFactory(KeepMountedStack)();

const TabsStandIn = () => <Text>Tabs</Text>;
const DispatcherChatStandIn = () => <Text testID="dispatcher-chat">Dispatcher chat</Text>;

async function renderTaskInStack() {
  const navRef = createNavigationContainerRef<any>();
  const view: any = await render(
    <NavigationContainer ref={navRef}>
      <Stack.Navigator initialRouteName="Tabs">
        <Stack.Screen name="Tabs" component={TabsStandIn} />
        <Stack.Screen name="Task" component={TaskScreen as any} />
        <Stack.Screen name="DispatcherChat" component={DispatcherChatStandIn} />
      </Stack.Navigator>
    </NavigationContainer>
  );
  await waitFor(() => expect(navRef.isReady()).toBe(true));
  await act(async () => {
    navRef.navigate('Task');
  });
  await act(async () => {});
  const stack = () => navRef.getRootState()?.routes.map((r: any) => r.name) ?? [];
  const focused = () => navRef.getCurrentRoute()?.name;
  return { view, navRef, stack, focused };
}

const pressHardwareBack = async () => {
  await act(async () => {
    DeviceEventEmitter.emit('hardwareBackPress', {});
  });
  await act(async () => {});
};

beforeEach(() => {
  mockItemsProps = [];
  mockFront = mockSlot({ currentStatus: 'At Store', completedSubtasks: { 0: true } });
  mockSlotB = mockSlot();
  mockHolds = {};
});

describe('Android Back on the dispatcher chat opened from a task', () => {
  it('closes the chat even with the errand sheet expanded, and leaves the sheet as it was', async () => {
    const { view, stack, focused } = await renderTaskInStack();
    expect(focused()).toBe('Task');

    // The rider opens the sheet to read the list, then chats with the dispatcher.
    await act(async () => {
      fireEvent.press(view.getAllByLabelText('Expand errand sheet')[0]);
    });
    expect(view.getAllByLabelText('Collapse errand sheet', { includeHiddenElements: true }).length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.press(view.getByTestId('header-chat-btn'));
    });
    await waitFor(() => expect(focused()).toBe('DispatcherChat'));
    expect(stack()).toEqual(['Tabs', 'Task', 'DispatcherChat']);

    await pressHardwareBack();

    expect(stack()).toEqual(['Tabs', 'Task']);
    expect(focused()).toBe('Task');
    // The sheet is where the rider left it.
    expect(view.getAllByLabelText('Collapse errand sheet').length).toBeGreaterThan(0);
  });

  it('still collapses the expanded sheet first while the task is in front', async () => {
    const { view, stack } = await renderTaskInStack();
    await act(async () => {
      fireEvent.press(view.getAllByLabelText('Expand errand sheet')[0]);
    });

    await pressHardwareBack();

    expect(stack()).toEqual(['Tabs', 'Task']);
    expect(view.getAllByLabelText('Expand errand sheet').length).toBeGreaterThan(0);
  });
});
