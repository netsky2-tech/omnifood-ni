import { JwtService } from '@nestjs/jwt';
import { IDENTITY_JWT_CONFIG } from '../../src/modules/identity/config/identity-jwt.config';
import {
  IDENTITY_JWT_TEST_CONFIG,
  createIdentityJwtConfigProvider,
  createIdentityJwtTestConfigProvider,
  signIdentityJwtAccessToken,
} from './identity-jwt-test.fixture';

describe('identity JWT test fixture', () => {
  it('provides the complete canonical configuration expected by identity JWT consumers', () => {
    const provider = createIdentityJwtTestConfigProvider();

    expect(provider.useValue.get('JWT_SECRET')).toBe(
      IDENTITY_JWT_TEST_CONFIG.secret,
    );
    expect(provider.useValue.get('JWT_ISSUER')).toBe(
      IDENTITY_JWT_TEST_CONFIG.issuer,
    );
    expect(createIdentityJwtConfigProvider()).toEqual({
      provide: IDENTITY_JWT_CONFIG,
      useValue: IDENTITY_JWT_TEST_CONFIG,
    });
    expect(provider.useValue.get('JWT_AUDIENCE')).toBe(
      IDENTITY_JWT_TEST_CONFIG.audience,
    );
  });

  it('signs a typed canonical access token with caller overrides', () => {
    const jwtService = new JwtService();
    const token = signIdentityJwtAccessToken(jwtService, {
      role: 'manager',
      tenant_id: 'tenant-fixture',
    });

    expect(
      jwtService.verify(token, {
        secret: IDENTITY_JWT_TEST_CONFIG.secret,
        issuer: IDENTITY_JWT_TEST_CONFIG.issuer,
        audience: IDENTITY_JWT_TEST_CONFIG.audience,
        algorithms: [IDENTITY_JWT_TEST_CONFIG.algorithm],
      }),
    ).toMatchObject({
      sub: 'e2e-user',
      email: 'e2e@example.test',
      tenant_id: 'tenant-fixture',
      role: 'manager',
      is_active: true,
      token_type: 'access',
      security_version: 1,
    });
  });
});
