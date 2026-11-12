/**
 * Why a photo upload failed, in words a rider can act on.
 *
 * Kept free of native imports so it runs under vitest: proofCapture itself pulls
 * in the image manipulator and ML Kit, which do not load off a device.
 */

/**
 * How long a photo upload may take before giving up.
 *
 * The app-wide 10 s budget is sized for small JSON. A receipt photo is ~400 KB,
 * and a 500 KB upload from the office line measured 16 s on 2026-09-24. Timing
 * out mid-upload meant the photo never reached the server (Cloudflare drops a
 * request whose body never finishes arriving), and the rider was told there was
 * no signal while standing in full signal.
 */
export const PHOTO_UPLOAD_TIMEOUT_MS = 90_000;

export interface UploadFailure {
  message: string;
  /** Pressing the same button again may work; false means take a different photo. */
  retryable: boolean;
  status: number | null;
}

export function describeUploadFailure(err: any): UploadFailure {
  const status: number | null = err?.status ?? err?.response?.status ?? null;
  const data = err?.response?.data;

  // The API answers `{ error }` (server errorHandler.ts). This used to read
  // `message`, which the API never sends, so every refusal (an unreadable
  // photo, scanning down, a rate limit) reached the rider as "No signal".
  const serverText =
    typeof data?.error === 'string' ? data.error : typeof data?.message === 'string' ? data.message
      : typeof err?.message === 'string' ? err.message : null;

  if (status !== null && serverText) {
    return { message: serverText, retryable: status === 503 || status === 429, status };
  }

  if (status !== null) {
    // An answer with no words in it: a proxy's error page rather than the API.
    return {
      message: `The server could not take the photo (error ${status}). Try again in a moment.`,
      retryable: true,
      status,
    };
  }

  if (err?.code === 'ECONNABORTED' || /timeout/i.test(String(err?.message ?? ''))) {
    return {
      message: 'Sending the photo took too long. The connection here is slow, so try again or move to where the signal is stronger.',
      retryable: true,
      status: null,
    };
  }

  return {
    message: 'Could not reach the server. Check your mobile data or Wi-Fi, then try again.',
    retryable: true,
    status: null,
  };
}

/** A fraction from an upload progress event, or null when the size is unknown. */
export function uploadFraction(event: { loaded?: number; total?: number } | undefined): number | null {
  if (!event?.total || event.total <= 0 || typeof event.loaded !== 'number') return null;
  return Math.min(1, Math.max(0, event.loaded / event.total));
}
