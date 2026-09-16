import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  CLOCK_TOLERANCE_SECONDS,
  JWT_ALGORITHM,
  MINIMUM_SECRET_LENGTH,
} from './identity-jwt.config';

export const DEFAULT_DEVICE_SYNC_ACCESS_TTL_SECONDS = 900;
export const MIN_DEVICE_SYNC_ACCESS_TTL_SECONDS = 60;
export const MAX_DEVICE_SYNC_ACCESS_TTL_SECONDS = 3600;
export const DEFAULT_DEVICE_SYNC_RENEWAL_TTL_SECONDS = 2592000;
export const MIN_DEVICE_SYNC_RENEWAL_TTL_SECONDS = 3600;
export const MAX_DEVICE_SYNC_RENEWAL_TTL_SECONDS = 31536000;
export const DEFAULT_DEVICE_SYNC_AUDIENCE = 'omnifood-device-sync';
export const DEVICE_SYNC_JWT_CONFIG = Symbol('DEVICE_SYNC_JWT_CONFIG');

const PROHIBITED_SECRET_VALUES = [
  'secret',
  'changeme',
  'replaceme',
  'jwtsecret',
  'yoursecretkey',
] as const;

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

export interface DeviceSyncJwtConfig {
  readonly secret: string;
  readonly issuer: string;
  readonly audience: string;
  readonly accessTokenTtlSeconds: number;
  readonly renewalTtlSeconds: number;
  readonly clockToleranceSeconds: number;
  readonly algorithm: typeof JWT_ALGORITHM;
}

export function getDeviceSyncJwtConfig(
  configService: ConfigService,
): DeviceSyncJwtConfig {
  const secret = configService.get<string>('JWT_SECRET') ?? '';
  const issuer = configService.get<string>('JWT_ISSUER')?.trim() ?? '';
  const humanAudience = configService.get<string>('JWT_AUDIENCE')?.trim() ?? '';
  const configuredAudience = configService
    .get<string>('DEVICE_SYNC_JWT_AUDIENCE')
    ?.trim();
  const audience = configuredAudience || DEFAULT_DEVICE_SYNC_AUDIENCE;

  if (humanAudience && audience === humanAudience) {
    throw new Error(
      'Device sync JWT configuration is invalid: audience must not match human audience',
    );
  }

  const configuredTtl = configService.get<string>(
    'DEVICE_SYNC_JWT_ACCESS_TTL_SECONDS',
  );
  let accessTokenTtlSeconds = DEFAULT_DEVICE_SYNC_ACCESS_TTL_SECONDS;
  if (configuredTtl !== undefined) {
    if (!/^\d+$/.test(configuredTtl)) {
      throw new Error(
        'Device sync JWT configuration is invalid: access TTL must be between 60 and 3600 seconds',
      );
    }
    const parsed = Number(configuredTtl);
    if (
      parsed < MIN_DEVICE_SYNC_ACCESS_TTL_SECONDS ||
      parsed > MAX_DEVICE_SYNC_ACCESS_TTL_SECONDS
    ) {
      throw new Error(
        'Device sync JWT configuration is invalid: access TTL must be between 60 and 3600 seconds',
      );
    }
    accessTokenTtlSeconds = parsed;
  }

  const configuredRenewalTtl = configService.get<string>(
    'DEVICE_SYNC_RENEWAL_TTL_SECONDS',
  );
  let renewalTtlSeconds = DEFAULT_DEVICE_SYNC_RENEWAL_TTL_SECONDS;
  if (configuredRenewalTtl !== undefined) {
    if (!/^\d+$/.test(configuredRenewalTtl)) {
      throw new Error(
        'Device sync JWT configuration is invalid: renewal TTL must be between 3600 and 31536000 seconds',
      );
    }
    const parsed = Number(configuredRenewalTtl);
    if (
      parsed < MIN_DEVICE_SYNC_RENEWAL_TTL_SECONDS ||
      parsed > MAX_DEVICE_SYNC_RENEWAL_TTL_SECONDS
    ) {
      throw new Error(
        'Device sync JWT configuration is invalid: renewal TTL must be between 3600 and 31536000 seconds',
      );
    }
    renewalTtlSeconds = parsed;
  }

  if (
    Buffer.byteLength(secret, 'utf8') < MINIMUM_SECRET_LENGTH ||
    isUnsafeSecret(secret) ||
    !issuer ||
    !audience
  ) {
    throw new Error('Device sync JWT configuration is invalid');
  }

  return {
    secret,
    issuer,
    audience,
    accessTokenTtlSeconds,
    renewalTtlSeconds,
    clockToleranceSeconds: CLOCK_TOLERANCE_SECONDS,
    algorithm: JWT_ALGORITHM,
  };
}

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DEVICE_SYNC_JWT_CONFIG,
      inject: [ConfigService],
      useFactory: getDeviceSyncJwtConfig,
    },
  ],
  exports: [DEVICE_SYNC_JWT_CONFIG],
})
export class DeviceSyncJwtConfigModule {}
