import React from 'react';
import { render } from '@testing-library/react-native';
import { ProgressSteps } from '../src/modules/task/components/ProgressSteps';
import { STATUS_STEPS, STEP_META, type StatusStep } from '../src/types/rider';

/**
 * The regression this whole harness exists for.
 *
 * ProgressSteps kept a stale icon map after the rider's five steps became four:
 * "Purchased" and "In Route" were still keys, "Delivering" was not. The
 * component looks its icon up by step and renders <Icon />, so icons.Delivering
 * being undefined threw and took the home screen down for every active errand.
 *
 * Nothing caught it. `Record<string, any>` accepted any key, so tsc was silent,
 * and the vitest suite is pure logic that never mounts a component. The map is
 * now typed against StatusStep — which turns a missing key into a build error —
 * and these tests cover the rendering itself.
 *
 * Note `await render(...)`: it is asynchronous in @testing-library/react-native
 * v14, which awaits React 19's concurrent render. Calling it synchronously
 * yields a Promise, so queries find nothing and destructured helpers are
 * undefined.
 */

const draw = (step: StatusStep, stepIndex = STATUS_STEPS.indexOf(step)) =>
  render(<ProgressSteps currentStatus={step} stepIndex={stepIndex} />);

describe('the progress stepper', () => {
  it.each(STATUS_STEPS)('renders without throwing while the rider is %s', async (step) => {
    // A throw during render surfaces as a rejected promise, so resolving at all
    // is the assertion.
    await expect(draw(step)).resolves.toBeDefined();
  });

  it('draws every step, not only the one in progress', async () => {
    // The stepper renders the whole journey unconditionally, which is why one
    // missing icon was fatal rather than merely cosmetic: a rider never had to
    // reach "Delivering" for it to throw.
    const view = await draw('Traveling');

    for (const step of STATUS_STEPS) {
      expect(view.getByText(STEP_META[step].label)).toBeTruthy();
    }
  });

  it('renders an icon for every step, none of them undefined', async () => {
    // The specific failure: <Icon /> where Icon is undefined. Mounting at the
    // last step exercises the key that was missing.
    const last = STATUS_STEPS.length - 1;
    const view = await draw(STATUS_STEPS[last], last);
    expect(view.toJSON()).not.toBeNull();
  });

  it('marks exactly one step as current', async () => {
    const view = await draw('At Store');
    expect(view.getAllByText('CURRENT')).toHaveLength(1);
  });

  it('survives a step index past the end of the journey', async () => {
    // advanceStatus stops at the last step, but a stale index arriving from a
    // socket update should degrade rather than crash.
    await expect(draw('Delivered', STATUS_STEPS.length + 2)).resolves.toBeDefined();
  });

  it('covers every StatusStep the app can be in', () => {
    // Guards the guard: if someone adds a fifth step to STATUS_STEPS, the
    // it.each above silently grows and this asserts the union and the array
    // have not diverged.
    const declared: StatusStep[] = ['Traveling', 'At Store', 'Delivering', 'Delivered'];
    expect([...STATUS_STEPS].sort()).toEqual([...declared].sort());
  });
});
