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

const NO_CONNECTION = 'No connection to the server. Check your signal and try again.';
const TOO_SLOW = 'The server is taking too long to answer. Check your signal and try again.';

// A refusal the server answered: its own message, plus the wait it asked for.
function toFailure(response: { status: number; data?: any; headers?: any }, fallback: string): ResetFailure {
  const data = response.data;
  const retryHeader = response.headers?.['retry-after'];
  const retryAfterSeconds: number | undefined =
    data?.details?.retryAfterSeconds ?? (retryHeader ? parseInt(retryHeader, 10) || undefined : undefined);
  return { ok: false, error: data?.error || fallback, status: response.status, retryAfterSeconds };
}

async function post<T>(path: string, body: unknown, fallback: string): Promise<ResetResult<T>> {
  try {
    // Every status resolves here instead of throwing. apiClient's error
    // interceptor rewraps a refusal into a plain Error without its response,
    // so the old `!err.response` check read every answer the server gave
    // ("no rider with that email", "too many lookups") as a dead signal and
    // showed "No connection" (found 2026-10-20). Resolving keeps the status,
    // the server's message and its retry wait, and still sends the device
    // headers the request interceptor adds. These endpoints never answer 401,
    // so skipping the interceptor's refresh-on-401 loses nothing.
    const response = await apiClient.post<T>(path, body, { validateStatus: () => true });
    if (response.status >= 200 && response.status < 300) {
      return { ok: true, ...(response.data as T) };
    }
    return toFailure(response, fallback);
  } catch (err: any) {
    // Only a request that got no answer at all lands here.
    const timedOut = err?.code === 'ECONNABORTED' || err?.code === 'ETIMEDOUT';
    return { ok: false, error: timedOut ? TOO_SLOW : NO_CONNECTION };
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
