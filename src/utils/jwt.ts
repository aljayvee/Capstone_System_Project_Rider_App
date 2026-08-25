/**
 * Minimal JWT inspection for deciding whether a token is worth presenting.
 *
 * Hand-rolled rather than using `atob`: React Native's Hermes engine does not
 * provide `atob` or `btoa`, and this app ships no polyfill for them. Code that
 * called `atob` here did not fail loudly — it threw, got swallowed by the
 * surrounding try/catch, and reported every token as expired, which quietly
 * forced a refresh-token rotation on every single socket connect.
 *
 * Nothing here verifies a signature and nothing here is a security decision.
 * The server re-verifies every token it is given; this only lets the client
 * avoid presenting one it can already see is stale.
 */

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Pure-JS base64 decode. No platform globals, no dependencies. */
function decodeBase64(input: string): string {
  const cleaned = input.replace(/[^A-Za-z0-9+/]/g, '');
  let output = '';

  for (let i = 0; i < cleaned.length; i += 4) {
    const c0 = BASE64_ALPHABET.indexOf(cleaned[i]);
    const c1 = BASE64_ALPHABET.indexOf(cleaned[i + 1]);
    const c2 = BASE64_ALPHABET.indexOf(cleaned[i + 2]);
    const c3 = BASE64_ALPHABET.indexOf(cleaned[i + 3]);

    if (c0 < 0 || c1 < 0) break;

    output += String.fromCharCode((c0 << 2) | (c1 >> 4));
    if (c2 >= 0) output += String.fromCharCode(((c1 & 15) << 4) | (c2 >> 2));
    if (c3 >= 0) output += String.fromCharCode(((c2 & 3) << 6) | c3);
  }

  return output;
}

/** The `exp` claim in seconds, or null if the token cannot be read. */
export function getTokenExpirySeconds(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;

    // base64url -> base64 before decoding.
    const payload = decodeBase64(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(payload);

    return typeof claims?.exp === 'number' ? claims.exp : null;
  } catch {
    return null;
  }
}

/** Seconds of slack, covering clock skew and the request's own flight time. */
const EXPIRY_SKEW_SECONDS = 30;

/**
 * Whether a token has expired, or is close enough that it is not worth using.
 *
 * A token whose expiry cannot be read returns `false`, not `true`. Treating an
 * unreadable token as expired is what caused the refresh-on-every-connect churn
 * described above; the safe default is to let the server be the judge, since it
 * will reject a genuinely bad token and the 401 path handles that correctly.
 */
export function isTokenExpired(token: string): boolean {
  const exp = getTokenExpirySeconds(token);
  if (exp === null) return false;
  return exp - EXPIRY_SKEW_SECONDS <= Math.floor(Date.now() / 1000);
}
