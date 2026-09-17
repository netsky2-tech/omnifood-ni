import {
  generateDeviceRenewalSecret,
  hashDeviceRenewalSecret,
  compareDeviceRenewalSecret,
} from './device-renewal-secret-verifier';

describe('device renewal secret verifier', () => {
  it('generates high-entropy random secret of at least 64 hex characters (32 bytes)', () => {
    const secret1 = generateDeviceRenewalSecret();
    const secret2 = generateDeviceRenewalSecret();

    expect(typeof secret1).toBe('string');
    expect(secret1.length).toBeGreaterThanOrEqual(64);
    expect(secret1).toMatch(/^[0-9a-f]+$/);
    expect(secret1).not.toBe(secret2);
  });

  it('hashes secret to bcrypt format and correctly verifies matching secret', async () => {
    const secret = generateDeviceRenewalSecret();
    const hash = await hashDeviceRenewalSecret(secret);

    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(hash).not.toBe(secret);

    const isMatch = await compareDeviceRenewalSecret(secret, hash);
    expect(isMatch).toBe(true);
  });

  it('rejects mismatched secret', async () => {
    const secret = generateDeviceRenewalSecret();
    const wrongSecret = generateDeviceRenewalSecret();
    const hash = await hashDeviceRenewalSecret(secret);

    const isMatch = await compareDeviceRenewalSecret(wrongSecret, hash);
    expect(isMatch).toBe(false);
  });
});
