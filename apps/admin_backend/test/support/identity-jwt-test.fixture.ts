import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JwtSignPayload } from '../../src/modules/identity/security/jwt-token.types';

export const IDENTITY_JWT_TEST_CONFIG = {
  secret: 'test-only-jwt-secret-with-at-least-thirty-two-bytes',
  issuer: 'omnifood-admin',
  audience: 'omnifood-pos',
  accessTokenTtlSeconds: 60 * 60,
  refreshTokenTtlSeconds: 7 * 24 * 60 * 60,
  clockToleranceSeconds: 5,
  algorithm: 'HS256',
} as const;

interface IdentityJwtTestConfigService {
  get<T = string>(key: string): T | undefined;
}

export type IdentityJwtAccessTokenOverrides = Partial<JwtSignPayload> &
  Readonly<Record<string, unknown>>;

const configValues: Readonly<Record<string, string>> = {
  NODE_ENV: 'test',
  JWT_SECRET: IDENTITY_JWT_TEST_CONFIG.secret,
  JWT_ISSUER: IDENTITY_JWT_TEST_CONFIG.issuer,
  JWT_AUDIENCE: IDENTITY_JWT_TEST_CONFIG.audience,
  JWT_ACCESS_TTL_SECONDS: String(
    IDENTITY_JWT_TEST_CONFIG.accessTokenTtlSeconds,
  ),
  JWT_REFRESH_TTL_SECONDS: String(
    IDENTITY_JWT_TEST_CONFIG.refreshTokenTtlSeconds,
  ),
  JWT_CLOCK_TOLERANCE_SECONDS: String(
    IDENTITY_JWT_TEST_CONFIG.clockToleranceSeconds,
  ),
  JWT_ALGORITHM: IDENTITY_JWT_TEST_CONFIG.algorithm,
};

export const createIdentityJwtTestConfigProvider = (): {
  provide: typeof ConfigService;
  useValue: IdentityJwtTestConfigService;
} => ({
  provide: ConfigService,
  useValue: {
    get: <T = string>(key: string): T | undefined =>
      configValues[key] as T | undefined,
  },
});

export const signIdentityJwtAccessToken = (
  jwtService: JwtService,
  overrides: IdentityJwtAccessTokenOverrides = {},
): string => {
  const payload: JwtSignPayload & Record<string, unknown> = {
    sub: 'e2e-user',
    email: 'e2e@example.test',
    tenant_id: 'tenant-e2e',
    role: 'manager',
    is_active: true,
    token_type: 'access',
    security_version: 1,
    ...overrides,
  };

  return jwtService.sign(payload, {
    secret: IDENTITY_JWT_TEST_CONFIG.secret,
    algorithm: IDENTITY_JWT_TEST_CONFIG.algorithm,
    issuer: IDENTITY_JWT_TEST_CONFIG.issuer,
    audience: IDENTITY_JWT_TEST_CONFIG.audience,
    expiresIn: IDENTITY_JWT_TEST_CONFIG.accessTokenTtlSeconds,
  });
};
