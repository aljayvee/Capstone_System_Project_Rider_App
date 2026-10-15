/**
 * The new-password rules for "Forgot password", and the check the first step
 * makes before asking the server anything.
 *
 * Pure on purpose (no React Native imports) so vitest covers it. The server
 * enforces the same five rules plus "no spaces" (staffResetPassword in the API's
 * authValidators); this copy exists only so the rider sees each rule tick over
 * as they type instead of learning them one refusal at a time.
 */

export interface PasswordRule {
  id: 'length' | 'upper' | 'lower' | 'number' | 'special';
  label: string;
  test: (value: string) => boolean;
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: 'length', label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { id: 'upper', label: 'An uppercase letter (A to Z)', test: (v) => /[A-Z]/.test(v) },
  { id: 'lower', label: 'A lowercase letter (a to z)', test: (v) => /[a-z]/.test(v) },
  { id: 'number', label: 'A number (0 to 9)', test: (v) => /\d/.test(v) },
  { id: 'special', label: 'A special character, like ! @ # $', test: (v) => /[^A-Za-z0-9\s]/.test(v) },
];

export interface PasswordCheck {
  rules: Array<PasswordRule & { met: boolean }>;
  hasSpace: boolean;
  /** Every rule met and no spaces: what the server will accept. */
  acceptable: boolean;
}

export function checkPassword(value: string): PasswordCheck {
  const rules = PASSWORD_RULES.map((rule) => ({ ...rule, met: rule.test(value) }));
  const hasSpace = /\s/.test(value);
  return { rules, hasSpace, acceptable: rules.every((rule) => rule.met) && !hasSpace };
}

/**
 * True for something the account lookup can use: an email address, or a
 * mobile number with at least ten digits in any common format.
 */
export function isSearchableIdentifier(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  return trimmed.replace(/\D/g, '').length >= 10;
}
