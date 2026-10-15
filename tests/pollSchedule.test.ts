import { describe, expect, it } from 'vitest';
import { fingerprint, nextPollDelay } from '../src/services/pollSchedule';

const BASE = 30_000;
const MAX = 300_000;

describe('smart polling', () => {
  it('backs off, doubling, while nothing changes', () => {
    expect(nextPollDelay(BASE, 'unchanged', BASE, MAX)).toBe(60_000);
    expect(nextPollDelay(60_000, 'unchanged', BASE, MAX)).toBe(120_000);
  });

  it('never waits longer than the ceiling', () => {
    expect(nextPollDelay(240_000, 'unchanged', BASE, MAX)).toBe(MAX);
    expect(nextPollDelay(MAX, 'unchanged', BASE, MAX)).toBe(MAX);
  });

  it('goes back to the base rate the moment something changes', () => {
    expect(nextPollDelay(MAX, 'changed', BASE, MAX)).toBe(BASE);
  });

  it('does not ask a failing server faster than an idle one', () => {
    expect(nextPollDelay(BASE, 'failed', BASE, MAX)).toBe(60_000);
  });

  it('never asks faster than the base rate', () => {
    expect(nextPollDelay(1_000, 'unchanged', BASE, MAX)).toBe(BASE);
  });
});

describe('telling a changed answer from the same one', () => {
  it('matches equal answers and tells different ones apart', () => {
    expect(fingerprint([{ id: 1, isRead: false }])).toBe(fingerprint([{ id: 1, isRead: false }]));
    expect(fingerprint([{ id: 1, isRead: false }])).not.toBe(fingerprint([{ id: 1, isRead: true }]));
  });
});
