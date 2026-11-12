import React from 'react';
import { act, render } from '@testing-library/react-native';
import GlidingRiderMarker from '../src/components/GlidingRiderMarker';
import { metresBetween, projectOntoPath } from '../src/utils/routeGeometry';

const mockDraw = jest.fn();
const mockNativeProps = jest.fn();
const mockRender = jest.fn();
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Marker: React.forwardRef((props: any, ref: any) => {
      mockRender();
      React.useImperativeHandle(ref, () => ({ setCoordinates: mockDraw, setNativeProps: mockNativeProps }));
      return React.createElement(View, props);
    }),
  };
});

const origin = { latitude: 6.68, longitude: 124.66 };
const east = (meters: number) => ({ ...origin, longitude: origin.longitude + meters / (111195 * Math.cos(origin.latitude * Math.PI / 180)) });
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
let now = 0;
const T0 = 1_000_000;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(T0);
  frames.clear();
  nextFrame = 0;
  now = 0;
  mockDraw.mockClear();
  mockNativeProps.mockClear();
  mockRender.mockClear();
  jest.spyOn(performance, 'now').mockImplementation(() => now);
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation((fn) => {
    frames.set(++nextFrame, fn);
    return nextFrame;
  });
  jest.spyOn(global, 'cancelAnimationFrame').mockImplementation((id) => {
    if (typeof id === 'number') frames.delete(id);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

async function frame(ms: number) {
  await act(async () => {
    now = ms;
    jest.setSystemTime(T0 + ms);
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((fn) => fn(ms));
  });
}
const drawn = () => mockDraw.mock.calls.at(-1)![0];
const angle = () => mockNativeProps.mock.calls.at(-1)![0].rotation;

it('keeps riding through a late fix without React renders per frame', async () => {
  const onPositionChange = jest.fn();
  const props = { route: null, speedMps: 10, headingDeg: 90, onPositionChange };
  const view = await render(<GlidingRiderMarker {...props} target={origin} recordedAt={T0} />);
  expect(frames.size).toBe(0);
  await frame(1000);
  await view.rerender(<GlidingRiderMarker {...props} target={east(10)} recordedAt={T0 + 1000} />);
  const renders = mockRender.mock.calls.length;
  await frame(2100);
  const at1100 = drawn().longitude;
  await frame(2900);
  expect(drawn().longitude).toBeGreaterThan(at1100);
  expect(frames.size).toBe(1);
  expect(mockRender).toHaveBeenCalledTimes(renders);
  expect(onPositionChange.mock.calls.at(-1)[0]).toEqual(drawn());
  await view.unmount();
  expect(frames.size).toBe(0);
});

it('retargets from its drawn motion and preserves velocity across the GPS tick', async () => {
  const view = await render(<GlidingRiderMarker target={origin} route={null} recordedAt={T0} speedMps={10} />);
  await frame(1000);
  await view.rerender(<GlidingRiderMarker target={east(10)} route={null} recordedAt={T0 + 1000} speedMps={10} />);
  await frame(1799);
  const before = drawn().longitude;
  await frame(1800);
  const atFix = drawn().longitude;
  await view.rerender(<GlidingRiderMarker target={east(20)} route={null} recordedAt={T0 + 1800} speedMps={10} />);
  expect(frames.size).toBe(1);
  await frame(1801);
  expect((drawn().longitude - atFix) / (atFix - before)).toBeCloseTo(1, 2);
});

it('keeps one uninterrupted frame loop through irregular real-world fix intervals', async () => {
  const view = await render(<GlidingRiderMarker target={origin} route={null} recordedAt={T0} speedMps={10} />);
  let last = 0;
  let lastLongitude = origin.longitude;
  for (const arrival of [1000, 2300, 4100, 5400, 7400]) {
    for (let time = last + 16; time < arrival; time += 16) {
      await frame(time);
      if (last >= 1000) {
        expect(drawn().longitude).toBeGreaterThan(lastLongitude);
        lastLongitude = drawn().longitude;
        expect(frames.size).toBe(1);
      }
    }
    await frame(arrival);
    await view.rerender(<GlidingRiderMarker target={east(arrival / 100)} route={null} recordedAt={T0 + arrival} speedMps={10} />);
    last = arrival;
    if (mockDraw.mock.calls.length) lastLongitude = drawn().longitude;
  }
});

it('rides the road line through a bend and does not restart on route identity or heading changes', async () => {
  const corner = east(30);
  const route = [origin, corner, { ...corner, latitude: corner.latitude + 60 / 111195 }];
  const along = (m: number) => (m <= 30 ? east(m) : { ...corner, latitude: corner.latitude + (m - 30) / 111195 });
  const view = await render(<GlidingRiderMarker target={origin} route={route} recordedAt={T0} speedMps={10} />);
  for (const second of [1, 2, 3, 4, 5]) {
    for (let time = (second - 1) * 1000 + 16; time < second * 1000; time += 16) {
      await frame(time);
      if (mockDraw.mock.calls.length) expect(projectOntoPath(drawn(), route)!.distanceMeters).toBeLessThan(0.01);
    }
    await frame(second * 1000);
    await view.rerender(<GlidingRiderMarker target={along(second * 10)} route={route} recordedAt={T0 + second * 1000} speedMps={10} />);
  }
  expect(drawn().latitude).toBeGreaterThan(corner.latitude);
  const before = drawn();
  await view.rerender(<GlidingRiderMarker target={along(50)} route={[...route]} recordedAt={T0 + 5000} speedMps={10} headingDeg={90} />);
  await frame(5016);
  expect(metresBetween(drawn(), before)).toBeLessThan(0.5);
  expect(projectOntoPath(drawn(), route)!.distanceMeters).toBeLessThan(0.01);
});

it('uses one rotation controller without snapping forward then backward', async () => {
  const view = await render(<GlidingRiderMarker target={origin} route={null} headingDeg={0} />);
  await view.rerender(<GlidingRiderMarker target={origin} route={null} headingDeg={90} />);
  expect(mockNativeProps).not.toHaveBeenCalled();
  await frame(16);
  let previous = angle();
  expect(previous).toBeGreaterThan(0);
  expect(previous).toBeLessThan(90);
  for (let time = 32; time < 1600; time += 16) {
    await frame(time);
    expect(angle()).toBeGreaterThanOrEqual(previous);
    expect(angle()).toBeLessThanOrEqual(90);
    previous = angle();
  }
  expect(angle()).toBeCloseTo(90, 0);
  expect(frames.size).toBe(0);
});

it('takes the shortest rotation across north and converges at 30fps', async () => {
  const view = await render(<GlidingRiderMarker target={origin} route={null} headingDeg={359} />);
  await view.rerender(<GlidingRiderMarker target={origin} route={null} headingDeg={1} />);
  for (let time = 33; time <= 1000; time += 33) {
    await frame(time);
    expect(angle() < 2 || angle() > 358).toBe(true);
  }
  expect(angle()).toBeCloseTo(1, 0);
});

it('starts a fresh smooth turn after a long idle instead of using the whole idle duration', async () => {
  const view = await render(<GlidingRiderMarker target={origin} route={null} headingDeg={0} />);
  await view.rerender(<GlidingRiderMarker target={origin} route={null} headingDeg={90} />);
  for (let time = 16; time < 1600; time += 16) await frame(time);
  expect(frames.size).toBe(0);
  await frame(30000);
  await view.rerender(<GlidingRiderMarker target={origin} route={null} headingDeg={180} />);
  await frame(30016);
  expect(angle()).toBeGreaterThan(90);
  expect(angle()).toBeLessThan(120);
});

it('does not restart for an out-of-order GPS sample', async () => {
  const props = { route: null, speedMps: 10 };
  const view = await render(<GlidingRiderMarker {...props} target={origin} recordedAt={T0} />);
  await frame(1000);
  await view.rerender(<GlidingRiderMarker {...props} target={east(10)} recordedAt={T0 + 1000} />);
  await frame(1500);
  const before = drawn().longitude;
  await view.rerender(<GlidingRiderMarker {...props} target={east(-10)} recordedAt={T0 + 500} />);
  await frame(1600);
  expect(drawn().longitude).toBeGreaterThan(before);
});

it('brakes for a newer stop at identical coordinates, settles there and stops its loop', async () => {
  const view = await render(<GlidingRiderMarker target={origin} route={null} recordedAt={T0} speedMps={10} />);
  await frame(1000);
  await view.rerender(<GlidingRiderMarker target={east(10)} route={null} recordedAt={T0 + 1000} speedMps={10} />);
  await frame(2200);
  await view.rerender(<GlidingRiderMarker target={east(10)} route={null} recordedAt={T0 + 2200} speedMps={0} stationary />);
  // A dead stop from 10 m/s inside a second: it brakes, rolls back onto the spot and settles.
  for (let time = 2216; time <= 16000 && frames.size > 0; time += 16) await frame(time);
  expect(metresBetween(drawn(), east(10))).toBeLessThan(0.001);
  expect(frames.size).toBe(0);
});

it('cancels frames on missing targets, inactive maps and unmount; resumes when active', async () => {
  const view = await render(<GlidingRiderMarker target={origin} route={null} />);
  await frame(1000);
  await view.rerender(<GlidingRiderMarker target={east(10)} route={null} />);
  expect(frames.size).toBe(1);
  await view.rerender(<GlidingRiderMarker target={east(10)} route={null} active={false} />);
  expect(frames.size).toBe(0);
  await view.rerender(<GlidingRiderMarker target={east(10)} route={null} active />);
  expect(frames.size).toBe(1);
  await view.rerender(<GlidingRiderMarker target={null} route={null} />);
  expect(view.toJSON()).toBeNull();
  expect(frames.size).toBe(0);
  await view.rerender(<GlidingRiderMarker target={east(20)} route={null} />);
  expect(view.toJSON()).not.toBeNull();
  await view.unmount();
  expect(frames.size).toBe(0);
});

it('places distant resume fixes immediately and does not animate stationary fixes', async () => {
  const view = await render(<GlidingRiderMarker target={origin} route={null} />);
  expect(frames.size).toBe(0);
  const far = { ...origin, latitude: origin.latitude + 0.02 };
  await view.rerender(<GlidingRiderMarker target={far} route={null} />);
  await frame(16);
  expect(drawn()).toEqual(far);
  expect(frames.size).toBe(0);
});

describe('the arrow facing the road ahead', () => {
  // 30 m east, then a right-angle turn north, ridden at 10 m/s with a fix a second.
  const corner = east(30);
  const route = [origin, corner, { ...corner, latitude: corner.latitude + 90 / 111195 }];
  const along = (m: number) => (m <= 30 ? east(m) : { ...corner, latitude: corner.latitude + (m - 30) / 111195 });

  async function rideTheBend(props: { headingDeg: number; followRoad?: boolean }) {
    const angles: number[] = [];
    const view = await render(<GlidingRiderMarker target={origin} route={route} recordedAt={T0} speedMps={10} {...props} />);
    for (const second of [1, 2, 3, 4, 5, 6]) {
      for (let time = (second - 1) * 1000 + 16; time < second * 1000; time += 16) {
        await frame(time);
        if (mockNativeProps.mock.calls.length) angles.push(angle());
      }
      await frame(second * 1000);
      await view.rerender(
        <GlidingRiderMarker target={along(second * 10)} route={route} recordedAt={T0 + second * 1000} speedMps={10} {...props} />
      );
    }
    return angles;
  }

  it('turns with the road through a bend, frame by frame, though the heading it is given never changes', async () => {
    // The heading given stays east throughout: what a fix a second would say
    // until the rider is already round the corner.
    const angles = await rideTheBend({ headingDeg: 90 });
    expect(angles[0]).toBeCloseTo(90, 0);
    // Facing north by the end, having gone round the short way with no step.
    expect(Math.min(angles.at(-1)!, 360 - angles.at(-1)!)).toBeLessThan(1);
    for (let i = 1; i < angles.length; i++) {
      expect(angles[i]).toBeLessThanOrEqual(angles[i - 1] + 0.001);
      expect(angles[i - 1] - angles[i]).toBeLessThan(3);
    }
  });

  it('draws once per screen refresh on a 120 Hz screen: a new place and a new angle every frame of the turn', async () => {
    const STEP = 1000 / 120;
    const view = await render(<GlidingRiderMarker target={origin} route={route} recordedAt={T0} speedMps={10} headingDeg={90} />);
    const turning: number[] = [];
    let framesRun = 0;
    let writes = 0;
    for (const second of [1, 2, 3, 4, 5, 6]) {
      for (let time = (second - 1) * 1000 + STEP; time < second * 1000 - 0.001; time += STEP) {
        const before = { draws: mockDraw.mock.calls.length, last: mockDraw.mock.calls.at(-1)?.[0] };
        await frame(time);
        if (frames.size === 0 && mockDraw.mock.calls.length === before.draws) continue; // not riding yet
        framesRun++;
        // Exactly one position and one rotation sent to the map for this frame.
        expect(mockDraw.mock.calls.length).toBe(before.draws + 1);
        expect(mockNativeProps.mock.calls.length).toBe(mockDraw.mock.calls.length);
        writes++;
        if (before.last) expect(metresBetween(before.last, drawn())).toBeGreaterThan(0);
        if (angle() > 2 && angle() < 88) turning.push(angle());
      }
      await frame(second * 1000);
      await view.rerender(
        <GlidingRiderMarker target={along(second * 10)} route={route} recordedAt={T0 + second * 1000} speedMps={10} headingDeg={90} />
      );
    }
    expect(writes).toBe(framesRun);
    // Five seconds of riding at 120 frames a second.
    expect(framesRun).toBeGreaterThan(550);
    // The turn takes about a second: over a hundred frames, each at its own angle.
    expect(turning.length).toBeGreaterThan(100);
    for (let i = 1; i < turning.length; i++) expect(turning[i]).toBeLessThan(turning[i - 1]);
  });

  it("keeps to the phone's own heading while that is what turns the map", async () => {
    const angles = await rideTheBend({ headingDeg: 200, followRoad: false });
    expect(angles.at(-1)).toBeCloseTo(200, 0);
  });

  it('keeps drawing frames while the camera says it is still settling', async () => {
    let settling = true;
    const onPositionChange = jest.fn(() => settling);
    const view = await render(<GlidingRiderMarker target={origin} route={null} headingDeg={0} onPositionChange={onPositionChange} />);
    await view.rerender(<GlidingRiderMarker target={origin} route={null} headingDeg={90} onPositionChange={onPositionChange} />);
    // The turn itself is over well inside two seconds; the camera is not.
    for (let time = 16; time < 2000; time += 16) await frame(time);
    expect(angle()).toBeCloseTo(90, 0);
    expect(frames.size).toBe(1);
    settling = false;
    await frame(2016);
    expect(frames.size).toBe(0);
  });
});
