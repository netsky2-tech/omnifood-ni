import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { KardexRegularizationService } from './services/kardex-regularization.service';
import { GovernanceApprovalService } from './services/governance-approval.service';
import { RegularizationController } from './controllers/regularization.controller';
import { KardexRecalculateQueue } from './entities/kardex-recalculate-queue.entity';
import { KardexCorrection } from './entities/kardex-correction.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { SystemParametersConfig } from './entities/system-parameters-config.entity';
import { AuthGuard } from '../identity/guards/auth.guard';
import { RolesGuard } from '../identity/guards/roles.guard';

describe('Batch 6b Backend E2E Integration: Complete Retrocalculation Lifecycle', () => {
  let controller: RegularizationController;
  let governanceService: GovernanceApprovalService;

  const mockQueueRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((dto) => ({ id: 'queue-1', ...dto })),
    save: jest.fn((entity) => Promise.resolve(entity)),
  };

  const mockCorrectionRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((dto) => ({ id: 'corr-1', ...dto })),
    save: jest.fn((entity) => Promise.resolve(entity)),
  };

  const mockMovementRepo = {
    findOne: jest.fn(),
    save: jest.fn((entity) => Promise.resolve(entity)),
  };

  const mockDataSource = {
    transaction: jest.fn(async (cb) => {
      return cb({
        findOne: mockMovementRepo.findOne,
        save: mockMovementRepo.save,
        getRepository: (entity: unknown) => {
          if (entity === KardexCorrection) return mockCorrectionRepo;
          if (entity === KardexRecalculateQueue) return mockQueueRepo;
          return mockMovementRepo;
        },
      });
    }),
  };

  const mockConfigRepo = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RegularizationController],
      providers: [
        KardexRegularizationService,
        GovernanceApprovalService,
        {
          provide: getRepositoryToken(KardexRecalculateQueue),
          useValue: mockQueueRepo,
        },
        {
          provide: getRepositoryToken(KardexCorrection),
          useValue: mockCorrectionRepo,
        },
        {
          provide: getRepositoryToken(InventoryMovement),
          useValue: mockMovementRepo,
        },
        {
          provide: getRepositoryToken(SystemParametersConfig),
          useValue: mockConfigRepo,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            NODE_ENV: 'test',
            JWT_SECRET: 'test-only-jwt-secret-with-at-least-thirty-two-bytes',
          }),
        },
        {
          provide: JwtService,
          useValue: { verifyAsync: jest.fn() },
        },
        {
          provide: Reflector,
          useValue: { getAllAndOverride: jest.fn() },
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RegularizationController>(RegularizationController);
    governanceService = module.get<GovernanceApprovalService>(
      GovernanceApprovalService,
    );
  });

  it('1. Governance Matrix: validates tiered authorization boundaries correctly', () => {
    // Under C$1,500.00 -> No approval required (automatic)
    const autoEval = governanceService.evaluateApprovalRequirement(
      1200.0,
      false,
    );
    expect(autoEval.requiresApproval).toBe(false);

    // C$1,500.01 - C$10,000.00 -> Manager allowed
    const managerEval = governanceService.evaluateApprovalRequirement(
      5000.0,
      false,
    );
    expect(managerEval.requiresApproval).toBe(true);
    expect(managerEval.allowedRoles).toContain('manager');
    expect(managerEval.reason).toBe('UMBRAL_EXCEDIDO');

    // > C$10,000.00 -> Admin / Owner required
    const adminEval = governanceService.evaluateApprovalRequirement(
      15000.0,
      false,
    );
    expect(adminEval.requiresApproval).toBe(true);
    expect(adminEval.allowedRoles).not.toContain('manager');
    expect(adminEval.allowedRoles).toContain('owner');
    expect(adminEval.allowedRoles).toContain('admin');
    expect(adminEval.reason).toBe('UMBRAL_SUPERVISOR_EXCEDIDO');

    // Closed period -> Always Admin / Owner regardless of amount
    const closedPeriodEval = governanceService.evaluateApprovalRequirement(
      500.0,
      true,
    );
    expect(closedPeriodEval.requiresApproval).toBe(true);
    expect(closedPeriodEval.allowedRoles).not.toContain('manager');
    expect(closedPeriodEval.allowedRoles).toContain('admin');
    expect(closedPeriodEval.reason).toBe('PERIODO_CERRADO');
  });

  it('2. Outbox Sync Ingestion: processes incoming POS corrections and prevents duplicates via lineageHash', async () => {
    const existingCorrection = {
      id: 'corr-existing',
      lineageHash: 'hash-existing-1',
    };
    mockCorrectionRepo.findOne.mockImplementation(
      ({ where }: { where: { lineageHash: string } }) => {
        if (where.lineageHash === 'hash-existing-1') {
          return Promise.resolve(existingCorrection);
        }
        return Promise.resolve(null);
      },
    );

    const syncDto = {
      corrections: [
        {
          id: 'corr-new-1',
          insumoId: 'ins-1',
          originMovementId: 'mov-sale-1',
          triggerMovementId: 'mov-purch-1',
          previousUnitCostNio: 100.0,
          recalculatedUnitCostNio: 120.0,
          deltaUnitCostNio: 20.0,
          totalDeltaCostNio: 2000.0,
          affectedQuantity: 100.0,
          lineageHash: 'hash-new-1',
          authorizedByUserId: 'user-sup-1',
          authorizedByRole: 'MANAGER',
          authorizationMethod: 'PIN',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'corr-dup-1',
          insumoId: 'ins-1',
          originMovementId: 'mov-sale-2',
          triggerMovementId: 'mov-purch-1',
          previousUnitCostNio: 100.0,
          recalculatedUnitCostNio: 120.0,
          deltaUnitCostNio: 20.0,
          totalDeltaCostNio: 1000.0,
          affectedQuantity: 50.0,
          lineageHash: 'hash-existing-1', // duplicate
          createdAt: new Date().toISOString(),
        },
      ],
    };

    mockMovementRepo.findOne.mockResolvedValue({
      id: 'mov-sale-1',
      insumoId: 'ins-1',
      unitCostNio: 100.0,
      estadoCosteo: 10,
    });

    const result = await controller.syncCorrections('tenant-test-1', syncDto);

    expect(result.syncedCount).toBe(1);
    expect(result.duplicatesCount).toBe(1);
    expect(mockCorrectionRepo.save).toHaveBeenCalledTimes(1);
    expect(mockMovementRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'mov-sale-1',
        estadoCosteo: 30, // REGULARIZED
        unitCostNio: 120.0,
      }),
    );
  });

  it('3. Supervisor Dashboard: queries pending items and executes authorization', async () => {
    mockQueueRepo.find.mockResolvedValue([
      {
        id: 'queue-item-1',
        insumoId: 'ins-1',
        originMovementId: 'mov-origin-1',
        status: 'BLOCKED',
        totalDeltaCostNio: 2500.0,
      },
    ]);

    const pending = await controller.getPending('tenant-test-1');
    expect(pending.length).toBe(1);
    expect(pending[0].id).toBe('queue-item-1');

    mockQueueRepo.findOne.mockResolvedValue({
      id: 'queue-item-1',
      insumoId: 'ins-1',
      originMovementId: 'mov-origin-1',
      triggerMovementId: 'mov-trigger-1',
      status: 'BLOCKED',
      previousUnitCostNio: 100.0,
      recalculatedUnitCostNio: 125.0,
      deltaUnitCostNio: 25.0,
      totalDeltaCostNio: 2500.0,
      affectedQuantity: 100.0,
      lineageHash: 'lineage-hash-sup-1',
    });

    mockMovementRepo.findOne.mockResolvedValue({
      id: 'mov-origin-1',
      estadoCosteo: 40, // BLOCKED
      unitCostNio: 100.0,
    });

    const reqUser = { sub: 'user-manager-1', role: 'manager' };
    const approveDto = {
      queueId: 'queue-item-1',
      authMethod: 'PIN' as const,
    };

    const approveResult = await controller.approve(
      'tenant-test-1',
      approveDto,
      { user: reqUser } as any,
    );

    expect(approveResult).toBeDefined();
    expect(mockCorrectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        authorizedByUserId: 'user-manager-1',
        authorizedByRole: 'manager',
        authorizationMethod: 'PIN',
      }),
    );
  });
});
