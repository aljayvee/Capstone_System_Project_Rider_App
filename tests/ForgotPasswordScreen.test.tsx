import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ForgotPasswordScreen } from '../src/modules/auth/ForgotPasswordScreen';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockParams: Record<string, unknown> | undefined;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => ({ params: mockParams }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(effect, [effect]);
  },
}));

const mockFind = jest.fn();
const mockSend = jest.fn();
const mockVerify = jest.fn();
const mockComplete = jest.fn();
// Not requireActual: the real module pulls in the API client and its native
// storage. The guard is one line, so it is restated here.
jest.mock('../src/services/passwordReset', () => ({
  isResetFailure: (result: { ok: boolean }) => result.ok === false,
  riderPasswordReset: {
    findAccount: (...args: unknown[]) => mockFind(...args),
    sendEmailCode: (...args: unknown[]) => mockSend(...args),
    verifyEmailCode: (...args: unknown[]) => mockVerify(...args),
    complete: (...args: unknown[]) => mockComplete(...args),
  },
}));

const JUAN = {
  ok: true,
  resetSessionToken: 'session',
  fullName: 'Juan Dela Cruz',
  maskedEmail: 'ju******@gmail.com',
  maskedPhone: '0*** *** 4567',
  expiresInSeconds: 900,
};

async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

async function reachCodeStep() {
  const screen = await render(<ForgotPasswordScreen />);
  await fireEvent.changeText(screen.getByTestId('forgot-identifier'), 'juan.rider@gmail.com');
  await fireEvent.press(screen.getByTestId('forgot-find'));
  await settle();
  await fireEvent.press(screen.getByTestId('forgot-send'));
  await settle();
  return screen;
}

describe('Forgot password screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = undefined;
    mockFind.mockResolvedValue(JUAN);
    mockSend.mockResolvedValue({
      ok: true,
      channel: 'EMAIL',
      maskedEmail: 'ju******@gmail.com',
      expiresInSeconds: 900,
      resendAfterSeconds: 60,
    });
    mockVerify.mockImplementation(async (_token: string, code: string) =>
      code === '123456'
        ? { ok: true, resetToken: 'reset', expiresInSeconds: 600 }
        : { ok: false, error: 'Incorrect code. Please check the email and try again.', status: 400 }
    );
    mockComplete.mockResolvedValue({ ok: true, message: 'done' });
  });

  it('fills in what the sign-in screen handed over', async () => {
    mockParams = { prefill: '0917 123 4567' };
    const screen = await render(<ForgotPasswordScreen />);
    expect(screen.getByTestId('forgot-identifier').props.value).toBe('0917 123 4567');
  });

  it('checks the input before asking the server', async () => {
    const screen = await render(<ForgotPasswordScreen />);
    await fireEvent.changeText(screen.getByTestId('forgot-identifier'), 'rider_juan');
    await fireEvent.press(screen.getByTestId('forgot-find'));
    await settle();
    expect(mockFind).not.toHaveBeenCalled();
    expect(screen.getByTestId('forgot-error')).toHaveTextContent(
      'Enter the email address or mobile number on your rider account.'
    );
  });

  it("shows the server's answer when no rider account matches, and keeps the draft", async () => {
    mockFind.mockResolvedValueOnce({
      ok: false,
      status: 404,
      error: "We couldn't find a rider account with that email address or mobile number.",
    });
    const screen = await render(<ForgotPasswordScreen />);
    await fireEvent.changeText(screen.getByTestId('forgot-identifier'), 'nobody@gmail.com');
    await fireEvent.press(screen.getByTestId('forgot-find'));
    await settle();
    expect(screen.getByTestId('forgot-error')).toHaveTextContent("We couldn't find a rider account", { exact: false });
    expect(screen.getByTestId('forgot-identifier').props.value).toBe('nobody@gmail.com');
  });

  it('shows the full name and where the code will go', async () => {
    const screen = await render(<ForgotPasswordScreen />);
    await fireEvent.changeText(screen.getByTestId('forgot-identifier'), 'juan.rider@gmail.com');
    await fireEvent.press(screen.getByTestId('forgot-find'));
    await settle();
    expect(mockFind).toHaveBeenCalledWith('juan.rider@gmail.com');
    expect(screen.getByTestId('forgot-name')).toHaveTextContent('Juan Dela Cruz');
    expect(screen.getByText(/ju\*\*\*\*\*\*@gmail\.com/)).toBeTruthy();
  });

  it('explains what to do when the account has no verified email', async () => {
    mockFind.mockResolvedValueOnce({ ...JUAN, maskedEmail: null });
    const screen = await render(<ForgotPasswordScreen />);
    await fireEvent.changeText(screen.getByTestId('forgot-identifier'), '09171234567');
    await fireEvent.press(screen.getByTestId('forgot-find'));
    await settle();
    expect(screen.getByTestId('forgot-no-email')).toHaveTextContent('Ask the owner to reset your password', { exact: false });
    expect(screen.queryByTestId('forgot-send')).toBeNull();
  });

  it('goes back a step, with the search text still there', async () => {
    const screen = await render(<ForgotPasswordScreen />);
    await fireEvent.changeText(screen.getByTestId('forgot-identifier'), 'juan.rider@gmail.com');
    await fireEvent.press(screen.getByTestId('forgot-find'));
    await settle();
    await fireEvent.press(screen.getByTestId('forgot-back'));
    expect(screen.getByTestId('forgot-identifier').props.value).toBe('juan.rider@gmail.com');
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it('clears a wrong code and says so, then accepts the right one', async () => {
    const screen = await reachCodeStep();
    expect(mockSend).toHaveBeenCalledWith('session');

    await fireEvent.changeText(screen.getByTestId('forgot-code'), '111111');
    await settle();
    expect(screen.getByTestId('forgot-error')).toHaveTextContent('Incorrect code', { exact: false });
    expect(screen.getByTestId('forgot-code').props.value).toBe('');

    await fireEvent.changeText(screen.getByTestId('forgot-code'), '123456');
    await settle();
    expect(screen.getByTestId('forgot-new-password')).toBeTruthy();
  });

  it('holds Save until the password meets every rule and both fields match', async () => {
    const screen = await reachCodeStep();
    await fireEvent.changeText(screen.getByTestId('forgot-code'), '123456');
    await settle();

    const save = () => screen.getByTestId('forgot-save');
    await fireEvent.changeText(screen.getByTestId('forgot-new-password'), 'fresh#sta');
    expect(save().props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByTestId('forgot-new-password'), 'Fresh#Start26');
    await fireEvent.changeText(screen.getByTestId('forgot-confirm-password'), 'Fresh#Start2');
    expect(screen.getByText('Passwords do not match')).toBeTruthy();
    expect(save().props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByTestId('forgot-confirm-password'), 'Fresh#Start26');
    expect(save().props.accessibilityState.disabled).toBe(false);
  });

  it('returns to sign-in with the success flag and the email once saved', async () => {
    const screen = await reachCodeStep();
    await fireEvent.changeText(screen.getByTestId('forgot-code'), '123456');
    await settle();
    await fireEvent.changeText(screen.getByTestId('forgot-new-password'), 'Fresh#Start26');
    await fireEvent.changeText(screen.getByTestId('forgot-confirm-password'), 'Fresh#Start26');
    await fireEvent.press(screen.getByTestId('forgot-save'));
    await settle();

    expect(mockComplete).toHaveBeenCalledWith('reset', 'Fresh#Start26');
    expect(mockNavigate).toHaveBeenCalledWith('Login', { passwordReset: true, email: 'juan.rider@gmail.com' });
  });

  it("keeps the passwords and shows the server's refusal", async () => {
    mockComplete.mockResolvedValueOnce({
      ok: false,
      status: 400,
      error: 'Choose a password you have not used on this account before.',
    });
    const screen = await reachCodeStep();
    await fireEvent.changeText(screen.getByTestId('forgot-code'), '123456');
    await settle();
    await fireEvent.changeText(screen.getByTestId('forgot-new-password'), 'Fresh#Start26');
    await fireEvent.changeText(screen.getByTestId('forgot-confirm-password'), 'Fresh#Start26');
    await fireEvent.press(screen.getByTestId('forgot-save'));
    await settle();

    expect(screen.getByTestId('forgot-error')).toHaveTextContent('not used on this account before', { exact: false });
    expect(screen.getByTestId('forgot-new-password').props.value).toBe('Fresh#Start26');
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
