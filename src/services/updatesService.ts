import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

/**
 * Result representation for OTA update checks.
 */
export interface UpdateCheckResult {
  isAvailable: boolean;
  isDownloaded: boolean;
  isRollBackToEmbedded?: boolean;
  manifest?: Updates.Manifest;
  error?: string;
}

/**
 * Metadata snapshot of the current running runtime and update environment.
 */
export interface UpdateMetadata {
  isEnabled: boolean;
  updateId: string | null;
  channel: string | null;
  runtimeVersion: string | null;
  createdAt: Date | null;
  isEmbeddedLaunch: boolean;
  isEmergencyLaunch: boolean;
  emergencyLaunchReason: string | null;
}

// Cooldown interval to throttle background checks between app switches (15 minutes)
export const MIN_CHECK_INTERVAL_MS = 15 * 60 * 1000;
let lastCheckTimestamp = 0;

/**
 * Reset check timestamp (primarily for test suite isolation).
 */
export function _resetLastCheckTimestampForTesting(): void {
  lastCheckTimestamp = 0;
}

/**
 * Extracts the current OTA update environment metadata.
 */
export function getUpdateMetadata(): UpdateMetadata {
  return {
    isEnabled: Boolean(Updates.isEnabled),
    updateId: Updates.updateId ?? null,
    channel: Updates.channel ?? null,
    runtimeVersion: Updates.runtimeVersion ?? null,
    createdAt: Updates.createdAt ?? null,
    isEmbeddedLaunch: Boolean(Updates.isEmbeddedLaunch),
    isEmergencyLaunch: Boolean(Updates.isEmergencyLaunch),
    emergencyLaunchReason: Updates.emergencyLaunchReason ?? null,
  };
}

/**
 * Checks for and downloads OTA updates silently in the background.
 *
 * Invariants:
 * 1. Dev Mode Guard: In development mode (__DEV__) or when updates are disabled,
 *    bypasses all native calls to avoid Metro HMR disruption and invalidated bridge callbacks.
 * 2. Anti-Happy-Path Guard: Network errors, DNS dropouts, rate-limiting, and server timeouts
 *    are swallowed gracefully without throwing or interrupting active rider navigation.
 * 3. Atomic Fetch & Rollback: If an update is detected OR a rollback directive to embedded
 *    is received, downloads the new JS bundle/directive into local cache so it applies
 *    automatically on the next cold start.
 */
export async function checkAndFetchUpdateSilently(): Promise<UpdateCheckResult> {
  if (__DEV__ || !Updates.isEnabled) {
    return { isAvailable: false, isDownloaded: false, isRollBackToEmbedded: false };
  }

  try {
    if (typeof Updates.setUpdateRequestHeadersOverride === 'function') {
      Updates.setUpdateRequestHeadersOverride({
        'expo-channel-name': 'production',
      });
    }

    const update = await Updates.checkForUpdateAsync();

    if (update.isAvailable) {
      const fetchResult = await Updates.fetchUpdateAsync();
      return {
        isAvailable: true,
        isDownloaded: Boolean(fetchResult.isNew),
        isRollBackToEmbedded: false,
        manifest: update.manifest,
      };
    }

    if (update.isRollBackToEmbedded) {
      const fetchResult = await Updates.fetchUpdateAsync();
      return {
        isAvailable: false,
        isDownloaded: Boolean(fetchResult.isRollBackToEmbedded),
        isRollBackToEmbedded: true,
      };
    }

    return { isAvailable: false, isDownloaded: false, isRollBackToEmbedded: false };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Non-blocking: Network timeouts must never disrupt active rider missions
    return {
      isAvailable: false,
      isDownloaded: false,
      isRollBackToEmbedded: false,
      error: message,
    };
  }
}

/**
 * Fire-and-forget background synchronization task for app boot or foreground resume.
 * Guarantees zero unhandled promise rejections.
 *
 * @param force If true, ignores the 15-minute throttle cooldown (used on cold boot mount).
 */
export async function syncUpdatesInBackground(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastCheckTimestamp < MIN_CHECK_INTERVAL_MS) {
    return;
  }
  lastCheckTimestamp = now;

  try {
    await checkAndFetchUpdateSilently();
  } catch (err: unknown) {
    if (__DEV__) {
      console.log('[updatesService] Background update check failed (ignored in dev):', err);
    }
  }
}

/**
 * Sets up an AppState listener to automatically trigger background update checks
 * whenever the app is resumed to the foreground, throttled by MIN_CHECK_INTERVAL_MS.
 * Returns a cleanup unsubscribe function.
 */
export function setupUpdateListeners(): () => void {
  if (__DEV__ || !Updates.isEnabled) {
    return () => {};
  }

  const subscription = AppState.addEventListener('change', (nextAppState) => {
    if (nextAppState === 'active') {
      syncUpdatesInBackground(false).catch(() => {});
    }
  });

  return () => {
    subscription.remove();
  };
}

/**
 * Safely requests a reload of the app with the newly downloaded bundle.
 * Returns true if reload was requested, or false if not supported in the current environment.
 */
export async function reloadAppForUpdate(): Promise<boolean> {
  if (__DEV__ || !Updates.isEnabled) {
    return false;
  }

  try {
    await Updates.reloadAsync();
    return true;
  } catch (err: unknown) {
    if (__DEV__) {
      console.warn('[updatesService] Failed to reload app for update:', err);
    }
    return false;
  }
}
