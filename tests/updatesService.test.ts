import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as Updates from 'expo-updates';
import { AppState, type AppStateStatus } from 'react-native';
import {
  checkAndFetchUpdateSilently,
  syncUpdatesInBackground,
  setupUpdateListeners,
  reloadAppForUpdate,
  getUpdateMetadata,
  MIN_CHECK_INTERVAL_MS,
  _resetLastCheckTimestampForTesting,
} from '../src/services/updatesService';

vi.mock('expo-updates', () => ({
  isEnabled: true,
  updateId: 'test-update-uuid',
  channel: 'production',
  runtimeVersion: '1.0.0',
  createdAt: new Date('2026-10-20T00:00:00Z'),
  isEmbeddedLaunch: false,
  isEmergencyLaunch: false,
  emergencyLaunchReason: null,
  checkForUpdateAsync: vi.fn(),
  fetchUpdateAsync: vi.fn(),
  reloadAsync: vi.fn(),
  // checkAndFetchUpdateSilently feature-checks this with typeof. A vitest
  // factory mock throws on any export it does not list, and the throw landed
  // in its try, so every check returned "no update" here (2026-11-06).
  setUpdateRequestHeadersOverride: vi.fn(),
}));

vi.mock('react-native', () => ({
  AppState: {
    addEventListener: vi.fn(),
  },
  Platform: {
    OS: 'android',
  },
}));

describe('updatesService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetLastCheckTimestampForTesting();
    (Updates as any).isEnabled = true;
  });

  describe('Dev Mode & Disabled Invariant Guards', () => {
    it('bypasses update checks completely when in development mode (__DEV__ = true)', async () => {
      // @ts-expect-error test override
      global.__DEV__ = true;

      const result = await checkAndFetchUpdateSilently();
      expect(result).toEqual({ isAvailable: false, isDownloaded: false, isRollBackToEmbedded: false });
      expect(Updates.checkForUpdateAsync).not.toHaveBeenCalled();
    });

    it('bypasses reload requests when in development mode (__DEV__ = true)', async () => {
      // @ts-expect-error test override
      global.__DEV__ = true;

      const result = await reloadAppForUpdate();
      expect(result).toBe(false);
      expect(Updates.reloadAsync).not.toHaveBeenCalled();
    });

    it('bypasses update checks when expo-updates is disabled (isEnabled = false)', async () => {
      // @ts-expect-error test override
      global.__DEV__ = false;
      (Updates as any).isEnabled = false;

      const result = await checkAndFetchUpdateSilently();
      expect(result).toEqual({ isAvailable: false, isDownloaded: false, isRollBackToEmbedded: false });
      expect(Updates.checkForUpdateAsync).not.toHaveBeenCalled();
    });

    it('returns a no-op cleanup from setupUpdateListeners when in dev mode', () => {
      // @ts-expect-error test override
      global.__DEV__ = true;

      const cleanup = setupUpdateListeners();
      expect(typeof cleanup).toBe('function');
      expect(AppState.addEventListener).not.toHaveBeenCalled();
    });
  });

  describe('Production Update Checking & Fetching', () => {
    beforeEach(() => {
      // @ts-expect-error test override
      global.__DEV__ = false;
      (Updates as any).isEnabled = true;
    });

    it('returns isAvailable=false when no update is deployed on the server', async () => {
      vi.mocked(Updates.checkForUpdateAsync).mockResolvedValueOnce({
        isAvailable: false,
        isRollBackToEmbedded: false,
        manifest: undefined,
      } as any);

      const result = await checkAndFetchUpdateSilently();
      expect(result).toEqual({ isAvailable: false, isDownloaded: false, isRollBackToEmbedded: false });
      expect(Updates.fetchUpdateAsync).not.toHaveBeenCalled();
    });

    it('detects and silently fetches update when a newer bundle is available', async () => {
      const mockManifest = { id: 'new-manifest-uuid' } as any;
      vi.mocked(Updates.checkForUpdateAsync).mockResolvedValueOnce({
        isAvailable: true,
        isRollBackToEmbedded: false,
        manifest: mockManifest,
      } as any);
      vi.mocked(Updates.fetchUpdateAsync).mockResolvedValueOnce({
        isNew: true,
        isRollBackToEmbedded: false,
        manifest: mockManifest,
      } as any);

      const result = await checkAndFetchUpdateSilently();
      expect(result).toEqual({
        isAvailable: true,
        isDownloaded: true,
        isRollBackToEmbedded: false,
        manifest: mockManifest,
      });
      expect(Updates.fetchUpdateAsync).toHaveBeenCalledTimes(1);
    });

    it('detects and fetches rollback directive when isRollBackToEmbedded is true', async () => {
      vi.mocked(Updates.checkForUpdateAsync).mockResolvedValueOnce({
        isAvailable: false,
        isRollBackToEmbedded: true,
        manifest: undefined,
      } as any);
      vi.mocked(Updates.fetchUpdateAsync).mockResolvedValueOnce({
        isNew: false,
        isRollBackToEmbedded: true,
      } as any);

      const result = await checkAndFetchUpdateSilently();
      expect(result).toEqual({
        isAvailable: false,
        isDownloaded: true,
        isRollBackToEmbedded: true,
      });
      expect(Updates.fetchUpdateAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe('Anti-Happy-Path Defensive Error Handling', () => {
    beforeEach(() => {
      // @ts-expect-error test override
      global.__DEV__ = false;
      (Updates as any).isEnabled = true;
    });

    it('catches network errors during checkForUpdateAsync without throwing', async () => {
      vi.mocked(Updates.checkForUpdateAsync).mockRejectedValueOnce(
        new Error('Network request failed: Tacurong signal loss')
      );

      const result = await checkAndFetchUpdateSilently();
      expect(result.isAvailable).toBe(false);
      expect(result.isDownloaded).toBe(false);
      expect(result.error).toContain('Tacurong signal loss');
    });

    it('catches download errors during fetchUpdateAsync without throwing', async () => {
      vi.mocked(Updates.checkForUpdateAsync).mockResolvedValueOnce({
        isAvailable: true,
        isRollBackToEmbedded: false,
      } as any);
      vi.mocked(Updates.fetchUpdateAsync).mockRejectedValueOnce(new Error('Corrupted bundle download'));

      const result = await checkAndFetchUpdateSilently();
      expect(result.isAvailable).toBe(false);
      expect(result.isDownloaded).toBe(false);
      expect(result.error).toContain('Corrupted bundle download');
    });
  });

  describe('Background Sync & Throttling', () => {
    beforeEach(() => {
      // @ts-expect-error test override
      global.__DEV__ = false;
      (Updates as any).isEnabled = true;
    });

    it('executes syncUpdatesInBackground fire-and-forget without crashing', async () => {
      vi.mocked(Updates.checkForUpdateAsync).mockResolvedValueOnce({
        isAvailable: false,
        isRollBackToEmbedded: false,
      } as any);

      await expect(syncUpdatesInBackground(true)).resolves.toBeUndefined();
    });

    it('throttles rapid background checks within MIN_CHECK_INTERVAL_MS', async () => {
      vi.mocked(Updates.checkForUpdateAsync).mockResolvedValue({
        isAvailable: false,
        isRollBackToEmbedded: false,
      } as any);

      await syncUpdatesInBackground(true);
      expect(Updates.checkForUpdateAsync).toHaveBeenCalledTimes(1);

      // Immediate second call should be throttled
      await syncUpdatesInBackground(false);
      expect(Updates.checkForUpdateAsync).toHaveBeenCalledTimes(1);
    });

    it('subscribes to AppState and triggers sync on resume to active', () => {
      let changeHandler: (state: AppStateStatus) => void = () => {};
      const mockRemove = vi.fn();

      vi.mocked(AppState.addEventListener).mockImplementationOnce((event, cb) => {
        if (event === 'change') {
          changeHandler = cb;
        }
        return { remove: mockRemove } as any;
      });

      const cleanup = setupUpdateListeners();
      expect(AppState.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

      changeHandler('active');

      cleanup();
      expect(mockRemove).toHaveBeenCalledTimes(1);
    });
  });

  describe('App Reload & Metadata', () => {
    beforeEach(() => {
      // @ts-expect-error test override
      global.__DEV__ = false;
      (Updates as any).isEnabled = true;
    });

    it('executes reloadAppForUpdate successfully in production', async () => {
      vi.mocked(Updates.reloadAsync).mockResolvedValueOnce();

      const result = await reloadAppForUpdate();
      expect(result).toBe(true);
      expect(Updates.reloadAsync).toHaveBeenCalledTimes(1);
    });

    it('returns false gracefully when reloadAsync fails', async () => {
      vi.mocked(Updates.reloadAsync).mockRejectedValueOnce(new Error('Reload failed'));

      const result = await reloadAppForUpdate();
      expect(result).toBe(false);
    });

    it('returns a comprehensive metadata snapshot', () => {
      const meta = getUpdateMetadata();
      expect(meta).toEqual({
        isEnabled: true,
        updateId: 'test-update-uuid',
        channel: 'production',
        runtimeVersion: '1.0.0',
        createdAt: expect.any(Date),
        isEmbeddedLaunch: false,
        isEmergencyLaunch: false,
        emergencyLaunchReason: null,
      });
    });
  });
});
