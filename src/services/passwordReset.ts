import { apiClient } from './apiClient';

/**
 * Client for the rider "Forgot password" endpoints (API:
 * staffPasswordResetService, /riders/password-reset/*). RIDER accounts only;
 * the same lookup on the web portal finds owners and dispatchers instead.
 *
 * Email codes only. The server can also verify a Firebase SMS sign-in, but
 * this app has no native Firebase Auth module to send one, so the screen never
 * offers it.
 *
 * Every call resolves rather than throwing: a refusal comes back as
 * { ok: false } carrying the server's own message, ready to show.
 */

export interface FoundAccount {
  resetSessionToken: string;
  fullName: string;
  maskedEmail: string | null;
  maskedPhone: string | null;
  expiresInSeconds: number;
}

export interface EmailCodeSent {
  channel: 'EMAIL';
  maskedEmail: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

export interface ResetFailure {
  ok: false;
  error: string;
  status?: number;
  retryAfterSeconds?: number;
}

export type ResetResult<T> = ({ ok: true } & T) | ResetFailure;

export function isResetFailure<T>(result: ResetResult<T>): result is ResetFailure {
  return result.ok === false;
}

function toFailure(err: any, fallback: string): ResetFailure {
  const status: number | undefined = err?.response?.status;
  const data = err?.response?.data;
  const retryHeader = err?.response?.headers?.['retry-after'];
  const retryAfterSeconds: number | undefined =
    data?.details?.retryAfterSeconds ?? (retryHeader ? parseInt(retryHeader, 10) || undefined : undefined);
  if (!err?.response) {
    // No answer at all: a dead signal, not a refusal.
    return {
      ok: false,
      error: 'No connection to the server. Check your signal and try again.',
    };
  }
  return { ok: false, error: data?.error || fallback, status, retryAfterSeconds };
}

async function post<T>(path: string, body: unknown, fallback: string): Promise<ResetResult<T>> {
  try {
    const response = await apiClient.post<T>(path, body);
    return { ok: true, ...(response.data as T) };
  } catch (err) {
    return toFailure(err, fallback);
  }
}

export const riderPasswordReset = {
  findAccount(identifier: string) {
    return post<FoundAccount>(
      '/riders/password-reset/find',
      { identifier, website: '' },
      "We couldn't look up that account. Please try again."
    );
  },

  sendEmailCode(resetSessionToken: string) {
    return post<EmailCodeSent>(
      '/riders/password-reset/send-code',
      { resetSessionToken, channel: 'EMAIL' },
      "We couldn't send a code right now. Please try again."
    );
  },

  verifyEmailCode(resetSessionToken: string, code: string) {
    return post<{ resetToken: string; expiresInSeconds: number }>(
      '/riders/password-reset/verify',
      { resetSessionToken, code },
      "We couldn't check that code. Please try again."
    );
  },

  complete(resetToken: string, password: string) {
    return post<{ message: string }>(
      '/riders/password-reset/complete',
      { resetToken, password },
      "We couldn't save your new password. Please try again."
    );
  },
};
