import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_DEVICE_SYNC_ACCESS_TTL_SECONDS,
  DEFAULT_DEVICE_SYNC_AUDIENCE,
  getDeviceSyncJwtConfig,
  DeviceSyncJwtConfig,
} from './device-sync-jwt.config';

describe('getDeviceSyncJwtConfig', () => {
  const validValues = {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-only-secret-with-at-least-thirty-two-bytes',
    JWT_ISSUER: 'omnifood-admin',
    JWT_AUDIENCE: 'omnifood-pos',
    DEVICE_SYNC_JWT_AUDIENCE: 'omnifood-pos-device-sync',
    DEVICE_SYNC_JWT_ACCESS_TTL_SECONDS: '900',
    JWT_CLOCK_TOLERANCE_SECONDS: '5',
    JWT_ALGORITHM: 'HS256',
  };

  it('returns valid device sync config with dedicated audience and short TTL', () => {
    const config = new ConfigService(validValues);
    const result: DeviceSyncJwtConfig = getDeviceSyncJwtConfig(config);

    expect(result).toEqual({
      secret: validValues.JWT_SECRET,
      issuer: validValues.JWT_ISSUER,
      audience: validValues.DEVICE_SYNC_JWT_AUDIENCE,
      accessTokenTtlSeconds: 900,
      renewalTtlSeconds: 2592000,
      clockToleranceSeconds: 5,
      algorithm: 'HS256',
    });
  });

  it('accepts valid configured DEVICE_SYNC_RENEWAL_TTL_SECONDS', () => {
    const config = new ConfigService({
      ...validValues,
      DEVICE_SYNC_RENEWAL_TTL_SECONDS: '86400',
    });
    const result = getDeviceSyncJwtConfig(config);

    expect(result.renewalTtlSeconds).toBe(86400);
  });

  it('rejects renewal TTL shorter than minimum (3600 seconds)', () => {
    const config = new ConfigService({
      ...validValues,
      DEVICE_SYNC_RENEWAL_TTL_SECONDS: '1800',
    });

    expect(() => getDeviceSyncJwtConfig(config)).toThrow(
      'Device sync JWT configuration is invalid: renewal TTL must be between 3600 and 31536000 seconds',
    );
  });

  it('rejects renewal TTL longer than maximum (31536000 seconds)', () => {
    const config = new ConfigService({
      ...validValues,
      DEVICE_SYNC_RENEWAL_TTL_SECONDS: '40000000',
    });

    expect(() => getDeviceSyncJwtConfig(config)).toThrow(
      'Device sync JWT configuration is invalid: renewal TTL must be between 3600 and 31536000 seconds',
    );
  });

  it('rejects non-numeric renewal TTL', () => {
    const config = new ConfigService({
      ...validValues,
      DEVICE_SYNC_RENEWAL_TTL_SECONDS: 'thirty-days',
    });

    expect(() => getDeviceSyncJwtConfig(config)).toThrow(
      'Device sync JWT configuration is invalid: renewal TTL must be between 3600 and 31536000 seconds',
    );
  });

  it('falls back to default device audience when DEVICE_SYNC_JWT_AUDIENCE is not set', () => {
    const valuesWithoutAudience = { ...validValues };
    delete (valuesWithoutAudience as Record<string, string>)
      .DEVICE_SYNC_JWT_AUDIENCE;
    const config = new ConfigService(valuesWithoutAudience);
    const result = getDeviceSyncJwtConfig(config);

    expect(result.audience).toBe(DEFAULT_DEVICE_SYNC_AUDIENCE);
  });

  it('falls back to default short TTL (900s) when DEVICE_SYNC_JWT_ACCESS_TTL_SECONDS is not set', () => {
    const valuesWithoutTtl = { ...validValues };
    delete (valuesWithoutTtl as Record<string, string>)
      .DEVICE_SYNC_JWT_ACCESS_TTL_SECONDS;
    const config = new ConfigService(valuesWithoutTtl);
    const result = getDeviceSyncJwtConfig(config);

    expect(result.accessTokenTtlSeconds).toBe(
      DEFAULT_DEVICE_SYNC_ACCESS_TTL_SECONDS,
    );
  });

  it('rejects device audience if it matches human audience (to prevent audience confusion)', () => {
    const config = new ConfigService({
      ...validValues,
      DEVICE_SYNC_JWT_AUDIENCE: validValues.JWT_AUDIENCE,
    });

    expect(() => getDeviceSyncJwtConfig(config)).toThrow(
      'Device sync JWT configuration is invalid: audience must not match human audience',
    );
  });

  it('rejects access TTL longer than maximum short TTL (3600 seconds)', () => {
    const config = new ConfigService({
      ...validValues,
      DEVICE_SYNC_JWT_ACCESS_TTL_SECONDS: '7200',
    });

    expect(() => getDeviceSyncJwtConfig(config)).toThrow(
      'Device sync JWT configuration is invalid: access TTL must be between 60 and 3600 seconds',
    );
  });

  it('rejects access TTL shorter than 60 seconds', () => {
    const config = new ConfigService({
      ...validValues,
      DEVICE_SYNC_JWT_ACCESS_TTL_SECONDS: '30',
    });

    expect(() => getDeviceSyncJwtConfig(config)).toThrow(
      'Device sync JWT configuration is invalid: access TTL must be between 60 and 3600 seconds',
    );
  });

  it('rejects missing or unsafe secret', () => {
    const config = new ConfigService({
      ...validValues,
      JWT_SECRET: 'too-short',
    });

    expect(() => getDeviceSyncJwtConfig(config)).toThrow(
      'Device sync JWT configuration is invalid',
    );
  });

  it('rejects missing issuer', () => {
    const config = new ConfigService({
      ...validValues,
      JWT_ISSUER: '',
    });

    expect(() => getDeviceSyncJwtConfig(config)).toThrow(
      'Device sync JWT configuration is invalid',
    );
  });
});
