import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { LoginScreen } from '../src/modules/auth/LoginScreen';

const mockNavigate = jest.fn();
const mockSetParams = jest.fn();
let mockParams: Record<string, unknown> | undefined;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, setParams: mockSetParams }),
  useRoute: () => ({ params: mockParams }),
}));

const mockLogin = jest.fn();
jest.mock('../src/context/RiderAuthContext', () => ({
  useRiderAuth: () => ({
    login: mockLogin,
    pendingChallenge: null,
    verifyLoginOtp: jest.fn(),
    verifyLoginSms: jest.fn(),
    sendLoginEmailCode: jest.fn(),
    cancelChallenge: jest.fn(),
  }),
  isChallengeExpired: () => false,
}));

describe('Login screen: forgot password', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = undefined;
  });

  it('opens the reset screen, handing over an email the rider already typed', async () => {
    const screen = await render(<LoginScreen />);
    await fireEvent.changeText(screen.getByTestId('username-input'), 'juan.rider@gmail.com');
    await fireEvent.press(screen.getByTestId('forgot-password-link'));
    expect(mockNavigate).toHaveBeenCalledWith('ForgotPassword', { prefill: 'juan.rider@gmail.com' });
  });

  it('does not hand over a username, which the reset cannot search by', async () => {
    const screen = await render(<LoginScreen />);
    await fireEvent.changeText(screen.getByTestId('username-input'), 'rider_juan');
    await fireEvent.press(screen.getByTestId('forgot-password-link'));
    expect(mockNavigate).toHaveBeenCalledWith('ForgotPassword', { prefill: undefined });
  });

  it('says the password changed and fills in the email after a reset, once', async () => {
    mockParams = { passwordReset: true, email: 'juan.rider@gmail.com' };
    const screen = await render(<LoginScreen />);

    expect(screen.getByTestId('password-reset-notice')).toHaveTextContent(
      'Password changed. Sign in with your new password.'
    );
    expect(screen.getByTestId('username-input').props.value).toBe('juan.rider@gmail.com');
    expect(mockSetParams).toHaveBeenCalledWith({ passwordReset: undefined, email: undefined });
  });

  it('shows no notice on an ordinary visit', async () => {
    const screen = await render(<LoginScreen />);
    expect(screen.queryByTestId('password-reset-notice')).toBeNull();
  });
});
