import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useLiveRoute } from '../src/hooks/useLiveRoute';
import { fetchDrivingRoute } from '../src/services/directionsService';

/**
 * Each map draws its own road lines: OSRM's on OpenStreetMap, Google's on
 * Google. The hook asks for the map on screen's provider, and keeps both
 * routes so switching back costs nothing.
 */

jest.mock('../src/services/directionsService', () => ({
  fetchDrivingRoute: jest.fn(),
}));

const mockedFetch = fetchDrivingRoute as jest.MockedFunction<typeof fetchDrivingRoute>;

const rider = { latitude: 6.6813, longitude: 124.6634, speed: 0 };
const store = { latitude: 6.6961, longitude: 124.6728 };

// A road route whose shape says which provider drew it.
function routeFrom(provider: 'osrm' | 'google') {
  const bend = provider === 'osrm' ? 124.665 : 124.666;
  const line = [rider, { latitude: 6.688, longitude: bend }, store];
  return {
    ok: true as const,
    data: {
      coordinates: line,
      pickupLegCoordinates: null,
      deliveryLegCoordinates: null,
      steps: [],
      legs: [{ distanceMeters: 2000, durationSeconds: 300, coordinates: line, steps: [] }],
      distanceMeters: 2000,
      durationSeconds: 300,
      provider,
      degraded: false,
    },
  };
}

beforeEach(() => {
  mockedFetch.mockReset();
  mockedFetch.mockImplementation(async (_o, _d, _w, provider) => routeFrom(provider ?? 'osrm'));
});

describe('useLiveRoute and the map on screen', () => {
  it('asks for the route from the provider of the map being shown', async () => {
    const { result } = await renderHook(() => useLiveRoute(rider, store, [], { provider: 'google' }));
    await waitFor(() => expect(result.current.provider).toBe('google'));
    expect(mockedFetch.mock.calls[0][3]).toBe('google');
  });

  it('redraws the same winning road when the rider only switches maps', async () => {
    mockedFetch.mockImplementation(async (_o, _d, _w, provider) => {
      const answer = routeFrom(provider ?? 'osrm');
      return {
        ...answer,
        data: {
          ...answer.data,
          selection: { strategy: 'fastest' as const, chosen: 'osrm', drawnWith: provider ?? 'osrm', candidates: [] },
        },
      };
    });
    const { result, rerender } = await renderHook(
      ({ provider }: { provider: 'osrm' | 'google' }) =>
        useLiveRoute(rider, store, [], { provider, choose: 'fastest' }),
      { initialProps: { provider: 'osrm' as 'osrm' | 'google' } }
    );
    await waitFor(() => expect(result.current.selection?.chosen).toBe('osrm'));
    // The first route is a real choice: nothing is kept.
    expect(mockedFetch.mock.calls[0][5]).toBeUndefined();

    await act(async () => { await rerender({ provider: 'google' }); });
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(2), { timeout: 4000 });
    // The switch asks for the same winner, redrawn on Google's roads.
    expect(mockedFetch.mock.calls[1][3]).toBe('google');
    expect(mockedFetch.mock.calls[1][5]).toBe('osrm');
  });

  it('asks for the fastest of both engines when told to, and hands back the verdict', async () => {
    mockedFetch.mockImplementation(async () => {
      const answer = routeFrom('google');
      return {
        ...answer,
        data: {
          ...answer.data,
          selection: {
            strategy: 'fastest' as const,
            chosen: 'osrm',
            drawnWith: 'google',
            candidates: [
              { provider: 'osrm', durationSeconds: 3240, distanceMeters: 44800 },
              { provider: 'google', durationSeconds: 3600, distanceMeters: 53100 },
            ],
          },
        },
      };
    });
    const { result } = await renderHook(() =>
      useLiveRoute(rider, store, [], { provider: 'google', choose: 'fastest' })
    );
    await waitFor(() => expect(result.current.selection?.chosen).toBe('osrm'));
    expect(mockedFetch.mock.calls[0][4]).toBe('fastest');
  });

  it('asks nothing when the map is named after the line already drawn', async () => {
    // The Task tab's first request names no map; the server draws the winner
    // on OpenStreetMap; the map is then kept as OpenStreetMap and named in
    // every request after (config/mapChoice.ts). Naming it must not fetch the
    // same road a second time.
    mockedFetch.mockImplementation(async () => {
      const answer = routeFrom('osrm');
      return {
        ...answer,
        data: {
          ...answer.data,
          selection: { strategy: 'fastest' as const, chosen: 'osrm', drawnWith: 'osrm', candidates: [] },
        },
      };
    });
    const { result, rerender } = await renderHook(
      ({ provider }: { provider: 'osrm' | 'google' | undefined }) =>
        useLiveRoute(rider, store, [], { provider, choose: 'fastest' }),
      { initialProps: { provider: undefined as 'osrm' | 'google' | undefined } }
    );
    await waitFor(() => expect(result.current.selection?.drawnWith).toBe('osrm'));

    await act(async () => { await rerender({ provider: 'osrm' }); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1800)); });
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(result.current.roadCoordinates?.[1].longitude).toBe(124.665);
  });

  it('switches to the other map’s own line, and back without asking again', async () => {
    const { result, rerender } = await renderHook(
      ({ provider }: { provider: 'osrm' | 'google' }) => useLiveRoute(rider, store, [], { provider }),
      { initialProps: { provider: 'google' as 'osrm' | 'google' } }
    );
    await waitFor(() => expect(result.current.provider).toBe('google'));

    // To OpenStreetMap: a new request, for OSRM's line.
    await act(async () => { await rerender({ provider: 'osrm' }); });
    await waitFor(() => expect(result.current.provider).toBe('osrm'), { timeout: 4000 });
    expect(mockedFetch.mock.calls.map((call) => call[3])).toEqual(['google', 'osrm']);
    expect(result.current.roadCoordinates?.[1].longitude).toBe(124.665);

    // Back to Google: the held line, instantly, and no third request.
    await act(async () => { await rerender({ provider: 'google' }); });
    await waitFor(() => expect(result.current.provider).toBe('google'));
    expect(result.current.roadCoordinates?.[1].longitude).toBe(124.666);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });
});

/**
 * The bug: a phone showing Google's map drew OSRM's line, which runs metres
 * beside Google's painted roads. Asked for 'fastest' on Google, the server
 * hands back the winner on its own roads when Google cannot follow its path.
 * Whatever the server answers, a named map gets only its own engine's line.
 */
describe('a line only on its own engine’s map', () => {
  // `keep` is the 6th argument: the engine asked for alone.
  function answering(engineFor: (provider: 'osrm' | 'google' | undefined, keep: string | undefined) => 'osrm' | 'google') {
    mockedFetch.mockImplementation(async (_o, _d, _w, provider, _choose, keep) => {
      const engine = engineFor(provider, keep);
      const answer = routeFrom(engine);
      return {
        ...answer,
        data: {
          ...answer.data,
          selection: { strategy: 'fastest' as const, chosen: engine, drawnWith: engine, candidates: [] },
        },
      };
    });
  }

  it('on Google, asks again for Google’s own route rather than draw the OSRM winner', async () => {
    // OSRM wins and Google cannot follow it; Google alone answers with its own.
    answering((_provider, keep) => (keep === 'google' ? 'google' : 'osrm'));
    const drawn: (number | undefined)[] = [];
    const { result } = await renderHook(() => {
      const route = useLiveRoute(rider, store, [], { provider: 'google', choose: 'fastest' });
      drawn.push(route.roadCoordinates?.[1]?.longitude);
      return route;
    });

    await waitFor(() => expect(result.current.selection?.drawnWith).toBe('google'), { timeout: 4000 });
    expect(mockedFetch.mock.calls.map((call) => call[5])).toEqual([undefined, 'google']);
    expect(result.current.roadCoordinates?.[1].longitude).toBe(124.666);
    // OSRM's bend never reached the screen, not even for a render.
    expect(drawn).not.toContain(124.665);
    expect(result.current.unroutable).toBeNull();
  });

  it('on OpenStreetMap, asks again for OSRM’s own route rather than draw Google’s', async () => {
    answering((_provider, keep) => (keep === 'osrm' ? 'osrm' : 'google'));
    const { result } = await renderHook(() => useLiveRoute(rider, store, [], { provider: 'osrm', choose: 'fastest' }));

    await waitFor(() => expect(result.current.selection?.drawnWith).toBe('osrm'), { timeout: 4000 });
    expect(mockedFetch.mock.calls.map((call) => call[5])).toEqual([undefined, 'osrm']);
    expect(result.current.roadCoordinates?.[1].longitude).toBe(124.665);
  });

  it('says so when Google has no route at all, draws a guess, and holds OSRM’s line for its own map', async () => {
    // Google's key missing on the server: every answer is OSRM's.
    answering(() => 'osrm');
    const { result, rerender } = await renderHook(
      ({ provider }: { provider: 'osrm' | 'google' }) =>
        useLiveRoute(rider, store, [], { provider, choose: 'fastest' }),
      { initialProps: { provider: 'google' as 'osrm' | 'google' } }
    );

    await waitFor(() => expect(result.current.unroutable).toBe('google'), { timeout: 4000 });
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    // A dashed straight line, never OSRM's road on Google's map.
    expect(result.current.isFallback).toBe(true);
    expect(result.current.roadCoordinates?.[1]).toEqual(store);

    // The Task tab moves to OpenStreetMap (config/mapChoice.ts): the line is
    // already in hand, so nothing more is asked.
    await act(async () => { await rerender({ provider: 'osrm' }); });
    await waitFor(() => expect(result.current.provider).toBe('osrm'));
    expect(result.current.roadCoordinates?.[1].longitude).toBe(124.665);
    expect(result.current.isFallback).toBe(false);
    expect(result.current.unroutable).toBeNull();
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  it('lets a straight-line guess stand on either map: it follows no roads', async () => {
    mockedFetch.mockImplementation(async () => {
      const answer = routeFrom('osrm');
      return { ...answer, data: { ...answer.data, provider: 'haversine', degraded: true } };
    });
    const { result } = await renderHook(() => useLiveRoute(rider, store, [], { provider: 'google', choose: 'fastest' }));

    await waitFor(() => expect(result.current.isFallback).toBe(true));
    expect(result.current.unroutable).toBeNull();
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });
});
