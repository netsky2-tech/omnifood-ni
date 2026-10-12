import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  UnauthorizedException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { SupervisorOverrideService } from './supervisor-override.service';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../../core/database/tenant-transaction';
import { User, UserRole } from '../entities/user.entity';
import { SecurityProfile } from '../entities/security-profile.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { AppPermission } from '../security/permissions.enum';
import { generateTotp } from '../security/totp.util';
import { IDENTITY_JWT_CONFIG } from '../config/identity-jwt.config';
import { JwtService } from '@nestjs/jwt';

describe('SupervisorOverrideService (Slice 10.2)', () => {
  let service: SupervisorOverrideService;

  const userRepository = {
    findOne: jest.fn(),
  };

  const securityProfileRepository = {
    findOne: jest.fn(),
  };

  const auditRepository = {
    save: jest.fn(),
  };

  // The tenant-bound transaction fake: the manager hands back the same
  // repository mocks the pooled tokens provide, so the existing behavior
  // assertions keep working unchanged while the binding guard below proves
  // the binding itself with isolated instrumented fakes.
  const manager = {
    query: jest.fn(),
    getRepository: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(),
  };

  const jwtService = {
    sign: jest.fn().mockReturnValue('signed.ephemeral.token'),
  };

  const mockJwtConfig = {
    secret: 'supersecretjwtkeyforadminbackenddevelopmentonly-32bytes',
    issuer: 'omnifood-admin-api',
    audience: 'omnifood-pos-client',
    algorithm: 'HS256',
  };

  const testTenantId = 'tenant-1';
  const supervisorId = 'sup-1';
  const requestingUserId = 'cashier-1';
  const testTotpSeed = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

  beforeEach(async () => {
    jest.clearAllMocks();

    manager.query.mockResolvedValue(undefined);
    manager.getRepository.mockImplementation((entity: unknown) => {
      if (entity === User) return userRepository;
      if (entity === SecurityProfile) return securityProfileRepository;
      // Issue #581: the override audit write rides its own tenant-bound
      // transaction, so the manager hands back the audit repository too.
      if (entity === AuditLog) return auditRepository;
      throw new Error(
        `Unexpected repository request: ${(entity as { name?: string })?.name ?? typeof entity}`,
      );
    });
    dataSource.transaction.mockImplementation(
      (work: (transactionManager: typeof manager) => Promise<unknown>) =>
        work(manager),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupervisorOverrideService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        {
          provide: getRepositoryToken(SecurityProfile),
          useValue: securityProfileRepository,
        },
        { provide: getRepositoryToken(AuditLog), useValue: auditRepository },
        { provide: DataSource, useValue: dataSource },
        { provide: JwtService, useValue: jwtService },
        { provide: IDENTITY_JWT_CONFIG, useValue: mockJwtConfig },
      ],
    }).compile();

    service = module.get<SupervisorOverrideService>(SupervisorOverrideService);
  });

  describe('PIN Authorization', () => {
    it('authorizes supervisor when PIN matches bcrypt hash and supervisor has permission', async () => {
      const hashedPin = await bcrypt.hash('123456', 10);

      userRepository.findOne.mockResolvedValue({
        id: supervisorId,
        name: 'Manager Supervisor',
        role: UserRole.MANAGER,
        tenant_id: testTenantId,
        is_active: true,
      });

      securityProfileRepository.findOne.mockResolvedValue({
        user_id: supervisorId,
        pin_hash: hashedPin,
        is_pin_enabled: true,
        custom_permissions: [],
      });

      const response = await service.authorizeOverride(
        {
          supervisorId,
          credential: '123456',
          method: 'PIN',
          permissionRequired: AppPermission.SALES_VOID_INVOICE,
          context: { reason: 'Order mistyped' },
        },
        testTenantId,
        requestingUserId,
      );

      expect(response.authorized).toBe(true);
      expect(response.supervisorId).toBe(supervisorId);
      expect(response.supervisorName).toBe('Manager Supervisor');
      expect(response.authorizationToken).toBe('signed.ephemeral.token');
      expect(response.permission).toBe(AppPermission.SALES_VOID_INVOICE);
      expect(new Date(response.expiresAt).getTime()).toBeGreaterThan(
        Date.now(),
      );

      expect(auditRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SUPERVISOR_OVERRIDE_APPROVED',
          metodo_autorizacion: 'PIN',
          usuario_autorizador_id: supervisorId,
          user_id: requestingUserId,
          tenant_id: testTenantId,
        }),
      );
    });

    it('throws UnauthorizedException and logs rejection when PIN is incorrect', async () => {
      const hashedPin = await bcrypt.hash('123456', 10);

      userRepository.findOne.mockResolvedValue({
        id: supervisorId,
        name: 'Manager Supervisor',
        role: UserRole.MANAGER,
        tenant_id: testTenantId,
        is_active: true,
      });

      securityProfileRepository.findOne.mockResolvedValue({
        user_id: supervisorId,
        pin_hash: hashedPin,
        is_pin_enabled: true,
        custom_permissions: [],
      });

      await expect(
        service.authorizeOverride(
          {
            supervisorId,
            credential: 'wrong-pin',
            method: 'PIN',
            permissionRequired: AppPermission.SALES_VOID_INVOICE,
          },
          testTenantId,
          requestingUserId,
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(auditRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SUPERVISOR_OVERRIDE_REJECTED',
          metodo_autorizacion: 'PIN',
          usuario_autorizador_id: supervisorId,
        }),
      );
    });
  });

  describe('TOTP Authorization (RFC 6238)', () => {
    it('authorizes supervisor when valid 6-digit TOTP code is provided for active seed', async () => {
      const now = Date.now();
      const validTotpCode = generateTotp(testTotpSeed, now);

      userRepository.findOne.mockResolvedValue({
        id: supervisorId,
        name: 'Owner Supervisor',
        role: UserRole.OWNER,
        tenant_id: testTenantId,
        is_active: true,
      });

      securityProfileRepository.findOne.mockResolvedValue({
        user_id: supervisorId,
        totp_secret_seed: testTotpSeed,
        is_totp_enabled: true,
        custom_permissions: [],
      });

      const response = await service.authorizeOverride(
        {
          supervisorId,
          credential: validTotpCode,
          method: 'TOTP',
          permissionRequired: AppPermission.INVENTORY_RECIPE_EDIT,
        },
        testTenantId,
        requestingUserId,
      );

      expect(response.authorized).toBe(true);
      expect(response.authorizationToken).toBe('signed.ephemeral.token');
      expect(auditRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SUPERVISOR_OVERRIDE_APPROVED',
          metodo_autorizacion: 'TOTP',
          usuario_autorizador_id: supervisorId,
        }),
      );
    });

    it('throws UnauthorizedException when invalid TOTP token is provided', async () => {
      userRepository.findOne.mockResolvedValue({
        id: supervisorId,
        name: 'Owner Supervisor',
        role: UserRole.OWNER,
        tenant_id: testTenantId,
        is_active: true,
      });

      securityProfileRepository.findOne.mockResolvedValue({
        user_id: supervisorId,
        totp_secret_seed: testTotpSeed,
        is_totp_enabled: true,
        custom_permissions: [],
      });

      await expect(
        service.authorizeOverride(
          {
            supervisorId,
            credential: '000000',
            method: 'TOTP',
            permissionRequired: AppPermission.SALES_VOID_INVOICE,
          },
          testTenantId,
          requestingUserId,
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(auditRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SUPERVISOR_OVERRIDE_REJECTED',
          metodo_autorizacion: 'TOTP',
        }),
      );
    });
  });

  describe('Authorization Constraints & Invariants', () => {
    it('throws ForbiddenException when supervisor does not hold the required permission', async () => {
      userRepository.findOne.mockResolvedValue({
        id: supervisorId,
        name: 'Cashier User',
        role: UserRole.CASHIER, // Cashier has no permissions by default
        tenant_id: testTenantId,
        is_active: true,
      });

      securityProfileRepository.findOne.mockResolvedValue({
        user_id: supervisorId,
        pin_hash: await bcrypt.hash('123456', 10),
        is_pin_enabled: true,
        custom_permissions: [], // no overrides
      });

      await expect(
        service.authorizeOverride(
          {
            supervisorId,
            credential: '123456',
            method: 'PIN',
            permissionRequired: AppPermission.SALES_VOID_INVOICE,
          },
          testTenantId,
          requestingUserId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows authorization if supervisor has permission via custom_permissions override', async () => {
      userRepository.findOne.mockResolvedValue({
        id: supervisorId,
        name: 'Cashier With Special Void Permission',
        role: UserRole.CASHIER,
        tenant_id: testTenantId,
        is_active: true,
      });

      securityProfileRepository.findOne.mockResolvedValue({
        user_id: supervisorId,
        pin_hash: await bcrypt.hash('123456', 10),
        is_pin_enabled: true,
        custom_permissions: [AppPermission.SALES_VOID_INVOICE],
      });

      const response = await service.authorizeOverride(
        {
          supervisorId,
          credential: '123456',
          method: 'PIN',
          permissionRequired: AppPermission.SALES_VOID_INVOICE,
        },
        testTenantId,
        requestingUserId,
      );

      expect(response.authorized).toBe(true);
    });

    it('returns the uniform 401 failure when supervisor does not exist in tenant or is inactive (S4: no enumeration)', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const error = await service
        .authorizeOverride(
          {
            supervisorId: 'non-existent',
            credential: '123456',
            method: 'PIN',
            permissionRequired: AppPermission.SALES_VOID_INVOICE,
          },
          testTenantId,
          requestingUserId,
        )
        .then(
          () => {
            throw new Error('Expected the override attempt to fail');
          },
          (e) => e as HttpException,
        );

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.getStatus()).toBe(401);
      expect(error.message).toBe('No se pudo autorizar la anulación');
    });

    it('throws UnauthorizedException when requested method is disabled on security profile', async () => {
      userRepository.findOne.mockResolvedValue({
        id: supervisorId,
        name: 'Manager Supervisor',
        role: UserRole.MANAGER,
        tenant_id: testTenantId,
        is_active: true,
      });

      securityProfileRepository.findOne.mockResolvedValue({
        user_id: supervisorId,
        is_pin_enabled: false, // PIN is disabled
        pin_hash: await bcrypt.hash('123456', 10),
        custom_permissions: [],
      });

      await expect(
        service.authorizeOverride(
          {
            supervisorId,
            credential: '123456',
            method: 'PIN',
            permissionRequired: AppPermission.SALES_VOID_INVOICE,
          },
          testTenantId,
          requestingUserId,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // S4 (security-hardening-batch2): supervisor override verification
  // hardening. Failure responses are uniform (no supervisor enumeration)
  // and failed verification attempts are counted per requesting user and
  // terminal with a fixed window that returns 429 when exhausted.
  describe('S4 hardening: uniform failures and failed-attempt window', () => {
    const GENERIC_FAILURE_MESSAGE = 'No se pudo autorizar la anulación';

    const stubActiveManagerSupervisor = async () => {
      userRepository.findOne.mockResolvedValue({
        id: supervisorId,
        name: 'Manager Supervisor',
        role: UserRole.MANAGER,
        tenant_id: testTenantId,
        is_active: true,
      });
      securityProfileRepository.findOne.mockResolvedValue({
        user_id: supervisorId,
        pin_hash: await bcrypt.hash('123456', 10),
        is_pin_enabled: true,
        custom_permissions: [],
      });
    };

    const attempt = (credential: string, requestingUser = requestingUserId) =>
      service.authorizeOverride(
        {
          supervisorId,
          credential,
          method: 'PIN',
          permissionRequired: AppPermission.SALES_VOID_INVOICE,
        },
        testTenantId,
        requestingUser,
      );

    // Same as `attempt`, but typed for the failure branch: tests that
    // inspect the thrown HttpException use this helper.
    const attemptFailure = async (
      credential: string,
      requestingUser = requestingUserId,
    ): Promise<HttpException> => {
      try {
        await service.authorizeOverride(
          {
            supervisorId,
            credential,
            method: 'PIN',
            permissionRequired: AppPermission.SALES_VOID_INVOICE,
          },
          testTenantId,
          requestingUser,
        );
      } catch (e) {
        return e as HttpException;
      }
      throw new Error('Expected the override attempt to fail');
    };

    it('returns the same 401 generic failure for an unknown supervisor and a wrong PIN (no enumeration)', async () => {
      await stubActiveManagerSupervisor();

      const wrongPinError = await attemptFailure('wrong-pin');
      expect(wrongPinError).toBeInstanceOf(UnauthorizedException);
      expect(wrongPinError.getStatus()).toBe(401);
      expect(wrongPinError.message).toBe(GENERIC_FAILURE_MESSAGE);

      userRepository.findOne.mockResolvedValue(null);
      const unknownSupervisorError = await attemptFailure('123456');
      expect(unknownSupervisorError).toBeInstanceOf(UnauthorizedException);
      expect(unknownSupervisorError.getStatus()).toBe(401);
      expect(unknownSupervisorError.message).toBe(GENERIC_FAILURE_MESSAGE);

      // Same wire shape: nothing in the response distinguishes an unknown
      // supervisor from a wrong credential.
      expect(unknownSupervisorError.getResponse()).toEqual(
        wrongPinError.getResponse(),
      );
    });

    it('keeps the structured rejection reason in the audit log while hiding it from the response', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(attempt('123456')).rejects.toThrow(UnauthorizedException);

      expect(auditRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SUPERVISOR_OVERRIDE_REJECTED',
          metadata: expect.objectContaining({
            reason: 'Supervisor not found or inactive',
          }),
        }),
      );
    });

    it('returns 429 with a retry-window hint after 5 failed attempts for the same user and terminal', async () => {
      await stubActiveManagerSupervisor();

      for (let i = 0; i < 5; i++) {
        await expect(attempt('wrong-pin')).rejects.toThrow(
          UnauthorizedException,
        );
      }
      // Each of the 5 verification attempts wrote its rejection audit row.
      expect(auditRepository.save).toHaveBeenCalledTimes(5);

      const blocked = await attemptFailure('wrong-pin');
      expect(blocked.getStatus()).toBe(429);
      expect(blocked.getResponse()).toMatchObject({
        statusCode: 429,
        retryAfterSeconds: expect.any(Number),
      });
      expect(blocked.message).toContain('segundos');
      // The blocked attempt never reaches verification, so no sixth audit
      // rejection row is written for it.
      expect(auditRepository.save).toHaveBeenCalledTimes(5);
    });

    it('counts failures per requesting user and terminal, not globally', async () => {
      await stubActiveManagerSupervisor();

      for (let i = 0; i < 5; i++) {
        await expect(attempt('wrong-pin', 'cashier-A')).rejects.toThrow(
          UnauthorizedException,
        );
      }

      // A different requesting user is not locked out by cashier-A's window.
      await expect(attempt('wrong-pin', 'cashier-B')).rejects.toThrow(
        UnauthorizedException,
      );

      // cashier-A's window is exhausted: the next attempt is throttled.
      const blocked = await attemptFailure('wrong-pin', 'cashier-A');
      expect(blocked.getStatus()).toBe(429);
    });

    it('counts insufficient-permission failures toward the same window', async () => {
      userRepository.findOne.mockResolvedValue({
        id: supervisorId,
        name: 'Cashier User',
        role: UserRole.CASHIER, // no default permissions
        tenant_id: testTenantId,
        is_active: true,
      });
      securityProfileRepository.findOne.mockResolvedValue({
        user_id: supervisorId,
        pin_hash: await bcrypt.hash('123456', 10),
        is_pin_enabled: true,
        custom_permissions: [],
      });

      for (let i = 0; i < 5; i++) {
        await expect(attempt('123456')).rejects.toThrow(ForbiddenException);
      }

      const blocked = await attemptFailure('123456');
      expect(blocked.getStatus()).toBe(429);
    });

    it('resets the attempt window after a successful authorization', async () => {
      await stubActiveManagerSupervisor();

      for (let i = 0; i < 4; i++) {
        await expect(attempt('wrong-pin')).rejects.toThrow(
          UnauthorizedException,
        );
      }
      await expect(attempt('123456')).resolves.toMatchObject({
        authorized: true,
      });

      // The success cleared the counter: a full window of 5 new failures is
      // required before the user is locked out again.
      for (let i = 0; i < 5; i++) {
        await expect(attempt('wrong-pin')).rejects.toThrow(
          UnauthorizedException,
        );
      }
      const blocked = await attemptFailure('wrong-pin');
      expect(blocked.getStatus()).toBe(429);
    });
  });

  // Issue #512 T3 slice 9 rework: security_profiles is now tenant-RLS
  // FORCE-protected, so the supervisor and security-profile reads inside
  // authorizeOverride must run through the tenant-bound transaction manager.
  // This guard has RUNTIME teeth: it injects a fake DataSource whose
  // transaction() hands back a manager that records the set_config binding
  // and hands out instrumented repositories, while the pooled repositories
  // stand beside it as tripwires. If any read is reverted to the pooled
  // repository, the tripwire records the call and this test fails at
  // runtime, not at compile time.
  describe('tenant transaction binding', () => {
    it('binds the supervisor and profile reads through the tenant transaction; pooled repos stay silent', async () => {
      // Pooled tripwires: any call here means a read or the audit write
      // escaped a bound transaction and would hit RLS with no tenant bound.
      const pooledUser = { findOne: jest.fn() };
      const pooledProfile = { findOne: jest.fn() };
      // Issue #581: the audit write is bound too, so the pooled audit repo
      // must stay silent.
      const pooledAudit = { save: jest.fn().mockResolvedValue({ id: 'a1' }) };

      const hashedPin = await bcrypt.hash('123456', 10);
      const boundUser = {
        findOne: jest.fn().mockResolvedValue({
          id: supervisorId,
          name: 'Manager Supervisor',
          role: UserRole.MANAGER,
          tenant_id: testTenantId,
          is_active: true,
        }),
      };
      const boundProfile = {
        findOne: jest.fn().mockResolvedValue({
          user_id: supervisorId,
          pin_hash: hashedPin,
          is_pin_enabled: true,
          custom_permissions: [],
        }),
      };

      const setConfigCalls: Array<[string, string[]]> = [];
      const boundAudit = { save: jest.fn().mockResolvedValue({ id: 'a1' }) };
      const boundManager = {
        query: jest.fn(async (sql: string, params: string[]) => {
          setConfigCalls.push([sql, params]);
          return [];
        }),
        getRepository: jest.fn((entity: unknown) =>
          entity === User
            ? boundUser
            : entity === SecurityProfile
              ? boundProfile
              : entity === AuditLog
                ? boundAudit
                : null,
        ),
      };
      const boundDataSource = {
        transaction: jest.fn(
          async (work: (manager: unknown) => Promise<unknown>) =>
            work(boundManager),
        ),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SupervisorOverrideService,
          { provide: getRepositoryToken(User), useValue: pooledUser },
          {
            provide: getRepositoryToken(SecurityProfile),
            useValue: pooledProfile,
          },
          { provide: getRepositoryToken(AuditLog), useValue: pooledAudit },
          { provide: DataSource, useValue: boundDataSource },
          { provide: JwtService, useValue: jwtService },
          { provide: IDENTITY_JWT_CONFIG, useValue: mockJwtConfig },
        ],
      }).compile();
      const bound = module.get<SupervisorOverrideService>(
        SupervisorOverrideService,
      );

      const response = await bound.authorizeOverride(
        {
          supervisorId,
          credential: '123456',
          method: 'PIN',
          permissionRequired: AppPermission.SALES_VOID_INVOICE,
          context: { reason: 'binding guard' },
        },
        testTenantId,
        requestingUserId,
      );
      expect(response.authorized).toBe(true);

      // ONE transaction for the read unit and ONE for the audit write,
      // each binding the tenant context exactly once with the production
      // set_config SQL (issue #581: the write is bound too).
      expect(boundDataSource.transaction).toHaveBeenCalledTimes(2);
      expect(setConfigCalls).toHaveLength(2);
      expect(setConfigCalls[0][0]).toBe(TENANT_CONTEXT_SET_CONFIG_SQL);
      expect(setConfigCalls[0][1]).toEqual([testTenantId]);
      expect(setConfigCalls[1][0]).toBe(TENANT_CONTEXT_SET_CONFIG_SQL);
      expect(setConfigCalls[1][1]).toEqual([testTenantId]);

      // Both reads resolved through the bound manager's repositories.
      expect(boundUser.findOne).toHaveBeenCalledTimes(1);
      expect(boundProfile.findOne).toHaveBeenCalledTimes(1);
      // The audit write resolved through the bound manager as well.
      expect(boundAudit.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SUPERVISOR_OVERRIDE_APPROVED',
          tenant_id: testTenantId,
        }),
      );

      // RUNTIME TEETH: the pooled read tripwires stayed silent. A reverted
      // read or write lands here and fails this assertion.
      expect(pooledUser.findOne).not.toHaveBeenCalled();
      expect(pooledProfile.findOne).not.toHaveBeenCalled();
      expect(pooledAudit.save).not.toHaveBeenCalled();
    });
  });
});
