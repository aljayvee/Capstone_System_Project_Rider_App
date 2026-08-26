import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { StatusBanner } from '../src/components/StatusBanner';
import type { RiderBanner } from '../src/types/rider';

/**
 * The replacement for the five Alert.alert dialogs that fired on success.
 *
 * The risk in removing a modal is that the feedback becomes visual only: a modal
 * takes focus and announces itself, and a plain View does neither. These tests
 * hold the line on the part that is easy to lose.
 */

const banner = (over: Partial<RiderBanner> = {}): RiderBanner => ({
  id: 1,
  tone: 'success',
  text: 'Delivered. ₱117.00 recorded.',
  ...over,
});

describe('the status banner', () => {
  it('shows nothing at all when there is no message', async () => {
    const view = await render(<StatusBanner banner={null} onDismiss={() => {}} />);
    expect(view.queryByTestId('status-banner')).toBeNull();
  });

  it('shows the message it is given', async () => {
    const view = await render(<StatusBanner banner={banner()} onDismiss={() => {}} />);
    expect(view.getByText('Delivered. ₱117.00 recorded.')).toBeTruthy();
  });

  it('announces itself to a screen reader', async () => {
    // Without this the removal of the modals is a regression for anyone using
    // TalkBack: the dialog used to speak, and a View does not.
    // mockClear, not just spyOn: React Native's preset already mocks
    // AccessibilityInfo with a jest.fn(), so spyOn returns that same mock
    // carrying every call the earlier tests made.
    const spy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    spy.mockClear();
    await render(<StatusBanner banner={banner({ text: 'Accepted. Drive safely.' })} onDismiss={() => {}} />);
    expect(spy).toHaveBeenCalledWith('Accepted. Drive safely.');
    spy.mockRestore();
  });

  it('is a polite live region, so it does not steal focus mid-ride', async () => {
    const view = await render(<StatusBanner banner={banner()} onDismiss={() => {}} />);
    const el = view.getByTestId('status-banner');
    expect(el.props.accessibilityLiveRegion).toBe('polite');
  });

  it('can be dismissed by hand', async () => {
    const onDismiss = jest.fn();
    const view = await render(<StatusBanner banner={banner()} onDismiss={onDismiss} />);
    fireEvent.press(view.getByTestId('status-banner-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('labels its dismiss control', async () => {
    const view = await render(<StatusBanner banner={banner()} onDismiss={() => {}} />);
    expect(view.getByLabelText('Dismiss this message')).toBeTruthy();
  });

  it.each(['success', 'info', 'warning'] as const)('renders the %s tone without throwing', async (tone) => {
    await expect(render(<StatusBanner banner={banner({ tone })} onDismiss={() => {}} />)).resolves.toBeDefined();
  });

  it('announces again when the same text is shown a second time', async () => {
    // Keyed on id rather than text: "Delivered" on two errands in a row is two
    // events, and a rider should hear both.
    // mockClear, not just spyOn: React Native's preset already mocks
    // AccessibilityInfo with a jest.fn(), so spyOn returns that same mock
    // carrying every call the earlier tests made.
    const spy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    spy.mockClear();
    const view = await render(<StatusBanner banner={banner({ id: 1 })} onDismiss={() => {}} />);
    await view.rerender(<StatusBanner banner={banner({ id: 2 })} onDismiss={() => {}} />);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
