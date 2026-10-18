import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ReceiptCaptureScreen from '../src/screens/ReceiptCaptureScreen';
import * as proofCapture from '../src/services/proofCapture';

/**
 * Cash at the door: "What did they hand you?"
 *
 * The amount owed arrives filled in, and Confirm total no longer files the
 * cash on a tap. It opens a last look at the figure, which the rider settles
 * by swiping, since this is money they answer for.
 */

jest.mock('../src/services/proofCapture', () => {
  class ProofCaptureError extends Error {
    constructor(message: string, readonly retryable = true, readonly status: number | null = null) {
      super(message);
      this.name = 'ProofCaptureError';
    }
  }
  return {
    ProofCaptureError,
    captureAndUpload: jest.fn(),
    scanReceipt: jest.fn(),
    saveScannedReceipt: jest.fn(),
  };
});

// The sheet's gesture root installs a native module that does not exist here.
jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  return { GestureHandlerRootView: View };
});

// The pan itself needs a device. What is under test is what a finished swipe
// does, so the slider stands in as something a test can complete, and counts
// its mounts so a reset (a fresh slider after a failed save) can be seen.
let sliderMounts = 0;
jest.mock('../src/components/SlideToConfirm', () => {
  const { useEffect } = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    SlideToConfirm: ({ label, onSlideComplete, disabled }: any) => {
      useEffect(() => {
        sliderMounts += 1;
      }, []);
      return (
        <Pressable testID="cash-confirm-slider" onPress={disabled ? undefined : onSlideComplete}>
          <Text>{label}</Text>
        </Pressable>
      );
    },
  };
});

const captureAndUpload = proofCapture.captureAndUpload as jest.Mock;

const draw = async (onDone = jest.fn(), expectedAmount: number | null = 450) =>
  (await render(
    <ReceiptCaptureScreen
      errandId="ERR-7"
      kind="CASH_COLLECTED"
      expectedAmount={expectedAmount ?? undefined}
      onDone={onDone}
      onCancel={jest.fn()}
    />
  )) as any;

const photograph = async (view: any) => {
  await fireEvent.press(view.getByTestId('receipt-capture-button'));
  await waitFor(() => expect(view.getByTestId('receipt-amount-input')).toBeTruthy());
};

beforeEach(() => {
  jest.clearAllMocks();
  sliderMounts = 0;
});

describe('collecting cash at the door', () => {
  it('fills in the amount owed', async () => {
    const view = await draw();
    await photograph(view);

    expect(view.getByTestId('receipt-amount-input').props.value).toBe('450.00');
    expect(view.getByText(/The amount due is filled in/)).toBeTruthy();
  });

  it('fills it in again after a retake', async () => {
    const view = await draw();
    await photograph(view);
    await fireEvent.changeText(view.getByTestId('receipt-amount-input'), '300');
    await fireEvent.press(view.getByText('Retake'));
    await photograph(view);

    expect(view.getByTestId('receipt-amount-input').props.value).toBe('450.00');
  });

  it('leaves it blank when nothing is owed to compare against', async () => {
    const view = await draw(jest.fn(), null);
    await photograph(view);

    expect(view.getByTestId('receipt-amount-input').props.value).toBe('');
    expect(view.getByText(/Enter what they handed you/)).toBeTruthy();
  });

  it('asks before filing on Confirm total, and files nothing yet', async () => {
    const onDone = jest.fn();
    const view = await draw(onDone);
    await photograph(view);

    expect(view.queryByTestId('cash-confirm-sheet')).toBeNull();
    await fireEvent.press(view.getByTestId('receipt-confirm-button'));

    expect(view.getByTestId('cash-confirm-sheet')).toBeTruthy();
    expect(view.getByTestId('cash-confirm-amount').props.children).toBe('₱450');
    expect(view.getByTestId('cash-confirm-detail').props.children).toBe('Matches the ₱450 due.');
    expect(view.getByText('Slide to confirm')).toBeTruthy();
    expect(captureAndUpload).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('files the cash when the rider swipes', async () => {
    captureAndUpload.mockResolvedValueOnce({ id: 91 });
    const onDone = jest.fn();
    const view = await draw(onDone);
    await photograph(view);
    await fireEvent.press(view.getByTestId('receipt-confirm-button'));
    await fireEvent.press(view.getByTestId('cash-confirm-slider'));

    await waitFor(() =>
      expect(onDone).toHaveBeenCalledWith({ confirmedTotal: 450, imageId: 91, riderNote: undefined })
    );
    expect(captureAndUpload).toHaveBeenCalledWith(
      'ERR-7',
      'CASH_COLLECTED',
      'file:///mock.jpg',
      undefined,
      450,
      expect.any(Function),
      undefined
    );
  });

  it('says when the cash is short of what is owed', async () => {
    const view = await draw();
    await photograph(view);
    await fireEvent.changeText(view.getByTestId('receipt-amount-input'), '400');
    await fireEvent.press(view.getByTestId('receipt-confirm-button'));

    expect(view.getByTestId('cash-confirm-detail').props.children).toBe(
      '₱50 short of the ₱450 due. It will be recorded as a short payment.'
    );
  });

  it('goes back to the amount without filing anything', async () => {
    const view = await draw();
    await photograph(view);
    await fireEvent.press(view.getByTestId('receipt-confirm-button'));
    await fireEvent.press(view.getByTestId('cash-confirm-back'));

    expect(view.queryByTestId('cash-confirm-sheet')).toBeNull();
    expect(view.getByTestId('receipt-amount-input')).toBeTruthy();
    expect(captureAndUpload).not.toHaveBeenCalled();
  });

  it('keeps the sheet open on a failed save, with a fresh slider to try again', async () => {
    captureAndUpload
      .mockRejectedValueOnce(new Error('No connection.'))
      .mockResolvedValueOnce({ id: 92 });
    const onDone = jest.fn();
    const view = await draw(onDone);
    await photograph(view);
    await fireEvent.press(view.getByTestId('receipt-confirm-button'));
    await fireEvent.press(view.getByTestId('cash-confirm-slider'));

    await waitFor(() => expect(view.getAllByText('No connection.').length).toBeGreaterThan(0));
    expect(view.getByTestId('cash-confirm-sheet')).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    expect(sliderMounts).toBe(2);

    await fireEvent.press(view.getByTestId('cash-confirm-slider'));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ imageId: 92 })));
  });

  it('sends the rider back to the camera when the server let go of the photo', async () => {
    captureAndUpload.mockRejectedValueOnce(
      new proofCapture.ProofCaptureError('That photo was not saved in time. Please take it again.', true, 410)
    );
    const view = await draw();
    await photograph(view);
    await fireEvent.press(view.getByTestId('receipt-confirm-button'));
    await fireEvent.press(view.getByTestId('cash-confirm-slider'));

    await waitFor(() => expect(view.getByText(/not saved in time/)).toBeTruthy());
    expect(view.queryByTestId('cash-confirm-sheet')).toBeNull();
    expect(view.getByTestId('receipt-capture-button')).toBeTruthy();
  });
});
