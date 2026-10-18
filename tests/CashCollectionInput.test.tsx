import React from 'react';
import { render } from '@testing-library/react-native';
import { CashCollectionInput } from '../src/modules/task/components/CashCollectionInput';
import type { Errand } from '../src/types/rider';

/**
 * The card's done line says what was actually collected.
 *
 * It used to read the errand's payment plan, so a GCash/Maya customer who paid
 * cash at the door ("They're paying cash instead") was shown "Receipt
 * confirmed", the one thing that did not happen.
 */

const errand = (overrides: Partial<Errand> = {}) =>
  ({
    id: 'err_1',
    amount: 560,
    feeBreakdown: { grandTotal: 560, itemsSubtotal: 500, fees: { subtotal: 60 } },
    ...overrides,
  }) as unknown as Errand;

const gcash = errand({
  paymentMode: 'GCash',
  paymentPlan: { hasLedger: true, balanceDue: 560 } as Errand['paymentPlan'],
});

const draw = async (props: Partial<React.ComponentProps<typeof CashCollectionInput>>) =>
  (await render(
    <CashCollectionInput
      errand={gcash}
      collectedInFull
      onCaptureBalanceProof={jest.fn()}
      onCaptureCashProof={jest.fn()}
      {...props}
    />
  )) as any;

describe('the cash card once payment is on file', () => {
  it('says cash on a GCash errand paid in cash instead', async () => {
    const view = await draw({ proofKind: 'CASH_COLLECTED' });
    expect(view.getByText('Cash photographed ✓')).toBeTruthy();
    expect(view.queryByText('Receipt confirmed ✓')).toBeNull();
  });

  it('says receipt when their GCash receipt was photographed', async () => {
    const view = await draw({ proofKind: 'RIDER_BALANCE_PROOF' });
    expect(view.getByText('Receipt confirmed ✓')).toBeTruthy();
  });

  it('says cash on an ordinary cash-on-delivery errand', async () => {
    const view = await draw({ errand: errand({ paymentMode: 'Cash on Delivery' }), proofKind: 'CASH_COLLECTED' });
    expect(view.getByText('Cash photographed ✓')).toBeTruthy();
  });

  it('tells the rider the cash figure without the non-COD fee', async () => {
    const withFee = errand({
      paymentMode: 'GCash',
      feeBreakdown: { grandTotal: 560, itemsSubtotal: 500, fees: { subtotal: 60, nonCodFee: 20 } },
      paymentPlan: { hasLedger: true, balanceDue: 560 } as Errand['paymentPlan'],
    } as Partial<Errand>);
    const view = await draw({ errand: withFee, collectedInFull: false });
    expect(view.getByTestId('cash-instead-amount').props.children.join('')).toBe(
      'In cash: ₱540, without the ₱20 non-COD fee.'
    );
  });

  it('says nothing extra when there is no non-COD fee', async () => {
    const view = await draw({ collectedInFull: false });
    expect(view.queryByTestId('cash-instead-amount')).toBeNull();
  });

  it('falls back to the payment plan when the kind is not known', async () => {
    expect((await draw({ proofKind: null })).getByText('Receipt confirmed ✓')).toBeTruthy();
    expect(
      (await draw({ errand: errand({ paymentMode: 'Cash on Delivery' }), proofKind: null })).getByText(
        'Cash photographed ✓'
      )
    ).toBeTruthy();
  });
});
