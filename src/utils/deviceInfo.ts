import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const DEVICE_ID_STORAGE_KEY = '@sugo_rider_device_id';

export interface DeviceInfo {
  deviceId: string;
  osName: string;
  osVersion: string;
  platform: string;
}

let cachedDeviceId: string | null = null;

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) {
    return cachedDeviceId;
  }

  try {
    const existing = await AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing) {
      cachedDeviceId = existing;
      return existing;
    }

    const newId = `DEV-RIDER-${Platform.OS.toUpperCase()}-${generateUUID()}`;
    await AsyncStorage.setItem(DEVICE_ID_STORAGE_KEY, newId);
    cachedDeviceId = newId;
    return newId;
  } catch {
    const fallbackId = `DEV-RIDER-FALLBACK-${generateUUID()}`;
    cachedDeviceId = fallbackId;
    return fallbackId;
  }
}

export async function getDeviceHeaders(): Promise<Record<string, string>> {
  const deviceId = await getDeviceId();
  return {
    'x-device-id': deviceId,
    'x-device-platform': Platform.OS,
    'x-device-os': `${Platform.OS} ${Platform.Version || ''}`.trim(),
  };
}
