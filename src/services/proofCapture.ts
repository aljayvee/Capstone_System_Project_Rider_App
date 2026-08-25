import * as ImageManipulator from 'expo-image-manipulator';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { apiClient } from './apiClient';

export type ProofImageKind = 'RECEIPT' | 'TRANSFER' | 'PROOF_OF_DELIVERY' | 'NO_RECEIPT';

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

export class ProofCaptureError extends Error {
  constructor(message: string, readonly retryable = true) {
    super(message);
    this.name = 'ProofCaptureError';
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
export async function readOnDevice(uri: string): Promise<string> {
  const result = await TextRecognition.recognize(uri);
  return result?.text ?? '';
}

export function isLegible(text: string): boolean {
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
  declaredTotal?: number
): Promise<UploadedProof> {
  const { uri, base64 } = await downscale(photoUri);

  // Two kinds have nothing to read, and running the legibility check on them
  // would reject a perfectly sharp photo.
  //
  // NO_RECEIPT is a picture of the GOODS from a sari-sari store or a market
  // stall — there is no printed text in it by definition, and this gate was
  // exactly what told riders their sharp photo was "too blurry" and left them
  // unable to finish the errand. PROOF_OF_DELIVERY is a doorstep.
  const hasTextToRead = kind === 'RECEIPT' || kind === 'TRANSFER';

  const deviceText = hasTextToRead ? await readOnDevice(uri) : '';
  if (hasTextToRead && !isLegible(deviceText)) {
    // Not retryable by pressing the same button — the rider has to take a
    // different photo, so the message says what to change.
    throw new ProofCaptureError(
      "That photo came out too blurry to read. Move into better light, hold the phone steady, and fit the whole receipt in the frame.",
      false
    );
  }

  try {
    const response = await apiClient.post(`/errands/${errandId}/proof-images`, {
      kind,
      imageData: base64,
      mimeType: 'image/jpeg',
      fileSize: Math.round((base64.length * 3) / 4),
      pinpointId: pinpointId ?? null,
      // Only sent for transfers; the server reads receipts itself.
      deviceText: kind === 'TRANSFER' ? deviceText : undefined,
      // The rider's own figure, and the only one available for a shop that
      // prints nothing.
      declaredTotal: kind === 'NO_RECEIPT' ? declaredTotal : undefined,
    });
    return response.data;
  } catch (err: any) {
    // The server distinguishes "we couldn't read it" (422) from "the service is
    // down" (503) and writes copy for each. Pass it through rather than
    // flattening both into a generic failure — they need different actions.
    const message = err?.response?.data?.message;
    if (message) throw new ProofCaptureError(message, err?.response?.status === 503);
    throw new ProofCaptureError(
      'No signal. Move toward the road and try again — your errand is saved.',
      true
    );
  }
}

/** The rider accepts the extracted figure or corrects it. */
export async function confirmProofTotal(
  errandId: string,
  imageId: number,
  confirmedTotal: number
): Promise<void> {
  await apiClient.patch(`/errands/${errandId}/proof-images/${imageId}/confirm`, {
    confirmedTotal,
  });
}
