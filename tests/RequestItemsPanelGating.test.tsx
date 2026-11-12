import React from 'react';
import { Alert } from 'react-native';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import { RequestItemsPanel } from '../src/modules/task/components/RequestItemsPanel';
import { riderApiService } from '../src/config/apiConfig';

jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  RN.Modal = ({ visible, children }: any) => (visible ? children : null);
  return RN;
});

jest.mock('../src/config/apiConfig', () => ({
  riderApiService: {
    updateItemFulfillmentStatus: jest.fn().mockResolvedValue(true),
  },
}));

function createErrand(overrides: any = {}) {
  return {
    id: 'ERR-TEST-1',
    status: 'IN_TRANSIT',
    category: 'Pabili',
    payload: [
      {
        name: 'Supermarket A',
        pinpointId: 101,
        storeCategory: 'Grocery',
        items: ['1kg Rice', 'Cooking Oil'],
        itemEntries: [
          { id: 1, label: '1kg Rice', itemName: '1kg Rice', quantity: 1, fulfillmentStatus: 'PENDING' },
          { id: 2, label: 'Cooking Oil', itemName: 'Cooking Oil', quantity: 2, fulfillmentStatus: 'PENDING' },
        ],
      },
    ],
    ...overrides,
  };
}

describe('RequestItemsPanel item confirmation and receipt gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(riderApiService.updateItemFulfillmentStatus).mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps capture closed until the final item mark is saved, then passes the saved states', async () => {
    let finish!: (ok: boolean) => void;
    jest.mocked(riderApiService.updateItemFulfillmentStatus).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const errand = createErrand();
    errand.payload[0].itemEntries[1].fulfillmentStatus = 'OUT_OF_STOCK';
    const onUpload = jest.fn();
    const view = await render(<RequestItemsPanel errand={errand} currentStatus="At Store" completedSubtasks={{}} uploadingSubtask={null} activeStoreTargetId={101} onUpload={onUpload} />);
    await fireEvent.press(view.getByLabelText(/1kg Rice, unchecked/i));
    await fireEvent.press(view.getByTestId('confirm-modal-confirm-btn'));
    await fireEvent.press(view.getByText('Photograph receipt'));
    expect(onUpload).not.toHaveBeenCalled();
    await act(async () => { finish(true); });
    await fireEvent.press(view.getByText('Photograph receipt'));
    expect(onUpload).toHaveBeenCalledWith(expect.objectContaining({ itemEntries: [
      expect.objectContaining({ fulfillmentStatus: 'PURCHASED' }),
      expect.objectContaining({ fulfillmentStatus: 'OUT_OF_STOCK' }),
    ] }), 0);
  });

  it('leaves a failed item mark unchecked so the rider can retry', async () => {
    jest.mocked(riderApiService.updateItemFulfillmentStatus).mockResolvedValueOnce(false);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const view = await render(<RequestItemsPanel errand={createErrand()} currentStatus="At Store" completedSubtasks={{}} uploadingSubtask={null} activeStoreTargetId={101} />);
    await fireEvent.press(view.getByLabelText(/1kg Rice, unchecked/i));
    await fireEvent.press(view.getByTestId('confirm-modal-confirm-btn'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Item not saved', expect.any(String)));
    expect(view.getByLabelText(/1kg Rice, unchecked/i)).toBeTruthy();
  });

  it('opens confirmation modal when clicking an unchecked item row', async () => {
    const errand = createErrand();
    const view = await render(
      <RequestItemsPanel
        errand={errand}
        currentStatus="At Store"
        completedSubtasks={{}}
        uploadingSubtask={null}
        activeStoreTargetId={101}
      />
    );

    // Click on the first item row
    const itemRow = view.getByLabelText(/1kg Rice, unchecked/i);
    await fireEvent.press(itemRow);

    // Modal should be visible with confirmation text
    await waitFor(() => {
      expect(view.getByTestId('confirm-modal-cancel-btn')).toBeTruthy();
      expect(view.getByText('Confirm Item Purchased')).toBeTruthy();
    });

    // Cancel closes modal
    const cancelBtn = view.getByTestId('confirm-modal-cancel-btn');
    await fireEvent.press(cancelBtn);

    await waitFor(() => {
      expect(view.queryByTestId('confirm-modal-cancel-btn')).toBeNull();
    });
  });

  it('marks item as purchased when confirmed in modal and calls riderApiService', async () => {
    const errand = createErrand();
    const view = await render(
      <RequestItemsPanel
        errand={errand}
        currentStatus="At Store"
        completedSubtasks={{}}
        uploadingSubtask={null}
        activeStoreTargetId={101}
      />
    );

    // Open modal
    const itemRow = view.getByLabelText(/1kg Rice, unchecked/i);
    await fireEvent.press(itemRow);

    await waitFor(() => {
      expect(view.getByTestId('confirm-modal-confirm-btn')).toBeTruthy();
    });

    // Confirm
    const confirmBtn = view.getByTestId('confirm-modal-confirm-btn');
    await fireEvent.press(confirmBtn);

    await waitFor(() => {
      expect(view.queryByTestId('confirm-modal-confirm-btn')).toBeNull();
    });

    expect(riderApiService.updateItemFulfillmentStatus).toHaveBeenCalledWith(
      'ERR-TEST-1',
      1,
      'PURCHASED'
    );
  });

  it('opens out-of-stock confirmation modal when clicking No Stock?', async () => {
    const errand = createErrand();
    const view = await render(
      <RequestItemsPanel
        errand={errand}
        currentStatus="At Store"
        completedSubtasks={{}}
        uploadingSubtask={null}
        activeStoreTargetId={101}
      />
    );

    // Click No Stock for 1kg Rice
    const oosBtn = view.getByLabelText(/Mark 1kg Rice as out of stock/i);
    await fireEvent.press(oosBtn);

    await waitFor(() => {
      expect(view.getByText('Confirm Out of Stock')).toBeTruthy();
      expect(view.getByTestId('confirm-modal-confirm-btn')).toBeTruthy();
    });

    // Confirm out of stock
    const confirmBtn = view.getByTestId('confirm-modal-confirm-btn');
    await fireEvent.press(confirmBtn);

    await waitFor(() => {
      expect(view.queryByTestId('confirm-modal-confirm-btn')).toBeNull();
    });

    expect(riderApiService.updateItemFulfillmentStatus).toHaveBeenCalledWith(
      'ERR-TEST-1',
      1,
      'OUT_OF_STOCK'
    );
  });

  it('gates receipt capture buttons when items are still unchecked', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const onUpload = jest.fn();
    const onNoReceipt = jest.fn();
    const errand = createErrand();

    const view = await render(
      <RequestItemsPanel
        errand={errand}
        currentStatus="At Store"
        completedSubtasks={{}}
        uploadingSubtask={null}
        activeStoreTargetId={101}
        onUpload={onUpload}
        onNoReceipt={onNoReceipt}
      />
    );

    // Warning banner should be rendered
    expect(
      view.getByText(/Check all items above \(2 remaining\) before photographing receipt or reporting no receipt\./i)
    ).toBeTruthy();

    // Try tapping Photograph receipt while items are unchecked
    const photoBtn = view.getByText('Photograph receipt');
    await fireEvent.press(photoBtn);

    expect(alertSpy).toHaveBeenCalledWith(
      'Check All Items First',
      expect.stringContaining('Please verify all 2 requested items'),
      expect.any(Array)
    );
    expect(onUpload).not.toHaveBeenCalled();

    // Try tapping This shop gives no receipt while items are unchecked
    const noReceiptBtn = view.getByText('This shop gives no receipt');
    await fireEvent.press(noReceiptBtn);

    expect(alertSpy).toHaveBeenCalledWith(
      'Check All Items First',
      expect.stringContaining('Please verify all 2 requested items'),
      expect.any(Array)
    );
    expect(onNoReceipt).not.toHaveBeenCalled();
  });

  it('permits receipt upload once all items for the store are verified', async () => {
    const onUpload = jest.fn();
    const errand = createErrand({
      id: 'ERR-VERIFIED-1',
      payload: [
        {
          name: 'Supermarket A',
          pinpointId: 101,
          storeCategory: 'Grocery',
          items: ['1kg Rice', 'Cooking Oil'],
          itemEntries: [
            { id: 1, label: '1kg Rice', itemName: '1kg Rice', quantity: 1, fulfillmentStatus: 'PURCHASED' },
            { id: 2, label: 'Cooking Oil', itemName: 'Cooking Oil', quantity: 2, fulfillmentStatus: 'OUT_OF_STOCK' },
          ],
        },
      ],
    });

    const view = await render(
      <RequestItemsPanel
        errand={errand}
        currentStatus="At Store"
        completedSubtasks={{}}
        uploadingSubtask={null}
        activeStoreTargetId={101}
        onUpload={onUpload}
      />
    );

    // Warning banner should NOT be present
    expect(
      view.queryByText(/Check all items above/i)
    ).toBeNull();

    // Tapping Photograph receipt should call onUpload
    await waitFor(() => {
      expect(view.getByText('Photograph receipt')).toBeTruthy();
    });

    const photoBtn = view.getByText('Photograph receipt');
    await fireEvent.press(photoBtn);

    expect(onUpload).toHaveBeenCalled();
  });

  it('names the size in the confirmation, so the rider checks the right pack', async () => {
    const errand = createErrand({
      payload: [
        {
          name: 'Supermarket A',
          pinpointId: 101,
          storeCategory: 'Grocery',
          items: ['Chicken · 5 kg x2'],
          itemEntries: [
            { id: 7, label: 'Chicken · 5 kg x2', itemName: 'Chicken', size: '5 kg', quantity: 2, fulfillmentStatus: 'PENDING' },
          ],
        },
      ],
    });
    const view = await render(
      <RequestItemsPanel
        errand={errand}
        currentStatus="At Store"
        completedSubtasks={{}}
        uploadingSubtask={null}
        activeStoreTargetId={101}
      />
    );

    await fireEvent.press(view.getByLabelText(/Chicken · 5 kg x2, unchecked/i));

    await waitFor(() => {
      // The dialog's own line, "2x " then the label; the row reads "... x2".
      expect(view.getByText('2x Chicken · 5 kg')).toBeTruthy();
      expect(view.getByText('Confirm Item Purchased')).toBeTruthy();
    });
  });

  it('shows the list but locks it while still riding to the store', async () => {
    // What the Task screen passes right after accepting: Traveling, routing to
    // store 101, nothing reached yet.
    const view = await render(
      <RequestItemsPanel errand={createErrand()} currentStatus="Traveling" completedSubtasks={{}} uploadingSubtask={null}
        activeStoreTargetId={101} visitedPinpointIds={[]} />
    );
    expect(view.getByText('1kg Rice')).toBeTruthy();
    expect(view.getByText('Reach this store first')).toBeTruthy();
    const row = view.getByLabelText(/1kg Rice, unchecked/i);
    expect(row.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(view.queryByText('No Stock?')).toBeNull();
    await fireEvent.press(row);
    expect(view.queryByTestId('confirm-modal-confirm-btn')).toBeNull();
    expect(riderApiService.updateItemFulfillmentStatus).not.toHaveBeenCalled();
  });

  it('unlocks the same list once the rider is at the store', async () => {
    const props = { errand: createErrand(), completedSubtasks: {}, uploadingSubtask: null, activeStoreTargetId: 101, visitedPinpointIds: [] as number[] };
    const view = await render(<RequestItemsPanel {...props} currentStatus="Traveling" />);
    await view.rerender(<RequestItemsPanel {...props} currentStatus="At Store" />);
    expect(view.queryByText('Reach this store first')).toBeNull();
    expect(view.getAllByText('No Stock?')).toHaveLength(2);
    await fireEvent.press(view.getByLabelText(/1kg Rice, unchecked/i));
    await fireEvent.press(view.getByTestId('confirm-modal-confirm-btn'));
    await waitFor(() => expect(riderApiService.updateItemFulfillmentStatus).toHaveBeenCalledWith('ERR-TEST-1', 1, 'PURCHASED'));
  });

  it('shows the customer note under the item, so the rider sees it at the counter', async () => {
    const errand = createErrand({
      payload: [
        {
          name: 'Market',
          pinpointId: 101,
          storeCategory: 'Grocery',
          items: ['Sibuyas · 1/2 kg'],
          itemEntries: [
            { id: 8, label: 'Sibuyas · 1/2 kg', itemName: 'Sibuyas', size: '1/2 kg', notes: 'walang bulok', quantity: 1, fulfillmentStatus: 'PENDING' },
          ],
        },
      ],
    });
    const view = await render(
      <RequestItemsPanel errand={errand} currentStatus="At Store" completedSubtasks={{}} uploadingSubtask={null} activeStoreTargetId={101} />
    );
    expect(view.getByText('Note: walang bulok')).toBeTruthy();
  });
});
