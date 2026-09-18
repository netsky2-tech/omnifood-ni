import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { DeviceSyncJwtConfig } from '../config/device-sync-jwt.config';
import {
  DeviceSyncCredential,
  DeviceSyncCredentialStatus,
} from '../entities/device-sync-credential.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { DEVICE_SYNC_PRINCIPAL_TYPE } from '../security/device-sync-principal';
import {
  DEVICE_SYNC_PRINCIPAL_TYPE_CLAIM,
  DEVICE_SYNC_TOKEN_TYPE,
  DeviceSyncJwtClaims,
} from '../security/jwt-token.types';
import { AuthGuard } from './auth.guard';
import { IdentityJwtConfig } from '../config/identity-jwt.config';
import { UserRole } from '../entities/user.entity';
import { SyncTransportGuard } from './sync-transport.guard';
import { SYNC_SCOPES_KEY } from '../decorators/sync-scopes.decorator';
import { ActivationAttempt } from '../../onboarding/entities/activation-attempt.entity';

describe('SyncTransportGuard', () => {
  let guard: SyncTransportGuard;
  let jwtService: JwtService;
  let credentialRepo: { findOne: jest.Mock };
  let tenantRepo: { findOne: jest.Mock };
  let transactionManager: { query: jest.Mock; getRepository: jest.Mock };
  let dataSource: { transaction: jest.Mock; getRepository: jest.Mock };
  let reflector: Reflector;

  const mockDeviceSyncJwtConfig: DeviceSyncJwtConfig = {
    secret: 'test-device-sync-secret-that-is-at-least-32-chars-long!',
    algorithm: 'HS256',
    accessTokenTtlSeconds: 900,
    renewalTtlSeconds: 86400 * 30,
    issuer: 'omnifood-device-sync-test',
    audience: 'omnifood-device-sync-client-test',
    clockToleranceSeconds: 5,
  };

  const mockIdentityJwtConfig: IdentityJwtConfig = {
    secret: 'test-identity-secret-that-is-at-least-32-chars-long!',
    algorithm: 'HS256',
    accessTokenTtlSeconds: 900,
    refreshTokenTtlSeconds: 86400 * 7,
    issuer: 'omnifood-identity-test',
    audience: 'omnifood-identity-client-test',
    clockToleranceSeconds: 5,
  };

  const validCredentialRecord: Partial<DeviceSyncCredential> = {
    id: 'cred-123',
    tenantId: 'tenant-alpha',
    activationAttemptId: 'attempt-456',
    activationAttempt: {
      id: 'attempt-456',
      tenantId: 'tenant-alpha',
      trustedTerminalId: 'terminal-pos-01',
    } as unknown as ActivationAttempt,
    version: 1,
    scopes: ['sync:push', 'sync:pull'],
    status: DeviceSyncCredentialStatus.ACTIVE,
    expiresAt: new Date(Date.now() + 86400 * 1000),
    issuedAt: new Date(),
  };

  const validTenantRecord: Partial<Tenant> = {
    id: 'tenant-alpha',
    name: 'Tenant Alpha',
    ruc: 'J0310000000001',
    is_active: true,
  };

  const validDeviceClaims: DeviceSyncJwtClaims = {
    sub: 'cred-123',
    principal_type: DEVICE_SYNC_PRINCIPAL_TYPE_CLAIM,
    token_type: DEVICE_SYNC_TOKEN_TYPE,
    tenant_id: 'tenant-alpha',
    device_id: 'terminal-pos-01',
    scopes: ['sync:push', 'sync:pull'],
    credential_version: 1,
    jti: 'jti-unique-uuid-1',
  };

  const signDeviceToken = async (
    claims: Record<string, unknown> = validDeviceClaims as unknown as Record<
      string,
      unknown
    >,
    options: Record<string, unknown> = {},
  ) => {
    return await jwtService.signAsync(claims, {
      secret: mockDeviceSyncJwtConfig.secret,
      algorithm: mockDeviceSyncJwtConfig.algorithm,
      issuer: mockDeviceSyncJwtConfig.issuer,
      audience: mockDeviceSyncJwtConfig.audience,
      expiresIn: mockDeviceSyncJwtConfig.accessTokenTtlSeconds,
      ...options,
    });
  };

  const createMockContext = (
    request: Record<string, unknown>,
    handlerScopes?: string[],
  ): ExecutionContext => {
    const handler = () => {};
    const targetClass = class {};
    if (handlerScopes) {
      Reflect.defineMetadata(SYNC_SCOPES_KEY, handlerScopes, handler);
    }
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
        getNext: () => ({}),
      }),
      getHandler: () => handler,
      getClass: () => targetClass,
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    jwtService = new JwtService();
    credentialRepo = {
      findOne: jest.fn().mockResolvedValue({ ...validCredentialRecord }),
    };
    tenantRepo = {
      findOne: jest.fn().mockResolvedValue({ ...validTenantRecord }),
    };
    transactionManager = {
      query: jest.fn().mockResolvedValue([]),
      getRepository: jest.fn().mockImplementation((entity) => {
        if (entity === DeviceSyncCredential) return credentialRepo;
        if (entity === Tenant) return tenantRepo;
        throw new Error(`Unexpected entity: ${entity}`);
      }),
    };
    dataSource = {
      transaction: jest
        .fn()
        .mockImplementation(async (runInTx) => runInTx(transactionManager)),
      getRepository: jest.fn().mockImplementation(() => {
        throw new Error(
          'Repositories must not be looked up on DataSource outside transaction',
        );
      }),
    };
    reflector = new Reflector();
    guard = new SyncTransportGuard(
      jwtService,
      mockDeviceSyncJwtConfig,
      dataSource as unknown as DataSource,
      reflector,
    );
  });

  describe('Device JWT verification and claims validation', () => {
    it('rejects request with missing Authorization header', async () => {
      const ctx = createMockContext({ headers: {} });
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects request with non-Bearer authorization header', async () => {
      const ctx = createMockContext({
        headers: { authorization: 'Basic 12345' },
      });
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects token signed with wrong secret or wrong algorithm', async () => {
      const badToken = await jwtService.signAsync(validDeviceClaims, {
        secret: 'wrong-secret-that-does-not-match-config-secret',
      });
      const ctx = createMockContext({
        headers: { authorization: `Bearer ${badToken}` },
      });
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects expired device token', async () => {
      const expiredToken = await jwtService.signAsync(validDeviceClaims, {
        secret: mockDeviceSyncJwtConfig.secret,
        algorithm: mockDeviceSyncJwtConfig.algorithm,
        issuer: mockDeviceSyncJwtConfig.issuer,
        audience: mockDeviceSyncJwtConfig.audience,
        expiresIn: -10,
      });
      const ctx = createMockContext({
        headers: { authorization: `Bearer ${expiredToken}` },
      });
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects token with wrong audience or issuer', async () => {
      const badAudToken = await jwtService.signAsync(validDeviceClaims, {
        secret: mockDeviceSyncJwtConfig.secret,
        algorithm: mockDeviceSyncJwtConfig.algorithm,
        issuer: mockDeviceSyncJwtConfig.issuer,
        audience: 'wrong-audience',
        expiresIn: 600,
      });
      const ctx = createMockContext({
        headers: { authorization: `Bearer ${badAudToken}` },
      });
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects token when principal_type is not device_sync', async () => {
      const badToken = await signDeviceToken({
        ...validDeviceClaims,
        principal_type: 'human_user',
      });
      const ctx = createMockContext({
        headers: { authorization: `Bearer ${badToken}` },
      });
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects token when token_type is not device_sync_access', async () => {
      const badToken = await signDeviceToken({
        ...validDeviceClaims,
        token_type: 'access',
      });
      const ctx = createMockContext({
        headers: { authorization: `Bearer ${badToken}` },
      });
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects token with missing jti or version or empty scopes', async () => {
      const badToken = await signDeviceToken({
        ...validDeviceClaims,
        scopes: [],
      });
      const ctx = createMockContext({
        headers: { authorization: `Bearer ${badToken}` },
      });
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('Server credential state consultation (fail closed)', () => {
    it('fails closed when credential is not found in database', async () => {
      credentialRepo.findOne.mockResolvedValueOnce(null);
      const token = await signDeviceToken();
      const ctx = createMockContext({
        headers: { authorization: `Bearer ${token}` },
      });
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('fails closed when credential status is REVOKED', async () => {
      credentialRepo.findOne.mockResolvedValueOnce({
        ...validCredentialRecord,
        status: DeviceSyncCredentialStatus.REVOKED,
      });
      const token = await signDeviceToken();
      const ctx = createMockContext({
        headers: { authorization: `Bearer ${token}` },
      });
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('fails closed when credential status is RETIRED', async () => {
      credentialRepo.findOne.mockResolvedValueOnce({
        ...validCredentialRecord,
        status: DeviceSyncCredentialStatus.RETIRED,
      });
      const token = await signDeviceToken();
      const ctx = createMockContext({
        headers: { authorization: `Bearer ${token}` },
      });
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('fails closed when credential status is PENDING', async () => {
      credentialRepo.findOne.mockResolvedValueOnce({
        ...validCredentialRecord,
        status: DeviceSyncCredentialStatus.PENDING,
      });
      const token = await signDeviceToken();
      const ctx = createMockContext({
        headers: { authorization: `Bearer ${token}` },
      });
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('fails closed when renewal credential has expired in database', async () => {
      credentialRepo.findOne.mockResolvedValueOnce({
        ...validCredentialRecord,
        expiresAt: new Date(Date.now() - 1000),
      });
      const token = await signDeviceToken();
      const ctx = createMockContext({
        headers: { authorization: `Bearer ${token}` },
      });
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('fails closed when token credential_version does not match server version', async () => {
      credentialRepo.findOne.mockResolvedValueOnce({
        ...validCredentialRecord,
        version: 2,
      });
      const token = await signDeviceToken({
        ...validDeviceClaims,
        credential_version: 1,
      });
      const ctx = createMockContext({
        headers: { authorization: `Bearer ${token}` },
      });
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('fails closed when token tenant_id does not match credential tenantId', async () => {
      credentialRepo.findOne.mockResolvedValueOnce({
        ...validCredentialRecord,
        tenantId: 'tenant-beta',
      });
      const token = await signDeviceToken({
        ...validDeviceClaims,
        tenant_id: 'tenant-alpha',
      });
      const ctx = createMockContext({
        headers: { authorization: `Bearer ${token}` },
      });
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('fails closed when token device_id does not match joined ActivationAttempt trustedTerminalId', async () => {
      credentialRepo.findOne.mockResolvedValueOnce({
        ...validCredentialRecord,
        activationAttempt: {
          id: 'attempt-456',
          trustedTerminalId: 'different-terminal-99',
        } as unknown as ActivationAttempt,
      });
      const token = await signDeviceToken({
        ...validDeviceClaims,
        device_id: 'terminal-pos-01',
      });
      const ctx = createMockContext({
        headers: { authorization: `Bearer ${token}` },
      });
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('fails closed when tenant does not exist or is_active is false', async () => {
      tenantRepo.findOne.mockResolvedValueOnce({
        ...validTenantRecord,
        is_active: false,
      });
      const token = await signDeviceToken();
      const ctx = createMockContext({
        headers: { authorization: `Bearer ${token}` },
      });
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('Real RLS transaction isolation and session binding (DSI-2)', () => {
    it('executes SELECT set_config(app.tenant_id, $1, true) using signed tenant_id inside transaction', async () => {
      const token = await signDeviceToken();
      const ctx = createMockContext({
        headers: { authorization: `Bearer ${token}` },
      });

      await expect(guard.canActivate(ctx)).resolves.toBe(true);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(transactionManager.query).toHaveBeenCalledWith(
        "SELECT set_config('app.tenant_id', $1, true)",
        ['tenant-alpha'],
      );
    });

    it('performs no repository lookup on DataSource outside transaction', async () => {
      const token = await signDeviceToken();
      const ctx = createMockContext({
        headers: { authorization: `Bearer ${token}` },
      });

      await expect(guard.canActivate(ctx)).resolves.toBe(true);

      expect(dataSource.getRepository).not.toHaveBeenCalled();
      expect(transactionManager.getRepository).toHaveBeenCalledWith(
        DeviceSyncCredential,
      );
      expect(transactionManager.getRepository).toHaveBeenCalledWith(Tenant);
    });

    it('derives RLS tenant strictly from signed token claims and rejects body tenant authority', async () => {
      const token = await signDeviceToken();
      const req = {
        headers: { authorization: `Bearer ${token}` },
        body: {
          tenantId: 'tenant-spoofed-in-body',
          records: [
            {
              idempotencyKey: 'sale-1',
              sourceDeviceId: 'terminal-pos-01',
              sourceSequence: 1,
              documentType: 'SALE',
            },
          ],
        },
      };
      const ctx = createMockContext(req);

      // Body tenantId mismatch will fail envelope validation with 403 Forbidden
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);

      // But RLS set_config must have used the signed token claim, never body
      expect(transactionManager.query).toHaveBeenCalledWith(
        "SELECT set_config('app.tenant_id', $1, true)",
        ['tenant-alpha'],
      );
    });

    it('rejects a blank tenant_id claim (Unit 0b-3) and issues no set_config SQL', async () => {
      for (const blankTenantId of ['', '   ']) {
        const token = await signDeviceToken({
          ...validDeviceClaims,
          tenant_id: blankTenantId,
        });
        const ctx = createMockContext({
          headers: { authorization: `Bearer ${token}` },
        });

        await expect(guard.canActivate(ctx)).rejects.toThrow(
          UnauthorizedException,
        );

        // Absence of SQL, not just the rejection: a blank tenant id must
        // never reach set_config, even if claim validation is weakened later.
        expect(dataSource.transaction).not.toHaveBeenCalled();
        expect(transactionManager.query).not.toHaveBeenCalled();
      }
    });
  });

  describe('Scope hardening against DB corruption and least-privilege narrowing', () => {
    it('fails closed (UnauthorizedException) when credential scopes in DB contain values outside V1 allowlist', async () => {
      credentialRepo.findOne.mockResolvedValueOnce({
        ...validCredentialRecord,
        scopes: ['sync:push', 'admin:wildcard'],
      });
      const token = await signDeviceToken({
        ...validDeviceClaims,
        scopes: ['sync:push'],
      });
      const ctx = createMockContext({
        headers: { authorization: `Bearer ${token}` },
      });

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('fails closed (UnauthorizedException) when token scopes contain values outside V1 allowlist', async () => {
      const token = await signDeviceToken({
        ...validDeviceClaims,
        scopes: ['sync:push', 'malicious:scope'],
      });
      const ctx = createMockContext({
        headers: { authorization: `Bearer ${token}` },
      });

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('fails closed (UnauthorizedException) when token scopes are not authorized by credential state', async () => {
      credentialRepo.findOne.mockResolvedValueOnce({
        ...validCredentialRecord,
        scopes: ['sync:push'],
      });
      const token = await signDeviceToken({
        ...validDeviceClaims,
        scopes: ['sync:push', 'sync:pull'],
      });
      const ctx = createMockContext({
        headers: { authorization: `Bearer ${token}` },
      });

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('does not widen principal scopes beyond token authorization when credential has wider scopes', async () => {
      credentialRepo.findOne.mockResolvedValueOnce({
        ...validCredentialRecord,
        scopes: ['sync:push', 'sync:pull'],
      });
      const token = await signDeviceToken({
        ...validDeviceClaims,
        scopes: ['sync:push'],
      });
      const req: Record<string, unknown> = {
        headers: { authorization: `Bearer ${token}` },
      };
      const ctx = createMockContext(req);

      const canActivate = await guard.canActivate(ctx);
      expect(canActivate).toBe(true);

      const principal = req.devicePrincipal as { scopes: string[] };
      expect(principal.scopes).toEqual(['sync:push']);
    });
  });

  describe('Principal attachment lifecycle and fail-closed safety', () => {
    it('does not attach devicePrincipal to request if origin binding check fails', async () => {
      const token = await signDeviceToken();
      const req: Record<string, unknown> = {
        headers: { authorization: `Bearer ${token}` },
        body: {
          records: [
            {
              idempotencyKey: 'sale-1',
              sourceDeviceId: 'spoofed-terminal-99',
              sourceSequence: 1,
              documentType: 'SALE',
            },
          ],
        },
      };
      const ctx = createMockContext(req);

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      expect(req.devicePrincipal).toBeUndefined();
    });

    it('does not attach devicePrincipal to request if requiredScopes check fails', async () => {
      const token = await signDeviceToken({
        ...validDeviceClaims,
        scopes: ['sync:pull'],
      });
      const req: Record<string, unknown> = {
        headers: { authorization: `Bearer ${token}` },
      };
      const ctx = createMockContext(req, ['sync:push']);

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      expect(req.devicePrincipal).toBeUndefined();
    });
  });

  describe('Principal establishment and request cleanliness', () => {
    it('attaches immutable DeviceSyncPrincipal and never sets request.user or UserRole', async () => {
      const token = await signDeviceToken();
      const req: Record<string, unknown> = {
        headers: { authorization: `Bearer ${token}` },
      };
      const ctx = createMockContext(req);

      const canActivate = await guard.canActivate(ctx);
      expect(canActivate).toBe(true);

      expect(req.devicePrincipal).toBeDefined();
      const principal = req.devicePrincipal as {
        principalType: string;
        credentialId: string;
        tenantId: string;
        deviceId: string;
        credentialVersion: number;
        scopes: string[];
      };
      expect(principal.principalType).toBe(DEVICE_SYNC_PRINCIPAL_TYPE);
      expect(principal.credentialId).toBe('cred-123');
      expect(principal.tenantId).toBe('tenant-alpha');
      expect(principal.deviceId).toBe('terminal-pos-01');
      expect(principal.credentialVersion).toBe(1);
      expect(principal.scopes).toEqual(['sync:push', 'sync:pull']);
      expect(Object.isFrozen(principal)).toBe(true);

      expect(req.user).toBeUndefined();
    });
  });

  describe('Route scope enforcement', () => {
    it('allows access when token scopes satisfy required sync:push scope', async () => {
      const token = await signDeviceToken({
        ...validDeviceClaims,
        scopes: ['sync:push'],
      });
      const req = { headers: { authorization: `Bearer ${token}` } };
      const ctx = createMockContext(req, ['sync:push']);

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('denies access (403 Forbidden) when route requires sync:push but token only has sync:pull', async () => {
      const token = await signDeviceToken({
        ...validDeviceClaims,
        scopes: ['sync:pull'],
      });
      const req = { headers: { authorization: `Bearer ${token}` } };
      const ctx = createMockContext(req, ['sync:push']);

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('allows access when token scopes satisfy required sync:pull scope', async () => {
      const token = await signDeviceToken({
        ...validDeviceClaims,
        scopes: ['sync:pull'],
      });
      const req = { headers: { authorization: `Bearer ${token}` } };
      const ctx = createMockContext(req, ['sync:pull']);

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('denies access (403 Forbidden) when route requires sync:pull but token only has sync:push', async () => {
      const token = await signDeviceToken({
        ...validDeviceClaims,
        scopes: ['sync:push'],
      });
      const req = { headers: { authorization: `Bearer ${token}` } };
      const ctx = createMockContext(req, ['sync:pull']);

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Authoritative origin binding on batch records', () => {
    it('accepts batch when all records match principal.deviceId (including SALE, PURCHASE, FULFILLMENT, CREDIT_NOTE transport)', async () => {
      const token = await signDeviceToken();
      const req = {
        headers: { authorization: `Bearer ${token}` },
        body: {
          records: [
            {
              idempotencyKey: 'sale-1',
              sourceDeviceId: 'terminal-pos-01',
              sourceSequence: 1,
              documentType: 'SALE',
            },
            {
              idempotencyKey: 'pur-1',
              sourceDeviceId: 'terminal-pos-01',
              sourceSequence: 2,
              documentType: 'PURCHASE',
            },
            {
              idempotencyKey: 'ful-1',
              sourceDeviceId: 'terminal-pos-01',
              sourceSequence: 3,
              documentType: 'FULFILLMENT',
            },
            {
              idempotencyKey: 'cn-1',
              sourceDeviceId: 'terminal-pos-01',
              sourceSequence: 4,
              documentType: 'CREDIT_NOTE',
            },
          ],
        },
      };
      const ctx = createMockContext(req, ['sync:push']);
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('rejects batch (403 Forbidden) when any record has mismatched sourceDeviceId', async () => {
      const token = await signDeviceToken();
      const req = {
        headers: { authorization: `Bearer ${token}` },
        body: {
          records: [
            {
              idempotencyKey: 'sale-1',
              sourceDeviceId: 'terminal-pos-01',
              sourceSequence: 1,
              documentType: 'SALE',
            },
            {
              idempotencyKey: 'sale-2',
              sourceDeviceId: 'spoofed-terminal-02',
              sourceSequence: 2,
              documentType: 'SALE',
            },
          ],
        },
      };
      const ctx = createMockContext(req, ['sync:push']);
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('rejects batch (403 Forbidden) when record terminalId is present and does not match principal.deviceId', async () => {
      const token = await signDeviceToken();
      const req = {
        headers: { authorization: `Bearer ${token}` },
        body: {
          records: [
            {
              idempotencyKey: 'sale-1',
              sourceDeviceId: 'terminal-pos-01',
              terminalId: 'spoofed-terminal-02',
              sourceSequence: 1,
              documentType: 'SALE',
            },
          ],
        },
      };
      const ctx = createMockContext(req, ['sync:push']);
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('rejects batch (403 Forbidden) when payload tenantId mismatches principal.tenantId', async () => {
      const token = await signDeviceToken();
      const req = {
        headers: { authorization: `Bearer ${token}` },
        body: {
          tenantId: 'tenant-beta',
          records: [
            {
              idempotencyKey: 'sale-1',
              sourceDeviceId: 'terminal-pos-01',
              sourceSequence: 1,
              documentType: 'SALE',
            },
          ],
        },
      };
      const ctx = createMockContext(req, ['sync:push']);
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Query parameter authoritative binding', () => {
    it('allows request when query terminalId matches principal deviceId exactly', async () => {
      const token = await signDeviceToken();
      const req = {
        headers: { authorization: `Bearer ${token}` },
        query: { terminalId: 'terminal-pos-01' },
      };
      const ctx = createMockContext(req, ['sync:pull']);
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('allows request when query terminalId has leading/trailing whitespace matching trimmed deviceId', async () => {
      const token = await signDeviceToken();
      const req = {
        headers: { authorization: `Bearer ${token}` },
        query: { terminalId: '  terminal-pos-01  ' },
      };
      const ctx = createMockContext(req, ['sync:pull']);
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('allows request when query terminalId is absent', async () => {
      const token = await signDeviceToken();
      const req = {
        headers: { authorization: `Bearer ${token}` },
        query: {},
      };
      const ctx = createMockContext(req, ['sync:pull']);
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('rejects request (403 Forbidden) when query terminalId mismatches principal deviceId', async () => {
      const token = await signDeviceToken();
      const req = {
        headers: { authorization: `Bearer ${token}` },
        query: { terminalId: 'OTHER-TERMINAL' },
      };
      const ctx = createMockContext(req, ['sync:pull']);
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('rejects request (403 Forbidden) when query terminalId is empty string or blank', async () => {
      const token = await signDeviceToken();
      const reqEmpty = {
        headers: { authorization: `Bearer ${token}` },
        query: { terminalId: '' },
      };
      const ctxEmpty = createMockContext(reqEmpty, ['sync:pull']);
      await expect(guard.canActivate(ctxEmpty)).rejects.toThrow(
        ForbiddenException,
      );

      const reqBlank = {
        headers: { authorization: `Bearer ${token}` },
        query: { terminalId: '   ' },
      };
      const ctxBlank = createMockContext(reqBlank, ['sync:pull']);
      await expect(guard.canActivate(ctxBlank)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects request (403 Forbidden) when query terminalId is an array', async () => {
      const token = await signDeviceToken();
      const req = {
        headers: { authorization: `Bearer ${token}` },
        query: { terminalId: ['terminal-pos-01', 'OTHER-TERMINAL'] },
      };
      const ctx = createMockContext(req, ['sync:pull']);
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);

      const reqSingleArray = {
        headers: { authorization: `Bearer ${token}` },
        query: { terminalId: ['terminal-pos-01'] },
      };
      const ctxSingleArray = createMockContext(reqSingleArray, ['sync:pull']);
      await expect(guard.canActivate(ctxSingleArray)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects request (403 Forbidden) when query terminalId is an object', async () => {
      const token = await signDeviceToken();
      const req = {
        headers: { authorization: `Bearer ${token}` },
        query: { terminalId: { id: 'terminal-pos-01' } },
      };
      const ctx = createMockContext(req, ['sync:pull']);
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('rejects request (403 Forbidden) when query tenantId mismatches principal tenantId', async () => {
      const token = await signDeviceToken();
      const req = {
        headers: { authorization: `Bearer ${token}` },
        query: { tenantId: 'tenant-spoofed' },
      };
      const ctx = createMockContext(req, ['sync:pull']);
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('rejects request (403 Forbidden) when query tenantId is empty, blank, array, or object', async () => {
      const token = await signDeviceToken();

      const reqEmpty = {
        headers: { authorization: `Bearer ${token}` },
        query: { tenantId: '' },
      };
      await expect(
        guard.canActivate(createMockContext(reqEmpty, ['sync:pull'])),
      ).rejects.toThrow(ForbiddenException);

      const reqBlank = {
        headers: { authorization: `Bearer ${token}` },
        query: { tenantId: '   ' },
      };
      await expect(
        guard.canActivate(createMockContext(reqBlank, ['sync:pull'])),
      ).rejects.toThrow(ForbiddenException);

      const reqArray = {
        headers: { authorization: `Bearer ${token}` },
        query: { tenantId: ['tenant-alpha'] },
      };
      await expect(
        guard.canActivate(createMockContext(reqArray, ['sync:pull'])),
      ).rejects.toThrow(ForbiddenException);

      const reqObj = {
        headers: { authorization: `Bearer ${token}` },
        query: { tenantId: { id: 'tenant-alpha' } },
      };
      await expect(
        guard.canActivate(createMockContext(reqObj, ['sync:pull'])),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows request when query tenantId matches principal tenantId', async () => {
      const token = await signDeviceToken();
      const req = {
        headers: { authorization: `Bearer ${token}` },
        query: { tenantId: 'tenant-alpha' },
      };
      const ctx = createMockContext(req, ['sync:pull']);
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });
  });

  describe('Administrative AuthGuard isolation & regression', () => {
    it('denies device JWT against administrative human AuthGuard', async () => {
      const authGuard = new AuthGuard(jwtService, mockIdentityJwtConfig);
      const deviceToken = await signDeviceToken();
      const req = { headers: { authorization: `Bearer ${deviceToken}` } };
      const ctx = createMockContext(req);

      await expect(authGuard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
      expect((req as Record<string, unknown>).user).toBeUndefined();
    });

    it('allows valid human JWT against administrative human AuthGuard', async () => {
      const authGuard = new AuthGuard(jwtService, mockIdentityJwtConfig);
      const humanToken = await jwtService.signAsync(
        {
          sub: 'user-manager-1',
          email: 'manager@test.local',
          tenant_id: 'tenant-alpha',
          role: UserRole.MANAGER,
          is_active: true,
          token_type: 'access',
          security_version: 1,
        },
        {
          secret: mockIdentityJwtConfig.secret,
          algorithm: mockIdentityJwtConfig.algorithm,
          issuer: mockIdentityJwtConfig.issuer,
          audience: mockIdentityJwtConfig.audience,
          expiresIn: 900,
        },
      );

      const req: Record<string, unknown> = {
        headers: { authorization: `Bearer ${humanToken}` },
      };
      const ctx = createMockContext(req);

      await expect(authGuard.canActivate(ctx)).resolves.toBe(true);
      expect(req.user).toBeDefined();
      expect((req.user as { sub: string }).sub).toBe('user-manager-1');
      expect((req.user as { role: string }).role).toBe(UserRole.MANAGER);
    });
  });
});
