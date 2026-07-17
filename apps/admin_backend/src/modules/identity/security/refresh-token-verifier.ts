import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 10;

export const digestRefreshToken = (refreshToken: string): string =>
  createHash('sha256').update(refreshToken).digest('hex');

export const hashRefreshTokenVerifier = (
  refreshToken: string,
): Promise<string> =>
  bcrypt.hash(digestRefreshToken(refreshToken), BCRYPT_ROUNDS);

export const compareRefreshTokenVerifier = (
  refreshToken: string,
  storedVerifier: string,
): Promise<boolean> =>
  bcrypt.compare(digestRefreshToken(refreshToken), storedVerifier);
