import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
export const CLOCK_TOLERANCE_SECONDS = 5;
export const MINIMUM_SECRET_LENGTH = 32;
export const JWT_ALGORITHM = 'HS256' as const;
export const IDENTITY_JWT_CONFIG = Symbol('IDENTITY_JWT_CONFIG');

const IDENTITY_JWT_ENVIRONMENTS = {
  DEVELOPMENT: 'development',
  TEST: 'test',
  PRODUCTION: 'production',
} as const;

const PROHIBITED_SECRET_VALUES = [
  'secret',
  'changeme',
  'replaceme',
  'jwtsecret',
  'yoursecretkey',
] as const;

const PUBLISHED_NON_PRODUCTION_SECRETS = new Set([
  'development-only-jwt-secret-at-least-thirty-two-bytes',
  'test-only-jwt-secret-with-at-least-thirty-two-bytes',
]);

export interface IdentityJwtConfig {
  readonly secret: string;
  readonly issuer: string;
  readonly audience: string;
  readonly accessTokenTtlSeconds: number;
  readonly refreshTokenTtlSeconds: number;
  readonly clockToleranceSeconds: number;
  readonly algorithm: typeof JWT_ALGORITHM;
}

const isUnsafeSecret = (secret: string): boolean => {
  const normalized = secret.toLowerCase().replace(/[-_\s]/g, '');
  return (
    secret !== secret.trim() ||
    new Set(secret).size === 1 ||
    PROHIBITED_SECRET_VALUES.some((value) =>
      new RegExp(`^(?:${value})+$`).test(normalized),
    )
  );
};

const isSupportedEnvironment = (environment: string): boolean =>
  Object.values(IDENTITY_JWT_ENVIRONMENTS).includes(
    environment as (typeof IDENTITY_JWT_ENVIRONMENTS)[keyof typeof IDENTITY_JWT_ENVIRONMENTS],
  );

const isPublishedSecretInProduction = (
  secret: string,
  environment: string,
): boolean =>
  environment === IDENTITY_JWT_ENVIRONMENTS.PRODUCTION &&
  PUBLISHED_NON_PRODUCTION_SECRETS.has(secret);

const parseCanonicalTtl = (
  configService: ConfigService,
  key: 'JWT_ACCESS_TTL_SECONDS' | 'JWT_REFRESH_TTL_SECONDS',
  expected: number,
): number => {
  const value = configService.get<string>(key);
  return value !== undefined &&
    /^\d+$/.test(value) &&
    Number(value) === expected
    ? expected
    : 0;
};

const parseCanonicalClockTolerance = (configService: ConfigService): number => {
  const value = configService.get<string>('JWT_CLOCK_TOLERANCE_SECONDS');
  return value === String(CLOCK_TOLERANCE_SECONDS)
    ? CLOCK_TOLERANCE_SECONDS
    : 0;
};

const parseAlgorithm = (configService: ConfigService): typeof JWT_ALGORITHM =>
  configService.get<string>('JWT_ALGORITHM') === JWT_ALGORITHM
    ? JWT_ALGORITHM
    : ('' as typeof JWT_ALGORITHM);

export function getIdentityJwtConfig(
  configService: ConfigService,
): IdentityJwtConfig {
  const environment = configService.get<string>('NODE_ENV') ?? '';
  const secret = configService.get<string>('JWT_SECRET') ?? '';
  const issuer = configService.get<string>('JWT_ISSUER')?.trim() ?? '';
  const audience = configService.get<string>('JWT_AUDIENCE')?.trim() ?? '';
  const accessTokenTtlSeconds = parseCanonicalTtl(
    configService,
    'JWT_ACCESS_TTL_SECONDS',
    ACCESS_TOKEN_TTL_SECONDS,
  );
  const refreshTokenTtlSeconds = parseCanonicalTtl(
    configService,
    'JWT_REFRESH_TTL_SECONDS',
    REFRESH_TOKEN_TTL_SECONDS,
  );
  const clockToleranceSeconds = parseCanonicalClockTolerance(configService);
  const algorithm = parseAlgorithm(configService);

  if (
    !isSupportedEnvironment(environment) ||
    Buffer.byteLength(secret, 'utf8') < MINIMUM_SECRET_LENGTH ||
    isUnsafeSecret(secret) ||
    isPublishedSecretInProduction(secret, environment) ||
    !issuer ||
    !audience ||
    accessTokenTtlSeconds !== ACCESS_TOKEN_TTL_SECONDS ||
    refreshTokenTtlSeconds !== REFRESH_TOKEN_TTL_SECONDS ||
    clockToleranceSeconds !== CLOCK_TOLERANCE_SECONDS ||
    algorithm !== JWT_ALGORITHM
  ) {
    throw new Error('JWT configuration is invalid');
  }

  return {
    secret,
    issuer,
    audience,
    accessTokenTtlSeconds,
    refreshTokenTtlSeconds,
    clockToleranceSeconds,
    algorithm,
  };
}

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: IDENTITY_JWT_CONFIG,
      inject: [ConfigService],
      useFactory: getIdentityJwtConfig,
    },
  ],
  exports: [IDENTITY_JWT_CONFIG],
})
export class IdentityJwtConfigModule {}
