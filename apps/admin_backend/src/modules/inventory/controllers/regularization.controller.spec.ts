import { GUARDS_METADATA } from '@nestjs/common/constants';
import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { ROLES_KEY } from '../../../core/decorators/roles.decorator';
import { SYNC_SCOPES_KEY } from '../../identity/decorators/sync-scopes.decorator';
import { UserRole } from '../../identity/entities/user.entity';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { SyncTransportGuard } from '../../identity/guards/sync-transport.guard';
import { RegularizationController } from './regularization.controller';
import { KardexRegularizationService } from '../services/kardex-regularization.service';

import {
  IDENTITY_JWT_CONFIG,
  type IdentityJwtConfig,
} from '../../identity/config/identity-jwt.config';

describe('RegularizationController', () => {
  let controller: RegularizationController;

  const regularizationServiceMock = {
    getPendingQueue: jest.fn(),
    approveRegularization: jest.fn(),
    syncCorrections: jest.fn(),
  };

  const jwtServiceMock = {
    verifyAsync: jest.fn(),
  };

  const reflectorMock = {
    getAllAndOverride: jest.fn(),
  };

  const identityJwtConfig: IdentityJwtConfig = {
    secret: 'test-only-jwt-secret-with-at-least-thirty-two-bytes',
    issuer: 'omnifood-admin',
    audience: 'omnifood-pos',
    accessTokenTtlSeconds: 3600,
    refreshTokenTtlSeconds: 604800,
    clockToleranceSeconds: 5,
    algorithm: 'HS256',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RegularizationController],
      providers: [
        {
          provide: KardexRegularizationService,
          useValue: regularizationServiceMock,
        },
        {
          provide: IDENTITY_JWT_CONFIG,
          useValue: identityJwtConfig,
        },
        {
          provide: JwtService,
          useValue: jwtServiceMock,
        },
        {
          provide: Reflector,
          useValue: reflectorMock,
        },
      ],
    })
      // ST-06: the sync handler declares SyncTransportGuard; the testing
      // module must resolve it eagerly even in specs that only exercise the
      // human handlers.
      .overrideGuard(SyncTransportGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RegularizationController>(RegularizationController);
  });

  const handlerGuards = (handler: unknown): unknown[] =>
    (Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[] | undefined) ??
    [];

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ST-06: human authorization moved from the controller class to the two
  // human handlers so the sync handler can carry device transport instead.
  it('keeps AuthGuard and RolesGuard on the human pending and approve handlers', () => {
    expect(handlerGuards(controller.getPending)).toContain(AuthGuard);
    expect(handlerGuards(controller.getPending)).toContain(RolesGuard);
    expect(handlerGuards(controller.approve)).toContain(AuthGuard);
    expect(handlerGuards(controller.approve)).toContain(RolesGuard);
  });

  it('moves the sync handler to device transport with sync:push and no human gate', () => {
    const guards = handlerGuards(controller.syncCorrections);
    expect(guards).toContain(SyncTransportGuard);
    expect(guards).not.toContain(AuthGuard);
    expect(guards).not.toContain(RolesGuard);

    const scopes = Reflect.getMetadata(
      SYNC_SCOPES_KEY,
      controller.syncCorrections,
    );
    expect(scopes).toEqual(['sync:push']);

    const roles = Reflect.getMetadata(ROLES_KEY, controller.syncCorrections);
    expect(roles).toBeUndefined();
  });

  it('getPending delegates to service with tenantId and role metadata', async () => {
    const mockItems = [{ id: 'q-1', status: 'PENDING' }];
    regularizationServiceMock.getPendingQueue.mockResolvedValue(mockItems);

    const result = await controller.getPending('tenant-123');
    expect(result).toBe(mockItems);
    expect(regularizationServiceMock.getPendingQueue).toHaveBeenCalledWith(
      'tenant-123',
    );

    const roles = Reflect.getMetadata(ROLES_KEY, controller.getPending);
    expect(roles).toEqual([UserRole.OWNER, UserRole.MANAGER]);
  });

  it('approve delegates to service with userId, role, and authMethod from request', async () => {
    const mockCorrection = { id: 'corr-1', totalDeltaCostNio: 200 };
    regularizationServiceMock.approveRegularization.mockResolvedValue(
      mockCorrection,
    );

    const result = await controller.approve(
      'tenant-123',
      { queueId: 'queue-uuid-1', authMethod: 'PIN' },
      { user: { sub: 'user-supervisor-1', role: 'manager' } } as any,
    );

    expect(result).toBe(mockCorrection);
    expect(
      regularizationServiceMock.approveRegularization,
    ).toHaveBeenCalledWith('tenant-123', {
      queueId: 'queue-uuid-1',
      approvedByUserId: 'user-supervisor-1',
      role: 'manager',
      authMethod: 'PIN',
    });
  });

  describe('approve fail-closed actor derivation (ST-06)', () => {
    const approveDto = { queueId: 'queue-uuid-1', authMethod: 'PIN' };

    it('rejects a request without an authenticated principal', async () => {
      await expect(
        controller.approve('tenant-123', approveDto, {
          user: undefined,
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(
        regularizationServiceMock.approveRegularization,
      ).not.toHaveBeenCalled();
    });

    it('rejects a principal without a user id instead of substituting unknown-user', async () => {
      await expect(
        controller.approve('tenant-123', approveDto, {
          user: { role: 'manager' },
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(
        regularizationServiceMock.approveRegularization,
      ).not.toHaveBeenCalledWith(
        'tenant-123',
        expect.objectContaining({ approvedByUserId: 'unknown-user' }),
      );
    });

    it('rejects a principal without a role instead of substituting manager', async () => {
      await expect(
        controller.approve('tenant-123', approveDto, {
          user: { sub: 'user-supervisor-1' },
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(
        regularizationServiceMock.approveRegularization,
      ).not.toHaveBeenCalledWith(
        'tenant-123',
        expect.objectContaining({ role: 'manager' }),
      );
    });

    it('rejects a principal whose role is an empty string', async () => {
      await expect(
        controller.approve('tenant-123', approveDto, {
          user: { sub: 'user-supervisor-1', role: '' },
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('forwards the id claim when sub is absent', async () => {
      regularizationServiceMock.approveRegularization.mockResolvedValue({
        id: 'corr-1',
      });

      await controller.approve('tenant-123', approveDto, {
        user: { id: 'user-by-id', role: 'owner' },
      } as any);

      expect(
        regularizationServiceMock.approveRegularization,
      ).toHaveBeenCalledWith('tenant-123', {
        queueId: 'queue-uuid-1',
        approvedByUserId: 'user-by-id',
        role: 'owner',
        authMethod: 'PIN',
      });
    });
  });

  it('syncCorrections delegates batch to service with tenantId', async () => {
    const mockResult = { syncedCount: 2, duplicatesCount: 0 };
    regularizationServiceMock.syncCorrections = jest
      .fn()
      .mockResolvedValue(mockResult);

    const dto = {
      corrections: [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          insumoId: '123e4567-e89b-12d3-a456-426614174001',
          originMovementId: 'mov-1',
          triggerMovementId: 'mov-2',
          previousUnitCostNio: 40,
          recalculatedUnitCostNio: 45,
          deltaUnitCostNio: 5,
          totalDeltaCostNio: 50,
          affectedQuantity: 10,
          lineageHash: 'hash-abc',
          createdAt: new Date().toISOString(),
        },
      ],
    };

    const result = await controller.syncCorrections('tenant-123', dto);
    expect(result).toBe(mockResult);
    expect(regularizationServiceMock.syncCorrections).toHaveBeenCalledWith(
      'tenant-123',
      dto.corrections,
    );
  });
});
