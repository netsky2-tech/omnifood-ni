import { TotpSecretTransformer } from './totp-secret.transformer';

describe('TotpSecretTransformer', () => {
  const originalKey = process.env.TOTP_SEED_ENCRYPTION_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.TOTP_SEED_ENCRYPTION_KEY;
    } else {
      process.env.TOTP_SEED_ENCRYPTION_KEY = originalKey;
    }
  });

  it('throws when encryption key is missing', () => {
    delete process.env.TOTP_SEED_ENCRYPTION_KEY;
    expect(() => TotpSecretTransformer.to?.('seed-123')).toThrow(
      /TOTP_SEED_ENCRYPTION_KEY missing or too short/,
    );
  });

  it('encrypts/decrypts with configured key', () => {
    process.env.TOTP_SEED_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
    const encrypted = TotpSecretTransformer.to?.('seed-abc') as string;
    expect(encrypted.startsWith('enc:v1:')).toBe(true);

    const decrypted = TotpSecretTransformer.from?.(encrypted);
    expect(decrypted).toBe('seed-abc');
  });
});
