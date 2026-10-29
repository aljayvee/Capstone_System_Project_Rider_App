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

it('keeps gliding beyond 1100ms through a delayed fix without React renders per frame', async () => {
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

it('follows bends and does not restart on route identity or heading changes', async () => {
  const corner = east(10);
  const north = { ...corner, latitude: corner.latitude + 30 / 111195 };
  const route = [origin, corner, north];
  const view = await render(<GlidingRiderMarker target={origin} route={route} recordedAt={T0} speedMps={10} />);
  await frame(1000);
  await view.rerender(<GlidingRiderMarker target={corner} route={route} recordedAt={T0 + 1000} speedMps={10} />);
  await frame(2000);
  expect(metresBetween(drawn(), corner)).toBeLessThan(0.001);
  await view.rerender(<GlidingRiderMarker target={corner} route={[...route]} recordedAt={T0 + 1000} speedMps={10} headingDeg={90} />);
  await frame(2300);
  expect(drawn().latitude).toBeGreaterThan(corner.latitude);
  expect(projectOntoPath(drawn(), route)!.distanceMeters).toBeLessThan(0.001);
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

it('accepts a newer stop at identical coordinates and ends bounded prediction', async () => {
  const view = await render(<GlidingRiderMarker target={origin} route={null} recordedAt={T0} speedMps={10} />);
  await frame(1000);
  await view.rerender(<GlidingRiderMarker target={east(10)} route={null} recordedAt={T0 + 1000} speedMps={10} />);
  await frame(2200);
  await view.rerender(<GlidingRiderMarker target={east(10)} route={null} recordedAt={T0 + 2200} speedMps={0} stationary />);
  await frame(4000);
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
