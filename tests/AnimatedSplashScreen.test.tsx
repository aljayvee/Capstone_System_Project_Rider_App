import React from 'react';
import { render, cleanup, act } from '@testing-library/react-native';
import AnimatedSplashScreen from '../src/components/AnimatedSplashScreen';
import { ThemeProvider } from '../src/context/ThemeContext';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

describe('Rider AnimatedSplashScreen component', () => {
  afterEach(() => {
    cleanup();
    jest.useRealTimers();
  });

  it('renders operational rider branding, wordmark, and tagline', async () => {
    const onComplete = jest.fn();
    const res: any = await render(
      <ThemeProvider>
        <AnimatedSplashScreen isAppReady={false} onAnimationComplete={onComplete} />
      </ThemeProvider>
    );

    expect(res.getByText('SUGO RIDER')).toBeTruthy();
    expect(res.getByText('Fleet Operations & Dispatch')).toBeTruthy();
    expect(res.getByText('Tacurong City Logistics')).toBeTruthy();
  });

  it('completes the animated dismissal workflow when rider session is ready', async () => {
    jest.useFakeTimers();
    const onComplete = jest.fn();
    await render(
      <ThemeProvider>
        <AnimatedSplashScreen isAppReady={true} onAnimationComplete={onComplete} />
      </ThemeProvider>
    );

    // Initial check before perception threshold
    expect(onComplete).not.toHaveBeenCalled();

    // Advance 1400ms min perception threshold
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });

    // Advance 280ms exit animation
    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    expect(onComplete).toHaveBeenCalled();
  });

  it('triggers safety circuit breaker fallback after 3500ms even if network hangs', async () => {
    jest.useFakeTimers();
    const onComplete = jest.fn();
    await render(
      <ThemeProvider>
        <AnimatedSplashScreen isAppReady={false} onAnimationComplete={onComplete} />
      </ThemeProvider>
    );

    expect(onComplete).not.toHaveBeenCalled();

    // Advance past 3500ms safety timeout
    await act(async () => {
      jest.advanceTimersByTime(3600);
    });

    // Advance 280ms exit animation
    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    expect(onComplete).toHaveBeenCalled();
  });
});
