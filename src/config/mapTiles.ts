import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import Constants from 'expo-constants';
import { API_BASE_URL } from './apiBaseUrl';

/**
 * Our own OpenStreetMap tile server (server/gis/docker-compose.tiles.yml),
 * behind nginx on the API host.
 *
 * Not tile.openstreetmap.org: its tile policy forbids apps from relying on it,
 * and it blocks requests it cannot attribute. Ours is rendered from the same
 * extract the routes are calculated on, which is the point of offering it.
 */
export const OSM_TILE_URL = `${API_BASE_URL.replace(/\/api\/?$/, '')}/tiles/{z}/{x}/{y}.png`;

/** The server renders to 19; the map may zoom one further and scale up. */
export const OSM_MAX_NATIVE_ZOOM = 19;
export const OSM_MAX_ZOOM = 20;

/** Required by the OpenStreetMap licence wherever its map is shown. */
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

/**
 * Where tiles are kept on the phone, so a street already seen loads with no
 * signal and costs no data the second time. The app's own cache directory,
 * which Android clears first under storage pressure. Null when the package
 * name is unknown (Expo Go), which simply disables the cache.
 */
export const OSM_TILE_CACHE_PATH: string | null = (() => {
  const pkg = Constants.expoConfig?.android?.package;
  return pkg ? `/data/user/0/${pkg}/cache/osm-tiles` : null;
})();

/** A week. The data changes only when the extract is rebuilt. */
export const OSM_TILE_CACHE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/** The z12 tile over Tacurong: small, always rendered, proves the server is up. */
const PROBE_URL = OSM_TILE_URL.replace('{z}', '12').replace('{x}', '3466').replace('{y}', '1971');
const PROBE_TIMEOUT_MS = 6000;
const PROBE_TTL_MS = 5 * 60 * 1000;

let lastProbe: { at: number; ok: boolean } | null = null;
let inFlight: Promise<boolean> | null = null;

/** Whether the tile server answers. Cached for five minutes either way. */
export async function probeOsmTiles(now: number = Date.now()): Promise<boolean> {
  if (lastProbe && now - lastProbe.at < PROBE_TTL_MS) return lastProbe.ok;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const response = await fetch(PROBE_URL, { method: 'GET', signal: controller.signal });
      const type = response.headers.get('content-type') ?? '';
      return response.ok && type.startsWith('image/');
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  })();

  const ok = await inFlight;
  inFlight = null;
  lastProbe = { at: Date.now(), ok };
  return ok;
}

/**
 * Whether the OpenStreetMap map can be shown: null until the server has
 * answered once, then true or false.
 *
 * It used to start optimistic (true), and that guess is what let the map
 * open on one base map and switch to the other a moment later. The map is no
 * longer drawn until the base map is settled (see mapChoice.ts), so not
 * knowing yet is said as such.
 */
export function useOsmTilesAvailable(wanted: boolean): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(() => lastProbe?.ok ?? null);

  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const check = () =>
      void probeOsmTiles().then((ok) => {
        if (!cancelled) setAvailable(ok);
      });
    // Asked again as the cached answer expires, so a tile server that goes
    // down mid-shift turns the map to Google. Only while the app is on
    // screen: a backgrounded app draws no map, and probing for it there spent
    // battery and data on an answer nobody was waiting for. Coming back
    // asks at once (cached for five minutes, so usually free).
    const start = () => {
      check();
      if (!timer) timer = setInterval(check, PROBE_TTL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    // 'unknown' at launch on some devices counts as on screen.
    if (AppState.currentState !== 'background') start();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else if (state === 'background') stop();
    });
    return () => {
      cancelled = true;
      stop();
      sub.remove();
    };
  }, [wanted]);

  return available;
}
