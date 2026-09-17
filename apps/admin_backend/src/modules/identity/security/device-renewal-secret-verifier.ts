import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 10;
const MINIMUM_SECRET_ENTROPY_BYTES = 32;

export const generateDeviceRenewalSecret = (): string =>
  randomBytes(MINIMUM_SECRET_ENTROPY_BYTES).toString('hex');

export const digestDeviceRenewalSecret = (secret: string): string =>
  createHash('sha256').update(secret).digest('hex');

export const hashDeviceRenewalSecret = (secret: string): Promise<string> =>
  bcrypt.hash(digestDeviceRenewalSecret(secret), BCRYPT_ROUNDS);

export const compareDeviceRenewalSecret = (
  secret: string,
  storedHash: string,
): Promise<boolean> =>
  bcrypt.compare(digestDeviceRenewalSecret(secret), storedHash);
