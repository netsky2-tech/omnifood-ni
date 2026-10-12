import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { DUMMY_PASSWORD_HASH } from '../services/auth.service';
import { PASSWORD_BCRYPT_COST, needsCostUpgrade } from './password.config';

describe('password hashing cost contract (security-hardening-batch2 S1)', () => {
  it('keeps the dummy digest at the configured cost (timing equalization)', () => {
    expect(bcrypt.getRounds(DUMMY_PASSWORD_HASH)).toBe(PASSWORD_BCRYPT_COST);
  });

  it('flags digests below the configured cost for upgrade', () => {
    const legacy = bcrypt.hashSync('legacy-password', 4);
    expect(needsCostUpgrade(legacy)).toBe(true);
  });

  it('does not flag digests already at the configured cost', () => {
    const current = bcrypt.hashSync('current-password', PASSWORD_BCRYPT_COST);
    expect(needsCostUpgrade(current)).toBe(false);
  });

  it('leaves unparsable digests alone (F2 edge case)', () => {
    expect(needsCostUpgrade('stored-hash')).toBe(false);
    expect(needsCostUpgrade('')).toBe(false);
    expect(needsCostUpgrade('$2b$malformed')).toBe(false);
  });
});
