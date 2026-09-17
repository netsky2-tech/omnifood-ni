import {
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  DeviceSyncCredential,
  DeviceSyncCredentialStatus,
} from '../entities/device-sync-credential.entity';
import {
  DeviceSyncCredentialEvent,
  DeviceSyncCredentialEventType,
} from '../entities/device-sync-credential-event';
import { DeviceCredentialRecoveryRequiredException } from '../exceptions/device-credential-recovery-required.exception';
import {
  ActivationAttempt,
  ActivationAttemptStatus,
} from '../../onboarding/entities/activation-attempt.entity';
import { DeviceSyncCredentialService } from './device-sync-credential.service';
import { DeviceCredentialRevokedException } from '../exceptions/device-credential-revoked.exception';
import {
  DEVICE_SYNC_JWT_CONFIG,
  DeviceSyncJwtConfig,
} from '../config/device-sync-jwt.config';
import {
  compareDeviceRenewalSecret,
  hashDeviceRenewalSecret,
} from '../security/device-renewal-secret-verifier';
import { isDeviceSyncAccessTokenPayload } from '../security/jwt-token.types';

describe('DeviceSyncCredentialService', () => {
  let service: DeviceSyncCredentialService;
  let credentialRepo: any;
  let eventRepo: any;
  let attemptRepo: any;
  let dataSource: any;
  let mockManager: any;
  let jwtService: JwtService;

  const mockJwtConfig: DeviceSyncJwtConfig = {
    secret: 'test-secret-at-least-thirty-two-bytes-long',
    issuer: 'omnifood-admin',
    audience: 'omnifood-device-sync',
    accessTokenTtlSeconds: 900,
    renewalTtlSeconds: 2592000,
    clockToleranceSeconds: 5,
    algorithm: 'HS256',
  };

  const sampleAttempt: Partial<ActivationAttempt> = {
    id: 'attempt-uuid-1',
    tenantId: 'tenant-100',
    status: ActivationAttemptStatus.PASS,
    candidateTerminalId: 'term-pos-01',
    trustedTerminalId: 'term-pos-01',
  };

  beforeEach(async () => {
    credentialRepo = {
      create: jest.fn((dto) => ({ ...dto, id: 'cred-uuid-1' })),
      save: jest.fn((entity) =>
        Promise.resolve({ ...entity, id: entity.id || 'cred-uuid-1' }),
      ),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };

    eventRepo = {
      create: jest.fn((dto) => ({
        ...dto,
        id: 'event-uuid-1',
        occurredAt: new Date(),
      })),
      save: jest.fn((entity) =>
        Promise.resolve({ ...entity, id: 'event-uuid-1' }),
      ),
    };

    attemptRepo = {
      findOne: jest.fn(),
    };

    mockManager = {
      getRepository: jest.fn((entity) => {
        if (entity === DeviceSyncCredential) return credentialRepo;
        if (entity === DeviceSyncCredentialEvent) return eventRepo;
        if (entity === ActivationAttempt) return attemptRepo;
        throw new Error(`Unknown entity: ${entity}`);
      }),
      query: jest.fn().mockResolvedValue([]),
    };

    dataSource = {
      transaction: jest.fn(async (cb: (mgr: any) => Promise<any>) => {
        return await cb(mockManager);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceSyncCredentialService,
        JwtService,
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: getRepositoryToken(DeviceSyncCredential),
          useValue: credentialRepo,
        },
        {
          provide: getRepositoryToken(DeviceSyncCredentialEvent),
          useValue: eventRepo,
        },
        {
          provide: getRepositoryToken(ActivationAttempt),
          useValue: attemptRepo,
        },
        { provide: DEVICE_SYNC_JWT_CONFIG, useValue: mockJwtConfig },
      ],
    }).compile();

    service = module.get<DeviceSyncCredentialService>(
      DeviceSyncCredentialService,
    );
    jwtService = module.get<JwtService>(JwtService);
  });

  describe('provisionCredential', () => {
    it('provisions high-entropy credential linked to PASS ActivationAttempt with status PENDING, derives expiresAt server-side, and records audit event in one transaction', async () => {
      attemptRepo.findOne.mockResolvedValue({
        ...sampleAttempt,
        status: ActivationAttemptStatus.PASS,
      });
      credentialRepo.find.mockResolvedValue([]); // No existing credential

      const result = await service.provisionCredential({
        activationAttemptId: 'attempt-uuid-1',
        tenantId: 'tenant-100',
      });

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);

      expect(result.renewalSecret).toBeDefined();
      expect(typeof result.renewalSecret).toBe('string');
      expect(result.renewalSecret.length).toBeGreaterThanOrEqual(64);

      // Verify the returned entity does not expose raw secret
      expect((result.credential as any).renewalSecret).toBeUndefined();
      expect(result.credential.renewalSecretHash).toMatch(/^\$2[aby]\$\d{2}\$/);

      // Verify the hash matches the generated raw secret
      const isMatch = await compareDeviceRenewalSecret(
        result.renewalSecret,
        result.credential.renewalSecretHash,
      );
      expect(isMatch).toBe(true);

      // Verify status is PENDING, never ACTIVE initially
      expect(result.credential.status).toBe(DeviceSyncCredentialStatus.PENDING);
      expect(result.credential.scopes).toEqual(['sync:push', 'sync:pull']);
      expect(result.credential.version).toBe(1);
      expect(result.credential.tenantId).toBe('tenant-100');
      expect(result.credential.activationAttemptId).toBe('attempt-uuid-1');

      // Verify expiresAt was derived server-side from renewalTtlSeconds
      expect(result.credential.expiresAt).toBeInstanceOf(Date);

      // Verify audit event persisted in the same transaction
      expect(eventRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-100',
          credentialId: 'cred-uuid-1',
          eventType: DeviceSyncCredentialEventType.PROVISIONED,
          metadata: expect.objectContaining({
            deviceId: 'term-pos-01',
            activationAttemptId: 'attempt-uuid-1',
          }),
        }),
      );
    });

    it('provisions credential with status PENDING when ActivationAttempt has status PASS_WITH_WARNING', async () => {
      attemptRepo.findOne.mockResolvedValue({
        ...sampleAttempt,
        status: ActivationAttemptStatus.PASS_WITH_WARNING,
      });
      credentialRepo.find.mockResolvedValue([]);

      const result = await service.provisionCredential({
        activationAttemptId: 'attempt-uuid-1',
        tenantId: 'tenant-100',
      });

      expect(result.credential).toBeDefined();
      expect(result.credential.status).toBe(DeviceSyncCredentialStatus.PENDING);
      expect(result.renewalSecret).toBeDefined();
    });

    it('returns no-op with no secret or new row when credential is ACTIVE already', async () => {
      attemptRepo.findOne.mockResolvedValue({
        ...sampleAttempt,
        status: ActivationAttemptStatus.PASS,
      });
      const existingCredential = {
        id: 'cred-uuid-active',
        tenantId: 'tenant-100',
        activationAttemptId: 'attempt-uuid-1',
        renewalSecretHash: '$2b$10$existinghashplaceholder',
        version: 1,
        status: DeviceSyncCredentialStatus.ACTIVE,
        scopes: ['sync:push', 'sync:pull'],
        expiresAt: new Date(Date.now() + 100000),
      };
      credentialRepo.find.mockResolvedValue([existingCredential]);

      const result = await service.provisionCredential({
        activationAttemptId: 'attempt-uuid-1',
        tenantId: 'tenant-100',
      });

      expect(result.isNoOp).toBe(true);
      expect(result.renewalSecret).toBeUndefined();
      expect(result.credential.id).toBe('cred-uuid-active');
      expect(result.credential.status).toBe(DeviceSyncCredentialStatus.ACTIVE);
      expect(credentialRepo.create).not.toHaveBeenCalled();
      expect(eventRepo.save).not.toHaveBeenCalled();
    });

    it('replaces PENDING credential: atomically retires old pending and issues N+1 pending with new secret', async () => {
      attemptRepo.findOne.mockResolvedValue({
        ...sampleAttempt,
        status: ActivationAttemptStatus.PASS,
      });
      const existingPending = {
        id: 'cred-uuid-pending-1',
        tenantId: 'tenant-100',
        activationAttemptId: 'attempt-uuid-1',
        renewalSecretHash: '$2b$10$existinghashplaceholder',
        version: 1,
        status: DeviceSyncCredentialStatus.PENDING,
        scopes: ['sync:push', 'sync:pull'],
      };
      credentialRepo.find.mockResolvedValue([existingPending]);

      const result = await service.provisionCredential({
        activationAttemptId: 'attempt-uuid-1',
        tenantId: 'tenant-100',
      });

      expect(result.isNoOp).toBeFalsy();
      expect(result.renewalSecret).toBeDefined();
      expect(result.credential.version).toBe(2);
      expect(result.credential.status).toBe(DeviceSyncCredentialStatus.PENDING);

      // Verify old pending was retired
      expect(existingPending.status).toBe(DeviceSyncCredentialStatus.RETIRED);
      expect(credentialRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'cred-uuid-pending-1',
          status: DeviceSyncCredentialStatus.RETIRED,
        }),
      );

      // Verify audit events: old RETIRED and new PROVISIONED
      expect(eventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          credentialId: 'cred-uuid-pending-1',
          eventType: DeviceSyncCredentialEventType.RETIRED,
        }),
      );
      expect(eventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: DeviceSyncCredentialEventType.PROVISIONED,
          metadata: expect.objectContaining({
            version: 2,
          }),
        }),
      );
    });

    it('rejects provisioning with DeviceCredentialRecoveryRequiredException when latest credential is REVOKED', async () => {
      attemptRepo.findOne.mockResolvedValue({
        ...sampleAttempt,
        status: ActivationAttemptStatus.PASS,
      });
      const existingRevoked = {
        id: 'cred-uuid-revoked',
        tenantId: 'tenant-100',
        activationAttemptId: 'attempt-uuid-1',
        version: 1,
        status: DeviceSyncCredentialStatus.REVOKED,
      };
      credentialRepo.find.mockResolvedValue([existingRevoked]);

      await expect(
        service.provisionCredential({
          activationAttemptId: 'attempt-uuid-1',
          tenantId: 'tenant-100',
        }),
      ).rejects.toBeInstanceOf(DeviceCredentialRecoveryRequiredException);
    });

    it('rejects provisioning with DeviceCredentialRecoveryRequiredException when latest credential is RETIRED', async () => {
      attemptRepo.findOne.mockResolvedValue({
        ...sampleAttempt,
        status: ActivationAttemptStatus.PASS,
      });
      const existingRetired = {
        id: 'cred-uuid-retired',
        tenantId: 'tenant-100',
        activationAttemptId: 'attempt-uuid-1',
        version: 1,
        status: DeviceSyncCredentialStatus.RETIRED,
      };
      credentialRepo.find.mockResolvedValue([existingRetired]);

      await expect(
        service.provisionCredential({
          activationAttemptId: 'attempt-uuid-1',
          tenantId: 'tenant-100',
        }),
      ).rejects.toBeInstanceOf(DeviceCredentialRecoveryRequiredException);
    });

    it('rejects provisioning when ActivationAttempt is not found', async () => {
      attemptRepo.findOne.mockResolvedValue(null);

      await expect(
        service.provisionCredential({
          activationAttemptId: 'non-existent',
          tenantId: 'tenant-100',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each([null, undefined, '', '   '])(
      'rejects provisioning when ActivationAttempt has blank trustedTerminalId (%p)',
      async (trustedTerminalId) => {
        attemptRepo.findOne.mockResolvedValue({
          ...sampleAttempt,
          status: ActivationAttemptStatus.PASS,
          trustedTerminalId,
        });

        await expect(
          service.provisionCredential({
            activationAttemptId: 'attempt-uuid-1',
            tenantId: 'tenant-100',
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
      },
    );

    it('rolls back transaction if audit event creation/save fails during provisioning', async () => {
      attemptRepo.findOne.mockResolvedValue({
        ...sampleAttempt,
        status: ActivationAttemptStatus.PASS,
      });
      credentialRepo.findOne.mockResolvedValue(null);
      eventRepo.save.mockRejectedValue(new Error('Event log DB disk full'));

      await expect(
        service.provisionCredential({
          activationAttemptId: 'attempt-uuid-1',
          tenantId: 'tenant-100',
        }),
      ).rejects.toThrow('Event log DB disk full');
    });
  });

  describe('renewAccessToken (exchange)', () => {
    let activeCredentialWithAttempt: DeviceSyncCredential;
    let validRenewalSecret: string;

    beforeEach(async () => {
      validRenewalSecret = 'a'.repeat(64);
      const hash = await hashDeviceRenewalSecret(validRenewalSecret);

      activeCredentialWithAttempt = {
        id: 'cred-uuid-1',
        tenantId: 'tenant-100',
        activationAttemptId: 'attempt-uuid-1',
        activationAttempt: sampleAttempt as ActivationAttempt,
        renewalSecretHash: hash,
        scopes: ['sync:push', 'sync:pull'],
        version: 1,
        status: DeviceSyncCredentialStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 86400000), // tomorrow
        issuedAt: new Date(),
        rotatedAt: null,
        revokedAt: null,
        revocationReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    it('uses declarative tenant as transaction-local RLS lookup partition, verifies secret, validates bindings, and returns clean DeviceSyncPrincipal', async () => {
      credentialRepo.findOne.mockResolvedValue(activeCredentialWithAttempt);

      const response = await service.renewAccessToken({
        credentialId: 'cred-uuid-1',
        renewalSecret: validRenewalSecret,
        declarativeTenantId: 'tenant-100',
        declarativeDeviceId: 'term-pos-01',
      });

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);

      // Verify transaction-local set_config was called with declarative tenant for RLS partitioning
      expect(mockManager.query).toHaveBeenCalledWith(
        "SELECT set_config('app.tenant_id', $1, true)",
        ['tenant-100'],
      );

      expect(response.tokenType).toBe('Bearer');
      expect(response.expiresIn).toBe(mockJwtConfig.accessTokenTtlSeconds);
      expect(response.accessToken).toBeDefined();

      // Verify token payload using JwtService and strict claims validator
      const decoded = jwtService.verify(response.accessToken, {
        secret: mockJwtConfig.secret,
        algorithms: [mockJwtConfig.algorithm],
        audience: mockJwtConfig.audience,
        issuer: mockJwtConfig.issuer,
      });

      expect(
        isDeviceSyncAccessTokenPayload(
          decoded,
          mockJwtConfig.issuer,
          mockJwtConfig.audience,
        ),
      ).toBe(true);
      expect(decoded.sub).toBe('cred-uuid-1');
      expect(decoded.principal_type).toBe('device_sync');
      expect(decoded.token_type).toBe('device_sync_access');
      expect(decoded.tenant_id).toBe('tenant-100');
      expect(decoded.device_id).toBe('term-pos-01');
      expect(decoded.scopes).toEqual(['sync:push', 'sync:pull']);
      expect(decoded.credential_version).toBe(1);
      expect(decoded.jti).toBeDefined();

      // Verify audience is dedicated device audience, NOT human audience
      expect(decoded.aud).toBe('omnifood-device-sync');

      // Verify DeviceSyncPrincipal has no UserRole shape
      const principal = response.principal;
      expect(principal.principalType).toBe('DEVICE_SYNC');
      expect(principal.credentialId).toBe('cred-uuid-1');
      expect(principal.tenantId).toBe('tenant-100');
      expect(principal.deviceId).toBe('term-pos-01');
      expect(principal.scopes).toEqual(['sync:push', 'sync:pull']);
      expect(principal.credentialVersion).toBe(1);

      expect((principal as any).role).toBeUndefined();
      expect((principal as any).roles).toBeUndefined();
      expect((principal as any).permissions).toBeUndefined();
      expect((principal as any).impersonation).toBeUndefined();
      expect((principal as any).cashier).toBeUndefined();
      expect((principal as any).branch).toBeUndefined();

      // Verify lifecycle audit event
      expect(eventRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-100',
          credentialId: 'cred-uuid-1',
          eventType: DeviceSyncCredentialEventType.TOKEN_ISSUED,
          metadata: expect.objectContaining({
            deviceId: 'term-pos-01',
          }),
        }),
      );
    });

    it('rejects exchange when credential is not found', async () => {
      credentialRepo.findOne.mockResolvedValue(null);

      await expect(
        service.renewAccessToken({
          credentialId: 'non-existent-cred',
          renewalSecret: validRenewalSecret,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects exchange when joined ActivationAttempt has no trustedTerminalId', async () => {
      const credWithNoTerminal = {
        ...activeCredentialWithAttempt,
        activationAttempt: {
          ...sampleAttempt,
          trustedTerminalId: null,
        } as unknown as ActivationAttempt,
      };
      credentialRepo.findOne.mockResolvedValue(credWithNoTerminal);

      await expect(
        service.renewAccessToken({
          credentialId: 'cred-uuid-1',
          renewalSecret: validRenewalSecret,
        }),
      ).rejects.toThrow(
        'Canonical device identity is not established for credential',
      );
    });

    it('rejects exchange when credential has corrupted scopes in database', async () => {
      const credWithCorruptedScopes = {
        ...activeCredentialWithAttempt,
        scopes: ['sync:push', 'unauthorized:scope'],
      };
      credentialRepo.findOne.mockResolvedValue(credWithCorruptedScopes);

      await expect(
        service.renewAccessToken({
          credentialId: 'cred-uuid-1',
          renewalSecret: validRenewalSecret,
        }),
      ).rejects.toThrow('Device credential has corrupted scopes');
    });

    it('rejects exchange when renewal secret is invalid', async () => {
      credentialRepo.findOne.mockResolvedValue(activeCredentialWithAttempt);

      await expect(
        service.renewAccessToken({
          credentialId: 'cred-uuid-1',
          renewalSecret: 'wrong-secret-value-that-does-not-match',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects exchange when credential has expired', async () => {
      const expiredCred = {
        ...activeCredentialWithAttempt,
        expiresAt: new Date(Date.now() - 1000), // expired 1s ago
      };
      credentialRepo.findOne.mockResolvedValue(expiredCred);

      await expect(
        service.renewAccessToken({
          credentialId: 'cred-uuid-1',
          renewalSecret: validRenewalSecret,
        }),
      ).rejects.toThrow('Device credential has expired');
    });

    it('rejects exchange when credential status is REVOKED', async () => {
      const revokedCred = {
        ...activeCredentialWithAttempt,
        status: DeviceSyncCredentialStatus.REVOKED,
      };
      credentialRepo.findOne.mockResolvedValue(revokedCred);

      await expect(
        service.renewAccessToken({
          credentialId: 'cred-uuid-1',
          renewalSecret: validRenewalSecret,
        }),
      ).rejects.toThrow(DeviceCredentialRevokedException);
    });

    it.each([
      DeviceSyncCredentialStatus.PENDING,
      DeviceSyncCredentialStatus.RETIRED,
    ])(
      'rejects exchange when credential status is non-active (%s)',
      async (status) => {
        const nonActiveCred = {
          ...activeCredentialWithAttempt,
          status,
        };
        credentialRepo.findOne.mockResolvedValue(nonActiveCred);

        await expect(
          service.renewAccessToken({
            credentialId: 'cred-uuid-1',
            renewalSecret: validRenewalSecret,
          }),
        ).rejects.toThrow(`Device credential is ${status.toLowerCase()}`);
      },
    );

    it('rejects exchange when expectedCredentialVersion mismatches', async () => {
      credentialRepo.findOne.mockResolvedValue(activeCredentialWithAttempt);

      await expect(
        service.renewAccessToken({
          credentialId: 'cred-uuid-1',
          renewalSecret: validRenewalSecret,
          expectedCredentialVersion: 2, // actual is 1
        }),
      ).rejects.toThrow('Credential version mismatch');
    });

    it('rejects exchange when declarative tenant does not match credential tenant', async () => {
      credentialRepo.findOne.mockResolvedValue(activeCredentialWithAttempt);

      await expect(
        service.renewAccessToken({
          credentialId: 'cred-uuid-1',
          renewalSecret: validRenewalSecret,
          declarativeTenantId: 'forged-tenant-id',
        }),
      ).rejects.toThrow('Declarative tenant does not match credential binding');
    });

    it('rejects exchange when declarative device does not match canonical device identity', async () => {
      credentialRepo.findOne.mockResolvedValue(activeCredentialWithAttempt);

      await expect(
        service.renewAccessToken({
          credentialId: 'cred-uuid-1',
          renewalSecret: validRenewalSecret,
          declarativeDeviceId: 'forged-device-id',
        }),
      ).rejects.toThrow(
        'Declarative device does not match canonical device identity',
      );
    });

    it('strictly derives device_id from joined ActivationAttempt.trustedTerminalId', async () => {
      const credWithSpecificTerminal = {
        ...activeCredentialWithAttempt,
        activationAttempt: {
          ...sampleAttempt,
          trustedTerminalId: 'canonical-trusted-terminal-xyz',
        } as ActivationAttempt,
      };
      credentialRepo.findOne.mockResolvedValue(credWithSpecificTerminal);

      const response = await service.renewAccessToken({
        credentialId: 'cred-uuid-1',
        renewalSecret: validRenewalSecret,
      });

      expect(response.principal.deviceId).toBe(
        'canonical-trusted-terminal-xyz',
      );
      const decoded = jwtService.verify(response.accessToken, {
        secret: mockJwtConfig.secret,
        algorithms: [mockJwtConfig.algorithm],
        audience: mockJwtConfig.audience,
        issuer: mockJwtConfig.issuer,
      });
      expect(decoded.device_id).toBe('canonical-trusted-terminal-xyz');
    });
  });

  describe('credential lifecycle management (rotation/revocation)', () => {
    it('requires tenant context and sets RLS before lookup when revoking credential', async () => {
      const cred = {
        id: 'cred-uuid-1',
        tenantId: 'tenant-100',
        status: DeviceSyncCredentialStatus.ACTIVE,
      };
      const callOrder: string[] = [];
      mockManager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('set_config')) callOrder.push('set_config');
        return [];
      });
      credentialRepo.findOne.mockImplementation(async () => {
        callOrder.push('findOne');
        return cred;
      });

      await service.revokeCredential(
        'tenant-100',
        'cred-uuid-1',
        'Device decommissioned',
      );

      expect(callOrder).toEqual(['set_config', 'findOne']);
      expect(mockManager.query).toHaveBeenCalledWith(
        "SELECT set_config('app.tenant_id', $1, true)",
        ['tenant-100'],
      );
      expect(credentialRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'cred-uuid-1', tenantId: 'tenant-100' },
      });
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(credentialRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: DeviceSyncCredentialStatus.REVOKED,
          revocationReason: 'Device decommissioned',
          revokedAt: expect.any(Date),
        }),
      );
      expect(eventRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-100',
          credentialId: 'cred-uuid-1',
          eventType: DeviceSyncCredentialEventType.REVOKED,
          metadata: expect.objectContaining({
            reason: 'Device decommissioned',
          }),
        }),
      );
    });

    it('rejects revocation when tenantId is empty or whitespace', async () => {
      await expect(
        service.revokeCredential('', 'cred-uuid-1', 'comp'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.revokeCredential('   ', 'cred-uuid-1', 'comp'),
      ).rejects.toThrow(BadRequestException);
    });

    it('requires tenant context and sets RLS before lookup when retiring credential', async () => {
      const cred = {
        id: 'cred-uuid-1',
        tenantId: 'tenant-100',
        status: DeviceSyncCredentialStatus.ACTIVE,
      };
      const callOrder: string[] = [];
      mockManager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('set_config')) callOrder.push('set_config');
        return [];
      });
      credentialRepo.findOne.mockImplementation(async () => {
        callOrder.push('findOne');
        return cred;
      });

      await service.retireCredential('tenant-100', 'cred-uuid-1');

      expect(callOrder).toEqual(['set_config', 'findOne']);
      expect(mockManager.query).toHaveBeenCalledWith(
        "SELECT set_config('app.tenant_id', $1, true)",
        ['tenant-100'],
      );
      expect(credentialRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'cred-uuid-1', tenantId: 'tenant-100' },
      });
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(credentialRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: DeviceSyncCredentialStatus.RETIRED,
          rotatedAt: expect.any(Date),
        }),
      );
      expect(eventRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-100',
          credentialId: 'cred-uuid-1',
          eventType: DeviceSyncCredentialEventType.RETIRED,
        }),
      );
    });

    it('rejects retirement when tenantId is empty or whitespace', async () => {
      await expect(service.retireCredential('', 'cred-uuid-1')).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        service.retireCredential('  ', 'cred-uuid-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rolls back revocation transaction if event save fails', async () => {
      const cred = {
        id: 'cred-uuid-1',
        tenantId: 'tenant-100',
        status: DeviceSyncCredentialStatus.ACTIVE,
      };
      credentialRepo.findOne.mockResolvedValue(cred);
      eventRepo.save.mockRejectedValue(new Error('Event insert failed'));

      await expect(
        service.revokeCredential('tenant-100', 'cred-uuid-1', 'comp'),
      ).rejects.toThrow('Event insert failed');
    });

    it('rolls back retirement transaction if event save fails', async () => {
      const cred = {
        id: 'cred-uuid-1',
        tenantId: 'tenant-100',
        status: DeviceSyncCredentialStatus.ACTIVE,
      };
      credentialRepo.findOne.mockResolvedValue(cred);
      eventRepo.save.mockRejectedValue(new Error('Event insert failed'));

      await expect(
        service.retireCredential('tenant-100', 'cred-uuid-1'),
      ).rejects.toThrow('Event insert failed');
    });
  });

  describe('confirmCredential', () => {
    const rawSecret =
      'valid-secret-64-characters-long-strictly-conforming-to-entropy-spec!!';
    let hashedSecret: string;

    beforeEach(async () => {
      hashedSecret = await hashDeviceRenewalSecret(rawSecret);
    });

    it('confirms PENDING credential: transitions status to ACTIVE, derives renewal expiresAt, and records CONFIRMED audit event', async () => {
      const pendingCredential = {
        id: 'cred-uuid-1',
        tenantId: 'tenant-100',
        activationAttemptId: 'attempt-uuid-1',
        renewalSecretHash: hashedSecret,
        version: 1,
        status: DeviceSyncCredentialStatus.PENDING,
        scopes: ['sync:push', 'sync:pull'],
        expiresAt: new Date(Date.now() + 60000), // not expired
      };
      credentialRepo.findOne.mockResolvedValue(pendingCredential);

      const confirmed = await service.confirmCredential({
        tenantId: 'tenant-100',
        activationAttemptId: 'attempt-uuid-1',
        credentialId: 'cred-uuid-1',
        credentialVersion: 1,
        renewalSecret: rawSecret,
        canonicalDeviceId: 'term-pos-01',
      });

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(confirmed.status).toBe(DeviceSyncCredentialStatus.ACTIVE);
      expect(credentialRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'cred-uuid-1',
          status: DeviceSyncCredentialStatus.ACTIVE,
        }),
      );
      expect(eventRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-100',
          credentialId: 'cred-uuid-1',
          eventType: DeviceSyncCredentialEventType.CONFIRMED,
          metadata: expect.objectContaining({
            deviceId: 'term-pos-01',
            activationAttemptId: 'attempt-uuid-1',
            version: 1,
          }),
        }),
      );
    });

    it('retries confirm on already ACTIVE credential idempotently with valid secret', async () => {
      const activeCredential = {
        id: 'cred-uuid-1',
        tenantId: 'tenant-100',
        activationAttemptId: 'attempt-uuid-1',
        renewalSecretHash: hashedSecret,
        version: 1,
        status: DeviceSyncCredentialStatus.ACTIVE,
        scopes: ['sync:push', 'sync:pull'],
        expiresAt: new Date(Date.now() + 100000),
      };
      credentialRepo.findOne.mockResolvedValue(activeCredential);

      const confirmed = await service.confirmCredential({
        tenantId: 'tenant-100',
        activationAttemptId: 'attempt-uuid-1',
        credentialId: 'cred-uuid-1',
        credentialVersion: 1,
        renewalSecret: rawSecret,
        canonicalDeviceId: 'term-pos-01',
      });

      expect(confirmed.status).toBe(DeviceSyncCredentialStatus.ACTIVE);
      // Idempotent: does not re-save or duplicate event
      expect(credentialRepo.save).not.toHaveBeenCalled();
      expect(eventRepo.save).not.toHaveBeenCalled();
    });

    it('rejects confirm when credential is not found', async () => {
      credentialRepo.findOne.mockResolvedValue(null);

      await expect(
        service.confirmCredential({
          tenantId: 'tenant-100',
          activationAttemptId: 'attempt-uuid-1',
          credentialId: 'cred-uuid-nonexistent',
          credentialVersion: 1,
          renewalSecret: rawSecret,
          canonicalDeviceId: 'term-pos-01',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects confirm when renewal secret is invalid', async () => {
      const pendingCredential = {
        id: 'cred-uuid-1',
        tenantId: 'tenant-100',
        activationAttemptId: 'attempt-uuid-1',
        renewalSecretHash: hashedSecret,
        version: 1,
        status: DeviceSyncCredentialStatus.PENDING,
        scopes: ['sync:push', 'sync:pull'],
        expiresAt: new Date(Date.now() + 60000),
      };
      credentialRepo.findOne.mockResolvedValue(pendingCredential);

      await expect(
        service.confirmCredential({
          tenantId: 'tenant-100',
          activationAttemptId: 'attempt-uuid-1',
          credentialId: 'cred-uuid-1',
          credentialVersion: 1,
          renewalSecret: 'wrong-secret',
          canonicalDeviceId: 'term-pos-01',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects confirm when credential version mismatches (e.g. stale version N)', async () => {
      const pendingCredential = {
        id: 'cred-uuid-1',
        tenantId: 'tenant-100',
        activationAttemptId: 'attempt-uuid-1',
        renewalSecretHash: hashedSecret,
        version: 2,
        status: DeviceSyncCredentialStatus.PENDING,
        scopes: ['sync:push', 'sync:pull'],
        expiresAt: new Date(Date.now() + 60000),
      };
      credentialRepo.findOne.mockResolvedValue(pendingCredential);

      await expect(
        service.confirmCredential({
          tenantId: 'tenant-100',
          activationAttemptId: 'attempt-uuid-1',
          credentialId: 'cred-uuid-1',
          credentialVersion: 1, // stale N
          renewalSecret: rawSecret,
          canonicalDeviceId: 'term-pos-01',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects confirm when credential status is RETIRED (superseded N cannot confirm)', async () => {
      const retiredCredential = {
        id: 'cred-uuid-1',
        tenantId: 'tenant-100',
        activationAttemptId: 'attempt-uuid-1',
        renewalSecretHash: hashedSecret,
        version: 1,
        status: DeviceSyncCredentialStatus.RETIRED,
        scopes: ['sync:push', 'sync:pull'],
        expiresAt: new Date(Date.now() + 60000),
      };
      credentialRepo.findOne.mockResolvedValue(retiredCredential);

      await expect(
        service.confirmCredential({
          tenantId: 'tenant-100',
          activationAttemptId: 'attempt-uuid-1',
          credentialId: 'cred-uuid-1',
          credentialVersion: 1,
          renewalSecret: rawSecret,
          canonicalDeviceId: 'term-pos-01',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects confirm when credential status is REVOKED', async () => {
      const revokedCredential = {
        id: 'cred-uuid-1',
        tenantId: 'tenant-100',
        activationAttemptId: 'attempt-uuid-1',
        renewalSecretHash: hashedSecret,
        version: 1,
        status: DeviceSyncCredentialStatus.REVOKED,
        scopes: ['sync:push', 'sync:pull'],
        expiresAt: new Date(Date.now() + 60000),
      };
      credentialRepo.findOne.mockResolvedValue(revokedCredential);

      await expect(
        service.confirmCredential({
          tenantId: 'tenant-100',
          activationAttemptId: 'attempt-uuid-1',
          credentialId: 'cred-uuid-1',
          credentialVersion: 1,
          renewalSecret: rawSecret,
          canonicalDeviceId: 'term-pos-01',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects confirm when pending credential has expired', async () => {
      const expiredCredential = {
        id: 'cred-uuid-1',
        tenantId: 'tenant-100',
        activationAttemptId: 'attempt-uuid-1',
        renewalSecretHash: hashedSecret,
        version: 1,
        status: DeviceSyncCredentialStatus.PENDING,
        scopes: ['sync:push', 'sync:pull'],
        expiresAt: new Date(Date.now() - 5000), // expired!
      };
      credentialRepo.findOne.mockResolvedValue(expiredCredential);

      await expect(
        service.confirmCredential({
          tenantId: 'tenant-100',
          activationAttemptId: 'attempt-uuid-1',
          credentialId: 'cred-uuid-1',
          credentialVersion: 1,
          renewalSecret: rawSecret,
          canonicalDeviceId: 'term-pos-01',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
