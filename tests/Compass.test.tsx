import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { LiveErrandMap } from '../src/components/LiveErrandMap';
import { TurnByTurnHUD } from '../src/components/TurnByTurnHUD';
import { bearingBetween } from '../src/utils/routeGeometry';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// These tests cover compass/road selection. Frame-by-frame native rotation is
// covered by GlidingRiderMarker.test.tsx; props here represent the requested heading.
jest.mock('../src/components/GlidingRiderMarker', () => {
  const React = require('react');
  const { View } = require('react-native');
  return ({ target, headingDeg }: any) => target
    ? React.createElement(View, { testID: 'mock-marker', title: 'You', rotation: headingDeg }) : null;
});

/**
 * The compass: the map and the rider's arrow turn with the phone while the
 * rider is stopped, follow the road while riding, and a rose shows north.
 */

const rider = { latitude: 6.6813, longitude: 124.6634 };
const store = { latitude: 6.6961, longitude: 124.6728 };
const roadRoute = [
  rider,
  { latitude: 6.6842, longitude: 124.6651 },
  { latitude: 6.6889, longitude: 124.6677 },
  { latitude: 6.693, longitude: 124.6703 },
  store,
];
const ROAD_BEARING = bearingBetween(roadRoute[0], roadRoute[1]);

let emitHeading: ((reading: any) => void) | null = null;
const removeHeading = jest.fn();
const watchHeading = jest.fn(async (callback: (reading: any) => void) => {
  emitHeading = callback;
  return { remove: removeHeading };
});

beforeAll(() => {
  (global as any).fetch = jest.fn(() =>
    Promise.resolve({ ok: true, headers: { get: () => 'image/png' } } as unknown as Response)
  );
});

beforeEach(() => {
  emitHeading = null;
  removeHeading.mockClear();
  watchHeading.mockClear();
  (Location as any).watchHeadingAsync = watchHeading;
});

async function renderMap(overrides: Partial<React.ComponentProps<typeof LiveErrandMap>> = {}) {
  const view = await render(
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
  await act(async () => {});
  return view;
}

async function phoneFaces(heading: number, accuracy = 3) {
  await act(async () => {
    // A steady phone: several identical readings, as the sensor sends them.
    for (let i = 0; i < 12; i++) emitHeading?.({ trueHeading: heading, magHeading: heading, accuracy });
  });
}

const arrow = (view: Awaited<ReturnType<typeof render>>) =>
  view.getAllByTestId('mock-marker').find((m) => m.props.title === 'You')!;

describe('the compass on the rider map', () => {
  it('turns the arrow with the phone while the rider is stopped, and says which way', async () => {
    const view = await renderMap({ riderLocation: { ...rider, speed: 0 } });
    expect(watchHeading).toHaveBeenCalledTimes(1);
    await phoneFaces(200);
    expect(Math.abs(arrow(view).props.rotation - 200)).toBeLessThan(3);
    expect(view.getByTestId('compass-cardinal').props.children).toBe('S');
  });

  it('follows the road once riding, whatever the phone says', async () => {
    const view = await renderMap({ riderLocation: { ...rider, speed: 8 } });
    await phoneFaces(200);
    expect(Math.abs(arrow(view).props.rotation - ROAD_BEARING)).toBeLessThan(3);
  });

  it('does not trust an uncalibrated compass, and asks for a figure 8', async () => {
    const view = await renderMap({ riderLocation: { ...rider, speed: 0 } });
    await phoneFaces(200, 1);
    expect(Math.abs(arrow(view).props.rotation - ROAD_BEARING)).toBeLessThan(3);
    expect(view.getByTestId('compass-calibration-hint')).toBeTruthy();
    expect(view.getByTestId('compass-needs-calibration')).toBeTruthy();
  });

  it('switches between turning with the rider and north up', async () => {
    const view = await renderMap({ riderLocation: { ...rider, speed: 0 } });
    expect(view.getByTestId('rider-map-compass').props.accessibilityLabel).toMatch(/turns with you/);
    await fireEvent.press(view.getByTestId('rider-map-compass'));
    expect(view.getByTestId('rider-map-compass').props.accessibilityLabel).toMatch(/North is up/);
    await fireEvent.press(view.getByTestId('rider-map-compass'));
    expect(view.getByTestId('rider-map-compass').props.accessibilityLabel).toMatch(/turns with you/);
  });

  it('reads the compass only while the map is on screen', async () => {
    const view = await renderMap({ riderLocation: { ...rider, speed: 0 }, active: false });
    expect(watchHeading).not.toHaveBeenCalled();
    await view.rerender(
      <LiveErrandMap
        riderLocation={{ ...rider, speed: 0 }}
        destination={store}
        pinpoints={[]}
        routeCoordinates={roadRoute}
        pickupLegCoordinates={roadRoute}
        steps={[]}
        active
      />
    );
    await act(async () => {});
    expect(watchHeading).toHaveBeenCalledTimes(1);
    await view.unmount();
    expect(removeHeading).toHaveBeenCalled();
  });

  it('still works on a phone with no compass: the road turns the map', async () => {
    (Location as any).watchHeadingAsync = jest.fn(() => Promise.reject(new Error('no sensor')));
    const view = await renderMap({ riderLocation: { ...rider, speed: 0 } });
    expect(Math.abs(arrow(view).props.rotation - ROAD_BEARING)).toBeLessThan(3);
    expect(view.queryByTestId('compass-calibration-hint')).toBeNull();
  });
});

describe('the first turn-by-turn instruction', () => {
  const maneuver = {
    activeStep: { bearingAfter: 47 } as any,
    activeStepIndex: 0,
    instruction: 'Head out on J. C. Avenue',
    streetName: 'J. C. Avenue',
    maneuverType: 'depart',
    distanceToManeuverMeters: 200,
    formattedDistance: 'In 200 m',
    nextStepPreview: null,
    isNearManeuver: false,
    isOffRoute: false,
    totalRemainingMeters: 1200,
    formattedTotalDistance: '1.2 km',
    totalRemainingSeconds: 180,
  };

  // What the hook now hands the panel while setting off: the turn ahead, with
  // the way out of the gate as a hint beside it.
  const settingOff = {
    ...maneuver,
    instruction: 'Turn left onto Alunan Avenue',
    maneuverType: 'turn',
    modifier: 'left',
    streetName: 'Alunan Avenue',
    distanceToManeuverMeters: 57,
    setOff: { bearingAfter: 47, streetName: 'J. C. Avenue', instruction: 'Head out on J. C. Avenue' },
  };

  it('says which way to head out, under the turn ahead', async () => {
    const view = await render(<TurnByTurnHUD maneuver={settingOff} targetName="Julie's Bakeshop" />);
    expect(view.getByText('In 55 m, turn left')).toBeTruthy();
    expect(view.getByText('Head north-east on J. C. Avenue')).toBeTruthy();
  });

  it('still says the departure on top for a route with no turn at all', async () => {
    const view = await render(<TurnByTurnHUD maneuver={maneuver} />);
    expect(view.getByText('Head north-east on J. C. Avenue')).toBeTruthy();
  });

  it('reads like Google Maps once riding: the turn and distance, then the street', async () => {
    const view = await render(<TurnByTurnHUD maneuver={{ ...settingOff, setOff: null }} />);
    expect(view.getByTestId('hud-instruction').props.children).toBe('In 55 m, turn left');
    expect(view.getByTestId('hud-street').props.children).toBe('onto Alunan Avenue');
  });

  it('says a roundabout as a roundabout, not a made-up turn', async () => {
    const view = await render(
      <TurnByTurnHUD
        maneuver={{
          ...maneuver,
          instruction: 'Enter roundabout and take exit onto Rizal Street',
          maneuverType: 'roundabout',
          modifier: 'right',
          streetName: 'Rizal Street',
        }}
      />
    );
    expect(view.getByText('In 200 m, enter the roundabout')).toBeTruthy();
    expect(view.getByText('exit onto Rizal Street')).toBeTruthy();
  });

  it('names the store or customer when arriving', async () => {
    const view = await render(
      <TurnByTurnHUD
        maneuver={{ ...maneuver, instruction: 'Arrive at destination', maneuverType: 'arrive', streetName: '' }}
        targetName="Julie's Bakeshop"
      />
    );
    expect(view.getByText("In 200 m, arrive at Julie's Bakeshop")).toBeTruthy();
  });

  it('keeps the same height whether or not a next turn is previewed', async () => {
    // The panel grew a line within 50 m of every turn, and the capsules
    // stacked under it jumped at each one. The row is always there, carrying
    // the distance left; only the "Then" part comes and goes.
    const without = await render(<TurnByTurnHUD maneuver={{ ...settingOff, setOff: null }} />);
    expect(without.getByTestId('hud-preview-row')).toBeTruthy();
    expect(without.getByText('1.2 km left')).toBeTruthy();
    expect(without.queryByText(/^Then /)).toBeNull();

    const withPreview = await render(
      <TurnByTurnHUD
        maneuver={{
          ...settingOff,
          setOff: null,
          nextStepPreview: { instruction: 'Turn right', modifier: 'right', maneuverType: 'turn' },
        }}
      />
    );
    expect(withPreview.getByTestId('hud-preview-row')).toBeTruthy();
    expect(withPreview.getByText('Then turn right')).toBeTruthy();
  });
});
