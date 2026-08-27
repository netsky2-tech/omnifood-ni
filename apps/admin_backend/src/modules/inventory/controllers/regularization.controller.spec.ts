import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { ROLES_KEY } from '../../../core/decorators/roles.decorator';
import { UserRole } from '../../identity/entities/user.entity';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { RegularizationController } from './regularization.controller';
import { KardexRegularizationService } from '../services/kardex-regularization.service';

describe('RegularizationController', () => {
  let controller: RegularizationController;
  let regularizationService: KardexRegularizationService;

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

  const configServiceMock = new ConfigService({
    NODE_ENV: 'test',
    JWT_SECRET: 'test-only-jwt-secret-with-at-least-thirty-two-bytes',
    JWT_ISSUER: 'omnifood-admin',
    JWT_AUDIENCE: 'omnifood-pos',
    JWT_ACCESS_TTL_SECONDS: '3600',
    JWT_REFRESH_TTL_SECONDS: '604800',
    JWT_CLOCK_TOLERANCE_SECONDS: '5',
    JWT_ALGORITHM: 'HS256',
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RegularizationController],
      providers: [
        {
          provide: KardexRegularizationService,
          useValue: regularizationServiceMock,
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
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
    }).compile();

    controller = module.get<RegularizationController>(RegularizationController);
    regularizationService = module.get<KardexRegularizationService>(
      KardexRegularizationService,
    );
  });

  it('should be defined and guarded with AuthGuard and RolesGuard', () => {
    expect(controller).toBeDefined();
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      RegularizationController,
    );
    expect(guards).toContain(AuthGuard);
    expect(guards).toContain(RolesGuard);
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
