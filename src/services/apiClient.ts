import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '../config/apiBaseUrl';
import { getDeviceHeaders } from '../utils/deviceInfo';
import { isTokenExpired } from '../utils/jwt';

export const SECURE_KEY_RIDER_TOKEN = 'sugo_rider_jwt_token';
export const STORAGE_KEY_RIDER_TOKEN_FALLBACK = '@sugo_rider_jwt_token';

// Same key RiderAuthContext has always written the refresh token to. It is
// declared here now because this module owns spending and rotating it — the
// context reads and writes through the helpers below rather than touching
// SecureStore directly, so there is one place that knows how a rotation lands.
export const SECURE_KEY_RIDER_REFRESH = 'sugo_rider_refresh_token';
export const STORAGE_KEY_RIDER_REFRESH_FALLBACK = '@sugo_rider_refresh_token';

let riderAccessToken: string | null = null;
let riderRefreshToken: string | null = null;

export const setRiderToken = (token: string | null) => {
  riderAccessToken = token;
};

export const getRiderToken = (): string | null => {
  return riderAccessToken;
};

/** Persist (or clear) the refresh token, SecureStore first. */
export const setRiderRefreshToken = async (token: string | null): Promise<void> => {
  riderRefreshToken = token;

  if (!token) {
    try {
      await SecureStore.deleteItemAsync(SECURE_KEY_RIDER_REFRESH);
    } catch {
      // Nothing stored there.
    }
    await AsyncStorage.removeItem(STORAGE_KEY_RIDER_REFRESH_FALLBACK).catch(() => {});
    return;
  }

  try {
    await SecureStore.setItemAsync(SECURE_KEY_RIDER_REFRESH, token);
    await AsyncStorage.removeItem(STORAGE_KEY_RIDER_REFRESH_FALLBACK).catch(() => {});
  } catch {
    await AsyncStorage.setItem(STORAGE_KEY_RIDER_REFRESH_FALLBACK, token).catch(() => {});
  }
};

export const getRiderRefreshToken = async (): Promise<string | null> => {
  if (riderRefreshToken) return riderRefreshToken;

  try {
    const secure = await SecureStore.getItemAsync(SECURE_KEY_RIDER_REFRESH);
    if (secure) {
      riderRefreshToken = secure;
      return secure;
    }
  } catch {
    // Fall through to the fallback store.
  }

  const fallback = await AsyncStorage.getItem(STORAGE_KEY_RIDER_REFRESH_FALLBACK).catch(() => null);
  if (fallback) riderRefreshToken = fallback;
  return fallback;
};

/**
 * A currently-valid access token for the Socket.IO handshake, refreshed first
 * if what we hold has aged out.
 *
 * The mission socket re-evaluates its `auth` callback on every reconnect, but it
 * read the in-memory token directly — with no expiry check and nothing to renew
 * it. Access tokens live 15 minutes and a shift lasts hours, so reconnects
 * routinely presented an expired token. The server's socket auth is deliberately
 * non-blocking, so rather than failing the handshake it downgraded the rider to
 * an ANONYMOUS socket: still connected, still reporting `connected: true`, but
 * outside every identity room. That is a live-looking connection that silently
 * never delivers, which is the worst version of this failure.
 */
export async function resolveRiderSocketToken(): Promise<string | null> {
  const inMemory = riderAccessToken;
  if (inMemory && !isTokenExpired(inMemory)) return inMemory;

  let stored: string | null = null;
  try {
    stored =
      (await SecureStore.getItemAsync(SECURE_KEY_RIDER_TOKEN)) ||
      (await AsyncStorage.getItem(STORAGE_KEY_RIDER_TOKEN_FALLBACK));
  } catch {
    stored = null;
  }
  if (stored && !isTokenExpired(stored)) {
    riderAccessToken = stored;
    return stored;
  }

  try {
    // Single-flighted in refreshRiderSession, so a socket reconnect racing an
    // HTTP 401 spends the refresh token once between them. Two spends would
    // present an already-rotated token and trip the server's replay detection.
    return await refreshRiderSession();
  } catch {
    return null;
  }
}

/** Fired when the session cannot be recovered; RiderAuthContext signs out. */
let onSessionExpired: (() => void) | null = null;

export const setOnSessionExpired = (cb: (() => void) | null) => {
  onSessionExpired = cb;
};

// Ensure baseURL strictly appends /api if not present
const resolveBaseUrl = (): string => {
  const url = API_BASE_URL.replace(/\/+$/, '');
  return url.endsWith('/api') ? url : `${url}/api`;
};

export const apiClient = axios.create({
  baseURL: resolveBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

apiClient.interceptors.request.use(
  async (config: any) => {
    let token = riderAccessToken;

    // Self-healing fallback: If in-memory token is empty (e.g. initial mount race condition),
    // immediately hydrate from persistent storage so the request is never sent without authorization.
    if (!token) {
      try {
        token =
          (await SecureStore.getItemAsync(SECURE_KEY_RIDER_TOKEN)) ||
          (await AsyncStorage.getItem(STORAGE_KEY_RIDER_TOKEN_FALLBACK));
        if (token) {
          riderAccessToken = token;
        }
      } catch {
        // Fall through
      }
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    try {
      const headers = await getDeviceHeaders();
      Object.assign(config.headers, headers);
    } catch {
      // Non-fatal
    }

    return config;
  },
  (error: any) => Promise.reject(error)
);

/**
 * Silent refresh, shared by the 401 interceptor below and by
 * RiderAuthContext's launch-time restore.
 *
 * The rider app already refreshed once at launch, which is why a session
 * survived a cold start but still died an hour into a shift — nothing renewed
 * the access token while the app was open. That is the gap this closes.
 *
 * It also fixes something rotation made urgent: the old launch refresh read
 * `refreshData.token` and ignored the rotated refresh token in the same
 * response. With rotation on, that meant the device kept presenting a token the
 * server had already retired, which its replay detection correctly reads as a
 * stolen credential and answers by revoking the session. Persisting the
 * rotation is not an optimisation here, it is a correctness requirement.
 *
 * A separate axios instance issues the call so a failing refresh cannot re-enter
 * this interceptor and recurse.
 */
const refreshClient = axios.create({
  baseURL: resolveBaseUrl(),
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

let refreshPromise: Promise<string> | null = null;

async function performRefresh(): Promise<string> {
  const storedRefreshToken = await getRiderRefreshToken();
  if (!storedRefreshToken) {
    throw new Error('NO_REFRESH_TOKEN');
  }

  let deviceHeaders: Record<string, string> = {};
  try {
    deviceHeaders = (await getDeviceHeaders()) as Record<string, string>;
  } catch {
    // Non-fatal; the server only compares device ids when both sides send one.
  }

  const response = await refreshClient.post(
    '/auth/refresh',
    { refreshToken: storedRefreshToken },
    { headers: deviceHeaders }
  );

  const newAccessToken: string | undefined = response.data?.token;
  if (!newAccessToken) {
    throw new Error('REFRESH_RESPONSE_MISSING_TOKEN');
  }

  setRiderToken(newAccessToken);
  try {
    await SecureStore.setItemAsync(SECURE_KEY_RIDER_TOKEN, newAccessToken);
  } catch {
    // Fall through to the fallback store below.
  }
  await AsyncStorage.setItem(STORAGE_KEY_RIDER_TOKEN_FALLBACK, newAccessToken).catch(() => {});

  // Absent when the server's grace window absorbed a concurrent refresh; the
  // stored token is still live, so do not overwrite it.
  if (response.data?.refreshToken) {
    await setRiderRefreshToken(response.data.refreshToken);
  }

  return newAccessToken;
}

/** Single-flight: concurrent 401s share one refresh, so rotation happens once.
 *  Without this, a screen firing several requests would rotate several times
 *  and the losers would look like replays. */
export function refreshRiderSession(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

apiClient.interceptors.response.use(
  (response: any) => response,
  async (error: any) => {
    const original = error.config;
    const status = error.response?.status;
    const isAuthCall = typeof original?.url === 'string' && original.url.includes('/auth/');

    if (status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      try {
        const newToken = await refreshRiderSession();
        original.headers = { ...(original.headers || {}), Authorization: `Bearer ${newToken}` };
        return apiClient(original);
      } catch {
        await setRiderRefreshToken(null);
        setRiderToken(null);
        onSessionExpired?.();
        return Promise.reject(new Error('Your session has expired. Please sign in again.'));
      }
    }

    const message =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      'Network request failed';
    return Promise.reject(new Error(message));
  }
);
