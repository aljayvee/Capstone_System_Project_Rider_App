import * as ImageManipulator from 'expo-image-manipulator';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { apiClient } from './apiClient';
import { describeUploadFailure, PHOTO_UPLOAD_TIMEOUT_MS, uploadFraction } from './uploadFailure';

export type ProofImageKind =
  | 'RECEIPT'
  | 'TRANSFER'
  | 'PROOF_OF_DELIVERY'
  | 'NO_RECEIPT'
  // The rider's photo of the customer's GCash/Maya receipt at the door —
  // read with the same reference-number/amount/same-day rigor the
  // customer's own upload gets.
  | 'RIDER_BALANCE_PROOF'
  // The rider's photo of physical cash in hand. No OCR — the rider's typed
  // figure is the amount, exactly like NO_RECEIPT.
  | 'CASH_COLLECTED';

export interface ProofExtraction {
  id: number;
  engine: 'CLOUD_VISION' | 'MLKIT';
  extractedTotal: number | null;
  extractedDate: string | null;
  status: 'OK' | 'NEEDS_REVIEW' | 'FAILED';
}

export interface UploadedProof {
  id: number;
  kind: ProofImageKind;
  clarityVerdict: string | null;
  /** False when a person asserted the figure rather than a machine reading it. */
  verified?: boolean;
  /** What the rider said they paid, where no receipt existed. */
  declaredTotal?: number | null;
  /** Null for kinds with nothing to read — a doorstep, or a shop with no receipt. */
  extraction: ProofExtraction | null;
}

/**
 * Longest edge after downscaling.
 *
 * A Samsung at full resolution shoots 8160x6120 — 12 MB, which becomes ~17 MB as
 * base64 against a 5 MB server cap. At 1600 px the same receipt is ~400 KB and
 * Cloud Vision still reads every line, verified on three real receipts. Going
 * smaller starts losing the fine print on thermal paper.
 */
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

/**
 * Below this many recognised characters the photo is unusable rather than the
 * receipt being unusual. Real receipts return 790-1010 characters; a blurred or
 * mis-aimed shot returns single digits.
 */
const MIN_LEGIBLE_CHARACTERS = 40;

/**
 * A receipt the server has read and is holding, unsaved, for the rider to check.
 * Nothing is stored until saveScannedReceipt, so a retake leaves no copy behind.
 */
export interface ScannedProof {
  scanId: string;
  kind: 'RECEIPT' | 'TRANSFER';
  clarityVerdict: string | null;
  extraction: Omit<ProofExtraction, 'id'>;
}

/** Share of the photo sent so far, 0 to 1; null when the size is unknown. */
export type UploadProgress = (fraction: number | null) => void;

export class ProofCaptureError extends Error {
  constructor(message: string, readonly retryable = true, readonly status: number | null = null) {
    super(message);
    this.name = 'ProofCaptureError';
  }
}

/** Every photo goes up with room to finish on a slow line, reporting as it goes. */
async function postPhoto<T>(path: string, body: unknown, onProgress?: UploadProgress): Promise<T> {
  try {
    const response = await apiClient.post(path, body, {
      timeout: PHOTO_UPLOAD_TIMEOUT_MS,
      onUploadProgress: onProgress ? (event: any) => onProgress(uploadFraction(event)) : undefined,
    });
    return response.data;
  } catch (err: any) {
    // The server distinguishes "we couldn't read it" (422) from "the service is
    // down" (503) and writes copy for each. Pass it through rather than
    // flattening both into a generic failure: they need different actions.
    const failure = describeUploadFailure(err);
    throw new ProofCaptureError(failure.message, failure.retryable, failure.status);
  }
}

/** Shrinks a full-resolution camera photo to something uploadable. */
export async function downscale(uri: string): Promise<{ uri: string; base64: string }> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_DIMENSION } }],
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );

  if (!result.base64) {
    throw new ProofCaptureError('Could not prepare that photo for upload. Please retake it.');
  }
  return { uri: result.uri, base64: result.base64 };
}

/**
 * Reads a photo on the device, before anything is uploaded.
 *
 * Serves two purposes at once, which is why one library covers both OCR paths:
 *
 *  - **The clarity gate for every image.** If ML Kit finds almost no text, the
 *    photo is unusable. Catching that here means the rider is told while still
 *    standing at the counter, offline, in under a second — rather than after a
 *    slow upload and a paid Cloud Vision call that was never going to succeed.
 *  - **The actual reader for transfers.** A GCash or bank screenshot is crisp
 *    machine-rendered text. ML Kit handles it perfectly, for free, and the image
 *    never has to leave the phone to be read.
 */
/**
 * Returns null when the reader itself is unavailable — which is NOT the same as
 * reading a blank photo.
 *
 * The distinction is load-bearing. This had no error handling, so if the native
 * module failed the exception escaped captureAndUpload as a raw native error and
 * every receipt capture died at the counter. Worse, treating that failure as an
 * empty read would have told riders their perfectly sharp photo was "too blurry"
 * — the exact bug that already stranded them once at sari-sari stores.
 *
 * A dead reader must therefore mean "I cannot judge this", not "this is bad".
 * The gate below skips, the photo uploads, and Cloud Vision decides on the
 * server as it already does for every receipt.
 */
export async function readOnDevice(uri: string): Promise<string | null> {
  try {
    const result = await TextRecognition.recognize(uri);
    return result?.text ?? '';
  } catch {
    return null;
  }
}

/** Null (reader unavailable) is never illegible — there was no reading to judge. */
export function isLegible(text: string | null): boolean {
  if (text === null) return true;
  return text.replace(/\s/g, '').length >= MIN_LEGIBLE_CHARACTERS;
}

/**
 * Capture -> downscale -> on-device check -> upload.
 *
 * A RECEIPT is uploaded for Cloud Vision to read on the server: crumpled thermal
 * paper is the hard case and the one Vision is markedly better at. A TRANSFER
 * carries the text ML Kit already extracted, so the server stores that instead of
 * spending a Vision call on a screenshot the phone read perfectly well.
 */
export async function captureAndUpload(
  errandId: string,
  kind: ProofImageKind,
  photoUri: string,
  pinpointId?: number | null,
  declaredTotal?: number,
  onProgress?: UploadProgress,
  riderNote?: string
): Promise<UploadedProof> {
  const { uri, base64 } = await downscale(photoUri);

  // Two kinds have nothing to read, and running the legibility check on them
  // would reject a perfectly sharp photo.
  //
  // NO_RECEIPT is a picture of the GOODS from a sari-sari store or a market
  // stall — there is no printed text in it by definition, and this gate was
  // exactly what told riders their sharp photo was "too blurry" and left them
  // unable to finish the errand. PROOF_OF_DELIVERY is a doorstep. CASH_COLLECTED
  // is a photo of banknotes — also nothing to read.
  const hasTextToRead = kind === 'RECEIPT' || kind === 'TRANSFER' || kind === 'RIDER_BALANCE_PROOF';

  const deviceText = hasTextToRead ? await readOnDevice(uri) : '';
  if (hasTextToRead && !isLegible(deviceText)) {
    // Not retryable by pressing the same button — the rider has to take a
    // different photo, so the message says what to change.
    throw new ProofCaptureError(
      "That photo came out too blurry to read. Move into better light, hold the phone steady, and fit the whole receipt in the frame.",
      false
    );
  }

  return postPhoto<UploadedProof>(
    `/errands/${errandId}/proof-images`,
    {
      kind,
      imageData: base64,
      mimeType: 'image/jpeg',
      fileSize: Math.round((base64.length * 3) / 4),
      pinpointId: pinpointId ?? null,
      // Only sent for TRANSFER; the server reads RECEIPT and RIDER_BALANCE_PROOF
      // itself. RIDER_BALANCE_PROOF deliberately never sends on-device text —
      // it exists specifically to be an independently-read check on money, so
      // it always pays for the real Cloud Vision call rather than trusting
      // what the phone read for free.
      deviceText: kind === 'TRANSFER' ? (deviceText ?? undefined) : undefined,
      // The rider's own figure — the only one available for a shop that
      // prints nothing, or for cash nobody else can corroborate.
      declaredTotal: kind === 'NO_RECEIPT' || kind === 'CASH_COLLECTED' ? declaredTotal : undefined,
      riderNote: riderNote?.trim() || undefined,
    },
    onProgress
  );
}

/**
 * Capture -> downscale -> on-device check -> the server reads it and holds it.
 *
 * For the kinds whose total the rider confirms. Uploading straight into the
 * record (captureAndUpload) stored every retake of the same receipt, so the
 * server now keeps the photo aside until saveScannedReceipt, and a retake
 * simply replaces it.
 */
export async function scanReceipt(
  errandId: string,
  kind: 'RECEIPT' | 'TRANSFER',
  photoUri: string,
  pinpointId?: number | null,
  onProgress?: UploadProgress
): Promise<ScannedProof> {
  const { uri, base64 } = await downscale(photoUri);

  const deviceText = await readOnDevice(uri);
  if (!isLegible(deviceText)) {
    throw new ProofCaptureError(
      'That photo came out too blurry to read. Move into better light, hold the phone steady, and fit the whole receipt in the frame.',
      false
    );
  }

  return postPhoto<ScannedProof>(
    `/errands/${errandId}/proof-images/scan`,
    {
      kind,
      imageData: base64,
      mimeType: 'image/jpeg',
      fileSize: Math.round((base64.length * 3) / 4),
      pinpointId: pinpointId ?? null,
      // As in captureAndUpload: a transfer screenshot is read on the phone.
      deviceText: kind === 'TRANSFER' ? (deviceText ?? undefined) : undefined,
    },
    onProgress
  );
}

/**
 * The rider accepts the extracted figure or corrects it, and only now is the
 * photo saved. Safe to press again after a lost reply: the server applies the
 * total to the photo it already saved instead of saving it twice.
 */
export async function saveScannedReceipt(
  errandId: string,
  scanId: string,
  confirmedTotal: number,
  riderNote?: string
): Promise<{ id: number }> {
  return postPhoto<{ id: number }>(
    `/errands/${errandId}/proof-images/scans/${encodeURIComponent(scanId)}/confirm`,
    {
      confirmedTotal,
      riderNote: riderNote?.trim() || undefined,
    }
  );
}
