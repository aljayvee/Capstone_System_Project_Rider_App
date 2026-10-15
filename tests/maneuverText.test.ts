import { describe, expect, it } from 'vitest';
import { maneuverVerb, navigationBannerText, streetFromInstruction, thenText } from '../src/utils/maneuverText';

/**
 * The navigation panel's words, Google Maps style: "In 55 m, turn right" on
 * top, "onto Rizal Street" under it. The panel used to show "57 m", "3.4 km
 * left" and "Head west" as separate pieces a rider had to assemble mid-ride.
 */

describe('navigationBannerText', () => {
  it('says what to do and how far ahead in one line, the street on the next', () => {
    expect(
      navigationBannerText({ distanceMeters: 57, maneuverType: 'turn', modifier: 'right', streetName: 'Rizal Street' })
    ).toEqual({ primary: 'In 55 m, turn right', secondary: 'onto Rizal Street' });
  });

  it('counts down in kilometres further out', () => {
    expect(navigationBannerText({ distanceMeters: 1240, maneuverType: 'turn', modifier: 'left' }).primary).toBe(
      'In 1.2 km, turn left'
    );
  });

  it('says it is happening now at the junction', () => {
    expect(navigationBannerText({ distanceMeters: 8, maneuverType: 'turn', modifier: 'left' }).primary).toBe(
      'Turn left now'
    );
  });

  it("finds the street in Google's instruction, which comes with no separate name", () => {
    expect(
      navigationBannerText({
        distanceMeters: 120,
        maneuverType: 'turn',
        modifier: 'slight right',
        streetName: '',
        instruction: 'Turn slight right onto National Highway',
      })
    ).toEqual({ primary: 'In 120 m, slight right', secondary: 'onto National Highway' });
  });

  it('names the store or customer on arrival, and which side it is on', () => {
    expect(
      navigationBannerText({ distanceMeters: 90, maneuverType: 'arrive', modifier: 'right', targetName: "Julie's Bakeshop" })
        .primary
    ).toBe("In 90 m, arrive at Julie's Bakeshop, on your right");
    expect(navigationBannerText({ distanceMeters: 5, maneuverType: 'arrive', targetName: 'Ana Cruz' }).primary).toBe(
      'Arriving at Ana Cruz'
    );
  });

  it('says roundabouts as roundabouts', () => {
    expect(
      navigationBannerText({ distanceMeters: 80, maneuverType: 'roundabout', modifier: 'right', streetName: 'Rizal Street' })
    ).toEqual({ primary: 'In 80 m, enter the roundabout', secondary: 'exit onto Rizal Street' });
  });

  it('leaves the second line empty on an unnamed road rather than guessing', () => {
    expect(navigationBannerText({ distanceMeters: 200, maneuverType: 'turn', modifier: 'left' }).secondary).toBe('');
  });
});

describe('maneuverVerb', () => {
  it.each([
    ['turn', 'left', 'turn left'],
    ['turn', 'sharp right', 'sharp right'],
    ['turn', 'straight', 'continue straight'],
    ['new name', 'straight', 'continue straight'],
    ['continue', 'slight left', 'keep left'],
    ['fork', 'right', 'keep right'],
    ['keep', 'left', 'keep left'], // Google "keep-left"
    ['merge', 'left', 'merge left'],
    ['on ramp', 'right', 'take the ramp on the right'],
    ['ramp', 'left', 'take the ramp on the left'], // Google "ramp-left"
    ['off ramp', 'right', 'take the exit on the right'],
    ['end of road', 'left', 'turn left at the end of the road'],
    ['uturn', undefined, 'make a U-turn'],
    ['turn', 'uturn', 'make a U-turn'],
    ['exit roundabout', 'right', 'exit the roundabout'],
    ['straight', undefined, 'continue straight'], // Google "straight"
  ])('%s %s -> %s', (type, modifier, expected) => {
    expect(maneuverVerb(type, modifier)).toBe(expected);
  });
});

describe('streetFromInstruction', () => {
  it('reads the street after "onto" or "toward"', () => {
    expect(streetFromInstruction('Turn right onto Rizal Street')).toBe('Rizal Street');
    expect(streetFromInstruction('Head west toward Alunan Avenue')).toBe('Alunan Avenue');
    expect(streetFromInstruction('Continue straight')).toBe('');
    expect(streetFromInstruction(undefined)).toBe('');
  });
});

describe('thenText', () => {
  it('says the turn after in the same words', () => {
    expect(thenText('turn', 'left')).toBe('Then turn left');
    expect(thenText('arrive')).toBe('Then arrive');
  });
});
