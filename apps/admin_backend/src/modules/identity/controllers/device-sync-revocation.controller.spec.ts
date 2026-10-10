import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  GUARDS_METADATA,
  INTERCEPTORS_METADATA,
} from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { DeviceSyncRevocationController } from './device-sync-revocation.controller';
import { DeviceSyncCredentialService } from '../services/device-sync-credential.service';
import { RevokeDeviceCredentialDto } from '../dto/revoke-device-credential.dto';
import { AuthGuard } from '../guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../guards/authoritative-current-user.guard';
import { RolesGuard } from '../guards/roles.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { ROLES_KEY } from '../../../core/decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { UserRole } from '../entities/user.entity';
import { AppPermission } from '../security/permissions.enum';
import {
  DeviceSyncCredential,
  DeviceSyncCredentialStatus,
} from '../entities/device-sync-credential.entity';
import { TenantTerminalDto } from '../dto/tenant-terminal.dto';
import {
  IDENTITY_JWT_CONFIG,
  type IdentityJwtConfig,
} from '../config/identity-jwt.config';
import { CurrentUserAuthorizationService } from '../services/current-user-authorization.service';

describe('DeviceSyncRevocationController (B17-02)', () => {
  let controller: DeviceSyncRevocationController;

  const mockService = {
    revokeCredential: jest.fn(),
    listTenantTerminals: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeviceSyncRevocationController],
      providers: [
        Reflector,
        AuthGuard,
        AuthoritativeCurrentUserGuard,
        RolesGuard,
        PermissionsGuard,
        {
          provide: JwtService,
          useValue: {
            verifyAsync: jest.fn(),
            sign: jest.fn(),
          },
        },
        {
          provide: IDENTITY_JWT_CONFIG,
          useValue: {
            secret: 'test-only-jwt-secret-with-at-least-thirty-two-bytes',
            issuer: 'omnifood-admin-test',
            audience: 'omnifood-pos-test',
            accessTokenTtlSeconds: 3600,
            refreshTokenTtlSeconds: 604800,
            clockToleranceSeconds: 5,
            algorithm: 'HS256',
          } satisfies IdentityJwtConfig,
        },
        {
          provide: CurrentUserAuthorizationService,
          useValue: { authorize: jest.fn((token: unknown) => token) },
        },
        {
          provide: DeviceSyncCredentialService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<DeviceSyncRevocationController>(
      DeviceSyncRevocationController,
    );
    jest.clearAllMocks();
  });

  describe('route metadata', () => {
    it('requires the OWNER role for revocation (method-level)', () => {
      expect(
        Reflect.getMetadata(
          ROLES_KEY,
          DeviceSyncRevocationController.prototype.revoke,
        ),
      ).toEqual([UserRole.OWNER]);
    });

    it('requires the DEVICE_SYNC_REVOKE permission for revocation (method-level)', () => {
      expect(
        Reflect.getMetadata(
          PERMISSIONS_KEY,
          DeviceSyncRevocationController.prototype.revoke,
        ),
      ).toEqual([AppPermission.DEVICE_SYNC_REVOKE]);
    });

    it('allows OWNER and MANAGER roles on listTerminals without the revoke permission', () => {
      expect(
        Reflect.getMetadata(
          ROLES_KEY,
          DeviceSyncRevocationController.prototype.listTerminals,
        ),
      ).toEqual([UserRole.OWNER, UserRole.MANAGER]);
      expect(
        Reflect.getMetadata(
          PERMISSIONS_KEY,
          DeviceSyncRevocationController.prototype.listTerminals,
        ),
      ).toBeUndefined();
    });

    it('is guarded by AuthGuard, AuthoritativeCurrentUserGuard, RolesGuard and PermissionsGuard in order', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        DeviceSyncRevocationController,
      ) as Array<new (...args: never[]) => unknown>;

      expect(guards).toEqual([
        AuthGuard,
        AuthoritativeCurrentUserGuard,
        RolesGuard,
        PermissionsGuard,
      ]);
    });

    it('applies the TenantInterceptor', () => {
      const interceptors = Reflect.getMetadata(
        INTERCEPTORS_METADATA,
        DeviceSyncRevocationController,
      ) as Array<new (...args: never[]) => unknown>;

      expect(interceptors).toEqual([TenantInterceptor]);
    });
  });

  describe('listTerminals execution', () => {
    const tenantId = 'tenant-100';

    it('delegates to deviceSyncCredentialService.listTenantTerminals with the tenant id', async () => {
      const terminals: TenantTerminalDto[] = [
        {
          terminalId: 'term-1',
          label: 'Caja 1',
          credentialId: 'cred-1',
          credentialVersion: 3,
          status: DeviceSyncCredentialStatus.ACTIVE,
          issuedAt: new Date('2025-01-01T00:00:00Z'),
          expiresAt: new Date('2026-01-01T00:00:00Z'),
          revokedAt: null,
          revocationReason: null,
          posBuild: null,
          freshnessState: 'COMPLETE',
          acceptedThroughSequence: 42,
          lastReceiptAt: '2025-01-02T00:00:00Z',
          hasDeclaredGaps: false,
          hasInventoryPending: false,
          inventoryPendingCount: 0,
        },
      ];
      mockService.listTenantTerminals.mockResolvedValue(terminals);

      const result = await controller.listTerminals(tenantId);

      expect(mockService.listTenantTerminals).toHaveBeenCalledTimes(1);
      expect(mockService.listTenantTerminals).toHaveBeenCalledWith(tenantId);
      expect(result).toBe(terminals);
    });

    it('forwards service exceptions for the terminal listing', async () => {
      mockService.listTenantTerminals.mockRejectedValue(
        new NotFoundException('Tenant context is required'),
      );

      await expect(controller.listTerminals(tenantId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('revoke execution', () => {
    const tenantId = 'tenant-100';
    const credentialId = 'cred-1234-5678';
    const dto: RevokeDeviceCredentialDto = {
      reason: 'Caja averiada por derrame',
    };

    it('delegates to deviceSyncCredentialService.revokeCredential with tenant, credential id and reason', async () => {
      const revokedCredential = { id: credentialId, status: 'REVOKED' };
      mockService.revokeCredential.mockResolvedValue(revokedCredential);

      const result = await controller.revoke(tenantId, credentialId, dto);

      expect(mockService.revokeCredential).toHaveBeenCalledTimes(1);
      expect(mockService.revokeCredential).toHaveBeenCalledWith(
        tenantId,
        credentialId,
        dto.reason,
      );
      expect(result).toBe(revokedCredential);
    });

    it('returns the updated credential from the service', async () => {
      const updatedCredential = {
        id: credentialId,
        tenantId,
        status: 'REVOKED',
        revocationReason: dto.reason,
      } as unknown as DeviceSyncCredential;
      mockService.revokeCredential.mockResolvedValue(updatedCredential);

      const result = await controller.revoke(tenantId, credentialId, dto);

      expect(result).toEqual(updatedCredential);
      expect(result.status).toBe('REVOKED');
      expect(result.revocationReason).toBe(dto.reason);
    });

    it('forwards NotFoundException when the credential does not exist for the tenant', async () => {
      mockService.revokeCredential.mockRejectedValue(
        new NotFoundException(
          `Credential '${credentialId}' not found for tenant`,
        ),
      );

      await expect(
        controller.revoke(tenantId, credentialId, dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('forwards ConflictException when the credential is already revoked or retired', async () => {
      mockService.revokeCredential.mockRejectedValue(
        new ConflictException('Credential is already revoked'),
      );

      await expect(
        controller.revoke(tenantId, credentialId, dto),
      ).rejects.toThrow(ConflictException);
    });

    it('forwards BadRequestException when the service rejects a missing tenant context or reason', async () => {
      mockService.revokeCredential.mockRejectedValue(
        new BadRequestException('Revocation reason is required'),
      );

      await expect(
        controller.revoke(tenantId, credentialId, dto),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
