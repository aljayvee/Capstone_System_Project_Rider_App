import React from 'react';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { BackHandler, View } from 'react-native';

/**
 * The Task tab's layout, rendered: what is on screen with the sheet closed,
 * and how the floating layers stack. The bugs this covers:
 *
 *   - the next-step button sat at the bottom of the sheet, which closed shows
 *     only its top, so "I've arrived" could not be pressed without dragging;
 *   - a floating chat dome duplicated the header's chat button and fought the
 *     map controls for the same corner;
 *   - the fee capsules sat at a fixed 82 dp that a two-line navigation panel
 *     outgrew, and the open sheet rose over both.
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

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockCanGoBack = jest.fn().mockReturnValue(true);

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    canGoBack: mockCanGoBack,
  }),
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
    steps: [{ instruction: 'Head out', streetName: 'J. C. Avenue', maneuverType: 'depart', distanceMeters: 200, durationSeconds: 30, location: { latitude: 0, longitude: 0 }, coordinates: [] }],
    distanceMeters: 1200,
    durationSeconds: 180,
    isFallback: false,
    isRerouting: false,
    lastFailure: null,
    selection: null,
  }),
}));

jest.mock('../src/config/mapTiles', () => ({ useOsmTilesAvailable: () => false }));

jest.mock('../src/services/errandGate', () => ({
  errandGate: () => ({ canAdvance: true, blockedReason: null, halfPayment: null }),
  nextAction: () => null,
  isCashCollected: () => false,
}));

jest.mock('../src/modules/task/components', () => {
  const { View: MockView } = require('react-native');
  const none = () => null;
  return {
    CustomerDetailsPanel: none,
    RequestItemsPanel: none,
    ProgressSteps: none,
    CashCollectionInput: none,
    PaymentProofViewer: none,
    UploadModal: none,
    // The real one: its capsules are how an errand's task opens in full.
    FeeCapsuleBar: jest.requireActual('../src/modules/task/components/FeeCapsuleBar').FeeCapsuleBar,
    ErrandQueueList: none,
  };
});
jest.mock('../src/components/FeeBreakdownPanel', () => ({ FeeBreakdownPanel: () => null }));
jest.mock('../src/components/WaybillModal', () => ({ WaybillModal: () => null }));
jest.mock('../src/screens/ReceiptCaptureScreen', () => () => null);

const errand = {
  id: 'e-1',
  customer: 'Maria Santos',
  address: 'Poblacion, Tacurong',
  customerPhone: '09171234567',
  deliveryLatitude: 6.69,
  deliveryLongitude: 124.68,
  pinpoints: [],
  payload: null,
  details: null,
  paymentMode: 'COD',
};

let mockUnread = false;
let mockArrivingAt: any = null;
let mockErrands: any[] = [errand];
let mockStatus = 'Traveling';
const farFromEverything = { latitude: 6.68, longitude: 124.67, heading: null, updatedAt: 0, accuracyMeters: 5 };
let mockLocation: any = farFromEverything;
const mockReportArrival = jest.fn().mockResolvedValue(undefined);
const mockAdvanceStatus = jest.fn();
jest.mock('../src/services/arrivalQueue', () => ({ reportStoreArrival: (...args: unknown[]) => mockReportArrival(...args) }));

jest.mock('../src/context/RiderMissionContext', () => ({
  useRiderMissionContext: () => ({
    phase: 'active',
    isOffline: false,
    currentStatus: mockStatus,
    errand,
    activeErrands: mockErrands,
    offeredErrands: [],
    workingErrand: mockErrands[0] ?? errand,
    progressFor: () => ({
      currentStatus: mockStatus,
      completedSubtasks: {},
      handoverCaptured: false,
      collectedAmount: '',
      shortPayment: false,
      showComplete: false,
      proofImageId: null,
      departedStoreIds: [],
      deferredStoreIds: [],
    }),
    startErrandFirst: jest.fn(),
    completedSubtasks: {},
    departedStoreIds: [],
    deferredStoreIds: [],
    stepIndex: 0,
    paymentMode: 'COD',
    collectedAmount: '',
    advanceStatus: mockAdvanceStatus,
    riderLocation: mockLocation,
    isDelivered: false,
    setShowWaybill: jest.fn(),
    setUnreadDR: jest.fn(),
    unreadDR: mockUnread,
    banner: null,
    dismissBanner: jest.fn(),
    storeArrival: { advancedAutomatically: false, arrivingAt: mockArrivingAt },
    handoverCaptured: false,
    isMissionAccepted: true,
    receiptTarget: null,
    showUploadModal: false,
    showWaybill: false,
  }),
}));

// eslint-disable-next-line import/first
import TaskScreen from '../src/modules/task/TaskScreen';
// eslint-disable-next-line import/first
import { formatErrandId, rememberErrandReferences } from '../src/utils/formatErrandId';

const layout = (height: number, y = 0) => ({ nativeEvent: { layout: { x: 0, y, width: 360, height } } });

/**
 * Riding ("Traveling"), the sheet starts off the screen (map mode). 'map'
 * leaves it there. 'full' opens the errand in full from its fee capsule.
 * 'peek', the default for the layout tests about the closed sheet, then closes
 * the full view to the peek by tapping the sheet's title, as a rider can.
 */
async function renderTask({ open = 'peek' }: { open?: 'map' | 'full' | 'peek' } = {}) {
  const view = await render(<TaskScreen />);
  await act(async () => {});
  if (open !== 'map') {
    await act(async () => {
      fireEvent.press(view.getByTestId('fee-capsule-0'));
    });
  }
  if (open === 'peek') {
    await act(async () => {
      fireEvent.press(view.getAllByLabelText('Collapse errand sheet')[0]);
    });
  }
  return view;
}

function flatStyle(node: any) {
  return Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
}

it('reports the current store before manually advancing arrival', async () => {
  mockReportArrival.mockClear();
  mockAdvanceStatus.mockClear();
  mockStatus = 'Traveling';
  mockErrands = [{ ...errand, pinpoints: [{ id: 101, storeName: 'Store A', latitude: 6.68, longitude: 124.67, sequence: 0 }] }];
  const view = await renderTask();
  await act(async () => { fireEvent.press(view.getByTestId('emergency-arrival-btn')); });
  expect(mockReportArrival).toHaveBeenCalledWith('e-1', 101);
  expect(mockAdvanceStatus).toHaveBeenCalledTimes(1);
});

beforeEach(() => {
  mockUnread = false;
  mockArrivingAt = null;
  mockErrands = [errand];
  mockStatus = 'Traveling';
  mockLocation = farFromEverything;
});

describe('map mode while riding', () => {
  it('starts with the sheet and its button off the screen, the whole map for directions', async () => {
    const view = await renderTask({ open: 'map' });
    // Still mounted (nothing typed into it is lost), but out of reach.
    expect(view.queryByTestId('navigating-capsule')).toBeNull();
    expect(view.getByTestId('navigating-capsule', { includeHiddenElements: true })).toBeTruthy();
    expect(mockMapProps.bottomInset).toBe(0);
  });

  it('has only the back button in the top bar: no task toggle, no ID pill', async () => {
    const view = await renderTask({ open: 'map' });
    const header = view.getByTestId('task-top-header');
    expect(within(header).getByTestId('task-back-btn')).toBeTruthy();
    expect(within(header).queryByText(formatErrandId(errand.id))).toBeNull();
    expect(view.queryByText('Show task')).toBeNull();
    expect(view.queryByText('Hide task')).toBeNull();
  });

  it('opens each errand from its own fee capsule, under the directions', async () => {
    mockErrands = ['e-00001', 'e-00002', 'e-00003'].map((id) => ({ ...errand, id }));
    rememberErrandReferences({ id: 'e-00003', referenceNo: '261019-00003-0003' });
    const view = await renderTask({ open: 'map' });
    expect(within(view.getByTestId('fee-capsule-layer')).getByText(/261019-00003-0003/)).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByTestId('fee-capsule-2'));
    });
    expect(view.getByTestId('full-task-back-btn')).toBeTruthy();
  });

  it('comes back on its own inside a stop, where "Confirm arrival" is needed', async () => {
    const view = await renderTask({ open: 'map' });
    mockArrivingAt = { id: 1, storeName: 'Store A', latitude: 6.68, longitude: 124.67, sequence: 1 };
    await act(async () => {
      view.rerender(<TaskScreen />);
    });
    expect(view.getByTestId('navigating-capsule')).toBeTruthy();
  });

  it('marks unread dispatcher messages on the first fee capsule, since the chat button is hidden with the sheet', async () => {
    mockUnread = true;
    const view = await renderTask({ open: 'map' });
    expect(within(view.getByTestId('fee-capsule-0')).getByTestId('fee-capsule-unread-dot')).toBeTruthy();
  });
});

describe('the full task view', () => {
  it('opens from the fee capsule over the whole screen, with a back button', async () => {
    const view = await renderTask({ open: 'map' });
    await fireEvent(view.getByTestId('task-screen'), 'layout', layout(700));
    expect(mockMapProps.directionsVisible).toBe(true);
    await act(async () => {
      fireEvent.press(view.getByTestId('fee-capsule-0'));
    });

    expect(view.getByTestId('full-task-back-btn')).toBeTruthy();
    expect(view.getByTestId('navigating-capsule')).toBeTruthy();
    // The map's own top bar, the fee capsules, and the "In 170 m, turn right"
    // panel all give way to it.
    expect(view.queryByTestId('task-top-header')).toBeNull();
    expect(view.queryByTestId('fee-capsule-layer')).toBeNull();
    expect(mockMapProps.directionsVisible).toBe(false);
    // Not stopped short of the capsules as the ordinary open sheet is: all of
    // the screen, less what the action button below it takes.
    await fireEvent(view.getByTestId('bottom-sheet-footer'), 'layout', layout(90));
    expect(flatStyle(view.getByTestId('bottom-sheet')).height).toBe(700 - 90);
  });

  it('goes back to the map as it was, the sheet away again while riding', async () => {
    const view = await renderTask({ open: 'full' });
    await act(async () => {
      fireEvent.press(view.getByTestId('full-task-back-btn'));
    });
    expect(view.queryByTestId('full-task-back-btn')).toBeNull();
    expect(view.queryByTestId('navigating-capsule')).toBeNull();
    expect(view.getByTestId('fee-capsule-0')).toBeTruthy();
    expect(mockMapProps.directionsVisible).toBe(true);
    expect(mockMapProps.bottomInset).toBe(0);
  });

  it("goes back on the phone's back key too, instead of leaving the screen", async () => {
    mockGoBack.mockClear();
    const backKey = jest.spyOn(BackHandler, 'addEventListener');
    const view = await renderTask({ open: 'full' });
    const handler = backKey.mock.calls[backKey.mock.calls.length - 1][1] as () => boolean;

    let handled = false;
    await act(async () => {
      handled = handler();
    });
    expect(handled).toBe(true);
    expect(mockGoBack).not.toHaveBeenCalled();
    expect(view.queryByTestId('full-task-back-btn')).toBeNull();
    backKey.mockRestore();
  });
});

describe('the Task tab with the sheet closed', () => {
  it("once shown, keeps the next step's button on screen, pinned below the sheet", async () => {
    const view = await renderTask();
    const footer = view.getByTestId('bottom-sheet-footer');
    expect(within(footer).getByTestId('navigating-capsule')).toBeTruthy();
    expect(within(footer).getByTestId('emergency-arrival-btn')).toBeTruthy();
    // And not inside the sliding sheet, where closed it was out of sight.
    expect(within(view.getByTestId('bottom-sheet')).queryByTestId('navigating-capsule')).toBeNull();
  });

  it('has one chat button, in the sheet header, and no floating dome', async () => {
    const view = await renderTask();
    expect(view.getAllByLabelText('Message the dispatcher')).toHaveLength(1);
    expect(view.getByTestId('header-chat-btn')).toBeTruthy();
  });

  it('tells the map exactly how much the sheet and its button cover', async () => {
    const view = await renderTask();
    await fireEvent(view.getByTestId('bottom-sheet-footer'), 'layout', layout(90));
    // The header's own height sets the peek: handle (48) plus header.
    await fireEvent(view.getByTestId('sheet-header'), 'layout', layout(96));
    expect(mockMapProps.bottomInset).toBe(48 + 96 + 90);
  });

  it('renders a floating back button that navigates back to Home', async () => {
    const view = await renderTask();
    const backBtn = view.getByTestId('task-back-btn');
    expect(backBtn).toBeTruthy();
    fireEvent.press(backBtn);
    expect(mockGoBack).toHaveBeenCalled();
  });
});

describe('the floating layers at the top', () => {
  it('stack the fee capsules below the navigation panel however tall it grows', async () => {
    const view = await renderTask();
    await act(async () => {
      mockMapProps.onHudLayout(170);
    });
    expect(flatStyle(view.getByTestId('fee-capsule-layer')).top).toBe(170 + 4);

    await fireEvent(view.getByTestId('fee-capsule-layer'), 'layout', layout(44));
    expect(flatStyle(view.getByTestId('banner-layer')).top).toBeGreaterThanOrEqual(170 + 4 + 44 + 4);
  });

  it('keep their minimum offsets under a short panel', async () => {
    const view = await renderTask();
    await act(async () => {
      mockMapProps.onHudLayout(60);
    });
    expect(flatStyle(view.getByTestId('fee-capsule-layer')).top).toBeGreaterThanOrEqual(82);
  });

  it('are not covered by the open sheet: they give way to it', async () => {
    // The sheet used to open part way and stop short of these layers. It now
    // opens in full, so they are taken off rather than left underneath it.
    const view = await renderTask();
    await fireEvent(view.getByTestId('task-screen'), 'layout', layout(700));
    await act(async () => {
      mockMapProps.onHudLayout(130);
    });
    await fireEvent(view.getByTestId('fee-capsule-layer'), 'layout', layout(40));
    await fireEvent(view.getByTestId('bottom-sheet-footer'), 'layout', layout(90));
    // Closed, they are all there, above a sheet that shows only its peek.
    expect(view.getByTestId('fee-capsule-layer')).toBeTruthy();
    expect(view.getByTestId('task-top-header')).toBeTruthy();
    expect(mockMapProps.directionsVisible).toBe(true);

    await act(async () => {
      fireEvent.press(view.getAllByLabelText('Expand errand sheet')[0]);
    });
    expect(flatStyle(view.getByTestId('bottom-sheet')).height).toBe(700 - 90);
    expect(view.queryByTestId('fee-capsule-layer')).toBeNull();
    expect(view.queryByTestId('task-top-header')).toBeNull();
    expect(mockMapProps.directionsVisible).toBe(false);
  });
});

/**
 * The sheet and its button are off the screen while riding, and used to come
 * back only once a fix landed inside the stop's circle. So "GPS not detecting?
 * Confirm Arrival" was hidden for as long as the GPS was not detecting.
 */
describe('the sheet coming back when the GPS has not placed the rider in the store', () => {
  const store = { id: 5, storeName: 'Store A', latitude: 6.69, longitude: 124.67, sequence: 0 };
  const northOfStore = (meters: number, extra: Record<string, unknown> = {}) => ({
    latitude: store.latitude + meters / 111_195,
    longitude: store.longitude,
    heading: null,
    updatedAt: 0,
    accuracyMeters: 8,
    ...extra,
  });
  beforeEach(() => {
    mockErrands = [{ ...errand, pinpoints: [store] }];
  });

  it('stays away on the road to the store', async () => {
    mockLocation = northOfStore(900);
    const view = await renderTask({ open: 'map' });
    expect(view.queryByTestId('emergency-arrival-btn')).toBeNull();
    expect(mockMapProps.bottomInset).toBe(0);
  });

  it('comes back close to the store though no fix is inside its circle', async () => {
    // 110 m out: outside the 75 m circle, so nothing says "arriving".
    mockLocation = northOfStore(110);
    const view = await renderTask({ open: 'map' });
    expect(view.getByTestId('emergency-arrival-btn')).toBeTruthy();
    expect(view.getByTestId('navigating-capsule')).toBeTruthy();
    // Shown, not opened: the map keeps everything above the peek.
    expect(view.queryByTestId('full-task-back-btn')).toBeNull();
    expect(mockMapProps.bottomInset).toBeGreaterThan(0);
  });

  it('comes back for a rider stopped not far off, and goes away again when they ride on', async () => {
    mockLocation = northOfStore(300, { stationary: true });
    const view = await renderTask({ open: 'map' });
    expect(view.getByTestId('emergency-arrival-btn')).toBeTruthy();

    // It was a red light: riding again, the whole map is the directions again.
    mockLocation = northOfStore(280, { stationary: false });
    await act(async () => {
      view.rerender(<TaskScreen />);
    });
    expect(view.queryByTestId('emergency-arrival-btn')).toBeNull();
    expect(mockMapProps.bottomInset).toBe(0);
  });

  it('does not take the sheet away from a rider who opened it meanwhile', async () => {
    mockLocation = northOfStore(300, { stationary: true });
    const view = await renderTask({ open: 'map' });
    await act(async () => {
      fireEvent.press(view.getAllByLabelText('Expand errand sheet')[0]);
    });
    mockLocation = northOfStore(280, { stationary: false });
    await act(async () => {
      view.rerender(<TaskScreen />);
    });
    expect(view.getByTestId('emergency-arrival-btn')).toBeTruthy();
  });

  it('comes back when the fix is too coarse for the circle to count it', async () => {
    mockLocation = northOfStore(40, { accuracyMeters: 90 });
    const view = await renderTask({ open: 'map' });
    expect(view.getByTestId('emergency-arrival-btn')).toBeTruthy();
  });
});

/**
 * At the customer's door the handover is the screen: the cash, the photo, the
 * button. The sheet used to open to the half height it takes over a map that is
 * still being ridden by, less a tall action dock, which left a strip of it.
 */
describe("the sheet at the customer's door", () => {
  const door = { id: -1, storeName: 'the delivery address', latitude: 6.69, longitude: 124.68, sequence: 99 };
  beforeEach(() => {
    mockStatus = 'Delivering';
    mockArrivingAt = door;
  });

  it('opens in full when the rider opens it, not to half over the map', async () => {
    const view = await renderTask({ open: 'map' });
    await fireEvent(view.getByTestId('task-screen'), 'layout', layout(700));
    await fireEvent(view.getByTestId('bottom-sheet-footer'), 'layout', layout(170));
    // Arriving, it is back at its peek with the handover button.
    expect(view.getByLabelText("I've handed it over")).toBeTruthy();
    expect(view.queryByTestId('full-task-back-btn')).toBeNull();

    await act(async () => {
      fireEvent.press(view.getAllByLabelText('Expand errand sheet')[0]);
    });
    // The whole screen, less what the action dock below it takes.
    expect(flatStyle(view.getByTestId('bottom-sheet')).height).toBe(700 - 170);
    expect(view.getByTestId('full-task-back-btn')).toBeTruthy();
    expect(view.queryByTestId('fee-capsule-layer')).toBeNull();
    expect(mockMapProps.directionsVisible).toBe(false);
  });

  it('closes back to the peek at the door, not off the screen', async () => {
    const view = await renderTask({ open: 'map' });
    await act(async () => {
      fireEvent.press(view.getAllByLabelText('Expand errand sheet')[0]);
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('full-task-back-btn'));
    });
    expect(view.queryByTestId('full-task-back-btn')).toBeNull();
    expect(view.getByLabelText("I've handed it over")).toBeTruthy();
    expect(mockMapProps.directionsVisible).toBe(true);
  });

});

describe('the sheet at a store', () => {
  beforeEach(() => {
    mockStatus = 'At Store';
  });

  it('opens in full when the rider opens it, as it does at the door', async () => {
    const view = await renderTask({ open: 'map' });
    await fireEvent(view.getByTestId('task-screen'), 'layout', layout(700));
    await fireEvent(view.getByTestId('bottom-sheet-footer'), 'layout', layout(90));
    // At the store it is on screen at its peek, the map's layers above it.
    expect(view.queryByTestId('full-task-back-btn')).toBeNull();
    expect(view.getByTestId('fee-capsule-layer')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getAllByLabelText('Expand errand sheet')[0]);
    });
    expect(flatStyle(view.getByTestId('bottom-sheet')).height).toBe(700 - 90);
    expect(view.getByTestId('full-task-back-btn')).toBeTruthy();
    expect(view.queryByTestId('fee-capsule-layer')).toBeNull();
  });

  it('closes back to the peek, on the back arrow and on the title alike', async () => {
    const view = await renderTask({ open: 'map' });
    await act(async () => {
      fireEvent.press(view.getAllByLabelText('Expand errand sheet')[0]);
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('full-task-back-btn'));
    });
    expect(view.queryByTestId('full-task-back-btn')).toBeNull();
    expect(view.getByTestId('fee-capsule-layer')).toBeTruthy();
    expect(view.getByTestId('store-finish-btn')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getAllByLabelText('Expand errand sheet')[0]);
    });
    await act(async () => {
      fireEvent.press(view.getAllByLabelText('Collapse errand sheet')[0]);
    });
    expect(view.queryByTestId('full-task-back-btn')).toBeNull();
    expect(view.getByTestId('store-finish-btn')).toBeTruthy();
  });
});
