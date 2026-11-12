import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { LoginScreen } from '../src/modules/auth/LoginScreen';
import { RiderAuthProvider, type PendingChallenge } from '../src/context/RiderAuthContext';
import { fetchWithTimeout } from '../src/config/apiConfig';

/**
 * The second sign-in check (MFA): "Confirm it's you".
 *
 * A correct password on a phone with no accepted mfaTrustToken gets a
 * challenge. The rider picks SMS (Firebase Phone Auth on the portal page,
 * opened in an auth session browser) or an emailed code. Both end in the same
 * POST /auth/verify-login-otp and leave a trust token so the phone skips the
 * check for 30 days.
 *
 * Two layers: the screen against a stubbed context (every modal state), then
 * the real RiderAuthProvider against a stubbed network and browser, which is
 * where the request shapes and the trust token are decided.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), setParams: jest.fn() }),
  useRoute: () => ({ params: undefined }),
}));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}));

// What a release APK reports. expo-linking's parse() reads it, and under the
// test renderer it otherwise has no execution environment and throws.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'bare', expoConfig: { scheme: 'sugorider' } },
  ExecutionEnvironment: { Bare: 'bare', Standalone: 'standalone', StoreClient: 'storeClient' },
}));

jest.mock('../src/config/apiConfig', () => ({
  API_BASE_URL: 'https://api.test/api',
  fetchWithTimeout: jest.fn(),
}));

jest.mock('../src/services/apiClient', () => ({
  SECURE_KEY_RIDER_TOKEN: 'sugo_rider_jwt_token',
  STORAGE_KEY_RIDER_TOKEN_FALLBACK: '@sugo_rider_jwt_token',
  setRiderToken: jest.fn(),
  setRiderRefreshToken: jest.fn(() => Promise.resolve()),
  getRiderRefreshToken: jest.fn(() => Promise.resolve(null)),
  refreshRiderSession: jest.fn(() => Promise.resolve(null)),
  setOnSessionExpired: jest.fn(),
}));

jest.mock('../src/firebase/realtimeSession', () => ({
  ensureRealtimeSession: jest.fn(() => Promise.resolve(true)),
  endRealtimeSession: jest.fn(() => Promise.resolve()),
}));

jest.mock('../src/services/riderShift', () => ({
  clearShift: jest.fn(() => Promise.resolve()),
  endShiftAtMidnight: jest.fn(() => Promise.resolve()),
  onShiftEnded: jest.fn(() => () => {}),
  shiftExpired: jest.fn(() => Promise.resolve(false)),
  startShift: jest.fn(() => Promise.resolve()),
}));

// The stubbed context for the screen-only tests. Swapped per test; the real
// provider tests below render RiderAuthProvider instead, which ignores it.
const mockAuth = {
  login: jest.fn(),
  pendingChallenge: null as PendingChallenge | null,
  verifyLoginOtp: jest.fn(),
  verifyLoginSms: jest.fn(),
  sendLoginEmailCode: jest.fn(),
  cancelChallenge: jest.fn(),
};
let mockUseStubbedAuth = true;
jest.mock('../src/context/RiderAuthContext', () => {
  const actual = jest.requireActual('../src/context/RiderAuthContext');
  return {
    ...actual,
    useRiderAuth: () => (mockUseStubbedAuth ? mockAuth : actual.useRiderAuth()),
  };
});

const fetchMock = fetchWithTimeout as jest.Mock;
const openAuthSession = WebBrowser.openAuthSessionAsync as jest.Mock;
const secureGet = SecureStore.getItemAsync as jest.Mock;
const secureSet = SecureStore.setItemAsync as jest.Mock;

const challenge = (overrides: Partial<PendingChallenge> = {}): PendingChallenge => ({
  step: 'OTP',
  challengeToken: 'challenge-1',
  maskedEmail: 'j***@gmail.com',
  factors: ['SMS', 'EMAIL'],
  phoneHint: '1234',
  maskedPhone: '+63 *** *** 1234',
  reason: 'NEW_DEVICE',
  emailCodeSent: false,
  expiresAt: null,
  identifier: 'rider_juan',
  ...overrides,
});

const expiredError = () => Object.assign(new Error('This sign-in timed out.'), { code: 'CHALLENGE_EXPIRED' });

const reply = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const MFA_CHALLENGE = {
  otpRequired: true,
  mfaRequired: true,
  reason: 'NEW_DEVICE',
  factors: ['SMS', 'EMAIL'],
  challengeToken: 'challenge-1',
  maskedEmail: 'j***@gmail.com',
  maskedPhone: '+63 *** *** 1234',
  phoneHint: '1234',
  role: 'RIDER',
  expiresInSeconds: 600,
};

const SIGNED_IN = {
  user: { id: 7, username: 'rider_juan', name: 'Juan Rider', role: 'RIDER', status: 'Active' },
  token: 'access-1',
  refreshToken: 'refresh-1',
  sessionId: 'session-1',
  mfaTrustToken: 'trust-new',
};

const bodyOf = (call: unknown[]) => JSON.parse((call[1] as { body: string }).body);
const headersOf = (call: unknown[]) => (call[1] as { headers: Record<string, string> }).headers;

beforeEach(() => {
  jest.clearAllMocks();
  // clearAllMocks keeps queued mockResolvedValueOnce answers; an unspent one
  // would answer the next test's first request.
  fetchMock.mockReset();
  openAuthSession.mockReset();
  Object.values(mockAuth).forEach((fn) => {
    if (jest.isMockFunction(fn)) fn.mockReset();
  });
  mockUseStubbedAuth = true;
  mockAuth.pendingChallenge = null;
  secureGet.mockImplementation(() => Promise.resolve(null));
});

describe('Confirm it\'s you: the method picker', () => {
  it('offers SMS to the number ending in the hint and email to the masked address', async () => {
    mockAuth.pendingChallenge = challenge();
    const screen = await render(<LoginScreen />);

    expect(screen.getByText("Confirm it's you")).toBeTruthy();
    expect(screen.getByText(/has not signed in to your account in the last 30 days/)).toBeTruthy();
    expect(screen.getByTestId('mfa-option-sms')).toHaveTextContent(/To the number ending 1234/);
    expect(screen.getByTestId('mfa-option-email')).toHaveTextContent(/To j\*\*\*@gmail\.com/);
    // No code box until a code has actually been sent.
    expect(screen.queryByTestId('mfa-code-input')).toBeNull();
  });

  it('explains a first sign-in differently from a new phone', async () => {
    mockAuth.pendingChallenge = challenge({ reason: 'FIRST_LOGIN' });
    const screen = await render(<LoginScreen />);
    expect(screen.getByText(/first sign-in on your account/)).toBeTruthy();
  });

  it('shows only the methods the server offers', async () => {
    mockAuth.pendingChallenge = challenge({ factors: ['EMAIL'] });
    const screen = await render(<LoginScreen />);
    expect(screen.queryByTestId('mfa-option-sms')).toBeNull();
    expect(screen.getByTestId('mfa-option-email')).toBeTruthy();
  });

  it('falls back to the masked phone when there is no hint', async () => {
    mockAuth.pendingChallenge = challenge({ phoneHint: null });
    const screen = await render(<LoginScreen />);
    expect(screen.getByTestId('mfa-option-sms')).toHaveTextContent(/To \+63 \*\*\* \*\*\* 1234/);
  });

  it('goes straight to code entry when an older server already emailed the code', async () => {
    mockAuth.pendingChallenge = challenge({ factors: ['EMAIL'], emailCodeSent: true, phoneHint: null });
    const screen = await render(<LoginScreen />);
    expect(screen.getByTestId('mfa-code-input')).toBeTruthy();
    expect(screen.queryByTestId('mfa-option-email')).toBeNull();
    expect(screen.queryByTestId('mfa-sms-instead')).toBeNull();
  });
});

describe('Confirm it\'s you: email path', () => {
  it('sends the code from the picker, then verifies what the rider types', async () => {
    mockAuth.pendingChallenge = challenge();
    mockAuth.sendLoginEmailCode.mockResolvedValue(undefined);
    const screen = await render(<LoginScreen />);

    await fireEvent.press(screen.getByTestId('mfa-option-email'));
    expect(mockAuth.sendLoginEmailCode).toHaveBeenCalledTimes(1);

    // The context marks the code as sent; the modal becomes code entry.
    mockAuth.pendingChallenge = challenge({ challengeToken: 'challenge-2', emailCodeSent: true });
    await screen.rerender(<LoginScreen />);

    await fireEvent.changeText(screen.getByTestId('mfa-code-input'), '12a3456');
    expect(screen.getByTestId('mfa-code-input').props.value).toBe('123456');
    await fireEvent.press(screen.getByTestId('mfa-verify'));
    expect(mockAuth.verifyLoginOtp).toHaveBeenCalledWith('123456');
  });

  it('shows a wrong code where it was typed and clears the box', async () => {
    mockAuth.pendingChallenge = challenge({ emailCodeSent: true });
    mockAuth.verifyLoginOtp.mockRejectedValue(new Error('Incorrect verification code.'));
    const screen = await render(<LoginScreen />);

    await fireEvent.changeText(screen.getByTestId('mfa-code-input'), '000000');
    await fireEvent.press(screen.getByTestId('mfa-verify'));

    expect(screen.getByTestId('mfa-error')).toHaveTextContent('Incorrect verification code.');
    expect(screen.getByTestId('mfa-code-input').props.value).toBe('');
  });

  it('asks for all six digits before calling the server', async () => {
    mockAuth.pendingChallenge = challenge({ emailCodeSent: true });
    const screen = await render(<LoginScreen />);
    await fireEvent.changeText(screen.getByTestId('mfa-code-input'), '123');
    await fireEvent.press(screen.getByTestId('mfa-verify'));
    expect(mockAuth.verifyLoginOtp).not.toHaveBeenCalled();
    expect(screen.getByTestId('mfa-error')).toHaveTextContent('Enter the 6-digit code from your email.');
  });

  it('keeps the picker open with the reason when the code cannot be sent', async () => {
    mockAuth.pendingChallenge = challenge();
    mockAuth.sendLoginEmailCode.mockRejectedValue(new Error('Too many requests. Try again in a minute.'));
    const screen = await render(<LoginScreen />);
    await fireEvent.press(screen.getByTestId('mfa-option-email'));
    expect(screen.getByTestId('mfa-error')).toHaveTextContent('Too many requests. Try again in a minute.');
    expect(screen.getByTestId('mfa-option-sms')).toBeTruthy();
  });
});

describe('Confirm it\'s you: SMS path', () => {
  it('shows the check is opening and locks the other choice meanwhile', async () => {
    mockAuth.pendingChallenge = challenge();
    let finish: (value: 'signed-in' | 'cancelled') => void = () => {};
    mockAuth.verifyLoginSms.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const screen = await render(<LoginScreen />);

    // Not awaited: the handler is held open on purpose (see RNTL 14 note).
    void fireEvent.press(screen.getByTestId('mfa-option-sms'));
    await waitFor(() => expect(screen.getByText('Opening SMS check...')).toBeTruthy());
    expect(screen.getByTestId('mfa-option-email').props.accessibilityState).toMatchObject({ disabled: true });

    finish('cancelled');
    await waitFor(() => expect(screen.getByTestId('mfa-sms-notice')).toBeTruthy());
  });

  it('says the SMS check was closed, and lets the rider pick again', async () => {
    mockAuth.pendingChallenge = challenge();
    mockAuth.verifyLoginSms.mockResolvedValue('cancelled');
    const screen = await render(<LoginScreen />);

    await fireEvent.press(screen.getByTestId('mfa-option-sms'));
    expect(screen.getByTestId('mfa-sms-notice')).toHaveTextContent(/closed before it finished/);
    expect(screen.queryByTestId('mfa-error')).toBeNull();
    expect(screen.getByTestId('mfa-option-email').props.accessibilityState).toMatchObject({ disabled: false });
  });

  it('offers SMS from the email code screen too', async () => {
    mockAuth.pendingChallenge = challenge({ emailCodeSent: true });
    mockAuth.verifyLoginSms.mockResolvedValue('signed-in');
    const screen = await render(<LoginScreen />);
    await fireEvent.press(screen.getByTestId('mfa-sms-instead'));
    expect(mockAuth.verifyLoginSms).toHaveBeenCalledTimes(1);
  });

  it('turns an expired sign-in into a single "Start over"', async () => {
    mockAuth.pendingChallenge = challenge();
    mockAuth.verifyLoginSms.mockRejectedValue(expiredError());
    const screen = await render(<LoginScreen />);

    await fireEvent.press(screen.getByTestId('mfa-option-sms'));
    expect(screen.getByText('Sign-in timed out')).toBeTruthy();
    expect(screen.queryByTestId('mfa-option-sms')).toBeNull();
    expect(screen.queryByText('Use a different account')).toBeNull();

    await fireEvent.press(screen.getByTestId('mfa-start-over'));
    expect(mockAuth.cancelChallenge).toHaveBeenCalledTimes(1);
  });
});

describe('RiderAuthProvider: MFA requests', () => {
  const renderWithProvider = async () => {
    mockUseStubbedAuth = false;
    const screen = await render(
      <RiderAuthProvider>
        <LoginScreen />
      </RiderAuthProvider>
    );
    await fireEvent.changeText(screen.getByTestId('username-input'), 'rider_juan');
    await fireEvent.changeText(screen.getByTestId('password-input'), 'secret-pass');
    return screen;
  };

  it('sends the stored trust token and the MFA header with the password', async () => {
    secureGet.mockImplementation((key: string) =>
      Promise.resolve(key === 'sugo_rider_mfa_trust' ? 'trust-old' : null)
    );
    fetchMock.mockResolvedValueOnce(reply(200, SIGNED_IN));
    const screen = await renderWithProvider();

    await fireEvent.press(screen.getByTestId('rider-login-submit'));

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/api/riders/login');
    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({
      username: 'rider_juan',
      password: 'secret-pass',
      mfaTrustToken: 'trust-old',
    });
    expect(headersOf(fetchMock.mock.calls[0])).toMatchObject({ 'x-sugo-mfa': '1' });
    // A trusted phone signs straight in, and a rotated token is kept.
    expect(screen.queryByText("Confirm it's you")).toBeNull();
    expect(secureSet).toHaveBeenCalledWith('sugo_rider_mfa_trust', 'trust-new');
  });

  it('leaves the trust token out when the phone has none', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, MFA_CHALLENGE));
    const screen = await renderWithProvider();
    await fireEvent.press(screen.getByTestId('rider-login-submit'));
    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({ username: 'rider_juan', password: 'secret-pass' });
    expect(screen.getByTestId('mfa-option-sms')).toBeTruthy();
  });

  it('SMS: opens the portal check and signs in with the Firebase token it returns', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, MFA_CHALLENGE)).mockResolvedValueOnce(reply(200, SIGNED_IN));
    openAuthSession.mockResolvedValue({
      type: 'success',
      url: 'sugorider://mfa-verified?token=firebase-id-token&phone=%2B639171231234',
    });
    const screen = await renderWithProvider();
    await fireEvent.press(screen.getByTestId('rider-login-submit'));
    await fireEvent.press(screen.getByTestId('mfa-option-sms'));

    expect(openAuthSession).toHaveBeenCalledWith(
      'https://portal.sugo-express.org/verify-phone?purpose=mfa&hint=1234&redirect=sugorider%3A%2F%2Fmfa-verified',
      'sugorider://mfa-verified'
    );
    const verify = fetchMock.mock.calls[1];
    expect(verify[0]).toBe('https://api.test/api/auth/verify-login-otp');
    expect(bodyOf(verify)).toEqual({ challengeToken: 'challenge-1', firebaseIdToken: 'firebase-id-token' });
    expect(headersOf(verify)).toMatchObject({ 'x-sugo-mfa': '1' });
    expect(secureSet).toHaveBeenCalledWith('sugo_rider_mfa_trust', 'trust-new');
    expect(screen.queryByText("Confirm it's you")).toBeNull();
  });

  it('SMS: a closed browser spends nothing and keeps the challenge', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, MFA_CHALLENGE));
    openAuthSession.mockResolvedValue({ type: 'cancel' });
    const screen = await renderWithProvider();
    await fireEvent.press(screen.getByTestId('rider-login-submit'));
    await fireEvent.press(screen.getByTestId('mfa-option-sms'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('mfa-sms-notice')).toBeTruthy();
    expect(screen.getByTestId('mfa-option-email')).toBeTruthy();
  });

  it('email: asks the server to send the code, then verifies against the new challenge token', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, MFA_CHALLENGE))
      .mockResolvedValueOnce(
        reply(200, { ...MFA_CHALLENGE, challengeToken: 'challenge-2', mfaRequired: true })
      )
      .mockResolvedValueOnce(reply(200, SIGNED_IN));
    const screen = await renderWithProvider();
    await fireEvent.press(screen.getByTestId('rider-login-submit'));
    await fireEvent.press(screen.getByTestId('mfa-option-email'));

    const resend = fetchMock.mock.calls[1];
    expect(resend[0]).toBe('https://api.test/api/auth/resend-login-otp');
    expect(bodyOf(resend)).toEqual({ challengeToken: 'challenge-1' });
    expect(headersOf(resend)).toMatchObject({ 'x-sugo-mfa': '1', 'x-device-platform': expect.any(String) });

    await fireEvent.changeText(screen.getByTestId('mfa-code-input'), '654321');
    await fireEvent.press(screen.getByTestId('mfa-verify'));

    expect(bodyOf(fetchMock.mock.calls[2])).toEqual({ challengeToken: 'challenge-2', code: '654321' });
    expect(secureSet).toHaveBeenCalledWith('sugo_rider_mfa_trust', 'trust-new');
  });

  it('an older server that already emailed the code goes straight to code entry', async () => {
    const { mfaRequired, factors, phoneHint, maskedPhone, ...legacy } = MFA_CHALLENGE;
    fetchMock.mockResolvedValueOnce(reply(200, legacy));
    const screen = await renderWithProvider();
    await fireEvent.press(screen.getByTestId('rider-login-submit'));
    expect(screen.getByTestId('mfa-code-input')).toBeTruthy();
    expect(screen.queryByTestId('mfa-sms-instead')).toBeNull();
  });

  it('a 401 from verify means the sign-in expired: Start over returns to the form', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, MFA_CHALLENGE))
      .mockResolvedValueOnce(reply(200, { ...MFA_CHALLENGE, challengeToken: 'challenge-2' }))
      .mockResolvedValueOnce(reply(401, { error: 'Your sign-in session expired. Please sign in again.' }));
    const screen = await renderWithProvider();
    await fireEvent.press(screen.getByTestId('rider-login-submit'));
    await fireEvent.press(screen.getByTestId('mfa-option-email'));
    await fireEvent.changeText(screen.getByTestId('mfa-code-input'), '111111');
    await fireEvent.press(screen.getByTestId('mfa-verify'));

    expect(screen.getByText('Sign-in timed out')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('mfa-start-over'));
    expect(screen.queryByText('Sign-in timed out')).toBeNull();
    expect(screen.getByTestId('password-input').props.value).toBe('');
    expect(secureSet).not.toHaveBeenCalledWith('sugo_rider_mfa_trust', expect.anything());
  });

  it('a wrong email code (400) stays in the modal', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, MFA_CHALLENGE))
      .mockResolvedValueOnce(reply(200, { ...MFA_CHALLENGE, challengeToken: 'challenge-2' }))
      .mockResolvedValueOnce(reply(400, { error: 'Incorrect verification code.' }));
    const screen = await renderWithProvider();
    await fireEvent.press(screen.getByTestId('rider-login-submit'));
    await fireEvent.press(screen.getByTestId('mfa-option-email'));
    await fireEvent.changeText(screen.getByTestId('mfa-code-input'), '222222');
    await fireEvent.press(screen.getByTestId('mfa-verify'));

    expect(screen.getByTestId('mfa-error')).toHaveTextContent('Incorrect verification code.');
    expect(screen.getByTestId('mfa-code-input')).toBeTruthy();
  });
});
