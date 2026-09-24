import {
  BadRequestException,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { ActivationController } from './activation.controller';
import { ActivationService } from '../services/activation.service';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { PermissionsGuard } from '../../identity/guards/permissions.guard';
import { AppPermission } from '../../identity/security/permissions.enum';
import { PERMISSIONS_KEY } from '../../identity/decorators/permissions.decorator';
import {
  ActivationAttempt,
  ActivationAttemptStatus,
} from '../entities/activation-attempt.entity';
import { DeviceSyncCredentialResponseDto } from '../dto/device-sync-credential-response.dto';
import { TenantTopologyRevisionService } from '../../fulfillment/services/tenant-topology-revision.service';
import { DeviceSyncCredentialService } from '../../identity/services/device-sync-credential.service';
import { DeviceSyncCredentialStatus } from '../../identity/entities/device-sync-credential.entity';
import { IDENTITY_JWT_CONFIG } from '../../identity/config/identity-jwt.config';
import { JWT_TOKEN_TYPES } from '../../identity/security/jwt-token.types';

describe('DSI-3: Activation Device Credential Provisioning', () => {
  const tenantId = 'tenant-dsi3-test';
  const q80DeviceId = 'Q802024120001';
  const attemptId = 'attempt-uuid-1234';

  describe('ActivationController - Route and Security Contract', () => {
    let controller: ActivationController;
    let activationService: jest.Mocked<Partial<ActivationService>>;
    let reflector: Reflector;

    beforeEach(() => {
      activationService = {
        provisionDeviceCredential: jest.fn(),
        confirmDeviceCredential: jest.fn(),
        provisionBootstrapDeviceCredential: jest.fn(),
        confirmBootstrapDeviceCredential: jest.fn(),
      };
      controller = new ActivationController(activationService as any);
      reflector = new Reflector();
    });

    it('has method confirmDeviceSyncCredential decorated with ONBOARDING_ACTIVATION_MANAGE permission', () => {
      const handler = controller.confirmDeviceSyncCredential;
      expect(handler).toBeDefined();

      const requiredPermissions = reflector.get<AppPermission[]>(
        PERMISSIONS_KEY,
        handler,
      );
      expect(requiredPermissions).toContain(
        AppPermission.ONBOARDING_ACTIVATION_MANAGE,
      );
    });

    it('confirmDeviceSyncCredential strictly enforces authenticated human tenant authority, discarding any body tenant', async () => {
      const mockResult: DeviceSyncCredentialResponseDto = {
        credentialId: 'cred-uuid-1',
        tenantId,
        slug: 'tenant-dsi3-test',
        deviceId: q80DeviceId,
        scopes: ['sync:push', 'sync:pull'],
        credentialVersion: 1,
        renewalCredentialExpiresAt: new Date(
          Date.now() + 86400000,
        ).toISOString(),
        status: 'ACTIVE',
      };
      (
        activationService.confirmDeviceCredential as jest.Mock
      ).mockResolvedValue(mockResult);

      const req: any = {
        user: {
          id: 'human-user-1',
          tenant_id: tenantId,
          role: 'ADMIN',
        },
        body: {
          tenantId: 'forged-attacker-tenant',
          credentialId: 'cred-uuid-1',
          deviceId: q80DeviceId,
          credentialVersion: 1,
          renewalSecret: 'valid-secret',
        },
      };

      const result = await controller.confirmDeviceSyncCredential(
        req,
        attemptId,
        {
          credentialId: 'cred-uuid-1',
          deviceId: q80DeviceId,
          credentialVersion: 1,
          renewalSecret: 'valid-secret',
        },
      );

      expect(activationService.confirmDeviceCredential).toHaveBeenCalledWith(
        tenantId,
        attemptId,
        expect.objectContaining({
          credentialId: 'cred-uuid-1',
          deviceId: q80DeviceId,
        }),
      );
      expect(result.status).toBe('ACTIVE');
    });

    it('has method provisionDeviceSyncCredential decorated with ONBOARDING_ACTIVATION_MANAGE permission', () => {
      const handler = controller.provisionDeviceSyncCredential;
      expect(handler).toBeDefined();

      const requiredPermissions = reflector.get<AppPermission[]>(
        PERMISSIONS_KEY,
        handler,
      );
      expect(requiredPermissions).toContain(
        AppPermission.ONBOARDING_ACTIVATION_MANAGE,
      );
    });

    it('delegates to activationService.provisionDeviceCredential using human tenant authority and attemptId', async () => {
      const mockResult: DeviceSyncCredentialResponseDto = {
        credentialId: 'cred-uuid-1',
        tenantId,
        slug: 'tenant-dsi3-test',
        deviceId: q80DeviceId,
        scopes: ['sync:push', 'sync:pull'],
        credentialVersion: 1,
        renewalSecret: 'valid-high-entropy-secret-1234567890',
        renewalCredentialExpiresAt: new Date(
          Date.now() + 86400000,
        ).toISOString(),
      };
      (
        activationService.provisionDeviceCredential as jest.Mock
      ).mockResolvedValue(mockResult);

      const req: any = {
        user: {
          id: 'human-user-1',
          tenant_id: tenantId,
          role: 'ADMIN',
        },
        body: {
          // Attacker attempts to pass a different tenantId in the body
          tenantId: 'forged-attacker-tenant',
        },
      };

      const result = await controller.provisionDeviceSyncCredential(
        req,
        attemptId,
      );

      // Must use authenticated human tenantId, NEVER body tenant
      expect(activationService.provisionDeviceCredential).toHaveBeenCalledWith(
        tenantId,
        attemptId,
      );
      expect(result).toEqual(mockResult);
      expect((result as any).renewalSecretHash).toBeUndefined();
    });

    it('supports req.user.tenantId (camelCase) fallback in controller', async () => {
      const mockResult: DeviceSyncCredentialResponseDto = {
        credentialId: 'cred-uuid-1',
        tenantId,
        slug: 'tenant-dsi3-test',
        deviceId: q80DeviceId,
        scopes: ['sync:push', 'sync:pull'],
        credentialVersion: 1,
        renewalSecret: 'valid-secret',
        renewalCredentialExpiresAt: new Date().toISOString(),
      };
      (
        activationService.provisionDeviceCredential as jest.Mock
      ).mockResolvedValue(mockResult);

      const req: any = {
        user: {
          id: 'human-user-1',
          tenantId, // camelCase
        },
      };

      await controller.provisionDeviceSyncCredential(req, attemptId);
      expect(activationService.provisionDeviceCredential).toHaveBeenCalledWith(
        tenantId,
        attemptId,
      );
    });

    it('rejects request when tenant context is missing from human user context', async () => {
      const req: any = {
        user: {
          id: 'human-user-1',
          // No tenantId or tenant_id
        },
      };

      await expect(
        controller.provisionDeviceSyncCredential(req, attemptId),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('has method provisionBootstrapDeviceSyncCredential decorated with ONBOARDING_ACTIVATION_MANAGE permission', () => {
      const handler = controller.provisionBootstrapDeviceSyncCredential;
      expect(handler).toBeDefined();

      const requiredPermissions = reflector.get<AppPermission[]>(
        PERMISSIONS_KEY,
        handler,
      );
      expect(requiredPermissions).toContain(
        AppPermission.ONBOARDING_ACTIVATION_MANAGE,
      );
    });

    it('delegates provisionBootstrapDeviceSyncCredential to activationService using human tenant authority and deviceId', async () => {
      const mockResult: DeviceSyncCredentialResponseDto = {
        credentialId: 'cred-uuid-boot-1',
        tenantId,
        slug: 'tenant-dsi3-test',
        deviceId: q80DeviceId,
        scopes: ['sync:push', 'sync:pull'],
        credentialVersion: 1,
        renewalSecret: 'valid-high-entropy-secret-boot',
        renewalCredentialExpiresAt: new Date(
          Date.now() + 86400000,
        ).toISOString(),
      };
      (
        activationService.provisionBootstrapDeviceCredential as jest.Mock
      ).mockResolvedValue(mockResult);

      const req: any = {
        user: {
          id: 'human-user-1',
          tenant_id: tenantId,
          role: 'OWNER',
        },
      };

      const result = await controller.provisionBootstrapDeviceSyncCredential(
        req,
        {
          deviceId: q80DeviceId,
        },
      );

      expect(
        activationService.provisionBootstrapDeviceCredential,
      ).toHaveBeenCalledWith(tenantId, q80DeviceId);
      expect(result.credentialId).toBe('cred-uuid-boot-1');
      expect(result.renewalSecret).toBe('valid-high-entropy-secret-boot');
    });

    it('has method confirmBootstrapDeviceSyncCredential decorated with ONBOARDING_ACTIVATION_MANAGE permission', () => {
      const handler = controller.confirmBootstrapDeviceSyncCredential;
      expect(handler).toBeDefined();

      const requiredPermissions = reflector.get<AppPermission[]>(
        PERMISSIONS_KEY,
        handler,
      );
      expect(requiredPermissions).toContain(
        AppPermission.ONBOARDING_ACTIVATION_MANAGE,
      );
    });

    it('delegates confirmBootstrapDeviceSyncCredential to activationService using human tenant authority and dto', async () => {
      const mockResult: DeviceSyncCredentialResponseDto = {
        credentialId: 'cred-uuid-boot-1',
        tenantId,
        slug: 'tenant-dsi3-test',
        deviceId: q80DeviceId,
        scopes: ['sync:push', 'sync:pull'],
        credentialVersion: 1,
        renewalCredentialExpiresAt: new Date(
          Date.now() + 86400000,
        ).toISOString(),
        status: 'ACTIVE',
      };
      (
        activationService.confirmBootstrapDeviceCredential as jest.Mock
      ).mockResolvedValue(mockResult);

      const req: any = {
        user: {
          id: 'human-user-1',
          tenant_id: tenantId,
          role: 'OWNER',
        },
      };

      const dto = {
        credentialId: 'cred-uuid-boot-1',
        deviceId: q80DeviceId,
        credentialVersion: 1,
        renewalSecret: 'valid-high-entropy-secret-boot',
      };

      const result = await controller.confirmBootstrapDeviceSyncCredential(
        req,
        dto,
      );

      expect(
        activationService.confirmBootstrapDeviceCredential,
      ).toHaveBeenCalledWith(tenantId, dto);
      expect(result.status).toBe('ACTIVE');
    });
  });

  describe('Guards - Strict Human Auth & Device JWT Rejection', () => {
    let authGuard: AuthGuard;
    let permissionsGuard: PermissionsGuard;
    let jwtService: { verifyAsync: jest.Mock };

    const identityJwtConfig = {
      secret: 'identity-secret-at-least-thirty-two-chars-long',
      issuer: 'omnifood-admin',
      audience: 'omnifood-identity',
      accessTokenTtlSeconds: 900,
      clockToleranceSeconds: 5,
      algorithm: 'HS256',
    };

    beforeEach(async () => {
      jwtService = { verifyAsync: jest.fn() };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AuthGuard,
          PermissionsGuard,
          { provide: JwtService, useValue: jwtService },
          { provide: IDENTITY_JWT_CONFIG, useValue: identityJwtConfig },
        ],
      }).compile();

      authGuard = module.get(AuthGuard);
      permissionsGuard = module.get(PermissionsGuard);
    });

    const createMockContext = (
      req: Record<string, unknown>,
    ): ExecutionContext => {
      return {
        switchToHttp: () => ({
          getRequest: () => req,
        }),
        getHandler: () => () => {},
        getClass: () => class {},
      } as unknown as ExecutionContext;
    };

    it('AuthGuard: rejects unauthenticated requests with no authorization header', async () => {
      const context = createMockContext({ headers: {} });
      await expect(authGuard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('AuthGuard: rejects a device sync JWT because AuthGuard is strictly for human access', async () => {
      // Device sync JWT payload produced by DSI-1 DeviceSyncCredentialService
      const deviceSyncPayload = {
        sub: 'credential-uuid-1',
        principal_type: 'device_sync',
        token_type: 'device_sync_access',
        tenant_id: tenantId,
        device_id: q80DeviceId,
        scopes: ['sync:push', 'sync:pull'],
        credential_version: 1,
        jti: 'jti-uuid',
      };
      jwtService.verifyAsync.mockResolvedValue(deviceSyncPayload);

      const context = createMockContext({
        headers: { authorization: 'Bearer device-sync-token-value' },
      });

      // Must throw UnauthorizedException because device tokens lack human user claims (email, role, security_version)
      await expect(authGuard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('AuthGuard: allows valid human user token with strict access payload', async () => {
      const humanPayload = {
        sub: 'user-uuid-1',
        email: 'operator@tenant.com',
        tenant_id: tenantId,
        role: 'ADMIN',
        is_active: true,
        token_type: JWT_TOKEN_TYPES.ACCESS,
        security_version: 1,
      };
      jwtService.verifyAsync.mockResolvedValue(humanPayload);

      const req: any = {
        headers: { authorization: 'Bearer valid-human-token' },
      };
      const context = createMockContext(req);

      const canActivate = await authGuard.canActivate(context);
      expect(canActivate).toBe(true);
      expect(req.user).toEqual(humanPayload);
    });

    it('PermissionsGuard: rejects human user lacking ONBOARDING_ACTIVATION_MANAGE permission', () => {
      const reflector = new Reflector();
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([AppPermission.ONBOARDING_ACTIVATION_MANAGE]);

      const guard = new PermissionsGuard(reflector);

      const context = createMockContext({
        user: {
          sub: 'user-1',
          role: 'VIEWER', // No ONBOARDING_ACTIVATION_MANAGE
        },
      });

      expect(permissionsGuard).toBeDefined();
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('PermissionsGuard: allows human user with ONBOARDING_ACTIVATION_MANAGE permission', () => {
      const reflector = new Reflector();
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([AppPermission.ONBOARDING_ACTIVATION_MANAGE]);

      const guard = new PermissionsGuard(reflector);

      const context = createMockContext({
        user: {
          sub: 'user-1',
          role: 'OWNER', // OWNER has ONBOARDING_ACTIVATION_MANAGE
        },
      });

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('ActivationService.provisionDeviceCredential - Domain & Security Rules', () => {
    let service: ActivationService;
    let attemptRepo: any;
    let checkRepo: any;
    let followUpRepo: any;
    let sessionRepo: any;
    let fiscalConfigVersionService: any;
    let onboardingCatalogService: any;
    let readinessEvaluator: any;
    let dataSource: any;
    let changeLogService: any;
    let deviceSyncCredentialService: jest.Mocked<
      Partial<DeviceSyncCredentialService>
    >;
    let tenantTopologyRevisionService: jest.Mocked<
      Partial<TenantTopologyRevisionService>
    >;

    beforeEach(() => {
      attemptRepo = {
        findOne: jest.fn(),
        save: jest.fn(),
      };
      checkRepo = { findOne: jest.fn(), save: jest.fn() };
      followUpRepo = { create: jest.fn(), save: jest.fn() };
      sessionRepo = { findOne: jest.fn(), save: jest.fn() };
      fiscalConfigVersionService = {};
      onboardingCatalogService = {};
      readinessEvaluator = { evaluate: jest.fn() };
      // ActivationService binds transaction-local tenant context (set_config)
      // on the transaction manager before repository access; the mock must
      // execute the transaction callback with a capable manager.
      dataSource = {
        // Issue #556 slice 11: provisioning/confirm responses read the
        // persisted tenant slug from the global tenants table.
        query: jest.fn().mockResolvedValue([{ slug: 'tenant-dsi3-test' }]),
        transaction: jest.fn((cb: (manager: any) => Promise<unknown>) =>
          cb({
            query: jest.fn().mockResolvedValue(undefined),
            getRepository: (entityClass: any) =>
              entityClass === ActivationAttempt ? attemptRepo : null,
          }),
        ),
      };
      changeLogService = { log: jest.fn() };

      deviceSyncCredentialService = {
        provisionCredential: jest.fn(),
      };
      tenantTopologyRevisionService = {
        current: jest.fn(),
      };

      service = new ActivationService(
        attemptRepo,
        checkRepo,
        followUpRepo,
        sessionRepo,
        fiscalConfigVersionService,
        onboardingCatalogService,
        readinessEvaluator,
        dataSource,
        changeLogService,
        undefined, // invoicesService
        deviceSyncCredentialService as any,
        tenantTopologyRevisionService as any,
      );
    });

    it('happy path: successfully provisions credentials for Q80 PASS attempt with matching topology device', async () => {
      const attempt: Partial<ActivationAttempt> = {
        id: attemptId,
        tenantId,
        status: ActivationAttemptStatus.PASS,
        candidateTerminalId: q80DeviceId,
        trustedTerminalId: q80DeviceId,
      };
      attemptRepo.findOne.mockResolvedValue(attempt);

      tenantTopologyRevisionService.current.mockResolvedValue({
        provisioned: true,
        revision: 1,
        tenantId,
        contractVersion: 1,
        topology: {
          operationMode: 'FOOD_PARK',
          channels: ['KDS_AND_PRINT'],
          devices: [
            {
              deviceId: q80DeviceId,
              roles: ['CASHIER'],
              capabilities: ['PRINT'],
            },
          ],
        },
        hash: 'valid-topology-hash',
      });

      const expiryDate = new Date(Date.now() + 30 * 24 * 3600 * 1000);
      deviceSyncCredentialService.provisionCredential.mockResolvedValue({
        credential: {
          id: 'cred-q80-1',
          tenantId,
          activationAttemptId: attemptId,
          renewalSecretHash: '$2b$12$someSecretBcryptHashShouldNeverLeak',
          scopes: ['sync:push', 'sync:pull'],
          version: 1,
          status: DeviceSyncCredentialStatus.PENDING,
          expiresAt: expiryDate,
          issuedAt: new Date(),
        } as any,
        renewalSecret: 'dsi3-plaintext-renewal-secret-q80',
      });

      const result = await service.provisionDeviceCredential(
        tenantId,
        attemptId,
      );

      expect(attemptRepo.findOne).toHaveBeenCalledWith({
        where: { id: attemptId, tenantId },
      });
      expect(tenantTopologyRevisionService.current).toHaveBeenCalledWith(
        tenantId,
      );
      expect(
        deviceSyncCredentialService.provisionCredential,
      ).toHaveBeenCalledWith({
        tenantId,
        activationAttemptId: attemptId,
      });

      // Response DTO assertions
      expect(result).toEqual({
        credentialId: 'cred-q80-1',
        tenantId,
        // Issue #556 slice 11: persisted slug exposed to the POS.
        slug: 'tenant-dsi3-test',
        deviceId: q80DeviceId,
        scopes: ['sync:push', 'sync:pull'],
        credentialVersion: 1,
        renewalSecret: 'dsi3-plaintext-renewal-secret-q80',
        renewalCredentialExpiresAt: expiryDate.toISOString(),
        status: DeviceSyncCredentialStatus.PENDING,
      });
      // Ensure renewalSecretHash and internal entity fields are not leaked
      expect((result as any).renewalSecretHash).toBeUndefined();
      expect((result as any).activationAttemptId).toBeUndefined();
    });

    it('happy path: also allows PASS_WITH_WARNING status', async () => {
      const attempt: Partial<ActivationAttempt> = {
        id: attemptId,
        tenantId,
        status: ActivationAttemptStatus.PASS_WITH_WARNING,
        candidateTerminalId: q80DeviceId,
        trustedTerminalId: q80DeviceId,
      };
      attemptRepo.findOne.mockResolvedValue(attempt);

      tenantTopologyRevisionService.current.mockResolvedValue({
        provisioned: true,
        revision: 1,
        topology: {
          devices: [{ deviceId: q80DeviceId }],
        },
      });

      deviceSyncCredentialService.provisionCredential.mockResolvedValue({
        credential: {
          id: 'cred-q80-warn',
          tenantId,
          activationAttemptId: attemptId,
          renewalSecretHash: 'secret-hash',
          scopes: ['sync:push', 'sync:pull'],
          version: 1,
          status: DeviceSyncCredentialStatus.ACTIVE,
          expiresAt: new Date(),
          issuedAt: new Date(),
        } as any,
        renewalSecret: 'plaintext-secret-warn',
      });

      const result = await service.provisionDeviceCredential(
        tenantId,
        attemptId,
      );
      expect(result.deviceId).toBe(q80DeviceId);
      expect(result.renewalSecret).toBe('plaintext-secret-warn');
    });

    it('happy path: succeeds when topology authority does not exist yet (provisioned: false)', async () => {
      const attempt: Partial<ActivationAttempt> = {
        id: attemptId,
        tenantId,
        status: ActivationAttemptStatus.PASS,
        candidateTerminalId: q80DeviceId,
        trustedTerminalId: q80DeviceId,
      };
      attemptRepo.findOne.mockResolvedValue(attempt);

      tenantTopologyRevisionService.current.mockResolvedValue({
        provisioned: false,
        revision: 0,
      });

      deviceSyncCredentialService.provisionCredential.mockResolvedValue({
        credential: {
          id: 'cred-q80-no-topo',
          tenantId,
          activationAttemptId: attemptId,
          renewalSecretHash: 'hash',
          scopes: ['sync:push', 'sync:pull'],
          version: 1,
          status: DeviceSyncCredentialStatus.ACTIVE,
          expiresAt: new Date(),
          issuedAt: new Date(),
        } as any,
        renewalSecret: 'secret-no-topo',
      });

      const result = await service.provisionDeviceCredential(
        tenantId,
        attemptId,
      );
      expect(result.deviceId).toBe(q80DeviceId);
      expect(result.credentialId).toBe('cred-q80-no-topo');
    });

    it('cross-tenant attempt: rejects when attempt belongs to another tenant', async () => {
      // attemptRepo.findOne with tenantId returns null (RLS / scoped lookup)
      attemptRepo.findOne.mockResolvedValue(null);

      await expect(
        service.provisionDeviceCredential(tenantId, attemptId),
      ).rejects.toThrow(NotFoundException);

      expect(attemptRepo.findOne).toHaveBeenCalledWith({
        where: { id: attemptId, tenantId },
      });
      expect(
        deviceSyncCredentialService.provisionCredential,
      ).not.toHaveBeenCalled();
    });

    it('non-PASS attempt: rejects when status is CREATED, IN_PROGRESS, or FAIL', async () => {
      for (const nonPassStatus of [
        ActivationAttemptStatus.CREATED,
        ActivationAttemptStatus.IN_PROGRESS,
        ActivationAttemptStatus.FAIL,
      ]) {
        attemptRepo.findOne.mockResolvedValue({
          id: attemptId,
          tenantId,
          status: nonPassStatus,
          candidateTerminalId: q80DeviceId,
          trustedTerminalId: q80DeviceId,
        });

        await expect(
          service.provisionDeviceCredential(tenantId, attemptId),
        ).rejects.toThrow(BadRequestException);

        expect(
          deviceSyncCredentialService.provisionCredential,
        ).not.toHaveBeenCalled();
      }
    });

    it('null or blank trustedTerminalId: rejects when trustedTerminalId is not established', async () => {
      attemptRepo.findOne.mockResolvedValue({
        id: attemptId,
        tenantId,
        status: ActivationAttemptStatus.PASS,
        candidateTerminalId: q80DeviceId,
        trustedTerminalId: null,
      });

      await expect(
        service.provisionDeviceCredential(tenantId, attemptId),
      ).rejects.toThrow(BadRequestException);

      expect(
        deviceSyncCredentialService.provisionCredential,
      ).not.toHaveBeenCalled();
    });

    it('mismatched trustedTerminalId: rejects when trustedTerminalId does not match candidateTerminalId', async () => {
      attemptRepo.findOne.mockResolvedValue({
        id: attemptId,
        tenantId,
        status: ActivationAttemptStatus.PASS,
        candidateTerminalId: 'CANDIDATE_TERMINAL_X',
        trustedTerminalId: q80DeviceId,
      });

      await expect(
        service.provisionDeviceCredential(tenantId, attemptId),
      ).rejects.toThrow(BadRequestException);

      expect(
        deviceSyncCredentialService.provisionCredential,
      ).not.toHaveBeenCalled();
    });

    it('missing topology device: rejects when topology authority exists but does not contain device', async () => {
      attemptRepo.findOne.mockResolvedValue({
        id: attemptId,
        tenantId,
        status: ActivationAttemptStatus.PASS,
        candidateTerminalId: q80DeviceId,
        trustedTerminalId: q80DeviceId,
      });

      tenantTopologyRevisionService.current.mockResolvedValue({
        provisioned: true,
        revision: 2,
        topology: {
          devices: [{ deviceId: 'OTHER_TERMINAL_999' }],
        },
      });

      await expect(
        service.provisionDeviceCredential(tenantId, attemptId),
      ).rejects.toThrow(BadRequestException);

      expect(
        deviceSyncCredentialService.provisionCredential,
      ).not.toHaveBeenCalled();
    });

    it('mismatched topology device: rejects when topology devices array is empty', async () => {
      attemptRepo.findOne.mockResolvedValue({
        id: attemptId,
        tenantId,
        status: ActivationAttemptStatus.PASS,
        candidateTerminalId: q80DeviceId,
        trustedTerminalId: q80DeviceId,
      });

      tenantTopologyRevisionService.current.mockResolvedValue({
        provisioned: true,
        revision: 1,
        topology: {
          devices: [],
        },
      });

      await expect(
        service.provisionDeviceCredential(tenantId, attemptId),
      ).rejects.toThrow(BadRequestException);

      expect(
        deviceSyncCredentialService.provisionCredential,
      ).not.toHaveBeenCalled();
    });

    it('duplicate provisioning: rejects with ConflictException and resurrects no secret', async () => {
      attemptRepo.findOne.mockResolvedValue({
        id: attemptId,
        tenantId,
        status: ActivationAttemptStatus.PASS,
        candidateTerminalId: q80DeviceId,
        trustedTerminalId: q80DeviceId,
      });

      tenantTopologyRevisionService.current.mockResolvedValue({
        provisioned: true,
        revision: 1,
        topology: {
          devices: [{ deviceId: q80DeviceId }],
        },
      });

      // DSI-1 service rejects duplicate attempts with ConflictException
      deviceSyncCredentialService.provisionCredential.mockRejectedValue(
        new ConflictException(
          `Activation attempt '${attemptId}' has already been provisioned`,
        ),
      );

      await expect(
        service.provisionDeviceCredential(tenantId, attemptId),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects with BadRequestException when tenantId or attemptId is blank', async () => {
      await expect(
        service.provisionDeviceCredential('  ', attemptId),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.provisionDeviceCredential(tenantId, '  '),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects with BadRequestException when DeviceSyncCredentialService is not available', async () => {
      const serviceWithoutDeviceSync = new ActivationService(
        attemptRepo,
        checkRepo,
        followUpRepo,
        sessionRepo,
        fiscalConfigVersionService,
        onboardingCatalogService,
        readinessEvaluator,
        dataSource,
        changeLogService,
        undefined,
        undefined, // deviceSyncCredentialService missing
        tenantTopologyRevisionService as any,
      );

      attemptRepo.findOne.mockResolvedValue({
        id: attemptId,
        tenantId,
        status: ActivationAttemptStatus.PASS,
        candidateTerminalId: q80DeviceId,
        trustedTerminalId: q80DeviceId,
      });

      tenantTopologyRevisionService.current.mockResolvedValue({
        provisioned: false,
        revision: 0,
      });

      await expect(
        serviceWithoutDeviceSync.provisionDeviceCredential(tenantId, attemptId),
      ).rejects.toThrow(BadRequestException);
    });

    describe('ActivationService.confirmDeviceCredential - Domain & Security Rules', () => {
      it('happy path: successfully confirms credential for Q80 attempt and returns ACTIVE response', async () => {
        attemptRepo.findOne.mockResolvedValue({
          id: attemptId,
          tenantId,
          status: ActivationAttemptStatus.PASS,
          candidateTerminalId: q80DeviceId,
          trustedTerminalId: q80DeviceId,
        });

        tenantTopologyRevisionService.current.mockResolvedValue({
          provisioned: true,
          revision: 1,
          topology: {
            devices: [{ deviceId: q80DeviceId }],
          },
        });

        const expiryDate = new Date(Date.now() + 30 * 24 * 3600 * 1000);
        (deviceSyncCredentialService as any).confirmCredential = jest
          .fn()
          .mockResolvedValue({
            id: 'cred-q80-1',
            tenantId,
            version: 1,
            status: DeviceSyncCredentialStatus.ACTIVE,
            scopes: ['sync:push', 'sync:pull'],
            expiresAt: expiryDate,
          });

        const result = await service.confirmDeviceCredential(
          tenantId,
          attemptId,
          {
            credentialId: 'cred-q80-1',
            deviceId: q80DeviceId,
            credentialVersion: 1,
            renewalSecret: 'valid-secret',
          },
        );

        expect(result.status).toBe(DeviceSyncCredentialStatus.ACTIVE);
        expect(result.credentialId).toBe('cred-q80-1');
        expect(result.renewalSecret).toBeUndefined(); // confirms do not return secret
      });

      it('rejects when declared device does not match canonical device', async () => {
        attemptRepo.findOne.mockResolvedValue({
          id: attemptId,
          tenantId,
          status: ActivationAttemptStatus.PASS,
          candidateTerminalId: q80DeviceId,
          trustedTerminalId: q80DeviceId,
        });

        await expect(
          service.confirmDeviceCredential(tenantId, attemptId, {
            credentialId: 'cred-q80-1',
            deviceId: 'WRONG-DEVICE',
            credentialVersion: 1,
            renewalSecret: 'valid-secret',
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects when attempt is not PASS or PASS_WITH_WARNING', async () => {
        attemptRepo.findOne.mockResolvedValue({
          id: attemptId,
          tenantId,
          status: ActivationAttemptStatus.IN_PROGRESS,
          candidateTerminalId: q80DeviceId,
          trustedTerminalId: q80DeviceId,
        });

        await expect(
          service.confirmDeviceCredential(tenantId, attemptId, {
            credentialId: 'cred-q80-1',
            deviceId: q80DeviceId,
            credentialVersion: 1,
            renewalSecret: 'valid-secret',
          }),
        ).rejects.toThrow(BadRequestException);
      });

      describe('ActivationService bootstrap methods', () => {
        it('provisionBootstrapDeviceCredential resolves latest finalized PASS attempt and provisions credential', async () => {
          attemptRepo.findOne.mockResolvedValue({
            id: 'attempt-pass-latest',
            tenantId,
            status: ActivationAttemptStatus.PASS,
            candidateTerminalId: q80DeviceId,
            trustedTerminalId: q80DeviceId,
            completedAt: new Date(),
          });

          tenantTopologyRevisionService.current.mockResolvedValue({
            provisioned: true,
            revision: 1,
            topology: {
              devices: [{ deviceId: q80DeviceId }],
            },
          });

          const expiryDate = new Date(Date.now() + 30 * 24 * 3600 * 1000);
          (deviceSyncCredentialService as any).provisionCredential = jest
            .fn()
            .mockResolvedValue({
              credential: {
                id: 'cred-boot-123',
                tenantId,
                version: 1,
                status: DeviceSyncCredentialStatus.PENDING,
                scopes: ['sync:push', 'sync:pull'],
                expiresAt: expiryDate,
              },
              renewalSecret: 'entropy-boot-secret-xyz',
            });

          const result = await service.provisionBootstrapDeviceCredential(
            tenantId,
            q80DeviceId,
          );

          expect(result.credentialId).toBe('cred-boot-123');
          expect(result.renewalSecret).toBe('entropy-boot-secret-xyz');
          expect(attemptRepo.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
              where: expect.objectContaining({
                tenantId,
                trustedTerminalId: q80DeviceId,
              }),
            }),
          );
        });

        it('provisionBootstrapDeviceCredential throws NotFoundException when no finalized attempt matches device', async () => {
          attemptRepo.findOne.mockResolvedValue(null);

          await expect(
            service.provisionBootstrapDeviceCredential(
              tenantId,
              'unknown-device',
            ),
          ).rejects.toThrow(NotFoundException);
        });

        it('confirmBootstrapDeviceCredential resolves latest finalized PASS attempt and confirms credential', async () => {
          attemptRepo.findOne.mockResolvedValue({
            id: 'attempt-pass-latest',
            tenantId,
            status: ActivationAttemptStatus.PASS,
            candidateTerminalId: q80DeviceId,
            trustedTerminalId: q80DeviceId,
            completedAt: new Date(),
          });

          tenantTopologyRevisionService.current.mockResolvedValue({
            provisioned: true,
            revision: 1,
            topology: {
              devices: [{ deviceId: q80DeviceId }],
            },
          });

          const expiryDate = new Date(Date.now() + 30 * 24 * 3600 * 1000);
          (deviceSyncCredentialService as any).confirmCredential = jest
            .fn()
            .mockResolvedValue({
              id: 'cred-boot-123',
              tenantId,
              version: 1,
              status: DeviceSyncCredentialStatus.ACTIVE,
              scopes: ['sync:push', 'sync:pull'],
              expiresAt: expiryDate,
            });

          const dto = {
            credentialId: 'cred-boot-123',
            deviceId: q80DeviceId,
            credentialVersion: 1,
            renewalSecret: 'entropy-boot-secret-xyz',
          };

          const result = await service.confirmBootstrapDeviceCredential(
            tenantId,
            dto,
          );

          expect(result.status).toBe(DeviceSyncCredentialStatus.ACTIVE);
          expect(result.credentialId).toBe('cred-boot-123');
        });
      });
    });
  });
});
