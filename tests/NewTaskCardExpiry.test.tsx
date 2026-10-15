import React from 'react';
import { render, act } from '@testing-library/react-native';
import { NewTaskCard } from '../src/modules/home/components/NewTaskCard';

/**
 * The offer countdown (2026-10-09).
 *
 * Running out used to call onDecline, which opened the decline modal and sent
 * nothing; on an unattended phone the errand stayed stuck on this rider. It now
 * calls onExpire, and counts from when the server made the offer (assignedAt),
 * not from when the card happened to mount.
 */

jest.mock('../src/components/SlideToConfirm', () => ({ SlideToConfirm: () => null }));

const offer = (assignedAt: string | null) =>
  ({
    id: 'ERR-1',
    status: 'Assigned',
    assignedAt,
    pinpoints: [],
    merchantCategories: [],
    deliveryAddress: 'Tacurong',
    pickupAddress: 'Store',
    deliveryFee: 70,
    totalCost: 300,
  }) as any;

const NOW = new Date('2026-10-09T12:00:00Z').getTime();

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});
afterEach(() => {
  jest.useRealTimers();
});

async function renderCard(assignedAt: string | null) {
  const onExpire = jest.fn();
  const onDecline = jest.fn();
  // v14 renders asynchronously, as the other component suites here await it.
  const view = await render(
    <NewTaskCard errand={offer(assignedAt)} onAccept={jest.fn()} onDecline={onDecline} onExpire={onExpire} />
  );
  return { view, onExpire, onDecline };
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

test('expires on its own when the countdown runs out, without opening the decline modal', async () => {
  const { onExpire, onDecline } = await renderCard(new Date(NOW).toISOString());
  await advance(44_000);
  expect(onExpire).not.toHaveBeenCalled();
  await advance(2_000);
  expect(onExpire).toHaveBeenCalledTimes(1);
  expect(onDecline).not.toHaveBeenCalled();
});

test('counts from when the offer was made, not from when the card appeared', async () => {
  const { view, onExpire } = await renderCard(new Date(NOW - 30_000).toISOString());
  expect(view.getByText('15s')).toBeTruthy();
  await advance(16_000);
  expect(onExpire).toHaveBeenCalledTimes(1);
});

test('expires at once when the app opens on an offer that has already run out', async () => {
  const { onExpire } = await renderCard(new Date(NOW - 50_000).toISOString());
  expect(onExpire).toHaveBeenCalledTimes(1);
});

test('falls back to a full countdown when the server sent no assignedAt', async () => {
  const { view } = await renderCard(null);
  expect(view.getByText('45s')).toBeTruthy();
});
