import { renderHook } from '@testing-library/react-native';
import { useStoreArrival, type StoreArrivalState } from '../src/hooks/useStoreArrival';

it('reports the actual out-of-order store that triggered the geofence', async () => {
  const onArrived = jest.fn();
  const first = { id: 1, storeName: 'Far store', latitude: 6.7, longitude: 124.7, sequence: 0 };
  const second = { id: 2, storeName: 'Here', latitude: 6.4, longitude: 124.8, sequence: 1 };
  const options = {
    pinpoints: [first, second], destination: null, currentStatus: 'Traveling' as const,
    isActive: true, onArrived,
    location: { latitude: 6.4, longitude: 124.8, accuracyMeters: 5, heading: null, updatedAt: 1000 },
  };
  const view = await renderHook<StoreArrivalState, { at: number }>(({ at }) => useStoreArrival({ ...options, location: { ...options.location, updatedAt: at } }), { initialProps: { at: 1000 } });
  expect(onArrived).not.toHaveBeenCalled();
  await view.rerender({ at: 22000 });
  expect(onArrived).toHaveBeenCalledWith(second);
});

it('never arrives the rider at the door, but keeps them shown as there', async () => {
  const onArrived = jest.fn();
  const door = { latitude: 6.4117201, longitude: 124.7690754 };
  const fixAt = (at: number) => ({ latitude: door.latitude + 5 / 111_195, longitude: door.longitude, accuracyMeters: 9, heading: null, updatedAt: at });
  // One list for every render, as the errand in hand gives the hook: a new
  // array each time is a new dependency, and the watch would run in a loop.
  const noStores: never[] = [];
  const view = await renderHook<StoreArrivalState, { at: number }>(
    ({ at }) => useStoreArrival({ pinpoints: noStores, destination: door, currentStatus: 'Delivering', isActive: true, onArrived, location: fixAt(at) }),
    { initialProps: { at: 0 } }
  );
  // A minute and ten seconds standing at the door, a fix a second.
  for (let second = 1; second <= 70; second++) {
    await view.rerender({ at: second * 1000 });
    expect(view.result.current.arrivingAtCustomer).toBe(true);
  }
  expect(onArrived).not.toHaveBeenCalled();
  expect(view.result.current.advancedAutomatically).toBe(false);
});
