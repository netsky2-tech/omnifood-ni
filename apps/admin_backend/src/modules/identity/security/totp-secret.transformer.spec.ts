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
    const toTransformer = (value: string): string =>
      TotpSecretTransformer.to?.(value) as string;

    expect(() => toTransformer('seed-123')).toThrow(
      /TOTP_SEED_ENCRYPTION_KEY missing or too short/,
    );
  });

  it('encrypts/decrypts with configured key', () => {
    process.env.TOTP_SEED_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
    const toTransformer = (value: string): string =>
      TotpSecretTransformer.to?.(value) as string;
    const fromTransformer = (value: string): string =>
      TotpSecretTransformer.from?.(value) as string;

    const encrypted = toTransformer('seed-abc');
    expect(encrypted.startsWith('enc:v1:')).toBe(true);

    const decrypted = fromTransformer(encrypted);
    expect(decrypted).toBe('seed-abc');
  });
});
