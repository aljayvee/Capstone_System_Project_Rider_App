import { describe, expect, it } from 'vitest';
import {
  cardinal,
  cardinalName,
  chooseMapHeading,
  compassUsable,
  departInstruction,
  RIDING_ENTER_MPS,
  RIDING_EXIT_MPS,
  shouldEmitHeading,
  smoothHeading,
  vectorHeading,
} from '../src/utils/compass';

describe('cardinal points', () => {
  it.each([
    [0, 'N'], [22, 'N'], [23, 'NE'], [45, 'NE'], [90, 'E'], [135, 'SE'],
    [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW'], [338, 'N'], [359.9, 'N'], [-45, 'NW'], [405, 'NE'],
  ])('%s degrees is %s', (deg, point) => {
    expect(cardinal(deg)).toBe(point);
  });

  it('names them for sentences', () => {
    expect(cardinalName(42)).toBe('north-east');
    expect(cardinalName(200)).toBe('south');
  });
});

describe('smoothing on the circle', () => {
  it('averages across north without swinging through south', () => {
    let v = smoothHeading(null, 350);
    for (let i = 0; i < 20; i++) v = smoothHeading(v, 10);
    const h = vectorHeading(v);
    expect(h < 15 || h > 345).toBe(true);
    // The naive mean of 350 and 10 is 180, the opposite direction.
    const mid = vectorHeading(smoothHeading(smoothHeading(null, 350), 10, 0.5));
    expect(mid < 1 || mid > 359).toBe(true);
  });

  it('settles on a steady reading and damps a single jolt', () => {
    let v = smoothHeading(null, 90);
    for (let i = 0; i < 10; i++) v = smoothHeading(v, 90);
    v = smoothHeading(v, 150); // one bad reading
    expect(vectorHeading(v)).toBeLessThan(110);
  });

  it('passes on a change only when it moved and time has passed', () => {
    expect(shouldEmitHeading(null, 10, 0)).toBe(true);
    expect(shouldEmitHeading(10, 11, 1000)).toBe(false);
    expect(shouldEmitHeading(10, 20, 50)).toBe(false);
    expect(shouldEmitHeading(359, 3, 200)).toBe(true);
  });
});

describe('which heading turns the map', () => {
  const base = { roadHeading: 90, compassHeading: 200, compassAccuracy: 3, wasRiding: false };

  it('follows the phone while the rider is stopped', () => {
    expect(chooseMapHeading({ ...base, speedMps: 0 })).toMatchObject({ heading: 200, source: 'compass', riding: false });
  });

  it('follows the road once riding', () => {
    expect(chooseMapHeading({ ...base, speedMps: 8 })).toMatchObject({ heading: 90, source: 'road', riding: true });
  });

  it('does not flip between them while creeping in traffic', () => {
    // Speeding up past 1.5 m/s is not riding yet; slowing to 2 m/s is not stopped yet.
    expect(chooseMapHeading({ ...base, speedMps: 2, wasRiding: false }).source).toBe('compass');
    expect(chooseMapHeading({ ...base, speedMps: 2, wasRiding: true }).source).toBe('road');
    expect(chooseMapHeading({ ...base, speedMps: RIDING_ENTER_MPS, wasRiding: false }).riding).toBe(true);
    expect(chooseMapHeading({ ...base, speedMps: RIDING_EXIT_MPS - 0.1, wasRiding: true }).riding).toBe(false);
  });

  it('ignores an uncalibrated compass and asks for a figure 8', () => {
    const choice = chooseMapHeading({ ...base, speedMps: 0, compassAccuracy: 1 });
    expect(choice).toMatchObject({ heading: 90, source: 'road', compassNeedsCalibration: true });
  });

  it('does not ask for calibration while riding, when the compass is not used', () => {
    expect(chooseMapHeading({ ...base, speedMps: 8, compassAccuracy: 0 }).compassNeedsCalibration).toBe(false);
  });

  it('uses the road, or nothing, without a compass at all', () => {
    expect(chooseMapHeading({ ...base, speedMps: 0, compassHeading: null })).toMatchObject({ heading: 90, source: 'road' });
    expect(chooseMapHeading({ ...base, speedMps: 0, compassHeading: null, roadHeading: null })).toMatchObject({
      heading: null,
      source: 'none',
      compassNeedsCalibration: false,
    });
  });

  it('treats a missing accuracy as usable, and a negative heading as none', () => {
    expect(compassUsable(10, null)).toBe(true);
    expect(compassUsable(-1, 3)).toBe(false);
  });
});

describe('the first instruction', () => {
  it('says which way to head out', () => {
    expect(departInstruction(47, 'J. C. Avenue')).toBe('Head north-east on J. C. Avenue');
    expect(departInstruction(181, '')).toBe('Head south');
    expect(departInstruction(undefined, 'J. C. Avenue')).toBeNull();
  });
});
