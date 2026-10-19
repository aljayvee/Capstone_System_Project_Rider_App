import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

/**
 * Two errands in hand on the Task tab. The bug this covers: the rider
 * photographed the first errand's receipt, and on opening the second errand
 * its stops already read "Receipt saved". The sheet gave every errand the
 * front errand's step and ticked sections (keyed by section index), and the
 * map routed every errand's stores as one run, so finishing the first errand's
 * only store "went to the next store", which was the second errand's.
 */

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

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true }),
  useIsFocused: () => true,
}));

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

async function renderTask() {
  const view = await render(<TaskScreen />);
  await act(async () => {});
  return view;
}

const lastItemsProps = () => mockItemsProps[mockItemsProps.length - 1];

beforeEach(() => {
  mockItemsProps = [];
  mockStartErrandFirst.mockClear();
  mockFront = mockSlot({ currentStatus: 'At Store', completedSubtasks: { 0: true } });
  mockSlotB = mockSlot();
  mockHolds = {};
});

describe('two errands in hand', () => {
  it('routes the errand in hand only, not every errand at once', async () => {
    await renderTask();
    expect(mockMapProps.pinpoints).toEqual([mockStoreA]);
    expect(mockMapProps.destination).toMatchObject({ latitude: mockErrandA.deliveryLatitude });
  });

  it("shows a queued errand with its own progress, not the front errand's", async () => {
    const view = await renderTask();
    // The front errand's first section has its receipt.
    expect(lastItemsProps().completedSubtasks).toEqual({ 0: true });
    expect(lastItemsProps().readOnly).toBe(false);

    await act(async () => {
      fireEvent.press(view.getByTestId('errand-queue-row-1'));
    });

    const queued = lastItemsProps();
    expect(queued.errand.id).toBe(mockErrandB.id);
    expect(queued.completedSubtasks).toEqual({});
    expect(queued.currentStatus).toBe('Traveling');
    // Nothing on it can be checked or photographed until it is in hand.
    expect(queued.readOnly).toBe(true);
    expect(queued.activeStoreTargetId).toBeNull();
    expect(view.getByTestId('sheet-status-label').props.children).toBe('Queued, 2nd');
  });

  it('says what to finish first, and offers to start the queued one instead', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const view = await renderTask();
    await act(async () => {
      fireEvent.press(view.getByTestId('errand-queue-row-1'));
    });

    expect(view.getByTestId('queued-dock')).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByTestId('start-errand-first-btn'));
    });
    expect(alert).toHaveBeenCalled();
    // Nothing changes until the rider confirms.
    expect(mockStartErrandFirst).not.toHaveBeenCalled();

    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.text === 'Start this first')?.onPress?.();
    });
    // Standing in Store A, which is the stop the set-aside errand is left at.
    expect(mockStartErrandFirst).toHaveBeenCalledWith(mockErrandB.id, { leavingStoreId: mockStoreA.id });
    alert.mockRestore();
  });

  it("opens a queued errand's own task in full from its fee capsule", async () => {
    const view = await renderTask();
    await act(async () => {
      fireEvent.press(view.getByTestId('fee-capsule-1'));
    });
    expect(view.getByTestId('full-task-back-btn')).toBeTruthy();
    expect(view.getByTestId('sheet-status-label').props.children).toBe('Queued, 2nd');
  });

  it('does not offer the switch once the front errand is bought and on its way', async () => {
    mockFront = mockSlot({ currentStatus: 'Delivering' });
    const view = await renderTask();
    // Riding to the customer, the sheet starts in map mode: open the errand in
    // full from its fee capsule first.
    await act(async () => {
      fireEvent.press(view.getByTestId('fee-capsule-0'));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('errand-queue-row-1'));
    });
    expect(view.queryByTestId('start-errand-first-btn')).toBeNull();
    expect(view.getByTestId('queued-dock')).toBeTruthy();
  });
});

describe('the drop-off preview while shopping', () => {
  it("shows the customer's whole address: street, landmark and the note for the rider", async () => {
    const view = await renderTask();

    expect(view.getByText('Drop-off: Ana Cruz')).toBeTruthy();
    // No longer cut to one line.
    const address = view.getByTestId('dropoff-address');
    expect(address.props.children).toBe('Poblacion, Tacurong');
    expect(address.props.numberOfLines).toBeUndefined();
    expect(view.getByText('Street: Purok 5, Mabini St.')).toBeTruthy();
    expect(view.getByText('Landmark: Blue gate beside the chapel')).toBeTruthy();
    expect(view.getByText('Note for the rider: Call when outside, the dog barks.')).toBeTruthy();
  });
});

describe("the same customer's two orders, one trip to the door", () => {
  beforeEach(() => {
    // B is bought and waits while A, the same customer's other order, is shopped.
    mockSlotB = mockSlot({ currentStatus: 'Delivering' });
    mockHolds = { [mockErrandB.id]: mockErrandA };
  });

  it('tells the rider the order in hand is the one the bought order waits for', async () => {
    const view = await renderTask();
    expect(view.getByTestId('delivery-hold-waiting-note')).toBeTruthy();
    expect(view.getByTestId('errand-queue-row-1')).toBeTruthy();
    expect(view.getByText(/^Waits for .*, then delivered with it$/)).toBeTruthy();
  });

  it('shows the held order as on hold, with no way to start it first', async () => {
    const view = await renderTask();
    await act(async () => {
      fireEvent.press(view.getByTestId('errand-queue-row-1'));
    });

    expect(view.getByTestId('delivery-hold-note')).toBeTruthy();
    expect(view.getByTestId('held-dock-note')).toBeTruthy();
    expect(view.queryByTestId('start-errand-first-btn')).toBeNull();
  });
});
