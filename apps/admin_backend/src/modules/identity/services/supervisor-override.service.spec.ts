import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { SupervisorOverrideService } from './supervisor-override.service';
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupervisorOverrideService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        {
          provide: getRepositoryToken(SecurityProfile),
          useValue: securityProfileRepository,
        },
        { provide: getRepositoryToken(AuditLog), useValue: auditRepository },
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

    it('throws NotFoundException when supervisor does not exist in tenant or is inactive', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.authorizeOverride(
          {
            supervisorId: 'non-existent',
            credential: '123456',
            method: 'PIN',
            permissionRequired: AppPermission.SALES_VOID_INVOICE,
          },
          testTenantId,
          requestingUserId,
        ),
      ).rejects.toThrow(NotFoundException);
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
});
