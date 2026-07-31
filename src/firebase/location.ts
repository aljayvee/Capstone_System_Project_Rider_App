import { ref, set } from 'firebase/database';
import { database } from './config';

export async function saveRiderLocation(
  riderId: string | number,
  latitude: number,
  longitude: number,
  heading: number = 0,
  speed: number = 0
) {
  try {
    const riderRef = ref(database, `riders/${riderId}/location`);
    await set(riderRef, {
      latitude,
      longitude,
      heading,
      speed,
      timestamp: Date.now(),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Rider Firebase RTDB] Location update error:', err);
  }
}
