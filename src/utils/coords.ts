// Tacurong City Center — used as the fallback map center when no real
// coordinate is available yet.
export const DEFAULT_CENTER: MapCoordinate = { latitude: 6.671, longitude: 124.6644 };

export interface MapCoordinate {
  latitude: number;
  longitude: number;
}

export interface MapRegion extends MapCoordinate {
  latitudeDelta: number;
  longitudeDelta: number;
}

function toFiniteNumber(value: unknown): number | null {
  const n = parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

/** Returns null when either value is missing/non-finite — never a NaN coordinate. */
export function toCoordinate(lat: unknown, lng: unknown): MapCoordinate | null {
  const latitude = toFiniteNumber(lat);
  const longitude = toFiniteNumber(lng);
  if (latitude === null || longitude === null) return null;
  return { latitude, longitude };
}

/** Never returns null — falls back to DEFAULT_CENTER. Accepts a coordinate-shaped object or two raw values. */
export function sanitizeCoordinate(value: unknown): MapCoordinate {
  if (value && typeof value === 'object' && 'latitude' in value && 'longitude' in value) {
    const c = toCoordinate((value as MapCoordinate).latitude, (value as MapCoordinate).longitude);
    if (c) return c;
  }
  return DEFAULT_CENTER;
}

export function toRegion(coordinate: MapCoordinate, delta = 0.015): MapRegion {
  return { ...coordinate, latitudeDelta: delta, longitudeDelta: delta };
}
