import { ConfigService } from '@nestjs/config';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  getIdentityJwtConfig,
  IDENTITY_JWT_CONFIG,
  IdentityJwtConfig,
  IdentityJwtConfigModule,
  REFRESH_TOKEN_TTL_SECONDS,
} from './identity-jwt.config';

describe('getIdentityJwtConfig', () => {
  const validValues = {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-only-secret-with-at-least-thirty-two-bytes',
    JWT_ISSUER: 'omnifood-admin',
    JWT_AUDIENCE: 'omnifood-pos',
    JWT_ACCESS_TTL_SECONDS: '3600',
    JWT_REFRESH_TTL_SECONDS: '604800',
    JWT_CLOCK_TOLERANCE_SECONDS: '5',
    JWT_ALGORITHM: 'HS256',
  };

  it('returns fixed HS256 issuer, audience, TTL, and tolerance settings', () => {
    const config = new ConfigService(validValues);

    expect(getIdentityJwtConfig(config)).toEqual({
      secret: validValues.JWT_SECRET,
      issuer: validValues.JWT_ISSUER,
      audience: validValues.JWT_AUDIENCE,
      accessTokenTtlSeconds: ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenTtlSeconds: REFRESH_TOKEN_TTL_SECONDS,
      clockToleranceSeconds: 5,
      algorithm: 'HS256',
    });
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(3600);
    expect(REFRESH_TOKEN_TTL_SECONDS).toBe(604800);
  });

  it('instantiates the validated provider at module startup', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true }),
        IdentityJwtConfigModule,
      ],
    })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService(validValues))
      .compile();

    const config = module.get<IdentityJwtConfig>(IDENTITY_JWT_CONFIG);
    expect(config.algorithm).toBe('HS256');
    expect(config.accessTokenTtlSeconds).toBe(3600);

    await module.close();
  });

  it.each([
    'development-only-jwt-secret-at-least-thirty-two-bytes',
    'test-only-jwt-secret-with-at-least-thirty-two-bytes',
  ])(
    'rejects invalid production configuration during module compilation: %s',
    async (JWT_SECRET) => {
      const module = Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ ignoreEnvFile: true }),
          IdentityJwtConfigModule,
        ],
      })
        .overrideProvider(ConfigService)
        .useValue(
          new ConfigService({
            ...validValues,
            NODE_ENV: 'production',
            JWT_SECRET,
          }),
        );

      await expect(module.compile()).rejects.toThrow(
        'JWT configuration is invalid',
      );
    },
  );

  it.each([
    ['short-secret'],
    [' secret-with-at-least-thirty-two-bytes '],
    ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    ['change-mechange-mechange-mechange-me'],
  ])(
    'fails closed for unsafe secrets without using a fallback: %s',
    (JWT_SECRET) => {
      const config = new ConfigService({ ...validValues, JWT_SECRET });

      expect(() => getIdentityJwtConfig(config)).toThrow(
        'JWT configuration is invalid',
      );
    },
  );

  it.each([
    'development-only-jwt-secret-at-least-thirty-two-bytes',
    'test-only-jwt-secret-with-at-least-thirty-two-bytes',
  ])(
    'allows the explicit non-production secret outside production: %s',
    (JWT_SECRET) => {
      const config = new ConfigService({
        ...validValues,
        NODE_ENV: 'development',
        JWT_SECRET,
      });

      expect(getIdentityJwtConfig(config).secret).toBe(JWT_SECRET);
    },
  );

  it.each([
    'development-only-jwt-secret-at-least-thirty-two-bytes',
    'test-only-jwt-secret-with-at-least-thirty-two-bytes',
  ])(
    'rejects published non-production secrets in production without leaking them: %s',
    (JWT_SECRET) => {
      const config = new ConfigService({
        ...validValues,
        NODE_ENV: 'production',
        JWT_SECRET,
      });

      expect(() => getIdentityJwtConfig(config)).toThrow(
        'JWT configuration is invalid',
      );
      expect(() => getIdentityJwtConfig(config)).not.toThrow(JWT_SECRET);
    },
  );

  it('rejects missing issuer/audience and invalid configured security values', () => {
    for (const values of [
      { NODE_ENV: '' },
      { JWT_ISSUER: '' },
      { JWT_AUDIENCE: '' },
      { JWT_ACCESS_TTL_SECONDS: '3599' },
      { JWT_REFRESH_TTL_SECONDS: '604801' },
      { JWT_CLOCK_TOLERANCE_SECONDS: '4' },
      { JWT_CLOCK_TOLERANCE_SECONDS: '-5' },
      { JWT_ALGORITHM: 'HS384' },
    ]) {
      expect(() =>
        getIdentityJwtConfig(new ConfigService({ ...validValues, ...values })),
      ).toThrow('JWT configuration is invalid');
    }
  });
});
