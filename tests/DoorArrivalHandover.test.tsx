/**
 * The customer's door on errand 261110-6447B-0008 (2026-11-10). Reaching the
 * door used to press "I've handed it over" for the rider: with cash still to
 * record it raised "Validation Error / Please enter the collected amount.",
 * again every 21 s; with the cash recorded it delivered the errand with no tap
 * and no handover photo, which is what happened on that errand. That dialog
 * now reads "Payment not recorded yet" and comes only from the button itself.
 *
 * The real RiderMissionProvider, with the real useRiderMission (the errand's
 * step, the cash rule, advanceStatus) and the real useStoreArrival (the
 * geofence that fires on its own). Stood in for: the GPS hook (fixes are fed
 * in by hand, one a second, at the real door), the socket and push hooks, the
 * network, and storage.
 */
import React from 'react';
import { Alert, Text } from 'react-native';
import { act, render } from '@testing-library/react-native';

jest.setTimeout(120000);

// ─── the errand, as production holds it ─────────────────────────────────────
const DOOR = { latitude: 6.4117201, longitude: 124.7690754 };
const ERRAND_ID = 'aa17101f-71d7-4186-a4fe-3de0ac76447b';
const mockErrand = {
  id: ERRAND_ID,
  referenceNo: '261110-6447B-0008',
  type: 'Pabili',
  customer: 'Aljayvee Versola',
  customerId: 1,
  customerPhone: '',
  address: 'Road entering Banga, Banga, SOCCSKSARGEN',
  deliveryLatitude: DOOR.latitude,
  deliveryLongitude: DOOR.longitude,
  pinpoints: [{ id: 850, storeName: '7-Eleven', latitude: 6.4302136, longitude: 124.7701825, sequence: 0, arrivedAt: '2026-11-10T09:57:26.228Z', departedAt: '2026-11-10T09:57:47.544Z' }],
  paymentMode: 'Cash on Delivery',
  paymentPlan: null,
  merchantCategories: ['Convenience Store'],
  status: 'Traveling',
  itemsPurchasedAt: '2026-11-10T10:01:09.843Z',
  amount: 146,
  feeBreakdown: { itemsSubtotal: 56, grandTotal: 146, tip: 0, isFinal: true, fees: { baseFee: 90, distanceFee: 0, multiStoreFee: 0, groceryFee: 0, nonCodFee: 0, subtotal: 90 } },
  createdAt: '2026-11-10T08:40:00.000Z',
  updatedAt: '2026-11-10T10:01:09.843Z',
  payload: [{ name: '7-Eleven', items: ['Item x1'], pinpointId: 850, storeCategory: 'Convenience Store' }],
  details: '',
};
let mockProofs: any[] = [];

const mockCalls: string[] = [];
jest.mock('../src/config/apiConfig', () => ({
  riderApiService: {
    fetchRiderProfile: async () => ({ id: 3, name: 'Test Rider' }),
    fetchRiderErrands: async () => [mockErrand],
    listProofImages: async () => mockProofs,
    updateErrandStatus: async (_id: string, status: string) => {
      mockCalls.push(`status ${status}`);
      return true;
    },
    markItemsPurchased: async () => true,
  },
}));
jest.mock('../src/services/settlementQueue', () => ({
  submitSettlement: async (_id: string, body: unknown) => {
    mockCalls.push(`settle ${JSON.stringify(body)}`);
  },
  flushPendingSettlements: async () => {},
}));
jest.mock('../src/services/arrivalQueue', () => ({
  reportStoreArrival: async () => {},
}));

// ─── the device and its surroundings ────────────────────────────────────────
const mockAuth = { rider: { id: 3, name: 'Test Rider' }, isOnline: true };
jest.mock('../src/context/RiderAuthContext', () => ({ useRiderAuth: () => mockAuth }));
// The GPS: whatever the test has put in __fix, as the broadcast hook hands it on.
jest.mock('../src/hooks/useRiderLocationBroadcast', () => ({
  useRiderLocationBroadcast: () => ({ location: (global as any).__fix ?? null, ModalElement: null }),
}));
jest.mock('../src/hooks/useRiderMissionSocket', () => ({
  useRiderMissionSocket: () => ({ connected: true, substituteNotice: null, dismissSubstituteNotice: () => {} }),
}));
jest.mock('../src/hooks/useRegisterPushToken', () => ({ useRegisterPushToken: () => {} }));
jest.mock('../src/hooks/useOfferReminder', () => ({ useOfferReminder: () => {} }));
jest.mock('../src/components/HalfPaymentSettledModal', () => () => null);
jest.mock('../src/hooks/useConnectivity', () => ({ useConnectivity: () => ({ isConnected: true }) }));
jest.mock('../src/adapters/storageAdapter', () => ({
  WAYBILL_CACHE_KEY: 'waybill',
  storageAdapter: { getJSON: async () => null, setJSON: async () => {}, remove: async () => {} },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('firebase/database', () => ({ ref: () => ({}), onValue: () => () => {} }));
jest.mock('../src/firebase/config', () => ({ database: {} }));
jest.mock('../src/firebase/realtimeSession', () => ({
  onRealtimeAuthChange: () => () => {},
  realtimeAuthState: () => 'signed-out',
}));
jest.mock('../src/firebase/dispatcherChat', () => ({
  pickReplyThread: () => null,
  riderMessagesPath: () => null,
  sendRiderMessage: () => {},
  subscribeRiderChatMode: () => () => {},
  subscribeRiderInbox: () => () => {},
}));

// eslint-disable-next-line import/first
const { RiderMissionProvider, useRiderMissionContext } = require('../src/context/RiderMissionContext');

function Step() {
  const mission = useRiderMissionContext();
  (global as any).__status = mission.currentStatus;
  (global as any).__mission = mission;
  return <Text testID="step">{mission.currentStatus}</Text>;
}
const Tree = ({ tick }: { tick: number }) => (
  <RiderMissionProvider>
    <Step key="step" />
    <Text>{tick}</Text>
  </RiderMissionProvider>
);

const M = 111_195;
const T0 = Date.UTC(2026, 10, 10, 10, 3, 0);
/** A fix at the door, as the steadied GPS hands it on: still, 5 m off, 9 m accuracy. */
const atDoor = (second: number) => ({
  latitude: DOOR.latitude + 5 / M,
  longitude: DOOR.longitude,
  heading: null,
  speed: 0,
  accuracyMeters: 9,
  stationary: true,
  updatedAt: T0 + second * 1000,
});

async function standAtTheDoor(seconds: number) {
  const alerts: { second: number; title: string; body: string }[] = [];
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  (global as any).__fix = null;
  const view = await render(<Tree tick={-1} />);
  // The waybill loads: the errand is bought and on its way, so "Delivering".
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  const startedAs = (global as any).__status;
  for (let second = 0; second <= seconds; second++) {
    (global as any).__fix = atDoor(second);
    const before = spy.mock.calls.length;
    await act(async () => {
      view.rerender(<Tree tick={second} />);
      await new Promise((r) => setTimeout(r, 0));
    });
    for (const call of spy.mock.calls.slice(before)) alerts.push({ second, title: String(call[0]), body: String(call[1]) });
  }
  const endedAs = (global as any).__status;
  spy.mockRestore();
  await view.unmount();
  return { startedAs, endedAs, alerts };
}

beforeEach(() => {
  mockCalls.length = 0;
  mockProofs = [];
});

it('raises nothing at the door while the cash is still to be recorded', async () => {
  const run = await standAtTheDoor(70);
  expect(run.startedAs).toBe('Delivering');
  expect(run.alerts).toEqual([]);
  expect(run.endedAs).toBe('Delivering');
  expect(mockCalls).toEqual([]);
});

it('does not deliver the errand on its own once the cash is recorded', async () => {
  // The cash photo is on record (the rider took it), the handover photo is not.
  mockProofs = [
    { id: 900, kind: 'CASH_COLLECTED', pinpointId: null, declaredTotal: 146, capturedAt: '2026-11-10T10:02:50.000Z', supersededAt: null },
  ];
  const run = await standAtTheDoor(30);
  expect(run.endedAs).toBe('Delivering');
  expect(run.alerts).toEqual([]);
  expect(mockCalls).toEqual([]);
});

const CASH = { id: 900, kind: 'CASH_COLLECTED', pinpointId: null, declaredTotal: 146, capturedAt: '2026-11-10T10:02:50.000Z', supersededAt: null };
const HANDOVER = { id: 901, kind: 'PROOF_OF_DELIVERY', pinpointId: null, declaredTotal: null, capturedAt: '2026-11-10T10:03:20.000Z', supersededAt: null };

async function atTheDoorWith(proofs: unknown[]) {
  mockProofs = proofs as typeof mockProofs;
  (global as any).__fix = atDoor(0);
  const view = await render(<Tree tick={0} />);
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  expect((global as any).__status).toBe('Delivering');
  return view;
}
const press = () => act(async () => { await (global as any).__mission.advanceStatus({ nativeEvent: {} }); });
const DELIVERED = ['status DELIVERED', 'settle {"collectedInFull":true,"proofImageId":900}'];

it('delivers on the press once the payment and the handover photo are both on record', async () => {
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const view = await atTheDoorWith([CASH, HANDOVER]);
  await press();
  expect(spy).not.toHaveBeenCalled();
  expect((global as any).__status).toBe('Delivered');
  expect(mockCalls).toEqual(DELIVERED);
  spy.mockRestore();
  await view.unmount();
});

it('asks for the handover photo instead of delivering when there is none', async () => {
  // 261110-B420D-0011: payment photographed, delivered 11.6 s later, no
  // picture of what was handed over, and nothing had asked for one.
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const view = await atTheDoorWith([CASH]);
  await press();
  expect((global as any).__status).toBe('Delivering');
  expect(mockCalls).toEqual([]);
  expect(spy).toHaveBeenCalledTimes(1);
  const [title, , buttons] = spy.mock.calls[0] as [string, string, { text: string; onPress?: () => void }[]];
  expect(title).toBe('Take the handover photo');
  expect(buttons.map((b) => b.text)).toEqual(['Cancel', 'Deliver without a photo', 'Take photo']);

  // "Take photo" opens the handover camera, and delivers nothing.
  await act(async () => { buttons[2].onPress?.(); });
  expect((global as any).__mission.receiptTarget).toEqual(expect.objectContaining({ kind: 'PROOF_OF_DELIVERY' }));
  expect((global as any).__status).toBe('Delivering');

  // The photo taken, the same press now delivers.
  await act(async () => { (global as any).__mission.completeReceiptCapture(); });
  expect((global as any).__mission.handoverCaptured).toBe(true);
  await press();
  expect(spy).toHaveBeenCalledTimes(1);
  expect((global as any).__status).toBe('Delivered');
  expect(mockCalls).toEqual(DELIVERED);
  spy.mockRestore();
  await view.unmount();
});

it('still lets a rider whose camera fails finish, by saying so', async () => {
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const view = await atTheDoorWith([CASH]);
  await press();
  const buttons = spy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
  await act(async () => { buttons[1].onPress?.(); await new Promise((r) => setTimeout(r, 0)); });
  expect((global as any).__status).toBe('Delivered');
  expect(mockCalls).toEqual(DELIVERED);
  spy.mockRestore();
  await view.unmount();
});

it('says what to photograph if the button is pressed before the payment is recorded', async () => {
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  (global as any).__fix = atDoor(0);
  const view = await render(<Tree tick={0} />);
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => {
    await (global as any).__mission.advanceStatus();
  });
  expect(spy).toHaveBeenCalledWith(
    'Payment not recorded yet',
    "Photograph the cash you collected, or the customer's payment receipt, before you tap \"I've handed it over\"."
  );
  expect((global as any).__status).toBe('Delivering');
  expect(mockCalls).toEqual([]);
  spy.mockRestore();
  await view.unmount();
});

it('stays at the door after the payment is photographed there, until the button is pressed', async () => {
  // The order it happens in at a door (261110-B420D-0011): the rider is
  // already standing there, then photographs the cash. Nothing but their own
  // tap may finish the errand afterwards.
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  (global as any).__fix = null;
  const view = await render(<Tree tick={-1} />);
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  const stand = async (from: number, to: number) => {
    for (let second = from; second <= to; second++) {
      (global as any).__fix = atDoor(second);
      await act(async () => {
        view.rerender(<Tree tick={second} />);
        await new Promise((r) => setTimeout(r, 0));
      });
    }
  };
  await stand(0, 40);
  await act(async () => { (global as any).__mission.openCashProofCapture(); });
  await act(async () => { (global as any).__mission.completeReceiptCapture({ confirmedTotal: (global as any).__mission.cashDueAtDoor, imageId: 901 }); });
  expect((global as any).__mission.collectedAmount).toBe('FULL');
  await stand(41, 110);
  expect((global as any).__status).toBe('Delivering');
  expect((global as any).__mission.handoverCaptured).toBe(false);
  expect(mockCalls).toEqual([]);
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
  await view.unmount();
});
