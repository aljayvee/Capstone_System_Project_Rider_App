import React from 'react';
import { render } from '@testing-library/react-native';
import { CustomerDetailsPanel } from '../src/modules/task/components/CustomerDetailsPanel';
import type { Errand } from '../src/types/rider';

/**
 * The delivery-stage card the rider reads at the door. The street, landmark and
 * notes come from the customer's saved location; each one shows only when the
 * customer filled it in.
 */

const errand = (over: Partial<Errand> = {}): Errand =>
  ({
    id: 'err_1',
    type: 'Pabili',
    customer: 'Maria Santos',
    customerPhone: '09171234567',
    address: 'Purok 5, Poblacion, Tacurong',
    paymentMode: null,
    status: 'Delivering',
    amount: 0,
    createdAt: '2026-10-03T00:00:00.000Z',
    updatedAt: '2026-10-03T00:00:00.000Z',
    ...over,
  }) as Errand;

describe('the customer details panel', () => {
  it('shows the street, landmark and notes for the door', async () => {
    const view = await render(
      <CustomerDetailsPanel
        errand={errand({
          deliveryStreetName: 'Rizal Street',
          deliveryLandmark: 'Blue gate beside the chapel',
          deliveryNotes: 'Call when outside, the dog barks.',
        })}
      />
    );

    expect(view.getByTestId('customer-street-name')).toBeTruthy();
    expect(view.getByText('Rizal Street', { exact: false })).toBeTruthy();
    expect(view.getByText('Blue gate beside the chapel', { exact: false })).toBeTruthy();
    expect(view.getByText('Call when outside, the dog barks.')).toBeTruthy();
  });

  it('shows no empty rows when the customer left them blank', async () => {
    const view = await render(<CustomerDetailsPanel errand={errand()} />);

    expect(view.getByText('Purok 5, Poblacion, Tacurong')).toBeTruthy();
    expect(view.queryByTestId('customer-street-name')).toBeNull();
    expect(view.queryByTestId('customer-landmark')).toBeNull();
    expect(view.queryByTestId('customer-delivery-notes')).toBeNull();
  });
});
