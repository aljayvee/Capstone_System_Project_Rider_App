import * as SecureStore from 'expo-secure-store';

/**
 * The server-issued token that says this phone passed the second sign-in
 * check recently (30 days). Sent with every POST /riders/login; while the
 * server accepts it, a correct password is enough.
 *
 * Deliberately NOT cleared on logout. Signing out ends the session, not the
 * phone's standing: a rider who signs out at the end of a shift should not be
 * asked for an SMS code again the next morning. The server decides when the
 * token stops counting (expiry, a password change, a revoked device).
 *
 * SecureStore only, with no AsyncStorage fallback: if the keystore cannot
 * hold it, the rider is simply asked for a code again, which is the safe way
 * to fail.
 */
export const SECURE_KEY_MFA_TRUST = 'sugo_rider_mfa_trust';

export async function getMfaTrustToken(): Promise<string | null> {
  try {
    return (await SecureStore.getItemAsync(SECURE_KEY_MFA_TRUST)) || null;
  } catch {
    return null;
  }
}

export async function setMfaTrustToken(token: string | null | undefined): Promise<void> {
  try {
    if (token) {
      await SecureStore.setItemAsync(SECURE_KEY_MFA_TRUST, token);
    } else {
      await SecureStore.deleteItemAsync(SECURE_KEY_MFA_TRUST);
    }
  } catch {
    // Non-fatal: the next sign-in on this phone asks for a code again.
  }
}
