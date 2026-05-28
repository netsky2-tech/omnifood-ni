import * as crypto from 'crypto';
import { ValueTransformer } from 'typeorm';

const ENCRYPTION_PREFIX = 'enc:v1:';

const deriveKey = (): Buffer => {
  const passphrase = process.env.TOTP_SEED_ENCRYPTION_KEY;
  if (!passphrase || passphrase.trim().length < 32) {
    throw new Error(
      'TOTP_SEED_ENCRYPTION_KEY missing or too short (min 32 chars). Refusing to process encrypted TOTP secrets.',
    );
  }
  return crypto.createHash('sha256').update(passphrase).digest();
};

const encrypt = (value: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTION_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
};

const decrypt = (value: string): string => {
  if (!value.startsWith(ENCRYPTION_PREFIX)) {
    return value;
  }
  const payload = value.substring(ENCRYPTION_PREFIX.length);
  const [ivB64, tagB64, encryptedB64] = payload.split(':');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    deriveKey(),
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
};

export const TotpSecretTransformer: ValueTransformer = {
  to: (value: string | null): string | null => (value ? encrypt(value) : null),
  from: (value: string | null): string | null =>
    value ? decrypt(value) : null,
};
