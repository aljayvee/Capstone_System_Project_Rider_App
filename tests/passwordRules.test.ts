import { describe, expect, it } from 'vitest';
import { checkPassword, isSearchableIdentifier, PASSWORD_RULES } from '../src/services/passwordRules';

describe('checkPassword', () => {
  it('accepts a password that meets all five rules', () => {
    const check = checkPassword('Fresh#Start26');
    expect(check.rules.every((rule) => rule.met)).toBe(true);
    expect(check.acceptable).toBe(true);
  });

  it('reports each missing rule on its own', () => {
    const met = (value: string) =>
      Object.fromEntries(checkPassword(value).rules.map((rule) => [rule.id, rule.met]));
    expect(met('fresh#sta')).toEqual({ length: true, upper: false, lower: true, number: false, special: true });
    expect(met('FRESHSTART1')).toEqual({ length: true, upper: true, lower: false, number: true, special: false });
  });

  it('refuses spaces even when every rule is met, as the server does', () => {
    const check = checkPassword('Fresh #Start26');
    expect(check.rules.every((rule) => rule.met)).toBe(true);
    expect(check.hasSpace).toBe(true);
    expect(check.acceptable).toBe(false);
  });

  it('does not count a space as the special character', () => {
    expect(checkPassword('Fresh Start26').rules.find((r) => r.id === 'special')!.met).toBe(false);
  });

  it('lists the rules in the order the screen shows them', () => {
    expect(PASSWORD_RULES.map((rule) => rule.id)).toEqual(['length', 'upper', 'lower', 'number', 'special']);
  });
});

describe('isSearchableIdentifier', () => {
  it('takes an email address or a mobile number in any common format', () => {
    expect(isSearchableIdentifier('juan.rider@gmail.com')).toBe(true);
    expect(isSearchableIdentifier('0917 123 4567')).toBe(true);
    expect(isSearchableIdentifier('+63 917-123-4567')).toBe(true);
  });

  it('turns away a username or a half-typed address before asking the server', () => {
    expect(isSearchableIdentifier('rider_juan')).toBe(false);
    expect(isSearchableIdentifier('juan@gmail')).toBe(false);
    expect(isSearchableIdentifier('0917 123')).toBe(false);
    expect(isSearchableIdentifier('   ')).toBe(false);
  });
});
