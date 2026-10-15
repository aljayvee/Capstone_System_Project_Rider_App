import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ReceiptCaptureScreen from '../src/screens/ReceiptCaptureScreen';
import * as proofCapture from '../src/services/proofCapture';

/**
 * A retaken receipt must never reach the errand's record.
 *
 * The photo used to be stored the moment it was read, before the rider had
 * looked at the total, so every retake left a copy behind. Now it is read and
 * held, and only Confirm saves it.
 */

// The real module loads the API client and its native storage, none of which
// matters here: what is under test is which call the screen makes, and when.
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

const scanReceipt = proofCapture.scanReceipt as jest.Mock;
const saveScannedReceipt = proofCapture.saveScannedReceipt as jest.Mock;
const captureAndUpload = proofCapture.captureAndUpload as jest.Mock;

const scanned = (scanId: string, extractedTotal: number | null = 176) => ({
  scanId,
  kind: 'RECEIPT',
  clarityVerdict: 'SHARP',
  extraction: { engine: 'CLOUD_VISION', extractedTotal, extractedDate: null, status: 'OK' },
});

const draw = async (onDone = jest.fn()) =>
  (await render(
    <ReceiptCaptureScreen errandId="ERR-1" kind="RECEIPT" pinpointId={5} onDone={onDone} onCancel={jest.fn()} />
  )) as any;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('photographing a receipt', () => {
  it('reads the photo without saving it', async () => {
    scanReceipt.mockResolvedValueOnce(scanned('scan-1'));
    const view = await draw();

    await fireEvent.press(view.getByTestId('receipt-capture-button'));
    await waitFor(() => expect(view.getByTestId('receipt-amount-input')).toBeTruthy());

    expect(scanReceipt).toHaveBeenCalledWith('ERR-1', 'RECEIPT', 'file:///mock.jpg', 5, expect.any(Function));
    expect(captureAndUpload).not.toHaveBeenCalled();
    expect(saveScannedReceipt).not.toHaveBeenCalled();
    expect(view.getByTestId('receipt-amount-input').props.value).toBe('176.00');
  });

  it('saves only the retake, once, when the rider confirms it', async () => {
    scanReceipt.mockResolvedValueOnce(scanned('scan-blurry', null)).mockResolvedValueOnce(scanned('scan-good'));
    saveScannedReceipt.mockResolvedValueOnce({ id: 42 });
    const onDone = jest.fn();
    const view = await draw(onDone);

    await fireEvent.press(view.getByTestId('receipt-capture-button'));
    await waitFor(() => expect(view.getByText('Retake')).toBeTruthy());
    await fireEvent.press(view.getByText('Retake'));

    await fireEvent.press(view.getByTestId('receipt-capture-button'));
    await waitFor(() => expect(view.getByTestId('receipt-amount-input').props.value).toBe('176.00'));
    await fireEvent.press(view.getByTestId('receipt-confirm-button'));

    // Optimistic: handed back at once with the save still going, which the
    // errand ticks now and undoes if it fails.
    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ confirmedTotal: 176, imageId: null, pending: expect.any(Promise) })
    );
    await expect(onDone.mock.calls[0][0].pending).resolves.toEqual({ id: 42 });
    expect(saveScannedReceipt).toHaveBeenCalledTimes(1);
    expect(saveScannedReceipt).toHaveBeenCalledWith('ERR-1', 'scan-good', 176);
  });

  it('does not wait on the save behind a spinner', async () => {
    scanReceipt.mockResolvedValueOnce(scanned('scan-1'));
    // A save that never answers: the rider must not be held for it.
    saveScannedReceipt.mockReturnValueOnce(new Promise(() => {}));
    const onDone = jest.fn();
    const view = await draw(onDone);

    await fireEvent.press(view.getByTestId('receipt-capture-button'));
    await waitFor(() => expect(view.getByTestId('receipt-confirm-button')).toBeTruthy());
    await fireEvent.press(view.getByTestId('receipt-confirm-button'));

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('sends the corrected total, not the reading', async () => {
    scanReceipt.mockResolvedValueOnce(scanned('scan-1', 176));
    saveScannedReceipt.mockResolvedValueOnce({ id: 7 });
    const view = await draw();

    await fireEvent.press(view.getByTestId('receipt-capture-button'));
    await waitFor(() => expect(view.getByTestId('receipt-amount-input')).toBeTruthy());
    await fireEvent.changeText(view.getByTestId('receipt-amount-input'), '186.50');
    await fireEvent.press(view.getByTestId('receipt-confirm-button'));

    await waitFor(() => expect(saveScannedReceipt).toHaveBeenCalledWith('ERR-1', 'scan-1', 186.5));
  });

  it('hands back, untried again, a save the server let go of, for the errand to undo', async () => {
    // The server no longer holds the photo (410): sending it again cannot
    // work, so the failure goes straight to the errand, which takes the tick
    // back off and asks for a new photo (useRiderMission, proofRollback).
    scanReceipt.mockResolvedValueOnce(scanned('scan-old'));
    const gone = new proofCapture.ProofCaptureError('That photo was not saved in time. Please take it again.', true, 410);
    saveScannedReceipt.mockRejectedValueOnce(gone);
    // As the errand does (completeReceiptCapture): handles the save's failure
    // the moment it is handed over, so the rejection is never left unheard.
    const onDone = jest.fn((result: { pending?: Promise<unknown> }) => {
      result.pending?.catch(() => {});
    });
    const view = await draw(onDone);

    await fireEvent.press(view.getByTestId('receipt-capture-button'));
    await waitFor(() => expect(view.getByTestId('receipt-confirm-button')).toBeTruthy());
    await fireEvent.press(view.getByTestId('receipt-confirm-button'));

    await expect(onDone.mock.calls[0][0].pending).rejects.toBe(gone);
    expect(saveScannedReceipt).toHaveBeenCalledTimes(1);
  });

  it('uploads the handover behind the step instead of in front of it', async () => {
    captureAndUpload.mockReturnValueOnce(new Promise(() => {}));
    const onDone = jest.fn();
    const view = (await render(
      <ReceiptCaptureScreen errandId="ERR-1" kind="PROOF_OF_DELIVERY" onDone={onDone} onCancel={jest.fn()} />
    )) as any;

    await fireEvent.press(view.getByTestId('receipt-capture-button'));

    await waitFor(() =>
      expect(onDone).toHaveBeenCalledWith(
        expect.objectContaining({ confirmedTotal: 0, imageId: null, pending: expect.any(Promise) })
      )
    );
  });

  it('shows the reason a photo did not go through, and stays on the camera', async () => {
    scanReceipt.mockRejectedValueOnce(
      new proofCapture.ProofCaptureError(
        'Sending the photo took too long. The connection here is slow, so try again or move to where the signal is stronger.'
      )
    );
    const view = await draw();

    await fireEvent.press(view.getByTestId('receipt-capture-button'));

    await waitFor(() => expect(view.getByText(/Sending the photo took too long/)).toBeTruthy());
    expect(view.getByTestId('receipt-capture-button')).toBeTruthy();
  });
});
