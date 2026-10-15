import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth, initializeAuth, inMemoryPersistence, type Auth } from 'firebase/auth';

declare const process: { env: Record<string, string | undefined> };

const firebaseConfig = {
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL || 'https://capstonedata-3589c-default-rtdb.asia-southeast1.firebasedatabase.app/',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'capstonedata-3589c',
  // Additive. Firebase Authentication does not work without these, and the
  // Realtime Database rules now require an identity before a rider may write
  // their own pin. An unauthenticated write is refused outright.
  //
  // A Firebase web api key is not a secret: it identifies the project rather
  // than authorising anything, which is why it is expected to ship inside the
  // app. What protects the data is the security rules.
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'capstonedata-3589c.firebaseapp.com',
};

/** True when this build can authenticate, not merely connect. */
export const isFirebaseAuthConfigured = Boolean(firebaseConfig.apiKey);

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const database = getDatabase(app);

/**
 * Explicit in-memory persistence rather than a bare `getAuth`.
 *
 * On React Native the default warns about missing AsyncStorage persistence and
 * behaves as in-memory anyway. Stating it removes the warning and makes the
 * lifetime deliberate: this session is meant to die with the process. The app
 * restores its own JWT session on launch and mints a fresh Firebase token from
 * it, so a persisted second credential could only ever outlive the session that
 * justified it.
 *
 * `initializeAuth` throws if the app already has an Auth instance, which is
 * reachable under Fast Refresh, so the fallback returns the existing one.
 */
function createAuth(): Auth {
  try {
    return initializeAuth(app, { persistence: inMemoryPersistence });
  } catch {
    return getAuth(app);
  }
}

export const auth = createAuth();
