import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import {
  IDENTITY_JWT_CONFIG,
  type IdentityJwtConfig,
} from '../config/identity-jwt.config';
import { AuthGuard } from './auth.guard';

interface GuardRequest {
  headers: { authorization?: string };
  user?: unknown;
}
const identityJwtConfig: IdentityJwtConfig = {
  secret: 'test-only-jwt-secret-with-at-least-thirty-two-bytes',
  issuer: 'omnifood-admin-test',
  audience: 'omnifood-pos-test',
  accessTokenTtlSeconds: 60 * 60,
  refreshTokenTtlSeconds: 7 * 24 * 60 * 60,
  clockToleranceSeconds: 5,
  algorithm: 'HS256',
};
const createContext = (request: GuardRequest): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: <T>() => request as T,
    }),
  }) as unknown as ExecutionContext;

describe('AuthGuard strict access-token validation', () => {
  let guard: AuthGuard;
  const jwtService = { verifyAsync: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthGuard,
        { provide: JwtService, useValue: jwtService },
        { provide: IDENTITY_JWT_CONFIG, useValue: identityJwtConfig },
      ],
    }).compile();

    guard = module.get(AuthGuard);
    jwtService.verifyAsync.mockReset();
  });

  it('rejects malformed tokens before they can populate the request', async () => {
    const request: GuardRequest = {
      headers: { authorization: 'Bearer malformed-access-token' },
    };
    jwtService.verifyAsync.mockRejectedValue(new Error('jwt malformed'));

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(request.user).toBeUndefined();
  });

  it('rejects an absent Bearer token without invoking verification', async () => {
    const request: GuardRequest = { headers: {} };

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it.each([
    ['inactive', { is_active: false }],
    ['refresh-token', { token_type: 'refresh' }],
    ['missing security version', { security_version: 0 }],
  ])('rejects an %s access claim set', async (_scenario, overrides) => {
    const request: GuardRequest = {
      headers: { authorization: 'Bearer typed-access-token' },
    };
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      email: 'user@example.test',
      tenant_id: 'tenant-1',
      role: 'manager',
      is_active: true,
      token_type: 'access',
      security_version: 1,
      ...overrides,
    });

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a typed active access token with canonical verification options', async () => {
    const request: GuardRequest = {
      headers: { authorization: 'Bearer typed-access-token' },
    };
    const payload = {
      sub: 'user-1',
      email: 'user@example.test',
      tenant_id: 'tenant-1',
      role: 'manager',
      is_active: true,
      token_type: 'access',
      security_version: 1,
    };
    jwtService.verifyAsync.mockResolvedValue(payload);

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('typed-access-token', {
      secret: identityJwtConfig.secret,
      algorithms: [identityJwtConfig.algorithm],
      issuer: identityJwtConfig.issuer,
      audience: identityJwtConfig.audience,
      clockTolerance: identityJwtConfig.clockToleranceSeconds,
    });
    expect(request.user).toEqual(payload);
  });

  it('rejects a device sync token payload because AuthGuard is strict human access', async () => {
    const request: GuardRequest = {
      headers: { authorization: 'Bearer device-sync-access-token' },
    };
    const deviceSyncPayload = {
      sub: 'credential-uuid-1',
      principal_type: 'device_sync',
      token_type: 'device_sync_access',
      tenant_id: 'tenant-1',
      device_id: 'term-pos-01',
      scopes: ['sync:push', 'sync:pull'],
      credential_version: 1,
      jti: 'jti-uuid',
    };
    jwtService.verifyAsync.mockResolvedValue(deviceSyncPayload);

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(request.user).toBeUndefined();
  });
});
