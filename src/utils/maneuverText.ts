import { formatManeuverDistance } from '../hooks/useTurnByTurnNavigation';

/**
 * The navigation panel's words, the way Google Maps says them: what to do and
 * how far ahead on the first line ("In 55 m, turn right"), where on the second
 * ("onto Rizal Street").
 *
 * The panel used to show a bare distance and the server's instruction on
 * separate lines ("57 m", "Head west"), which a rider had to put together at a
 * glance from a moving motorcycle. Pure, so the wording is tested without a
 * screen.
 */

/** Below this the maneuver is happening now, as formatManeuverDistance also rules. */
const NOW_METERS = 15;

const sideOf = (modifier: string): 'left' | 'right' | null =>
  modifier.includes('left') ? 'left' : modifier.includes('right') ? 'right' : null;

/**
 * What to do at a maneuver, lower case, as it follows "In 55 m, ".
 *
 * Covers OSRM's maneuver types and the ones parsed from Google's maneuver
 * strings ("turn-slight-left" arrives as type "turn", modifier "slight left";
 * "keep-left" as "keep"; "ramp-right" as "ramp").
 */
export function maneuverVerb(maneuverType: string, modifier?: string): string {
  const type = (maneuverType || '').toLowerCase();
  const mod = (modifier || '').toLowerCase().replace(/-/g, ' ').trim();
  const side = sideOf(mod);

  if (type === 'uturn' || mod.includes('uturn')) return 'make a U-turn';

  switch (type) {
    case 'roundabout':
    case 'rotary':
      return 'enter the roundabout';
    case 'exit roundabout':
    case 'exit rotary':
      return 'exit the roundabout';
    case 'fork':
    case 'keep':
      return side ? `keep ${side}` : 'keep straight';
    case 'merge':
      return side ? `merge ${side}` : 'merge';
    case 'on ramp':
    case 'ramp':
      return side ? `take the ramp on the ${side}` : 'take the ramp';
    case 'off ramp':
      return side ? `take the exit on the ${side}` : 'take the exit';
    case 'end of road':
      return side ? `turn ${side} at the end of the road` : 'continue at the end of the road';
    case 'continue':
    case 'new name':
    case 'straight':
    case 'notification':
    case 'depart':
      if (!side) return 'continue straight';
      return mod.includes('slight') ? `keep ${side}` : `turn ${side}`;
    default:
      // 'turn', 'roundabout turn' (a small roundabout taken as a turn), and
      // anything newer an engine sends.
      if (!side) return mod === 'straight' || !mod ? 'continue straight' : mod;
      if (mod.includes('slight')) return `slight ${side}`;
      if (mod.includes('sharp')) return `sharp ${side}`;
      return `turn ${side}`;
  }
}

/** "Rizal Street" out of "Turn right onto Rizal Street" (Google sends no separate name). */
export function streetFromInstruction(instruction: string | undefined): string {
  if (!instruction) return '';
  const match = instruction.match(/\b(?:onto|toward|towards)\s+(.+?)\s*$/i);
  return match ? match[1].replace(/\s*Destination will be.*$/i, '').trim() : '';
}

const capitalise = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text);

export interface BannerText {
  /** What to do and how far ahead: "In 55 m, turn right". */
  primary: string;
  /** Where: "onto Rizal Street". Empty when there is nothing to name. */
  secondary: string;
}

export function navigationBannerText(args: {
  distanceMeters: number;
  maneuverType: string;
  modifier?: string;
  streetName?: string;
  instruction?: string;
  /** The store or the customer, for the arrival. */
  targetName?: string;
}): BannerText {
  const { distanceMeters, maneuverType, modifier, instruction, targetName } = args;
  const now = distanceMeters < NOW_METERS;
  const ahead = formatManeuverDistance(distanceMeters, maneuverType);
  const street = (args.streetName || '').trim() || streetFromInstruction(instruction);

  if ((maneuverType || '').toLowerCase() === 'arrive') {
    const where = targetName?.trim() || 'your destination';
    const side = sideOf((modifier || '').toLowerCase());
    const onSide = side ? `, on your ${side}` : '';
    return {
      primary: now ? `Arriving at ${where}${onSide}` : `${ahead}, arrive at ${where}${onSide}`,
      secondary: street ? `on ${street}` : '',
    };
  }

  const verb = maneuverVerb(maneuverType, modifier);
  const isRoundabout = /^(roundabout|rotary)$/i.test(maneuverType || '');
  return {
    primary: now ? `${capitalise(verb)} now` : `${ahead}, ${verb}`,
    secondary: street ? (isRoundabout ? `exit onto ${street}` : `onto ${street}`) : '',
  };
}

/** The "Then" line: "Then turn left". */
export function thenText(maneuverType: string, modifier?: string): string {
  if ((maneuverType || '').toLowerCase() === 'arrive') return 'Then arrive';
  return `Then ${maneuverVerb(maneuverType, modifier)}`;
}
