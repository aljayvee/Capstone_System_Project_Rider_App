import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { LiveErrandMap } from '../src/components/LiveErrandMap';
import GlidingRiderMarker from '../src/components/GlidingRiderMarker';

let mockGliderProps: React.ComponentProps<typeof GlidingRiderMarker>;
jest.mock('../src/components/GlidingRiderMarker', () => {
  const React = require('react');
  const Actual = jest.requireActual('../src/components/GlidingRiderMarker').default;
  return { __esModule: true, default: (props: React.ComponentProps<typeof GlidingRiderMarker>) => {
    mockGliderProps = props;
    return React.createElement(Actual, props);
  } };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// The OpenStreetMap tile probe. Never the real server from a test.
const tileProbe = jest.fn(() =>
  Promise.resolve({ ok: true, headers: { get: () => 'image/png' } } as unknown as Response)
);
beforeAll(() => {
  (global as any).fetch = tileProbe;
});

/**
 * What the rider is shown, and how a guessed line is distinguished from a real
 * one. The bug this covers drew a straight two-point line solid and
 * casing-backed, identical to a road route.
 *
 * The react-native-maps mock in jest.setup.js renders Polyline as a passthrough
 * View stamped with `props.testID || 'mock-polyline'`. LiveErrandMap gives only
 * the coloured core polyline a testID, so the dark casing lands on
 * 'mock-polyline' — which makes its presence directly assertable.
 */

const rider = { latitude: 6.6813, longitude: 124.6634 };
const store = { latitude: 6.6961, longitude: 124.6728 };

// A route with real intermediate vertices, as a road-following answer has.
const roadRoute = [
  rider,
  { latitude: 6.6842, longitude: 124.6651 },
  { latitude: 6.6889, longitude: 124.6677 },
  { latitude: 6.693, longitude: 124.6703 },
  store,
];

function renderMap(overrides: Partial<React.ComponentProps<typeof LiveErrandMap>> = {}) {
  return render(
    <LiveErrandMap
      riderLocation={null}
      destination={store}
      pinpoints={[]}
      routeCoordinates={roadRoute}
      pickupLegCoordinates={roadRoute}
      deliveryLegCoordinates={null}
      steps={[]}
      distanceMeters={2716}
      durationSeconds={376}
      phase="shopping"
      isFallback={false}
      {...overrides}
    />
  );
}

describe('the route the rider is shown', () => {
  it('draws a road route solid, with its casing behind it', async () => {
    const view = await renderMap({ isFallback: false });

    const core = view.getByTestId('route-line-shopping');
    expect(core.props.lineDashPattern).toBeUndefined();
    // The dark casing only renders for a real route.
    expect(view.queryByTestId('mock-polyline')).toBeTruthy();
  });

  it('draws an approximate route dashed, and drops the casing', async () => {
    const view = await renderMap({ isFallback: true });

    const core = view.getByTestId('route-line-shopping');
    expect(core.props.lineDashPattern).toEqual([10, 8]);
    // No casing: the line reads visibly thinner and weaker than a real one.
    expect(view.queryByTestId('mock-polyline')).toBeNull();
  });

  it('still draws something when the line is only two points', async () => {
    // The straight-line fallback is exactly two points. Guards against the map
    // going blank on the very state that most needs to be visible.
    const view = await renderMap({
      isFallback: true,
      routeCoordinates: [rider, store],
      pickupLegCoordinates: [rider, store],
    });

    expect(view.getByTestId('route-line-shopping')).toBeTruthy();
  });

  it('marks the ETA approximate when the line is', async () => {
    // Haversine still returns confident-looking numbers — a straight-line
    // distance times a detour factor, over an assumed average speed. Reading as
    // precisely as a measured ETA undoes what the dashed line just said.
    const real = await renderMap({ isFallback: false });
    expect(real.getByTestId('eta-badge')).toBeTruthy();
    expect(real.queryByText(/^~/)).toBeNull();

    const guessed = await renderMap({ isFallback: true });
    expect(guessed.getByText(/^~/)).toBeTruthy();
  });

  it('draws the delivery leg once the rider is carrying the goods', async () => {
    const view = await renderMap({
      phase: 'delivering',
      pickupLegCoordinates: null,
      deliveryLegCoordinates: roadRoute,
    });

    expect(view.getByTestId('route-line-delivering')).toBeTruthy();
  });
});

describe('the dashed links off the road', () => {
  // About 30 m west of the route's first point, standing still: inside a shop.
  const inShop = { latitude: 6.6813, longitude: 124.66313, speed: 0 };

  it('joins a rider standing inside a store to where the route starts', async () => {
    const view = await renderMap({ riderLocation: inShop });
    const link = view.getByTestId('route-link-start');
    expect(link.props.coordinates[0]).toMatchObject({ latitude: inShop.latitude, longitude: inShop.longitude });
    expect(link.props.lineDashPattern).toEqual([2, 8]);
  });

  it('draws no link for a rider riding along the road', async () => {
    // The same 30 m of scatter, but moving: that is the phone, not the rider.
    const view = await renderMap({ riderLocation: { ...inShop, speed: 8 } });
    expect(view.queryByTestId('route-link-start')).toBeNull();
  });

  it('joins the end of the road to a store set back from it', async () => {
    const setBack = { latitude: 6.6964, longitude: 124.6728 }; // ~33 m past the route end
    const view = await renderMap({ targetCoordinate: setBack });
    const link = view.getByTestId('route-link-end');
    expect(link.props.coordinates[1]).toEqual(setBack);
  });

  it('draws no end link when the route reaches the pin', async () => {
    const view = await renderMap({ targetCoordinate: store });
    expect(view.queryByTestId('route-link-end')).toBeNull();
  });

  it('draws no links for a straight-line guess, which is not on a road anyway', async () => {
    const view = await renderMap({ isFallback: true, riderLocation: inShop, targetCoordinate: { latitude: 6.6964, longitude: 124.6728 } });
    expect(view.queryByTestId('route-link-start')).toBeNull();
    expect(view.queryByTestId('route-link-end')).toBeNull();
  });
});

describe('the map under the line, as the server decided', () => {
  it('is Google, with no tile layer, unless told otherwise', async () => {
    const view = await renderMap();
    expect(view.queryByTestId('osm-tiles')).toBeNull();
    expect(view.getByTestId('mock-map-view').props.mapType).toBe('standard');
  });

  it('draws our OpenStreetMap tiles in place of the Google map, with the credit', async () => {
    const view = await renderMap({ mapStyle: 'osm' });
    expect(view.getByTestId('osm-tiles').props.urlTemplate).toMatch(/\/tiles\/\{z\}\/\{x\}\/\{y\}\.png$/);
    expect(view.getByTestId('mock-map-view').props.mapType).toBe('none');
    expect(view.getByText('© OpenStreetMap contributors')).toBeTruthy();
  });

  it('hides every Google base map feature too, for a map that ignores "none"', async () => {
    // A Huawei phone's Petal map, standing in for Google's, kept its roads
    // and labels under the tiles. The style is a second way of saying it.
    const osm = await renderMap({ mapStyle: 'osm' });
    expect(osm.getByTestId('mock-map-view').props.customMapStyle).toEqual([{ stylers: [{ visibility: 'off' }] }]);
    const google = await renderMap({ mapStyle: 'google' });
    expect(google.getByTestId('mock-map-view').props.customMapStyle).toBeUndefined();
  });

  it('lays plain paper under the tiles, so a tile still loading shows no other map', async () => {
    // The Petal map ignored "none" and the style alike: panning showed its
    // roads in every gap until our tiles arrived over them.
    const osm = await renderMap({ mapStyle: 'osm' });
    const paper = osm.getByTestId('osm-paper');
    const tiles = osm.getByTestId('osm-tiles');
    expect(paper.props.fillColor).toBe('#F2EFE9');
    expect(paper.props.strokeWidth).toBe(0);
    expect(paper.props.zIndex).toBeLessThan(tiles.props.zIndex);
    // Under every other line and circle on the map, which sit at 0.
    expect(paper.props.zIndex).toBeLessThan(0);
    // Added first too, for a map that stacks by order rather than zIndex.
    const order = React.Children.toArray(osm.getByTestId('mock-map-view').props.children).map(
      (child) => (React.isValidElement(child) ? (child.props as { testID?: string }).testID : undefined)
    );
    expect(order.indexOf('osm-paper')).toBe(0);
    expect(order.indexOf('osm-tiles')).toBe(1);

    const google = await renderMap({ mapStyle: 'google' });
    expect(google.queryByTestId('osm-paper')).toBeNull();
  });

  it('draws no map at all until the server has said which', async () => {
    const view = await renderMap({ mapStyle: null });
    expect(view.queryByTestId('mock-map-view')).toBeNull();
    expect(view.queryByTestId('osm-tiles')).toBeNull();
    expect(view.getByTestId('map-pending')).toBeTruthy();
  });

  it('creates the map with its type once it is known, and keeps that one map', async () => {
    const view = await renderMap({ mapStyle: null });
    const props = { mapStyle: 'osm' as const };
    await view.rerender(
      <LiveErrandMap
        riderLocation={null}
        destination={store}
        pinpoints={[]}
        routeCoordinates={roadRoute}
        pickupLegCoordinates={roadRoute}
        deliveryLegCoordinates={null}
        steps={[]}
        phase="shopping"
        {...props}
      />
    );
    const first = view.getByTestId('mock-map-view');
    expect(first.props.mapType).toBe('none');

    // A new route on the same map: the same native map, not a new one.
    await view.rerender(
      <LiveErrandMap
        riderLocation={null}
        destination={store}
        pinpoints={[]}
        routeCoordinates={[...roadRoute].reverse()}
        pickupLegCoordinates={[...roadRoute].reverse()}
        deliveryLegCoordinates={null}
        steps={[]}
        phase="shopping"
        {...props}
      />
    );
    expect(view.getByTestId('mock-map-view')).toBe(first);
  });

  it('offers the rider no map switch', async () => {
    const view = await renderMap();
    expect(view.queryByTestId('rider-map-style-toggle')).toBeNull();
  });
});

describe('the rider on the map', () => {
  // The first stretch of roadRoute runs north-north-east, about 30 degrees.
  const ROAD_BEARING = 30;
  const find = (view: any) => view.getAllByTestId('mock-marker').find((m: any) => m.props.title === 'You') as any;

  it('is drawn from an image, never a child view that Android can lose', async () => {
    // A child view is turned into a bitmap once on the new architecture, and
    // came back blank after switching maps (react-native-maps #5877).
    const you = find(await renderMap({ riderLocation: { ...rider, speed: 5, heading: 90 } }));
    expect(you).toBeTruthy();
    expect(you.props.image).toBeTruthy();
    expect(you.props.children).toBeUndefined();
  });

  it('faces forward along the route line, not where the phone points', async () => {
    const you = find(await renderMap({ riderLocation: { ...rider, speed: 5, heading: 200 } }));
    expect(Math.abs(you.props.rotation - ROAD_BEARING)).toBeLessThan(3);
  });

  it('faces the road ahead while standing still, even with no heading at all', async () => {
    const you = find(await renderMap({ riderLocation: { ...rider, speed: 0, heading: -1 } }));
    expect(Math.abs(you.props.rotation - ROAD_BEARING)).toBeLessThan(3);
  });
});

describe('the faster of the two routes', () => {
  it('says on the ETA badge which engine won', async () => {
    const google = await renderMap({ routeChosenBy: 'google' });
    expect(google.getByText(/via Google/)).toBeTruthy();

    const osm = await renderMap({ routeChosenBy: 'osrm' });
    expect(osm.getByText(/via OSM/)).toBeTruthy();
  });

  it('claims nothing when no comparison was made, or the line is a guess', async () => {
    expect((await renderMap()).queryByText(/via /)).toBeNull();
    expect((await renderMap({ routeChosenBy: 'google', isFallback: true })).queryByText(/via /)).toBeNull();
  });
});

describe('the directions panel', () => {
  const turn = {
    instruction: 'Turn right onto Rizal Street',
    streetName: 'Rizal Street',
    maneuverType: 'turn',
    modifier: 'right',
    distanceMeters: 170,
    durationSeconds: 30,
    location: roadRoute[1],
    coordinates: roadRoute.slice(1),
  };

  it('is drawn over the map while there are directions', async () => {
    const view = await renderMap({ steps: [turn], riderLocation: { ...rider, speed: 6 } });
    expect(view.getByTestId('hud-instruction')).toBeTruthy();
  });

  it('is not drawn over the full task view', async () => {
    // The Task tab opens an errand's task over the whole screen; the panel
    // ("In 170 m, turn right") used to stay on top of it.
    const view = await renderMap({ steps: [turn], riderLocation: { ...rider, speed: 6 }, directionsVisible: false });
    expect(view.queryByTestId('hud-instruction')).toBeNull();
  });
});

describe('before the native map is ready', () => {
  afterEach(() => {
    (global as any).__holdMapReady = false;
  });

  it('sends no padding until it is, which crashed the Task tab', async () => {
    // react-native-maps applies it on Android the moment it arrives, and its
    // padding setter dereferences a GoogleMap that does not exist yet.
    (global as any).__holdMapReady = true;
    const view = await renderMap({ bottomInset: 180, riderLocation: { ...rider, speed: 6 } });
    await act(async () => {
      fireEvent(view.getByTestId('mock-map-view'), 'layout', {
        nativeEvent: { layout: { width: 400, height: 800, x: 0, y: 0 } },
      });
    });
    const props = view.getByTestId('mock-map-view').props;
    expect(props.mapPadding).toBeUndefined();

    // Once ready, it arrives.
    await act(async () => {
      props.onMapReady();
    });
    expect(view.getByTestId('mock-map-view').props.mapPadding).toMatchObject({ bottom: 180 });
  });

  it('sends the map type from the start, so the map is created as that type', async () => {
    // The opposite of padding, and on purpose: in the first props it becomes
    // GoogleMapOptions.mapType, so OpenStreetMap is never drawn over a base
    // map that was there first. Sent only after ready, a Huawei phone's Petal
    // map stayed drawn under the tiles.
    (global as any).__holdMapReady = true;
    const view = await renderMap({ mapStyle: 'osm' });
    expect(view.getByTestId('mock-map-view').props.mapType).toBe('none');
  });
});

describe('the navigation camera', () => {
  it('in 3D, hides Re-center while following and offers it once the rider drags the map', async () => {
    const view = await renderMap({ riderLocation: { ...rider, speed: 6 } });
    // Hidden initially while properly oriented and following the route
    expect(view.queryByTestId('rider-map-recenter')).toBeNull();

    // Dragging map disorients the camera
    await act(async () => {
      fireEvent(view.getByTestId('mock-map-view'), 'panDrag');
    });
    expect(view.getByTestId('rider-map-recenter')).toBeTruthy();

    // Tapping Re-center snaps back to following and hides the button
    await act(async () => {
      fireEvent.press(view.getByTestId('rider-map-recenter'));
    });
    expect(view.queryByTestId('rider-map-recenter')).toBeNull();
  });

  it('in 2D, offers Re-center only once the rider drags the map', async () => {
    const view = await renderMap({ riderLocation: { ...rider, speed: 6 } });
    await act(async () => {
      fireEvent.press(view.getByTestId('rider-map-mode-2d'));
    });
    expect(view.queryByTestId('rider-map-recenter')).toBeNull();

    await act(async () => {
      fireEvent(view.getByTestId('mock-map-view'), 'panDrag');
    });
    expect(view.getByTestId('rider-map-recenter')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByTestId('rider-map-recenter'));
    });
    expect(view.queryByTestId('rider-map-recenter')).toBeNull();
  });

  it('pads the top in 3D so the rider sits low with the road ahead above', async () => {
    const view = await renderMap({ bottomInset: 180 });
    await act(async () => {
      fireEvent(view.getByTestId('mock-map-view'), 'layout', {
        nativeEvent: { layout: { width: 400, height: 800, x: 0, y: 0 } },
      });
    });
    const padding = view.getByTestId('mock-map-view').props.mapPadding;
    expect(padding.bottom).toBe(180);
    expect(padding.top).toBeGreaterThan(200);
  });
});

describe('floating map controls & sheet collision prevention', () => {
  it('hides camera mode controls, ETA badge, and OSM attribution when controlsVisible is false', async () => {
    const view = await renderMap({
      controlsVisible: false,
      mapStyle: 'osm',
      distanceMeters: 500,
      durationSeconds: 120,
    });

    expect(view.queryByTestId('eta-badge')).toBeNull();
    expect(view.queryByTestId('rider-map-mode-3d')).toBeNull();
    expect(view.queryByTestId('rider-map-mode-2d')).toBeNull();
    expect(view.queryByTestId('rider-map-mode-overview')).toBeNull();
    expect(view.queryByTestId('rider-map-recenter')).toBeNull();
    expect(view.queryByText(/OpenStreetMap/)).toBeNull();
  });

  it('renders camera mode controls and ETA badge when controlsVisible is true or default', async () => {
    const view = await renderMap({
      controlsVisible: true,
      distanceMeters: 500,
      durationSeconds: 120,
    });

    expect(view.getByTestId('eta-badge')).toBeTruthy();
    expect(view.getByTestId('rider-map-mode-3d')).toBeTruthy();
    expect(view.getByTestId('rider-map-mode-2d')).toBeTruthy();
    expect(view.getByTestId('rider-map-mode-overview')).toBeTruthy();
  });

  it('dynamically anchors ETA badge to bottomInset + 14', async () => {
    const view = await renderMap({
      bottomInset: 148,
      distanceMeters: 500,
      durationSeconds: 120,
    });

    const badge = view.getByTestId('eta-badge');
    expect(badge.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bottom: 148 + 14 }),
      ])
    );
  });

  it('elevates ETA badge to bottomInset + 22 when OpenStreetMap attribution is active to prevent collision', async () => {
    const view = await renderMap({
      bottomInset: 148,
      distanceMeters: 500,
      durationSeconds: 120,
      mapStyle: 'osm',
    });

    const badge = view.getByTestId('eta-badge');
    expect(badge.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bottom: 148 + 22 }),
      ])
    );
  });
});

/**
 * The bug: 3D showed on one phone and stayed flat on another. On Android a
 * change of map padding re-sets the camera where it stands, which cancels an
 * animated tilt in flight, and a rider standing still sends no further fix to
 * tilt it again. So the camera is set at once, never animated, whenever the
 * padding is new.
 */
describe('the 3D camera and the map padding', () => {
  // Sample the camera callback explicitly here. The marker's frame loop and
  // rotation timing are exercised with a controlled clock in its own suite.
  beforeEach(() => {
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation(() => 1);
  });
  afterEach(() => jest.restoreAllMocks());
  const still = { ...rider, speed: 0 };
  const base: React.ComponentProps<typeof LiveErrandMap> = {
    riderLocation: still,
    destination: store,
    pinpoints: [],
    routeCoordinates: roadRoute,
    pickupLegCoordinates: roadRoute,
    deliveryLegCoordinates: null,
    steps: [],
    distanceMeters: 2716,
    durationSeconds: 376,
    phase: 'shopping',
    isFallback: false,
    mapStyle: 'google',
  };
  const handle = () => (global as any).__mapHandle;

  it('sets the tilted camera at once when the Google map is ready', async () => {
    await render(<LiveErrandMap {...base} bottomInset={180} />);
    expect(handle().setCamera).toHaveBeenCalledTimes(1);
    expect(handle().setCamera.mock.calls[0][0]).toMatchObject({ pitch: 60 });
    expect(handle().animateCamera).not.toHaveBeenCalled();
  });

  it('sets it again, at once, when the sheet changes the padding', async () => {
    const view = await render(<LiveErrandMap {...base} bottomInset={180} />);
    await act(async () => {
      await view.rerender(<LiveErrandMap {...base} bottomInset={260} />);
    });
    expect(handle().setCamera).toHaveBeenCalledTimes(2);
    expect(handle().setCamera.mock.calls[1][0]).toMatchObject({ pitch: 60 });
    expect(handle().animateCamera).not.toHaveBeenCalled();
  });

  it('follows the drawn marker frame instead of starting a separate GPS camera animation', async () => {
    const view = await render(<LiveErrandMap {...base} bottomInset={180} />);
    const moved = { ...still, latitude: still.latitude + 0.0004, speed: 5 };
    await act(async () => {
      await view.rerender(<LiveErrandMap {...base} riderLocation={moved} bottomInset={180} />);
    });
    expect(handle().setCamera).toHaveBeenCalledTimes(1);
    expect(handle().animateCamera).not.toHaveBeenCalled();
    const drawn = { ...rider, latitude: rider.latitude + 0.0002 };
    await act(async () => {
      mockGliderProps.onPositionChange!(drawn, 45);
    });
    expect(handle().setCamera.mock.calls.at(-1)[0]).toMatchObject({ center: drawn, heading: 45, pitch: 60 });
  });

  it('passes timestamp and stationary metadata and does not follow while inactive or panned', async () => {
    const location = { ...still, updatedAt: 12345, stationary: true };
    const view = await render(<LiveErrandMap {...base} riderLocation={location} active={false} />);
    expect(mockGliderProps).toMatchObject({ recordedAt: 12345, stationary: true, active: false });
    const count = handle().setCamera.mock.calls.length;
    await act(async () => mockGliderProps.onPositionChange!(rider, 90));
    expect(handle().setCamera).toHaveBeenCalledTimes(count);
    await view.rerender(<LiveErrandMap {...base} riderLocation={location} active />);
    await act(async () => fireEvent(view.getByTestId('mock-map-view'), 'panDrag'));
    const afterPan = handle().setCamera.mock.calls.length;
    await act(async () => mockGliderProps.onPositionChange!(store, 90));
    expect(handle().setCamera).toHaveBeenCalledTimes(afterPan);
  });

  it('keeps the sampled camera north-up and flat in 2D', async () => {
    const view = await render(<LiveErrandMap {...base} />);
    await act(async () => fireEvent.press(view.getByTestId('rider-map-mode-trigger')));
    await act(async () => fireEvent.press(view.getByTestId('rider-map-mode-2d')));
    await act(async () => mockGliderProps.onPositionChange!(rider, 120));
    expect(handle().setCamera.mock.calls.at(-1)[0]).toMatchObject({ center: rider, heading: 0, pitch: 0 });
  });

  it('places a recreated base map at the current fix, clearing the old visual sample', async () => {
    const view = await render(<LiveErrandMap {...base} />);
    await act(async () => mockGliderProps.onPositionChange!(store, 90));
    await view.rerender(<LiveErrandMap {...base} mapStyle="osm" />);
    expect(handle().setCamera.mock.calls.at(-1)[0]).toMatchObject({ center: rider, pitch: 60 });
  });

  it('waits for the first fix, then sets the camera at once', async () => {
    const view = await render(<LiveErrandMap {...base} riderLocation={null} bottomInset={180} />);
    expect(handle().setCamera).not.toHaveBeenCalled();
    await act(async () => {
      await view.rerender(<LiveErrandMap {...base} bottomInset={180} />);
    });
    expect(handle().setCamera).toHaveBeenCalledTimes(1);
    expect(handle().animateCamera).not.toHaveBeenCalled();
  });

  it('switches back into 3D at once, tilted, though the padding changes with it', async () => {
    const view = await render(<LiveErrandMap {...base} bottomInset={180} />);
    // A real height, so 3D pads the top and 2D does not.
    await act(async () => {
      fireEvent(view.getByTestId('mock-map-view'), 'layout', {
        nativeEvent: { layout: { width: 400, height: 800, x: 0, y: 0 } },
      });
    });
    // The switcher opens first; its buttons take no touches while closed.
    const choose = async (mode: '2d' | '3d') => {
      await act(async () => {
        fireEvent.press(view.getByTestId('rider-map-mode-trigger'));
      });
      await act(async () => {
        fireEvent.press(view.getByTestId(`rider-map-mode-${mode}`));
      });
    };
    await choose('2d');
    expect(handle().setCamera.mock.calls.at(-1)[0]).toMatchObject({ pitch: 0 });
    const before = handle().setCamera.mock.calls.length;
    await choose('3d');
    expect(handle().setCamera.mock.calls.length).toBe(before + 1);
    expect(handle().setCamera.mock.calls.at(-1)[0]).toMatchObject({ pitch: 60 });
  });
});
