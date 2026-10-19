/**
 * The reset client against the REAL apiClient and its interceptors, with only
 * the network adapter faked. ForgotPasswordScreen.test.tsx mocks this client
 * away, which is how a release shipped where every answer the server gave
 * ("no rider with that email", "too many lookups") reached the rider as
 * "No connection to the server": apiClient's error interceptor rewraps a
 * refusal without its response, and the client read that as a dead signal.
 *
 * A .tsx only so jest-expo runs it: apiClient pulls in native storage modules
 * that vitest cannot load.
 */
import { AxiosError } from 'axios';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('../src/utils/deviceInfo', () => ({
  getDeviceHeaders: async () => ({ 'x-device-id': 'rider-test-device' }),
}));

import { apiClient } from '../src/services/apiClient';
import { riderPasswordReset } from '../src/services/passwordReset';

type Reply =
  | { status: number; data?: unknown; headers?: Record<string, string> }
  | { network: 'ERR_NETWORK' | 'ECONNABORTED' };

let reply: Reply;
let sent: any;

beforeEach(() => {
  sent = undefined;
  // Behaves like axios's own adapters: settle against the request's
  // validateStatus, and reject with no response when nothing answered.
  apiClient.defaults.adapter = async (config: any) => {
    sent = config;
    if ('network' in reply) {
      throw new AxiosError('Network Error', reply.network, config, {});
    }
    const response = {
      data: reply.data,
      status: reply.status,
      statusText: String(reply.status),
      headers: reply.headers ?? {},
      config,
      request: {},
    };
    if (!config.validateStatus || config.validateStatus(reply.status)) return response;
    throw new AxiosError(`Request failed with status code ${reply.status}`, 'ERR_BAD_REQUEST', config, {}, response as any);
  };
});

describe('rider password reset client', () => {
  it("shows the server's own words when it finds no rider, not 'No connection'", async () => {
    reply = {
      status: 404,
      data: { error: "We couldn't find a rider account with that email address or mobile number." },
    };
    const result = await riderPasswordReset.findAccount('owner@example.com');
    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "We couldn't find a rider account with that email address or mobile number.",
      retryAfterSeconds: undefined,
    });
  });

  it('keeps the status and the wait the server asked for on a 429', async () => {
    reply = {
      status: 429,
      data: { error: 'Please wait before asking for another code.', details: { retryAfterSeconds: 42 } },
      headers: { 'retry-after': '42' },
    };
    const result = await riderPasswordReset.sendEmailCode('session-token');
    expect(result).toMatchObject({ ok: false, status: 429, retryAfterSeconds: 42 });
  });

  it('reads the wait from Retry-After when the body has none', async () => {
    reply = { status: 429, data: { error: 'Too many account lookups from this device.' }, headers: { 'retry-after': '600' } };
    expect(await riderPasswordReset.findAccount('rider@example.com')).toMatchObject({
      status: 429,
      error: 'Too many account lookups from this device.',
      retryAfterSeconds: 600,
    });
  });

  it('falls back to its own message when a refusal carries none', async () => {
    reply = { status: 500, data: '<html>Bad gateway</html>' };
    expect(await riderPasswordReset.findAccount('rider@example.com')).toMatchObject({
      ok: false,
      status: 500,
      error: "We couldn't look up that account. Please try again.",
    });
  });

  it('passes a found account through, and still sends the device id', async () => {
    reply = {
      status: 200,
      data: { resetSessionToken: 't', fullName: 'Juan Dela Cruz', maskedEmail: 'ju***@example.com', maskedPhone: null, expiresInSeconds: 900 },
    };
    const result = await riderPasswordReset.findAccount('juan@example.com');
    expect(result).toMatchObject({ ok: true, fullName: 'Juan Dela Cruz', resetSessionToken: 't' });
    expect(sent.url).toBe('/riders/password-reset/find');
    expect(sent.headers['x-device-id']).toBe('rider-test-device');
  });

  it('says No connection only when nothing answered', async () => {
    reply = { network: 'ERR_NETWORK' };
    expect(await riderPasswordReset.findAccount('rider@example.com')).toEqual({
      ok: false,
      error: 'No connection to the server. Check your signal and try again.',
    });
  });

  it('tells a slow server apart from no signal', async () => {
    reply = { network: 'ECONNABORTED' };
    expect(await riderPasswordReset.findAccount('rider@example.com')).toEqual({
      ok: false,
      error: 'The server is taking too long to answer. Check your signal and try again.',
    });
  });
});
