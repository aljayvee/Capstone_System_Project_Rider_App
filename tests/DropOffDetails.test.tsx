import React from 'react';
import { render } from '@testing-library/react-native';
import { DropOffDetails } from '../src/modules/task/components/DropOffDetails';

/**
 * The lines under "Drop-off: <customer>" beyond the map address. Each one is
 * the customer's own words, so a field they left blank is no line at all,
 * never an empty label.
 */

describe('DropOffDetails', () => {
  it('shows each part the customer filled in', async () => {
    const view = (await render(
      <DropOffDetails streetName="Purok 5, Mabini St." landmark="Blue gate" notes="Call when outside." />
    )) as any;

    expect(view.getByText('Street: Purok 5, Mabini St.')).toBeTruthy();
    expect(view.getByText('Landmark: Blue gate')).toBeTruthy();
    expect(view.getByText('Note for the rider: Call when outside.')).toBeTruthy();
  });

  it('leaves out the parts left blank', async () => {
    const view = (await render(<DropOffDetails streetName={null} landmark="  " notes="Leave at the gate." />)) as any;

    expect(view.queryByTestId('dropoff-street-name')).toBeNull();
    expect(view.queryByTestId('dropoff-landmark')).toBeNull();
    expect(view.getByTestId('dropoff-notes')).toBeTruthy();
  });

  it('draws nothing when there is nothing beyond the address', async () => {
    const view = (await render(<DropOffDetails />)) as any;
    expect(view.toJSON()).toBeNull();
  });
});
