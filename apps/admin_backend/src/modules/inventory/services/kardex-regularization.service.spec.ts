import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { KardexRegularizationService } from './kardex-regularization.service';
import {
  KardexRecalculateQueue,
  KardexQueueStatus,
} from '../entities/kardex-recalculate-queue.entity';
import { KardexCorrection } from '../entities/kardex-correction.entity';
import { InventoryMovement } from '../entities/inventory-movement.entity';
import { GovernanceApprovalService } from './governance-approval.service';

describe('KardexRegularizationService', () => {
  let service: KardexRegularizationService;
  let queueRepo: any;
  let correctionRepo: any;
  let movementRepo: any;
  let dataSource: any;

  beforeEach(async () => {
    jest.clearAllMocks();

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
          query: jest.fn(async () => undefined),
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

    service = module.get<KardexRegularizationService>(
      KardexRegularizationService,
    );
  });

  it('retrieves pending queue items ordered by creation date', async () => {
    const mockItems = [
      { id: 'q-1', tenant_id: 'tenant-test', status: 'PENDING' },
    ];
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

    const result = await service.syncCorrections(
      'tenant-test',
      correctionsInput,
    );

    expect(result.syncedCount).toBe(1);
    expect(result.duplicatesCount).toBe(1);
    expect(correctionRepo.save).toHaveBeenCalledTimes(1);
    expect(movementRepo.save).toHaveBeenCalledTimes(1);
  });

  // ST-06: the sync path runs against FORCE-RLS tables, so it must bind
  // app.tenant_id inside its own transaction before the first query.
  it('syncCorrections binds the tenant context inside its own transaction before the first query', async () => {
    const callOrder: string[] = [];

    const txCorrectionRepo = {
      findOne: jest.fn(async () => {
        callOrder.push('find');
        return null;
      }),
      create: jest.fn((dto) => ({ id: 'corr-tx-1', ...dto })),
      save: jest.fn(async (entity) => entity),
    };
    const txMovementRepo = {
      findOne: jest.fn(async () => {
        callOrder.push('movement-find');
        return null;
      }),
      save: jest.fn(async (entity) => entity),
    };
    const managerQuery = jest.fn(async () => {
      callOrder.push('bind');
    });

    (dataSource.transaction as jest.Mock).mockImplementation(async (callback) =>
      callback({
        query: managerQuery,
        getRepository: (entity: any) =>
          entity === KardexCorrection ? txCorrectionRepo : txMovementRepo,
      }),
    );

    await service.syncCorrections('tenant-test', [
      {
        id: 'corr-tx-1',
        insumoId: 'ins-1',
        originMovementId: '101',
        triggerMovementId: '102',
        previousUnitCostNio: 50,
        recalculatedUnitCostNio: 55,
        deltaUnitCostNio: 5,
        totalDeltaCostNio: 50,
        affectedQuantity: 10,
        lineageHash: 'hash-bind-1',
        createdAt: new Date().toISOString(),
      },
    ]);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(managerQuery).toHaveBeenCalledWith(
      "SELECT set_config('app.tenant_id', $1, true)",
      ['tenant-test'],
    );
    expect(callOrder[0]).toBe('bind');
    expect(callOrder).toContain('find');
    expect(callOrder.indexOf('bind')).toBeLessThan(callOrder.indexOf('find'));
  });

  it('syncCorrections uses only manager-scoped repositories and never the global ones', async () => {
    const txCorrectionRepo = {
      findOne: jest.fn(async () => null),
      create: jest.fn((dto) => ({ id: 'corr-tx-2', ...dto })),
      save: jest.fn(async (entity) => entity),
    };
    const txMovementRepo = {
      findOne: jest.fn(async () => null),
      save: jest.fn(async (entity) => entity),
    };

    (dataSource.transaction as jest.Mock).mockImplementation(async (callback) =>
      callback({
        query: jest.fn(async () => undefined),
        getRepository: (entity: any) =>
          entity === KardexCorrection ? txCorrectionRepo : txMovementRepo,
      }),
    );

    await service.syncCorrections('tenant-test', [
      {
        id: 'corr-tx-2',
        insumoId: 'ins-1',
        originMovementId: '101',
        triggerMovementId: '102',
        previousUnitCostNio: 50,
        recalculatedUnitCostNio: 55,
        deltaUnitCostNio: 5,
        totalDeltaCostNio: 50,
        affectedQuantity: 10,
        lineageHash: 'hash-scoped-1',
        createdAt: new Date().toISOString(),
      },
    ]);

    expect(txCorrectionRepo.findOne).toHaveBeenCalled();
    expect(txCorrectionRepo.save).toHaveBeenCalled();
    expect(correctionRepo.findOne).not.toHaveBeenCalled();
    expect(correctionRepo.save).not.toHaveBeenCalled();
    expect(movementRepo.findOne).not.toHaveBeenCalled();
    expect(movementRepo.save).not.toHaveBeenCalled();
  });

  // HR-01 (issue #486): the human pending and approve routes read and write
  // FORCE-RLS tables, so both must bind app.tenant_id on their own
  // transaction before the first protected query and use only
  // manager-scoped repositories — the same invariant ST-06 set for sync.
  describe('human regularization tenant binding (HR-01, issue #486)', () => {
    const TENANT_BIND_SQL = "SELECT set_config('app.tenant_id', $1, true)";

    it('getPendingQueue binds the tenant context in its own transaction before the first query', async () => {
      const callOrder: string[] = [];
      const managerQuery = jest.fn(async () => {
        callOrder.push('bind');
      });
      queueRepo.find.mockImplementation(async () => {
        callOrder.push('find');
        return [];
      });

      (dataSource.transaction as jest.Mock).mockImplementation(
        async (callback) =>
          callback({
            query: managerQuery,
            getRepository: (entity: any) =>
              entity === KardexRecalculateQueue ? queueRepo : null,
          }),
      );

      await service.getPendingQueue('tenant-test');

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(managerQuery).toHaveBeenCalledWith(TENANT_BIND_SQL, [
        'tenant-test',
      ]);
      expect(callOrder[0]).toBe('bind');
      expect(callOrder.indexOf('bind')).toBeLessThan(callOrder.indexOf('find'));
    });

    it('getPendingQueue reads only through the manager-scoped repository, never the global one', async () => {
      const txQueueRepo = { find: jest.fn(async () => []) };
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (callback) =>
          callback({
            query: jest.fn(async () => undefined),
            getRepository: (entity: any) =>
              entity === KardexRecalculateQueue ? txQueueRepo : null,
          }),
      );

      await service.getPendingQueue('tenant-test');

      expect(txQueueRepo.find).toHaveBeenCalledWith({
        where: { tenant_id: 'tenant-test' },
        order: { createdAt: 'ASC' },
      });
      expect(queueRepo.find).not.toHaveBeenCalled();
    });

    it('getPendingQueue fails fast on a blank tenant before any transaction or SQL', async () => {
      const managerQuery = jest.fn(async () => undefined);
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (callback) =>
          callback({
            query: managerQuery,
            getRepository: () => queueRepo,
          }),
      );

      await expect(service.getPendingQueue('   ')).rejects.toThrow(
        'TENANT_CONTEXT_REQUIRED',
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(managerQuery).not.toHaveBeenCalled();
      expect(queueRepo.find).not.toHaveBeenCalled();
    });

    it('approveRegularization binds the tenant context as the first SQL operation of its transaction', async () => {
      const queueItem = {
        id: 'q-hr-1',
        tenant_id: 'tenant-test',
        insumoId: 'ins-hr-1',
        originMovementId: '101',
        triggerMovementId: '102',
        status: KardexQueueStatus.PENDING,
      };
      const originMovement = {
        id: '101',
        tenant_id: 'tenant-test',
        quantity: -10,
        unitCostNio: 100,
        estadoCosteo: 40,
      };
      const triggerMovement = {
        id: '102',
        tenant_id: 'tenant-test',
        quantity: 10,
        unitCostNio: 120,
        estadoCosteo: 30,
      };

      const callOrder: string[] = [];
      const managerQuery = jest.fn(async () => {
        callOrder.push('bind');
      });
      queueRepo.findOne.mockImplementation(async () => {
        callOrder.push('queue-find');
        return queueItem;
      });
      movementRepo.findOne.mockImplementation(async () => {
        callOrder.push('movement-find');
        return callOrder.filter((c) => c === 'movement-find').length === 1
          ? originMovement
          : triggerMovement;
      });

      (dataSource.transaction as jest.Mock).mockImplementation(
        async (callback) =>
          callback({
            query: managerQuery,
            getRepository: (entity: any) => {
              if (entity === KardexRecalculateQueue) return queueRepo;
              if (entity === KardexCorrection) return correctionRepo;
              if (entity === InventoryMovement) return movementRepo;
              return null;
            },
          }),
      );

      const correction = await service.approveRegularization('tenant-test', {
        queueId: 'q-hr-1',
        approvedByUserId: 'user-admin-1',
        role: 'MANAGER',
        authMethod: 'PIN',
      });

      expect(correction.totalDeltaCostNio).toBe(200);
      expect(managerQuery).toHaveBeenCalledWith(TENANT_BIND_SQL, [
        'tenant-test',
      ]);
      expect(callOrder[0]).toBe('bind');
      expect(callOrder.indexOf('bind')).toBeLessThan(
        callOrder.indexOf('queue-find'),
      );
    });

    it('approveRegularization uses only manager-scoped repositories and never the global ones', async () => {
      const txQueueRepo = { findOne: jest.fn(async () => null) };
      const txCorrectionRepo = {
        create: jest.fn((dto) => ({ id: 'corr-hr-1', ...dto })),
        save: jest.fn(async (entity) => entity),
      };
      const txMovementRepo = { findOne: jest.fn(async () => null) };

      (dataSource.transaction as jest.Mock).mockImplementation(
        async (callback) =>
          callback({
            query: jest.fn(async () => undefined),
            getRepository: (entity: any) => {
              if (entity === KardexRecalculateQueue) return txQueueRepo;
              if (entity === KardexCorrection) return txCorrectionRepo;
              if (entity === InventoryMovement) return txMovementRepo;
              return null;
            },
          }),
      );

      await expect(
        service.approveRegularization('tenant-test', {
          queueId: 'q-missing',
          approvedByUserId: 'user-admin-1',
          role: 'MANAGER',
          authMethod: 'PIN',
        }),
      ).rejects.toThrow('no encontrado');

      expect(txQueueRepo.findOne).toHaveBeenCalled();
      expect(queueRepo.findOne).not.toHaveBeenCalled();
      expect(correctionRepo.findOne).not.toHaveBeenCalled();
      expect(correctionRepo.save).not.toHaveBeenCalled();
      expect(movementRepo.findOne).not.toHaveBeenCalled();
      expect(movementRepo.save).not.toHaveBeenCalled();
    });

    it('approveRegularization fails fast on a blank tenant before any protected SQL', async () => {
      const managerQuery = jest.fn(async () => undefined);
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (callback) =>
          callback({
            query: managerQuery,
            getRepository: () => queueRepo,
          }),
      );

      await expect(
        service.approveRegularization('   ', {
          queueId: 'q-hr-1',
          approvedByUserId: 'user-admin-1',
          role: 'MANAGER',
          authMethod: 'PIN',
        }),
      ).rejects.toThrow('TENANT_CONTEXT_REQUIRED');
      expect(managerQuery).not.toHaveBeenCalled();
      expect(queueRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('syncCorrections actor fields (ST-06, DSI-6 self-reported until attested)', () => {
    const baseCorrection = {
      id: 'corr-actor-1',
      insumoId: 'ins-1',
      originMovementId: '101',
      triggerMovementId: '102',
      previousUnitCostNio: 50,
      recalculatedUnitCostNio: 55,
      deltaUnitCostNio: 5,
      totalDeltaCostNio: 50,
      affectedQuantity: 10,
      lineageHash: 'hash-actor-1',
      createdAt: new Date().toISOString(),
    };

    it('persists absent actor fields as absent without fabricating identity or role', async () => {
      correctionRepo.findOne.mockResolvedValue(null);
      movementRepo.findOne.mockResolvedValue(null);

      await service.syncCorrections('tenant-test', [{ ...baseCorrection }]);

      expect(correctionRepo.save).toHaveBeenCalledTimes(1);
      const saved = correctionRepo.save.mock.calls[0][0];
      expect(saved.authorizedByUserId).toBeUndefined();
      expect(saved.authorizedByRole).toBeUndefined();
      expect(saved.authorizationMethod).toBeUndefined();
      expect(saved.authorizedByUserId).not.toBe('unknown-user');
      expect(saved.authorizedByRole).not.toBe('manager');
    });

    it('records present self-reported actor values exactly as sent', async () => {
      correctionRepo.findOne.mockResolvedValue(null);
      movementRepo.findOne.mockResolvedValue(null);

      await service.syncCorrections('tenant-test', [
        {
          ...baseCorrection,
          authorizedByUserId: 'pos-user-7',
          authorizedByRole: 'supervisor',
          authorizationMethod: 'PIN',
        },
      ]);

      const saved = correctionRepo.save.mock.calls[0][0];
      expect(saved.authorizedByUserId).toBe('pos-user-7');
      expect(saved.authorizedByRole).toBe('supervisor');
      expect(saved.authorizationMethod).toBe('PIN');
    });
  });
});
