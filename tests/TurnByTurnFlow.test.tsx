import { act, renderHook } from '@testing-library/react-native';
import { useTurnByTurnNavigation } from '../src/hooks/useTurnByTurnNavigation';
import type { RouteStep } from '../src/services/directionsService';

/**
 * The panel, ridden through a real sequence of OSRM steps.
 *
 * OSRM puts each step's maneuver at its start. The panel used to announce the
 * step being ridden, whose turn was already behind the rider, and counted down
 * to a junction where a different turn happened. This rides east, turns left
 * (north), turns right (east), and arrives, and checks what is on screen.
 */

const M_PER_DEG = 111_195;
const LAT0 = 6.68;
const LNG0 = 124.67;
const lngScale = Math.cos((LAT0 * Math.PI) / 180);
const at = (east: number, north: number) => ({
  latitude: LAT0 + north / M_PER_DEG,
  longitude: LNG0 + east / (M_PER_DEG * lngScale),
});
const line = (from: [number, number], to: [number, number]) => {
  const out = [];
  for (let k = 0; k <= 10; k++) {
    out.push(at(from[0] + ((to[0] - from[0]) * k) / 10, from[1] + ((to[1] - from[1]) * k) / 10));
  }
  return out;
};

const step = (partial: Partial<RouteStep>): RouteStep => ({
  instruction: '',
  streetName: '',
  maneuverType: 'continue',
  distanceMeters: 0,
  durationSeconds: 0,
  location: at(0, 0),
  coordinates: [],
  ...partial,
});

const steps: RouteStep[] = [
  step({
    instruction: 'Head out on Alunan Avenue',
    streetName: 'Alunan Avenue',
    maneuverType: 'depart',
    bearingAfter: 90,
    distanceMeters: 200,
    durationSeconds: 30,
    location: at(0, 0),
    coordinates: line([0, 0], [200, 0]),
  }),
  step({
    instruction: 'Turn left onto Rizal Street',
    streetName: 'Rizal Street',
    maneuverType: 'turn',
    modifier: 'left',
    distanceMeters: 150,
    durationSeconds: 25,
    location: at(200, 0),
    coordinates: line([200, 0], [200, 150]),
  }),
  step({
    instruction: 'Turn right onto Bonifacio Street',
    streetName: 'Bonifacio Street',
    maneuverType: 'turn',
    modifier: 'right',
    distanceMeters: 100,
    durationSeconds: 15,
    location: at(200, 150),
    coordinates: line([200, 150], [300, 150]),
  }),
  step({
    instruction: 'Arrive at destination',
    maneuverType: 'arrive',
    location: at(300, 150),
    coordinates: [at(300, 150), at(300, 150)],
  }),
];

const route = steps.flatMap((s) => s.coordinates);

async function ride() {
  let position = { ...at(0, 0), speed: 8 };
  const hook = await renderHook(() => useTurnByTurnNavigation(position, steps, route));
  const moveTo = async (east: number, north: number) => {
    position = { ...at(east, north), speed: 8 };
    await hook.rerender({});
    // Step advances are scheduled with setTimeout(0).
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await hook.rerender({});
  };
  return { hook, moveTo };
}

describe('riding through the turns', () => {
  it('starts on the first turn, with the way out of the gate beside it', async () => {
    const { hook } = await ride();
    // "In 200 m, turn left", not "Head west", from the moment the route is drawn.
    expect(hook.result.current.maneuverType).toBe('turn');
    expect(hook.result.current.modifier).toBe('left');
    expect(hook.result.current.setOff).toMatchObject({ streetName: 'Alunan Avenue', bearingAfter: 90 });
  });

  it('drops the way out once riding the route', async () => {
    const { hook, moveTo } = await ride();
    await moveTo(60, 0);
    expect(hook.result.current.setOff).toBeNull();
  });

  it('announces the coming left turn, and the distance to it, while riding toward it', async () => {
    const { hook, moveTo } = await ride();
    await moveTo(60, 0);
    expect(hook.result.current.instruction).toBe('Turn left onto Rizal Street');
    expect(hook.result.current.modifier).toBe('left');
    expect(hook.result.current.distanceToManeuverMeters).toBeGreaterThan(130);
    expect(hook.result.current.distanceToManeuverMeters).toBeLessThan(150);
  });

  it('keeps "Turn left" up at the junction itself', async () => {
    const { hook, moveTo } = await ride();
    await moveTo(60, 0);
    await moveTo(190, 0);
    expect(hook.result.current.instruction).toBe('Turn left onto Rizal Street');
    expect(hook.result.current.formattedDistance).toBe('Turn Now');
    // And previews what comes after it.
    expect(hook.result.current.nextStepPreview?.instruction).toBe('Turn right onto Bonifacio Street');
  });

  it('moves on to the right turn once round the corner', async () => {
    const { hook, moveTo } = await ride();
    await moveTo(60, 0);
    await moveTo(190, 0);
    await moveTo(200, 0.5);
    await moveTo(200, 20);
    expect(hook.result.current.instruction).toBe('Turn right onto Bonifacio Street');
    expect(hook.result.current.distanceToManeuverMeters).toBeGreaterThan(115);
    expect(hook.result.current.distanceToManeuverMeters).toBeLessThan(135);
  });

  it('ends on the arrival', async () => {
    const { hook, moveTo } = await ride();
    for (const [e, n] of [[60, 0], [190, 0], [200, 0.5], [200, 60], [200, 149], [200, 150.5], [240, 150]] as const) {
      await moveTo(e, n);
    }
    expect(hook.result.current.maneuverType).toBe('arrive');
  });
});
