import { JwtService } from '@nestjs/jwt';
import {
  compareRefreshTokenVerifier,
  digestRefreshToken,
  hashRefreshTokenVerifier,
} from './refresh-token-verifier';

const jwt = new JwtService();
const signingOptions = {
  secret: 'test-only-jwt-secret-with-at-least-thirty-two-bytes',
  algorithm: 'HS256' as const,
  issuer: 'omnifood-admin-test',
  audience: 'omnifood-pos-test',
};

describe('refresh token verifier', () => {
  it('distinguishes valid refresh JWTs that share their first 72 bytes', async () => {
    const first = await jwt.signAsync(
      { sub: 'user-1', token_type: 'refresh' },
      { ...signingOptions, jwtid: 'refresh-jti-a' },
    );
    const second = await jwt.signAsync(
      { sub: 'user-1', token_type: 'refresh' },
      { ...signingOptions, jwtid: 'refresh-jti-b' },
    );
    const verifier = await hashRefreshTokenVerifier(first);

    expect(first.slice(0, 72)).toBe(second.slice(0, 72));
    expect(digestRefreshToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(digestRefreshToken(first)).not.toBe(digestRefreshToken(second));
    await expect(compareRefreshTokenVerifier(first, verifier)).resolves.toBe(
      true,
    );
    await expect(compareRefreshTokenVerifier(second, verifier)).resolves.toBe(
      false,
    );
  });

  it('uses the existing bcrypt cost over the canonical full-token digest', async () => {
    const verifier = await hashRefreshTokenVerifier('refresh-token-value');

    expect(verifier).toMatch(/^\$2[aby]\$10\$/);
    await expect(
      compareRefreshTokenVerifier('refresh-token-value', verifier),
    ).resolves.toBe(true);
  });
});
