import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { KardexRegularizationService } from './kardex-regularization.service';
import { KardexRecalculateQueue, KardexQueueStatus } from '../entities/kardex-recalculate-queue.entity';
import { KardexCorrection } from '../entities/kardex-correction.entity';
import { InventoryMovement } from '../entities/inventory-movement.entity';
import { GovernanceApprovalService } from './governance-approval.service';

describe('KardexRegularizationService', () => {
  let service: KardexRegularizationService;
  let queueRepo: any;
  let correctionRepo: any;
  let movementRepo: any;
  let governanceService: GovernanceApprovalService;
  let dataSource: any;

  beforeEach(async () => {
    queueRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };

    correctionRepo = {
      create: jest.fn((dto) => ({ id: 'corr-uuid-1', ...dto })),
      save: jest.fn((entity) => Promise.resolve(entity)),
      findOne: jest.fn(),
    };

    movementRepo = {
      findOne: jest.fn(),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };

    dataSource = {
      transaction: jest.fn(async (callback) => {
        const manager = {
          getRepository: (entity: any) => {
            if (entity === KardexRecalculateQueue) return queueRepo;
            if (entity === KardexCorrection) return correctionRepo;
            if (entity === InventoryMovement) return movementRepo;
            return null;
          },
        };
        return callback(manager);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KardexRegularizationService,
        GovernanceApprovalService,
        {
          provide: getRepositoryToken(KardexRecalculateQueue),
          useValue: queueRepo,
        },
        {
          provide: getRepositoryToken(KardexCorrection),
          useValue: correctionRepo,
        },
        {
          provide: getRepositoryToken(InventoryMovement),
          useValue: movementRepo,
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
      ],
    }).compile();

    service = module.get<KardexRegularizationService>(KardexRegularizationService);
    governanceService = module.get<GovernanceApprovalService>(GovernanceApprovalService);
  });

  it('retrieves pending queue items ordered by creation date', async () => {
    const mockItems = [{ id: 'q-1', tenant_id: 'tenant-test', status: 'PENDING' }];
    queueRepo.find.mockResolvedValue(mockItems);

    const result = await service.getPendingQueue('tenant-test');
    expect(result).toBe(mockItems);
    expect(queueRepo.find).toHaveBeenCalledWith({
      where: { tenant_id: 'tenant-test' },
      order: { createdAt: 'ASC' },
    });
  });

  it('approves blocked regularization and records immutable correction with lineage', async () => {
    const queueItem = {
      id: 'q-10',
      tenant_id: 'tenant-test',
      insumoId: 'ins-100',
      originMovementId: '101',
      triggerMovementId: '102',
      status: KardexQueueStatus.BLOCKED,
    };

    const originMovement = {
      id: '101',
      tenant_id: 'tenant-test',
      quantity: -20,
      unitCostNio: 50,
      estadoCosteo: 40,
    };

    const triggerMovement = {
      id: '102',
      tenant_id: 'tenant-test',
      quantity: 50,
      unitCostNio: 70,
      estadoCosteo: 30,
    };

    queueRepo.findOne.mockResolvedValue(queueItem);
    movementRepo.findOne
      .mockResolvedValueOnce(originMovement)
      .mockResolvedValueOnce(triggerMovement);

    const correction = await service.approveRegularization('tenant-test', {
      queueId: 'q-10',
      approvedByUserId: 'user-admin-1',
      role: 'manager',
      authMethod: 'PIN',
    });

    expect(correction.deltaUnitCostNio).toBe(20);
    expect(correction.totalDeltaCostNio).toBe(400);
    expect(correction.authorizedByUserId).toBe('user-admin-1');
    expect(correction.authorizedByRole).toBe('manager');
    expect(correction.lineageHash).toBeDefined();

    expect(queueItem.status).toBe(KardexQueueStatus.COMPLETED);
    expect(originMovement.estadoCosteo).toBe(30);
    expect(originMovement.unitCostNio).toBe(70);
  });

  it('syncCorrections persists new corrections and deduplicates by lineageHash', async () => {
    const correctionsInput = [
      {
        id: 'corr-new-1',
        insumoId: 'ins-1',
        originMovementId: 'mov-1',
        triggerMovementId: 'mov-2',
        previousUnitCostNio: 50,
        recalculatedUnitCostNio: 55,
        deltaUnitCostNio: 5,
        totalDeltaCostNio: 50,
        affectedQuantity: 10,
        lineageHash: 'hash-unique-1',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'corr-dup-2',
        insumoId: 'ins-1',
        originMovementId: 'mov-1',
        triggerMovementId: 'mov-2',
        previousUnitCostNio: 50,
        recalculatedUnitCostNio: 55,
        deltaUnitCostNio: 5,
        totalDeltaCostNio: 50,
        affectedQuantity: 10,
        lineageHash: 'hash-already-exists',
        createdAt: new Date().toISOString(),
      },
    ];

    correctionRepo.findOne
      .mockResolvedValueOnce(null) // first one is new
      .mockResolvedValueOnce({ id: 'existing-id' }); // second one exists

    movementRepo.findOne.mockResolvedValue({
      id: 'mov-1',
      tenant_id: 'tenant-test',
      estadoCosteo: 10,
    });

    const result = await service.syncCorrections('tenant-test', correctionsInput);

    expect(result.syncedCount).toBe(1);
    expect(result.duplicatesCount).toBe(1);
    expect(correctionRepo.save).toHaveBeenCalledTimes(1);
    expect(movementRepo.save).toHaveBeenCalledTimes(1);
  });
});
