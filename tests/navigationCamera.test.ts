import { describe, expect, it } from 'vitest';
import {
  glideZoom,
  headingDelta,
  lineTrailMeters,
  markerSnapMeters,
  navigationCamera,
  navigationTopPadding,
  navigationZoom,
  settleHeading,
  steadyNavigationZoom,
  ZOOM_GLIDE_PER_SECOND,
} from '../src/utils/navigationCamera';

// A road running due east, then turning due north: an L.
const EAST_THEN_NORTH = [
  { latitude: 6.69, longitude: 124.67 },
  { latitude: 6.69, longitude: 124.671 }, // ~110 m east
  { latitude: 6.691, longitude: 124.671 }, // ~110 m north
];

describe('navigationCamera', () => {
  it('turns the map toward the road ahead, not the phone', () => {
    // On the east-running stretch, well before the corner. The phone claims
    // to face south; the road says east.
    const rider = { latitude: 6.69, longitude: 124.6702, heading: 180, speed: 8 };
    const camera = navigationCamera(rider, EAST_THEN_NORTH);
    expect(camera.onRoute).toBe(true);
    expect(camera.heading!).toBeCloseTo(90, 0);
  });

  it('starts turning before the corner, as the road ahead bends', () => {
    // 20 m before the corner: 40 m ahead is already 20 m up the northward leg.
    const rider = { latitude: 6.69, longitude: 124.67082, speed: 8 };
    const camera = navigationCamera(rider, EAST_THEN_NORTH);
    expect(camera.heading!).toBeGreaterThan(0);
    expect(camera.heading!).toBeLessThan(90);
  });

  it('centres on the road, not on a fix scattered beside it', () => {
    const rider = { latitude: 6.69008, longitude: 124.6703, speed: 8 }; // ~9 m north of the road
    const camera = navigationCamera(rider, EAST_THEN_NORTH);
    expect(camera.center.latitude).toBeCloseTo(6.69, 6);
  });

  it('keeps the heading of a moving rider who is off the route', () => {
    const rider = { latitude: 6.695, longitude: 124.675, heading: 250, speed: 6 };
    const camera = navigationCamera(rider, EAST_THEN_NORTH);
    expect(camera.onRoute).toBe(false);
    expect(camera.heading).toBe(250);
    expect(camera.center).toEqual({ latitude: 6.695, longitude: 124.675 });
  });

  it('faces the road ahead, not the compass, for someone standing still off the route', () => {
    // Inside a store beside the east-running stretch: the compass swings as
    // the phone is carried around, but the way out is east along the road.
    const rider = { latitude: 6.6905, longitude: 124.6702, heading: 30, speed: 0.2 }; // ~55 m north of it
    const camera = navigationCamera(rider, EAST_THEN_NORTH);
    expect(camera.onRoute).toBe(false);
    expect(camera.heading!).toBeCloseTo(90, 0);
    expect(camera.center).toEqual({ latitude: 6.6905, longitude: 124.6702 });
  });

  it('has no heading to give without a route or a direction of travel', () => {
    expect(navigationCamera({ latitude: 6.69, longitude: 124.67, speed: 0 }, null).heading).toBeNull();
  });

  it('aims along the last stretch at the very end of the route', () => {
    const rider = { latitude: 6.691, longitude: 124.671, speed: 3 };
    const camera = navigationCamera(rider, EAST_THEN_NORTH);
    expect(camera.heading!).toBeCloseTo(0, 0);
  });
});

describe('settleHeading', () => {
  it('ignores a wobble of a few degrees', () => {
    expect(settleHeading(90, 92)).toBe(90);
  });

  it('follows a real turn, across north', () => {
    expect(settleHeading(350, 20)).toBe(20);
    expect(headingDelta(350, 20)).toBe(30);
  });

  it('keeps the current heading when there is no new one', () => {
    expect(settleHeading(120, null)).toBe(120);
  });
});

describe('navigationZoom', () => {
  it('is closest at walking pace and widens with speed', () => {
    expect(navigationZoom(0)).toBe(18.5);
    expect(navigationZoom(8)).toBe(18);
    expect(navigationZoom(15)).toBe(17.5);
    expect(navigationZoom(null)).toBe(18.5);
  });
});

describe('markerSnapMeters', () => {
  it('pulls a riding fix onto the road, but not a standing one', () => {
    expect(markerSnapMeters(8)).toBe(40);
    expect(markerSnapMeters(0.3)).toBe(12);
    expect(markerSnapMeters(null)).toBe(12);
  });
});

describe('navigationTopPadding', () => {
  it('puts the rider in the lower part of what the sheet leaves visible', () => {
    const top = navigationTopPadding(800, 180);
    // The camera centres its target in the padded area: top + (usable - top) / 2.
    const riderY = top + (800 - 180 - top) / 2;
    expect(riderY).toBeGreaterThan(800 * 0.5);
    expect(riderY).toBeLessThan(800 - 180);
  });

  it('pads nothing before the map has been measured', () => {
    expect(navigationTopPadding(0, 180)).toBe(0);
  });

  it('keeps the rider below the floating panel on a tall phone', () => {
    // A 900 dp phablet: 250 dp of panel and capsules on top, a 300 dp sheet below.
    const top = navigationTopPadding(900, 300, 250);
    const riderY = top + (900 - 300 - top) / 2;
    expect(riderY).toBeGreaterThan(250);
    expect(riderY).toBeLessThan(900 - 300);
    // Still low in what is left, with the road ahead above.
    expect(riderY).toBeGreaterThan(250 + (900 - 300 - 250) * 0.5);
  });
});

describe('steadyNavigationZoom', () => {
  it('matches navigationZoom from a standing start', () => {
    expect(steadyNavigationZoom(null, 0)).toBe(navigationZoom(0));
    expect(steadyNavigationZoom(null, 8)).toBe(navigationZoom(8));
  });

  it('does not flip the zoom for a speed hovering at a step', () => {
    // Town riding right at ~15 km/h, speed noise of about a metre a second:
    // navigationZoom alone changed zoom on most fixes.
    const speeds = [4.2, 3.7, 4.4, 3.8, 4.1, 3.6, 4.3, 3.9, 4.0, 3.7];
    let zoom: number | null = steadyNavigationZoom(null, 3);
    let changes = 0;
    let rawChanges = 0;
    let raw = navigationZoom(3);
    for (const speed of speeds) {
      const next = steadyNavigationZoom(zoom, speed);
      if (next !== zoom) changes++;
      zoom = next;
      const rawNext = navigationZoom(speed);
      if (rawNext !== raw) rawChanges++;
      raw = rawNext;
    }
    expect(rawChanges).toBeGreaterThan(4);
    expect(changes).toBe(0);
  });

  it('still widens for a real change of speed, and narrows again', () => {
    expect(steadyNavigationZoom(18.5, 6)).toBe(18);
    expect(steadyNavigationZoom(18, 13)).toBe(17.5);
    expect(steadyNavigationZoom(17.5, 2)).toBe(18.5);
  });
});

describe('lineTrailMeters', () => {
  it('starts the line about one glide behind the fix, more at speed, within a cap', () => {
    expect(lineTrailMeters(0)).toBe(6);
    expect(lineTrailMeters(null)).toBe(6);
    expect(lineTrailMeters(10)).toBeCloseTo(18, 5);
    expect(lineTrailMeters(40)).toBe(25);
  });
});

describe('glideZoom', () => {
  it('starts at the band zoom when there is no zoom yet', () => {
    expect(glideZoom(null, 18.5, 0.016)).toBe(18.5);
  });

  it('moves toward the band at a steady rate, in either direction', () => {
    expect(glideZoom(18.5, 18, 0.5)).toBeCloseTo(18.5 - ZOOM_GLIDE_PER_SECOND * 0.5, 10);
    expect(glideZoom(17.5, 18, 0.5)).toBeCloseTo(17.5 + ZOOM_GLIDE_PER_SECOND * 0.5, 10);
  });

  it('lands exactly on the band and never passes it', () => {
    expect(glideZoom(18.01, 18, 1)).toBe(18);
    expect(glideZoom(18, 18, 1)).toBe(18);
  });

  it('stays put when no time has passed', () => {
    expect(glideZoom(18.3, 18, 0)).toBe(18.3);
  });

  it('takes about a second for the half level between two bands, with no jump on the way', () => {
    let zoom = 18.5;
    let frames = 0;
    while (zoom !== 18 && frames < 1000) {
      const next = glideZoom(zoom, 18, 1 / 60);
      expect(zoom - next).toBeLessThan(0.01);
      zoom = next;
      frames++;
    }
    expect(frames / 60).toBeGreaterThan(1);
    expect(frames / 60).toBeLessThan(1.5);
  });
});
