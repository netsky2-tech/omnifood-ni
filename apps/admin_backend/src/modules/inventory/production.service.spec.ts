import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Batch } from './entities/batch.entity';
import {
  calculateProductionClosePayloadHash,
  ProductionService,
} from './production.service';
import { RecipeService } from './recipe.service';
import { BomExplosionService } from './bom-explosion.service';
import { BatchCostingService } from './batch-costing.service';
import { ProductionBatchHistory } from './entities/production-batch-history.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { InventorySyncReceipt } from './entities/inventory-sync-receipt.entity';

describe('ProductionService', () => {
  let service: ProductionService;

  const batchRepo = { find: jest.fn() };
  const managerBatchRepo = { find: jest.fn() };
  const recipeService = { getSnapshot: jest.fn() };
  const bomExplosionService = { explode: jest.fn() };
  const batchCostingService = { buildValuationTrace: jest.fn() };

  const inventoryReceiptRepo = {
    findOneBy: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const inventoryReceiptQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue({
      tenant_id: 'tenant-A',
      source_device_id: 'terminal-1',
      flow_type: 'production',
      source_sequence: 'previous',
    }),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === InventorySyncReceipt) return inventoryReceiptRepo;
      if (entity === Batch) return managerBatchRepo;
      throw new Error('Unexpected repository');
    }),
    createQueryBuilder: jest.fn(() => ({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: 'ins-1',
        stock: 10,
        existenciaActual: 10,
        averageCost: 3,
      }),
    })),
    save: jest.fn().mockResolvedValue({}),
    query: jest.fn().mockResolvedValue({}),
    create: jest.fn((_: unknown, payload: unknown) => payload),
    findOne: jest.fn().mockResolvedValue(null),
  };

  const dataSource = {
    transaction: jest
      .fn()
      .mockImplementation(
        async (
          _isolation: string,
          callback: (txManager: typeof manager) => Promise<void>,
        ) => callback(manager),
      ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    batchRepo.find.mockReset();
    managerBatchRepo.find.mockReset();
    recipeService.getSnapshot.mockReset();
    bomExplosionService.explode.mockReset();
    batchCostingService.buildValuationTrace.mockReset();
    inventoryReceiptRepo.findOneBy.mockReset();
    inventoryReceiptRepo.createQueryBuilder.mockReset();
    inventoryReceiptQueryBuilder.where.mockReset();
    inventoryReceiptQueryBuilder.andWhere.mockReset();
    inventoryReceiptQueryBuilder.getOne.mockReset();
    manager.getRepository.mockReset();
    manager.createQueryBuilder.mockReset();
    manager.save.mockReset();
    manager.query.mockReset();
    manager.create.mockReset();
    manager.findOne.mockReset();
    dataSource.transaction.mockClear();
    manager.getRepository.mockImplementation((entity: unknown) => {
      if (entity === InventorySyncReceipt) return inventoryReceiptRepo;
      if (entity === Batch) return managerBatchRepo;
      throw new Error('Unexpected repository');
    });
    manager.createQueryBuilder.mockImplementation(() => ({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: 'ins-1',
        stock: 10,
        existenciaActual: 10,
        averageCost: 3,
      }),
    }));
    manager.save.mockResolvedValue({});
    manager.query.mockResolvedValue({});
    manager.create.mockImplementation(
      (_: unknown, payload: unknown) => payload,
    );
    manager.findOne.mockResolvedValue(null);
    inventoryReceiptRepo.findOneBy.mockResolvedValue(null);
    inventoryReceiptRepo.createQueryBuilder.mockReturnValue(
      inventoryReceiptQueryBuilder,
    );
    inventoryReceiptQueryBuilder.where.mockReturnThis();
    inventoryReceiptQueryBuilder.andWhere.mockReturnThis();
    inventoryReceiptQueryBuilder.getOne.mockResolvedValue({
      tenant_id: 'tenant-A',
      source_device_id: 'terminal-1',
      flow_type: 'production',
      source_sequence: 'previous',
    });
    managerBatchRepo.find.mockImplementation(
      (options: unknown): Promise<unknown> =>
        batchRepo.find(options) as Promise<unknown>,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductionService,
        { provide: DataSource, useValue: dataSource },
        { provide: RecipeService, useValue: recipeService },
        { provide: BomExplosionService, useValue: bomExplosionService },
        { provide: BatchCostingService, useValue: batchCostingService },
        { provide: getRepositoryToken(Batch), useValue: batchRepo },
      ],
    }).compile();

    service = module.get<ProductionService>(ProductionService);
  });

  it('processes production by consuming exploded ingredients and creating receipt stock', async () => {
    recipeService.getSnapshot.mockResolvedValue({
      recipeVersion: { id: 'v3' },
      components: [{ insumo_id: 'ins-raw', quantity: 0.5 }],
    });
    bomExplosionService.explode.mockReturnValue(new Map([['ins-raw', 2]]));
    batchRepo.find.mockResolvedValue([
      { id: 'b1', remaining_stock: 2, cost: 1.5 },
    ]);
    batchCostingService.buildValuationTrace.mockReturnValue([
      {
        batchId: 'b1',
        consumedQuantity: 2,
        unitCostNio: 1.5,
        totalCostNio: 3,
        isSoftExpired: false,
      },
    ]);

    const result = await service.processOrder({
      tenantId: 'tenant-A',
      recipeVersionId: 'v3',
      orderQuantity: 4,
      producedInsumoId: 'ins-finished',
      producedBatchNumber: 'PB-001',
      producedExpirationDate: new Date('2026-12-01T00:00:00.000Z'),
      operationDate: new Date('2026-05-01T00:00:00.000Z'),
    });

    expect(dataSource.transaction).toHaveBeenCalledWith(
      'SERIALIZABLE',
      expect.any(Function),
    );
    expect(result.valuationTraceability['ins-raw']).toHaveLength(1);
    expect(manager.save).toHaveBeenCalled();
    expect(manager.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reason: 'PRODUCTION_RECEIPT:v3',
        unitCostNio: 0.75,
        totalCostNio: 3,
        averageCostAfterNio: 3,
      }),
    );
  });

  it('keeps valuation traceability with soft-expired flag from costing service', async () => {
    recipeService.getSnapshot.mockResolvedValue({
      recipeVersion: { id: 'v3' },
      components: [],
    });
    bomExplosionService.explode.mockReturnValue(new Map([['ins-raw', 1]]));
    batchRepo.find.mockResolvedValue([]);
    batchCostingService.buildValuationTrace.mockReturnValue([
      {
        batchId: 'expired-1',
        consumedQuantity: 1,
        unitCostNio: 2,
        totalCostNio: 2,
        isSoftExpired: true,
      },
    ]);

    const result = await service.processOrder({
      tenantId: 'tenant-A',
      recipeVersionId: 'v3',
      orderQuantity: 1,
      producedInsumoId: 'ins-finished',
      producedBatchNumber: 'PB-002',
      producedExpirationDate: new Date('2026-12-01T00:00:00.000Z'),
      operationDate: new Date('2026-05-01T00:00:00.000Z'),
    });

    expect(result.valuationTraceability['ins-raw'][0].isSoftExpired).toBe(true);
  });

  it('replays a completed production close once and freezes immutable batch history', async () => {
    recipeService.getSnapshot.mockResolvedValue({
      recipeVersion: { id: 'v3' },
      components: [{ insumo_id: 'ins-raw', quantity: 2 }],
    });
    bomExplosionService.explode.mockReturnValue(new Map([['ins-raw', 4]]));
    batchRepo.find.mockResolvedValue([
      { id: 'b1', remaining_stock: 10, cost: 2, expiration_date: new Date() },
    ]);
    batchCostingService.buildValuationTrace.mockReturnValue([
      {
        batchId: 'b1',
        insumoId: 'ins-raw',
        consumedQuantity: 4,
        unitCostNio: 2,
        totalCostNio: 8,
        isSoftExpired: false,
      },
    ]);
    const document = {
      id: 'prod-doc-1',
      recipeVersionId: 'v3',
      producedInsumoId: 'ins-finished',
      producedBatchNumber: 'PB-001',
      producedExpirationDate: '2026-12-01T00:00:00.000Z',
      plannedQuantity: 4,
      actualQuantity: 4,
      outcome: 'COMPLETED' as const,
      terminalId: 'terminal-1',
      sourceSequence: 7,
      idempotencyKey: 'production:terminal-1:prod-doc-1',
      payloadHash: 'hash-a',
      totalConsumedCostNio: 8,
      producedUnitCostNio: 2,
      operationDate: '2026-05-01T00:00:00.000Z',
      movementReferences: ['out-1', 'in-1'],
    };

    const result = await service.replayProductionClose({
      tenantId: 'tenant-A',
      document,
    });

    expect(result).toEqual({
      documentId: 'prod-doc-1',
      skippedExisting: false,
    });
    expect(manager.create).toHaveBeenCalledWith(
      InventoryMovement,
      expect.objectContaining({
        tenant_id: 'tenant-A',
        sourceDocumentType: 'PRODUCTION_CLOSE',
        sourceDocumentId: 'prod-doc-1',
        idempotencyKey: 'production:terminal-1:prod-doc-1',
        sourceDeviceId: 'terminal-1',
        sourceSequence: '-7001',
      }),
    );
    expect(manager.create).toHaveBeenCalledWith(
      ProductionBatchHistory,
      expect.objectContaining({
        tenant_id: 'tenant-A',
        production_document_id: 'prod-doc-1',
        produced_unit_cost_nio: 2,
        total_consumed_cost_nio: 8,
        movement_references: ['out-1', 'in-1'],
      }),
    );
    expect(manager.create).toHaveBeenCalledWith(
      InventorySyncReceipt,
      expect.objectContaining({
        tenant_id: 'tenant-A',
        idempotency_key: 'production:terminal-1:prod-doc-1',
        payload_hash: calculateProductionClosePayloadHash(document),
        flow_type: 'production',
        source_sequence: '7',
      }),
    );
  });

  it.each([
    ['planned quantity', { plannedQuantity: 0, actualQuantity: 4 }],
    ['actual quantity', { plannedQuantity: 4, actualQuantity: 0 }],
  ])(
    'rejects completed production replay with non-positive %s before posting inventory',
    async (_caseName, quantities) => {
      await expect(
        service.replayProductionClose({
          tenantId: 'tenant-A',
          document: {
            id: `prod-doc-completed-${_caseName.replace(' ', '-')}`,
            recipeVersionId: 'v3',
            producedInsumoId: 'ins-finished',
            producedBatchNumber: 'PB-COMPLETED-QTY',
            producedExpirationDate: '2026-12-01T00:00:00.000Z',
            ...quantities,
            outcome: 'COMPLETED',
            terminalId: 'terminal-1',
            sourceSequence: 13,
            idempotencyKey: `production:terminal-1:prod-doc-completed-${_caseName.replace(' ', '-')}`,
            payloadHash: 'client-hash',
            operationDate: '2026-05-01T00:00:00.000Z',
            movementReferences: ['out-1', 'in-1'],
          },
        }),
      ).rejects.toThrow(
        'Completed production close must have positive planned and actual output',
      );
      expect(recipeService.getSnapshot).not.toHaveBeenCalled();
      expect(manager.create).not.toHaveBeenCalledWith(
        InventoryMovement,
        expect.anything(),
      );
    },
  );

  it('sets the transaction-local tenant context before RLS-protected history writes', async () => {
    recipeService.getSnapshot.mockResolvedValue({
      recipeVersion: { id: 'v3' },
      components: [{ insumo_id: 'ins-raw', quantity: 2 }],
    });
    bomExplosionService.explode.mockReturnValue(new Map([['ins-raw', 4]]));
    batchRepo.find.mockResolvedValue([
      { id: 'b1', remaining_stock: 10, cost: 2, expiration_date: new Date() },
    ]);
    batchCostingService.buildValuationTrace.mockReturnValue([
      {
        batchId: 'b1',
        insumoId: 'ins-raw',
        consumedQuantity: 4,
        unitCostNio: 2,
        totalCostNio: 8,
        isSoftExpired: false,
      },
    ]);

    await service.replayProductionClose({
      tenantId: 'tenant-A',
      document: {
        id: 'prod-doc-rls-context',
        recipeVersionId: 'v3',
        producedInsumoId: 'ins-finished',
        producedBatchNumber: 'PB-RLS',
        producedExpirationDate: '2026-12-01T00:00:00.000Z',
        plannedQuantity: 4,
        actualQuantity: 4,
        outcome: 'COMPLETED',
        terminalId: 'terminal-1',
        sourceSequence: 12,
        idempotencyKey: 'production:terminal-1:prod-doc-rls-context',
        payloadHash: 'client-hash',
        operationDate: '2026-05-01T00:00:00.000Z',
        movementReferences: ['out-1', 'in-1'],
      },
    });

    expect(manager.query).toHaveBeenCalledWith(
      "SELECT set_config('app.tenant_id', $1, true)",
      ['tenant-A'],
    );
    const historySaveCallIndex = manager.save.mock.calls.findIndex(
      (call: [unknown, unknown]) => call[0] === ProductionBatchHistory,
    );
    const historySaveCallOrder =
      manager.save.mock.invocationCallOrder[historySaveCallIndex];
    expect(manager.query.mock.invocationCallOrder[0]).toBeLessThan(
      historySaveCallOrder ?? Number.MAX_SAFE_INTEGER,
    );
  });

  it('uses the replay transaction manager repository for costing candidate reads', async () => {
    recipeService.getSnapshot.mockResolvedValue({
      recipeVersion: { id: 'v3' },
      components: [{ insumo_id: 'ins-raw', quantity: 2 }],
    });
    bomExplosionService.explode.mockReturnValue(new Map([['ins-raw', 4]]));
    batchRepo.find.mockRejectedValue(
      new Error('Injected batch repository must not be used during replay'),
    );
    managerBatchRepo.find.mockResolvedValue([
      { id: 'b1', remaining_stock: 10, cost: 2, expiration_date: new Date() },
    ]);
    batchCostingService.buildValuationTrace.mockReturnValue([
      {
        batchId: 'b1',
        insumoId: 'ins-raw',
        consumedQuantity: 4,
        unitCostNio: 2,
        totalCostNio: 8,
        isSoftExpired: false,
      },
    ]);

    await service.replayProductionClose({
      tenantId: 'tenant-A',
      document: {
        id: 'prod-doc-manager-candidates',
        recipeVersionId: 'v3',
        producedInsumoId: 'ins-finished',
        producedBatchNumber: 'PB-MANAGER',
        producedExpirationDate: '2026-12-01T00:00:00.000Z',
        plannedQuantity: 4,
        actualQuantity: 4,
        outcome: 'COMPLETED',
        terminalId: 'terminal-1',
        sourceSequence: 13,
        idempotencyKey: 'production:terminal-1:prod-doc-manager-candidates',
        payloadHash: 'client-hash',
        operationDate: '2026-05-01T00:00:00.000Z',
        movementReferences: ['out-1', 'in-1'],
      },
    });

    expect(batchRepo.find).not.toHaveBeenCalled();
    expect(manager.getRepository).toHaveBeenCalledWith(Batch);
    expect(managerBatchRepo.find).toHaveBeenCalledWith({
      where: { tenant_id: 'tenant-A', insumo_id: 'ins-raw' },
      order: { batch_number: 'ASC' },
    });
  });

  it('uses manager-scoped candidate reads for every replay costing component', async () => {
    recipeService.getSnapshot.mockResolvedValue({
      recipeVersion: { id: 'v3' },
      components: [
        { insumo_id: 'ins-raw-a', quantity: 1 },
        { insumo_id: 'ins-raw-b', quantity: 3 },
      ],
    });
    bomExplosionService.explode.mockReturnValue(
      new Map([
        ['ins-raw-a', 2],
        ['ins-raw-b', 6],
      ]),
    );
    batchRepo.find.mockRejectedValue(
      new Error('Injected batch repository must not be used during replay'),
    );
    managerBatchRepo.find
      .mockResolvedValueOnce([
        { id: 'batch-a', remaining_stock: 5, cost: 2, expiration_date: null },
      ])
      .mockResolvedValueOnce([
        { id: 'batch-b', remaining_stock: 8, cost: 3, expiration_date: null },
      ]);
    batchCostingService.buildValuationTrace
      .mockReturnValueOnce([
        {
          batchId: 'batch-a',
          insumoId: 'ins-raw-a',
          consumedQuantity: 2,
          unitCostNio: 2,
          totalCostNio: 4,
          isSoftExpired: false,
        },
      ])
      .mockReturnValueOnce([
        {
          batchId: 'batch-b',
          insumoId: 'ins-raw-b',
          consumedQuantity: 6,
          unitCostNio: 3,
          totalCostNio: 18,
          isSoftExpired: false,
        },
      ]);

    await service.replayProductionClose({
      tenantId: 'tenant-A',
      document: {
        id: 'prod-doc-manager-candidates-multi',
        recipeVersionId: 'v3',
        producedInsumoId: 'ins-finished',
        producedBatchNumber: 'PB-MANAGER-MULTI',
        producedExpirationDate: '2026-12-01T00:00:00.000Z',
        plannedQuantity: 2,
        actualQuantity: 2,
        outcome: 'COMPLETED',
        terminalId: 'terminal-1',
        sourceSequence: 14,
        idempotencyKey:
          'production:terminal-1:prod-doc-manager-candidates-multi',
        payloadHash: 'client-hash',
        operationDate: '2026-05-01T00:00:00.000Z',
        movementReferences: ['out-a', 'out-b', 'in-1'],
      },
    });

    expect(batchRepo.find).not.toHaveBeenCalled();
    expect(managerBatchRepo.find).toHaveBeenNthCalledWith(1, {
      where: { tenant_id: 'tenant-A', insumo_id: 'ins-raw-a' },
      order: { batch_number: 'ASC' },
    });
    expect(managerBatchRepo.find).toHaveBeenNthCalledWith(2, {
      where: { tenant_id: 'tenant-A', insumo_id: 'ins-raw-b' },
      order: { batch_number: 'ASC' },
    });
  });

  it('deducts production source batch balances for a replay that consumes one batch', async () => {
    recipeService.getSnapshot.mockResolvedValue({
      recipeVersion: { id: 'v3' },
      components: [{ insumo_id: 'ins-raw', quantity: 2 }],
    });
    bomExplosionService.explode.mockReturnValue(new Map([['ins-raw', 4]]));
    managerBatchRepo.find.mockResolvedValue([
      { id: 'batch-a', remaining_stock: 10, cost: 2, expiration_date: null },
    ]);
    batchCostingService.buildValuationTrace.mockReturnValue([
      {
        batchId: 'batch-a',
        insumoId: 'ins-raw',
        consumedQuantity: 4,
        unitCostNio: 2,
        totalCostNio: 8,
        isSoftExpired: false,
      },
    ]);

    await service.replayProductionClose({
      tenantId: 'tenant-A',
      document: {
        id: 'prod-doc-source-batch-one',
        recipeVersionId: 'v3',
        producedInsumoId: 'ins-finished',
        producedBatchNumber: 'PB-SOURCE-BATCH-ONE',
        producedExpirationDate: '2026-12-01T00:00:00.000Z',
        plannedQuantity: 2,
        actualQuantity: 2,
        outcome: 'COMPLETED',
        terminalId: 'terminal-1',
        sourceSequence: 24,
        idempotencyKey: 'production:terminal-1:prod-doc-source-batch-one',
        payloadHash: 'client-hash',
        operationDate: '2026-05-01T00:00:00.000Z',
        movementReferences: ['out-1', 'in-1'],
      },
    });

    expect(manager.save).toHaveBeenCalledWith(
      Batch,
      expect.objectContaining({ id: 'batch-a', remaining_stock: 6 }),
    );
  });

  it('deducts production source batch balances across FIFO batches', async () => {
    recipeService.getSnapshot.mockResolvedValue({
      recipeVersion: { id: 'v3' },
      components: [{ insumo_id: 'ins-raw', quantity: 3 }],
    });
    bomExplosionService.explode.mockReturnValue(new Map([['ins-raw', 6]]));
    managerBatchRepo.find.mockResolvedValue([
      { id: 'batch-a', remaining_stock: 3, cost: 2, expiration_date: null },
      { id: 'batch-b', remaining_stock: 5, cost: 3, expiration_date: null },
    ]);
    batchCostingService.buildValuationTrace.mockReturnValue([
      {
        batchId: 'batch-a',
        insumoId: 'ins-raw',
        consumedQuantity: 3,
        unitCostNio: 2,
        totalCostNio: 6,
        isSoftExpired: false,
      },
      {
        batchId: 'batch-b',
        insumoId: 'ins-raw',
        consumedQuantity: 3,
        unitCostNio: 3,
        totalCostNio: 9,
        isSoftExpired: false,
      },
    ]);

    await service.replayProductionClose({
      tenantId: 'tenant-A',
      document: {
        id: 'prod-doc-source-batch-fifo',
        recipeVersionId: 'v3',
        producedInsumoId: 'ins-finished',
        producedBatchNumber: 'PB-SOURCE-BATCH-FIFO',
        producedExpirationDate: '2026-12-01T00:00:00.000Z',
        plannedQuantity: 2,
        actualQuantity: 2,
        outcome: 'COMPLETED',
        terminalId: 'terminal-1',
        sourceSequence: 25,
        idempotencyKey: 'production:terminal-1:prod-doc-source-batch-fifo',
        payloadHash: 'client-hash',
        operationDate: '2026-05-01T00:00:00.000Z',
        movementReferences: ['out-1', 'in-1'],
      },
    });

    expect(manager.save).toHaveBeenCalledWith(
      Batch,
      expect.objectContaining({ id: 'batch-a', remaining_stock: 0 }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      Batch,
      expect.objectContaining({ id: 'batch-b', remaining_stock: 2 }),
    );
  });

  it('uses depleted source batch balances for later production replay valuation', async () => {
    recipeService.getSnapshot.mockResolvedValue({
      recipeVersion: { id: 'v3' },
      components: [{ insumo_id: 'ins-raw', quantity: 3 }],
    });
    bomExplosionService.explode.mockReturnValue(new Map([['ins-raw', 3]]));
    const sourceBatches = [
      { id: 'batch-a', remaining_stock: 3, cost: 2, expiration_date: null },
      { id: 'batch-b', remaining_stock: 5, cost: 3, expiration_date: null },
    ];
    managerBatchRepo.find.mockImplementation(() =>
      Promise.resolve(sourceBatches),
    );
    batchCostingService.buildValuationTrace.mockImplementation(
      ({
        candidates,
      }: {
        candidates: Array<{
          batchId: string;
          remainingStock: number;
          unitCostNio: number;
        }>;
      }) => {
        const firstAvailable = candidates.find(
          (candidate) => candidate.remainingStock > 0,
        );
        if (!firstAvailable) return [];
        return [
          {
            batchId: firstAvailable.batchId,
            insumoId: 'ins-raw',
            consumedQuantity: 3,
            unitCostNio: firstAvailable.unitCostNio,
            totalCostNio: 3 * firstAvailable.unitCostNio,
            isSoftExpired: false,
          },
        ];
      },
    );

    await service.replayProductionClose({
      tenantId: 'tenant-A',
      document: {
        id: 'prod-doc-source-batch-first',
        recipeVersionId: 'v3',
        producedInsumoId: 'ins-finished',
        producedBatchNumber: 'PB-SOURCE-BATCH-FIRST',
        producedExpirationDate: '2026-12-01T00:00:00.000Z',
        plannedQuantity: 1,
        actualQuantity: 1,
        outcome: 'COMPLETED',
        terminalId: 'terminal-1',
        sourceSequence: 26,
        idempotencyKey: 'production:terminal-1:prod-doc-source-batch-first',
        payloadHash: 'client-hash',
        operationDate: '2026-05-01T00:00:00.000Z',
        movementReferences: ['out-1', 'in-1'],
      },
    });
    await service.replayProductionClose({
      tenantId: 'tenant-A',
      document: {
        id: 'prod-doc-source-batch-second',
        recipeVersionId: 'v3',
        producedInsumoId: 'ins-finished',
        producedBatchNumber: 'PB-SOURCE-BATCH-SECOND',
        producedExpirationDate: '2026-12-01T00:00:00.000Z',
        plannedQuantity: 1,
        actualQuantity: 1,
        outcome: 'COMPLETED',
        terminalId: 'terminal-1',
        sourceSequence: 27,
        idempotencyKey: 'production:terminal-1:prod-doc-source-batch-second',
        payloadHash: 'client-hash',
        operationDate: '2026-05-02T00:00:00.000Z',
        movementReferences: ['out-2', 'in-2'],
      },
    });

    const buildValuationTraceMock =
      batchCostingService.buildValuationTrace as jest.Mock<
        unknown,
        [{ candidates: unknown[] }]
      >;
    const secondValuationCall = buildValuationTraceMock.mock.calls[1]?.[0];
    expect(secondValuationCall?.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ batchId: 'batch-a', remainingStock: 0 }),
        expect.objectContaining({ batchId: 'batch-b', remainingStock: 5 }),
      ]),
    );
    expect(manager.create).toHaveBeenCalledWith(
      InventoryMovement,
      expect.objectContaining({
        sourceDocumentId: 'prod-doc-source-batch-second',
        insumoId: 'ins-raw',
        unitCostNio: 3,
      }),
    );
  });

  it('rejects completed replay when source batch valuation only partially covers required consumption', async () => {
    recipeService.getSnapshot.mockResolvedValue({
      recipeVersion: { id: 'v3' },
      components: [{ insumo_id: 'ins-raw', quantity: 3 }],
    });
    bomExplosionService.explode.mockReturnValue(new Map([['ins-raw', 6]]));
    managerBatchRepo.find.mockResolvedValue([
      { id: 'batch-a', remaining_stock: 2, cost: 2, expiration_date: null },
    ]);
    batchCostingService.buildValuationTrace.mockReturnValue([
      {
        batchId: 'batch-a',
        insumoId: 'ins-raw',
        consumedQuantity: 2,
        unitCostNio: 2,
        totalCostNio: 4,
        isSoftExpired: false,
      },
    ]);

    await expect(
      service.replayProductionClose({
        tenantId: 'tenant-A',
        document: {
          id: 'prod-doc-partial-valuation',
          recipeVersionId: 'v3',
          producedInsumoId: 'ins-finished',
          producedBatchNumber: 'PB-PARTIAL-VALUATION',
          producedExpirationDate: '2026-12-01T00:00:00.000Z',
          plannedQuantity: 2,
          actualQuantity: 2,
          outcome: 'COMPLETED',
          terminalId: 'terminal-1',
          sourceSequence: 28,
          idempotencyKey: 'production:terminal-1:prod-doc-partial-valuation',
          payloadHash: 'client-hash',
          operationDate: '2026-05-01T00:00:00.000Z',
          movementReferences: ['out-1', 'in-1'],
        },
      }),
    ).rejects.toThrow(
      'Insufficient source batch stock for production component ins-raw: required 6, valued 2',
    );

    expect(manager.save).not.toHaveBeenCalledWith(
      Batch,
      expect.objectContaining({ id: 'batch-a', remaining_stock: 0 }),
    );
    expect(manager.create).not.toHaveBeenCalledWith(
      InventoryMovement,
      expect.objectContaining({
        sourceDocumentId: 'prod-doc-partial-valuation',
      }),
    );
    expect(manager.create).not.toHaveBeenCalledWith(
      ProductionBatchHistory,
      expect.objectContaining({
        production_document_id: 'prod-doc-partial-valuation',
      }),
    );
    expect(manager.create).not.toHaveBeenCalledWith(
      InventorySyncReceipt,
      expect.objectContaining({
        idempotency_key: 'production:terminal-1:prod-doc-partial-valuation',
      }),
    );
  });

  it('rejects failed replay when no source batch stock exists for required component consumption', async () => {
    recipeService.getSnapshot.mockResolvedValue({
      recipeVersion: { id: 'v3' },
      components: [{ insumo_id: 'ins-raw', quantity: 1.5 }],
    });
    bomExplosionService.explode.mockReturnValue(new Map([['ins-raw', 3]]));
    managerBatchRepo.find.mockResolvedValue([]);
    batchCostingService.buildValuationTrace.mockReturnValue([]);

    await expect(
      service.replayProductionClose({
        tenantId: 'tenant-A',
        document: {
          id: 'prod-doc-missing-valuation-failed',
          recipeVersionId: 'v3',
          producedInsumoId: 'ins-finished',
          producedBatchNumber: 'PB-MISSING-VALUATION-FAILED',
          producedExpirationDate: '2026-12-01T00:00:00.000Z',
          plannedQuantity: 2,
          actualQuantity: 0,
          outcome: 'FAILED',
          failureReason: 'DESECHO_COCINA',
          terminalId: 'terminal-1',
          sourceSequence: 29,
          idempotencyKey:
            'production:terminal-1:prod-doc-missing-valuation-failed',
          payloadHash: 'client-hash',
          operationDate: '2026-05-01T00:00:00.000Z',
          movementReferences: ['out-1'],
        },
      }),
    ).rejects.toThrow(
      'Insufficient source batch stock for production component ins-raw: required 3, valued 0',
    );

    expect(manager.create).not.toHaveBeenCalledWith(
      InventoryMovement,
      expect.objectContaining({
        sourceDocumentId: 'prod-doc-missing-valuation-failed',
      }),
    );
    expect(manager.create).not.toHaveBeenCalledWith(
      ProductionBatchHistory,
      expect.objectContaining({
        production_document_id: 'prod-doc-missing-valuation-failed',
      }),
    );
    expect(manager.create).not.toHaveBeenCalledWith(
      InventorySyncReceipt,
      expect.objectContaining({
        idempotency_key:
          'production:terminal-1:prod-doc-missing-valuation-failed',
      }),
    );
  });

  it('assigns deterministic unique source sequences to each Kardex movement from one production close', async () => {
    recipeService.getSnapshot.mockResolvedValue({
      recipeVersion: { id: 'v3' },
      components: [
        { insumo_id: 'ins-raw-a', quantity: 1 },
        { insumo_id: 'ins-raw-b', quantity: 2 },
      ],
    });
    bomExplosionService.explode.mockReturnValue(
      new Map([
        ['ins-raw-a', 3],
        ['ins-raw-b', 6],
      ]),
    );
    managerBatchRepo.find
      .mockResolvedValueOnce([
        { id: 'batch-a', remaining_stock: 5, cost: 2, expiration_date: null },
      ])
      .mockResolvedValueOnce([
        { id: 'batch-b', remaining_stock: 8, cost: 3, expiration_date: null },
      ]);
    batchCostingService.buildValuationTrace
      .mockReturnValueOnce([
        {
          batchId: 'batch-a',
          insumoId: 'ins-raw-a',
          consumedQuantity: 3,
          unitCostNio: 2,
          totalCostNio: 6,
          isSoftExpired: false,
        },
      ])
      .mockReturnValueOnce([
        {
          batchId: 'batch-b',
          insumoId: 'ins-raw-b',
          consumedQuantity: 6,
          unitCostNio: 3,
          totalCostNio: 18,
          isSoftExpired: false,
        },
      ]);

    await service.replayProductionClose({
      tenantId: 'tenant-A',
      document: {
        id: 'prod-doc-unique-kardex-sequences',
        recipeVersionId: 'v3',
        producedInsumoId: 'ins-finished',
        producedBatchNumber: 'PB-UNIQUE-KARDEX',
        producedExpirationDate: '2026-12-01T00:00:00.000Z',
        plannedQuantity: 3,
        actualQuantity: 3,
        outcome: 'COMPLETED',
        terminalId: 'terminal-1',
        sourceSequence: 21,
        idempotencyKey:
          'production:terminal-1:prod-doc-unique-kardex-sequences',
        payloadHash: 'client-hash',
        operationDate: '2026-05-01T00:00:00.000Z',
        movementReferences: ['out-a', 'out-b', 'in-1'],
      },
    });

    const movementPayloads = manager.create.mock.calls
      .filter(([entity]) => entity === InventoryMovement)
      .map(([, payload]) => payload as InventoryMovement);
    const movementSourceSequences = movementPayloads.map(
      (movement) => movement.sourceSequence,
    );

    expect(movementPayloads).toHaveLength(3);
    expect(movementPayloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          insumoId: 'ins-raw-a',
          sourceDocumentId: 'prod-doc-unique-kardex-sequences',
          sourceDeviceId: 'terminal-1',
        }),
        expect.objectContaining({
          insumoId: 'ins-raw-b',
          sourceDocumentId: 'prod-doc-unique-kardex-sequences',
          sourceDeviceId: 'terminal-1',
        }),
        expect.objectContaining({
          insumoId: 'ins-finished',
          sourceDocumentId: 'prod-doc-unique-kardex-sequences',
          sourceDeviceId: 'terminal-1',
        }),
      ]),
    );
    expect(movementSourceSequences).toEqual(['-21001', '-21002', '-21003']);
    expect(new Set(movementSourceSequences).size).toBe(
      movementSourceSequences.length,
    );
    expect(
      movementSourceSequences.every((sourceSequence) =>
        sourceSequence.startsWith('-'),
      ),
    ).toBe(true);
  });

  it('skips idempotent replay when the same key has the same payload hash', async () => {
    const document = {
      id: 'prod-doc-1',
      recipeVersionId: 'v3',
      producedInsumoId: 'ins-finished',
      producedBatchNumber: 'PB-001',
      producedExpirationDate: '2026-12-01T00:00:00.000Z',
      plannedQuantity: 4,
      actualQuantity: 4,
      outcome: 'COMPLETED' as const,
      terminalId: 'terminal-1',
      sourceSequence: 7,
      idempotencyKey: 'production:terminal-1:prod-doc-1',
      payloadHash: 'hash-a',
      operationDate: '2026-05-01T00:00:00.000Z',
      movementReferences: [],
    };
    inventoryReceiptRepo.findOneBy.mockResolvedValueOnce({
      idempotency_key: 'production:terminal-1:prod-doc-1',
      payload_hash: calculateProductionClosePayloadHash(document),
    });

    const result = await service.replayProductionClose({
      tenantId: 'tenant-A',
      document,
    });

    expect(result).toEqual({ documentId: 'prod-doc-1', skippedExisting: true });
    expect(recipeService.getSnapshot).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('computes the replay payload hash server-side instead of trusting the caller hash', async () => {
    const document = {
      id: 'prod-doc-1',
      recipeVersionId: 'v3',
      producedInsumoId: 'ins-finished',
      producedBatchNumber: 'PB-001',
      producedExpirationDate: '2026-12-01T00:00:00.000Z',
      plannedQuantity: 4,
      actualQuantity: 4,
      outcome: 'COMPLETED' as const,
      terminalId: 'terminal-1',
      sourceSequence: 7,
      idempotencyKey: 'production:terminal-1:prod-doc-1',
      payloadHash: 'caller-supplied-mismatch',
      operationDate: '2026-05-01T00:00:00.000Z',
      movementReferences: [],
    };
    inventoryReceiptRepo.findOneBy.mockResolvedValueOnce({
      idempotency_key: document.idempotencyKey,
      payload_hash: calculateProductionClosePayloadHash({
        ...document,
        payloadHash: 'different-caller-value',
      }),
    });

    const result = await service.replayProductionClose({
      tenantId: 'tenant-A',
      document,
    });

    expect(result).toEqual({ documentId: 'prod-doc-1', skippedExisting: true });
    expect(recipeService.getSnapshot).not.toHaveBeenCalled();
  });

  it('changes the server payload hash when replay-relevant document content changes', () => {
    const baseDocument = {
      id: 'prod-doc-1',
      recipeVersionId: 'v3',
      producedInsumoId: 'ins-finished',
      producedBatchNumber: 'PB-001',
      producedExpirationDate: '2026-12-01T00:00:00.000Z',
      plannedQuantity: 4,
      actualQuantity: 4,
      outcome: 'COMPLETED' as const,
      terminalId: 'terminal-1',
      sourceSequence: 7,
      idempotencyKey: 'production:terminal-1:prod-doc-1',
      payloadHash: 'client-a',
      operationDate: '2026-05-01T00:00:00.000Z',
      movementReferences: ['out-1', 'in-1'],
    };

    expect(
      calculateProductionClosePayloadHash({
        ...baseDocument,
        payloadHash: 'client-b',
      }),
    ).toBe(calculateProductionClosePayloadHash(baseDocument));
    expect(
      calculateProductionClosePayloadHash({
        ...baseDocument,
        actualQuantity: 5,
      }),
    ).not.toBe(calculateProductionClosePayloadHash(baseDocument));
  });

  it('ignores client-supplied costing diagnostics when computing replay payload hashes', () => {
    const baseDocument = {
      id: 'prod-doc-diagnostics-hash',
      recipeVersionId: 'v3',
      producedInsumoId: 'ins-finished',
      producedBatchNumber: 'PB-DIAGNOSTICS-HASH',
      producedExpirationDate: '2026-12-01T00:00:00.000Z',
      plannedQuantity: 4,
      actualQuantity: 4,
      outcome: 'COMPLETED' as const,
      terminalId: 'terminal-1',
      sourceSequence: 17,
      idempotencyKey: 'production:terminal-1:prod-doc-diagnostics-hash',
      payloadHash: 'client-a',
      operationDate: '2026-05-01T00:00:00.000Z',
      movementReferences: ['out-1', 'in-1'],
    };

    expect(
      calculateProductionClosePayloadHash({
        ...baseDocument,
        totalConsumedCostNio: 9999,
        producedUnitCostNio: 777,
      }),
    ).toBe(calculateProductionClosePayloadHash(baseDocument));
  });

  it('persists server-derived production costs when the client manipulates cost diagnostics', async () => {
    recipeService.getSnapshot.mockResolvedValue({
      recipeVersion: { id: 'v3' },
      components: [{ insumo_id: 'ins-raw', quantity: 2 }],
    });
    bomExplosionService.explode.mockReturnValue(new Map([['ins-raw', 4]]));
    managerBatchRepo.find.mockResolvedValue([
      { id: 'b1', remaining_stock: 10, cost: 2, expiration_date: new Date() },
    ]);
    batchCostingService.buildValuationTrace.mockReturnValue([
      {
        batchId: 'b1',
        insumoId: 'ins-raw',
        consumedQuantity: 4,
        unitCostNio: 2,
        totalCostNio: 8,
        isSoftExpired: false,
      },
    ]);

    await service.replayProductionClose({
      tenantId: 'tenant-A',
      document: {
        id: 'prod-doc-manipulated-costs',
        recipeVersionId: 'v3',
        producedInsumoId: 'ins-finished',
        producedBatchNumber: 'PB-MANIPULATED-COSTS',
        producedExpirationDate: '2026-12-01T00:00:00.000Z',
        plannedQuantity: 4,
        actualQuantity: 4,
        outcome: 'COMPLETED',
        terminalId: 'terminal-1',
        sourceSequence: 18,
        idempotencyKey: 'production:terminal-1:prod-doc-manipulated-costs',
        payloadHash: 'client-hash',
        totalConsumedCostNio: 9999,
        producedUnitCostNio: 777,
        operationDate: '2026-05-01T10:30:00.000Z',
        movementReferences: ['out-1', 'in-1'],
      },
    });

    expect(manager.create).toHaveBeenCalledWith(
      InventoryMovement,
      expect.objectContaining({
        insumoId: 'ins-finished',
        quantity: 4,
        unitCostNio: 2,
        totalCostNio: 8,
      }),
    );
    expect(manager.create).toHaveBeenCalledWith(
      Batch,
      expect.objectContaining({
        batch_number: 'PB-MANIPULATED-COSTS',
        cost: 2,
      }),
    );
    expect(manager.create).toHaveBeenCalledWith(
      ProductionBatchHistory,
      expect.objectContaining({
        production_document_id: 'prod-doc-manipulated-costs',
        total_consumed_cost_nio: 8,
        produced_unit_cost_nio: 2,
      }),
    );
  });

  it('uses the DB replay key of tenant, source device, flow, and source sequence for idempotency lookup', async () => {
    const document = {
      id: 'prod-doc-1',
      recipeVersionId: 'v3',
      producedInsumoId: 'ins-finished',
      producedBatchNumber: 'PB-001',
      producedExpirationDate: '2026-12-01T00:00:00.000Z',
      plannedQuantity: 4,
      actualQuantity: 4,
      outcome: 'COMPLETED' as const,
      terminalId: 'terminal-1',
      sourceSequence: 7,
      idempotencyKey: 'production:terminal-1:prod-doc-1',
      payloadHash: 'client-hash',
      operationDate: '2026-05-01T00:00:00.000Z',
      movementReferences: [],
    };
    inventoryReceiptRepo.findOneBy.mockResolvedValueOnce({
      idempotency_key: 'older-client-key-for-same-source-sequence',
      payload_hash: calculateProductionClosePayloadHash(document),
    });

    const result = await service.replayProductionClose({
      tenantId: 'tenant-A',
      document,
    });

    expect(inventoryReceiptRepo.findOneBy).toHaveBeenCalledWith({
      tenant_id: 'tenant-A',
      source_device_id: 'terminal-1',
      flow_type: 'production',
      source_sequence: '7',
    });
    expect(result).toEqual({ documentId: 'prod-doc-1', skippedExisting: true });
  });

  it('skips idempotent replay when the same idempotency key already exists at a different source sequence with the same hash', async () => {
    const document = {
      id: 'prod-doc-same-key-new-sequence',
      recipeVersionId: 'v3',
      producedInsumoId: 'ins-finished',
      producedBatchNumber: 'PB-SAME-KEY',
      producedExpirationDate: '2026-12-01T00:00:00.000Z',
      plannedQuantity: 4,
      actualQuantity: 4,
      outcome: 'COMPLETED' as const,
      terminalId: 'terminal-1',
      sourceSequence: 8,
      idempotencyKey: 'production:terminal-1:stable-idempotency-key',
      payloadHash: 'client-hash',
      operationDate: '2026-05-01T00:00:00.000Z',
      movementReferences: [],
    };
    inventoryReceiptRepo.findOneBy
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        idempotency_key: document.idempotencyKey,
        payload_hash: calculateProductionClosePayloadHash(document),
        source_sequence: '7',
      });

    const result = await service.replayProductionClose({
      tenantId: 'tenant-A',
      document,
    });

    expect(inventoryReceiptRepo.findOneBy).toHaveBeenNthCalledWith(2, {
      tenant_id: 'tenant-A',
      idempotency_key: 'production:terminal-1:stable-idempotency-key',
      flow_type: 'production',
    });
    expect(result).toEqual({
      documentId: 'prod-doc-same-key-new-sequence',
      skippedExisting: true,
    });
    expect(recipeService.getSnapshot).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects the same idempotency key at a different source sequence with a different payload hash before posting inventory', async () => {
    const document = {
      id: 'prod-doc-same-key-conflict',
      recipeVersionId: 'v3',
      producedInsumoId: 'ins-finished',
      producedBatchNumber: 'PB-SAME-KEY-CONFLICT',
      producedExpirationDate: '2026-12-01T00:00:00.000Z',
      plannedQuantity: 4,
      actualQuantity: 4,
      outcome: 'COMPLETED' as const,
      terminalId: 'terminal-1',
      sourceSequence: 8,
      idempotencyKey: 'production:terminal-1:conflicting-idempotency-key',
      payloadHash: 'client-hash',
      operationDate: '2026-05-01T00:00:00.000Z',
      movementReferences: [],
    };
    inventoryReceiptRepo.findOneBy
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        idempotency_key: document.idempotencyKey,
        payload_hash: 'different-server-hash',
        source_sequence: '7',
      });

    await expect(
      service.replayProductionClose({ tenantId: 'tenant-A', document }),
    ).rejects.toThrow(
      'Idempotency key already exists with a different payload hash',
    );

    expect(recipeService.getSnapshot).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects non-positive production replay source sequences before posting inventory or history', async () => {
    await expect(
      service.replayProductionClose({
        tenantId: 'tenant-A',
        document: {
          id: 'prod-doc-zero-sequence',
          recipeVersionId: 'v3',
          producedInsumoId: 'ins-finished',
          producedBatchNumber: 'PB-ZERO',
          producedExpirationDate: '2026-12-01T00:00:00.000Z',
          plannedQuantity: 4,
          actualQuantity: 4,
          outcome: 'COMPLETED',
          terminalId: 'terminal-1',
          sourceSequence: 0,
          idempotencyKey: 'production:terminal-1:prod-doc-zero-sequence',
          payloadHash: 'client-hash',
          operationDate: '2026-05-01T00:00:00.000Z',
          movementReferences: ['out-1', 'in-1'],
        },
      }),
    ).rejects.toThrow('Production replay source sequence must be positive');

    expect(recipeService.getSnapshot).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects a production replay sequence gap before posting inventory or history', async () => {
    inventoryReceiptQueryBuilder.getOne.mockResolvedValueOnce(null);

    await expect(
      service.replayProductionClose({
        tenantId: 'tenant-A',
        document: {
          id: 'prod-doc-gap',
          recipeVersionId: 'v3',
          producedInsumoId: 'ins-finished',
          producedBatchNumber: 'PB-GAP',
          producedExpirationDate: '2026-12-01T00:00:00.000Z',
          plannedQuantity: 4,
          actualQuantity: 4,
          outcome: 'COMPLETED',
          terminalId: 'terminal-1',
          sourceSequence: 2,
          idempotencyKey: 'production:terminal-1:prod-doc-gap',
          payloadHash: 'client-hash',
          operationDate: '2026-05-01T00:00:00.000Z',
          movementReferences: ['out-1', 'in-1'],
        },
      }),
    ).rejects.toThrow('Production replay sequence gap');

    expect(recipeService.getSnapshot).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('accepts the next contiguous production replay sequence', async () => {
    recipeService.getSnapshot.mockResolvedValue({
      recipeVersion: { id: 'v3' },
      components: [{ insumo_id: 'ins-raw', quantity: 2 }],
    });
    bomExplosionService.explode.mockReturnValue(new Map([['ins-raw', 4]]));
    managerBatchRepo.find.mockResolvedValue([
      { id: 'b1', remaining_stock: 10, cost: 2, expiration_date: new Date() },
    ]);
    batchCostingService.buildValuationTrace.mockReturnValue([
      {
        batchId: 'b1',
        insumoId: 'ins-raw',
        consumedQuantity: 4,
        unitCostNio: 2,
        totalCostNio: 8,
        isSoftExpired: false,
      },
    ]);
    inventoryReceiptQueryBuilder.getOne.mockResolvedValueOnce({
      tenant_id: 'tenant-A',
      source_device_id: 'terminal-1',
      flow_type: 'production',
      source_sequence: '1',
    });

    const result = await service.replayProductionClose({
      tenantId: 'tenant-A',
      document: {
        id: 'prod-doc-next-sequence',
        recipeVersionId: 'v3',
        producedInsumoId: 'ins-finished',
        producedBatchNumber: 'PB-NEXT',
        producedExpirationDate: '2026-12-01T00:00:00.000Z',
        plannedQuantity: 4,
        actualQuantity: 4,
        outcome: 'COMPLETED',
        terminalId: 'terminal-1',
        sourceSequence: 2,
        idempotencyKey: 'production:terminal-1:prod-doc-next-sequence',
        payloadHash: 'client-hash',
        operationDate: '2026-05-01T00:00:00.000Z',
        movementReferences: ['out-1', 'in-1'],
      },
    });

    expect(result).toEqual({
      documentId: 'prod-doc-next-sequence',
      skippedExisting: false,
    });
    expect(manager.create).toHaveBeenCalledWith(
      InventorySyncReceipt,
      expect.objectContaining({
        source_device_id: 'terminal-1',
        flow_type: 'production',
        source_sequence: '2',
      }),
    );
  });

  it('explodes completed production replay using actual quantity rather than planned quantity', async () => {
    recipeService.getSnapshot.mockResolvedValue({
      recipeVersion: { id: 'v3' },
      components: [{ insumo_id: 'ins-raw', quantity: 2 }],
    });
    bomExplosionService.explode.mockReturnValue(new Map([['ins-raw', 6]]));
    managerBatchRepo.find.mockResolvedValue([
      { id: 'b1', remaining_stock: 10, cost: 2, expiration_date: new Date() },
    ]);
    batchCostingService.buildValuationTrace.mockReturnValue([
      {
        batchId: 'b1',
        insumoId: 'ins-raw',
        consumedQuantity: 6,
        unitCostNio: 2,
        totalCostNio: 12,
        isSoftExpired: false,
      },
    ]);

    await service.replayProductionClose({
      tenantId: 'tenant-A',
      document: {
        id: 'prod-doc-actual-not-planned',
        recipeVersionId: 'v3',
        producedInsumoId: 'ins-finished',
        producedBatchNumber: 'PB-ACTUAL',
        producedExpirationDate: '2026-12-01T00:00:00.000Z',
        plannedQuantity: 10,
        actualQuantity: 3,
        outcome: 'COMPLETED',
        terminalId: 'terminal-1',
        sourceSequence: 22,
        idempotencyKey: 'production:terminal-1:prod-doc-actual-not-planned',
        payloadHash: 'client-hash',
        operationDate: '2026-05-01T00:00:00.000Z',
        movementReferences: ['out-1', 'in-1'],
      },
    });

    expect(bomExplosionService.explode).toHaveBeenCalledWith({
      snapshotComponents: [{ insumo_id: 'ins-raw', quantity: 2 }],
      orderQuantity: 3,
    });
    expect(manager.create).toHaveBeenCalledWith(
      InventoryMovement,
      expect.objectContaining({
        insumoId: 'ins-raw',
        quantity: -6,
      }),
    );
  });

  it('fails a completed production replay transactionally when the produced insumo is missing', async () => {
    recipeService.getSnapshot.mockResolvedValue({
      recipeVersion: { id: 'v3' },
      components: [{ insumo_id: 'ins-raw', quantity: 2 }],
    });
    bomExplosionService.explode.mockReturnValue(new Map([['ins-raw', 4]]));
    managerBatchRepo.find.mockResolvedValue([
      { id: 'b1', remaining_stock: 10, cost: 2, expiration_date: new Date() },
    ]);
    batchCostingService.buildValuationTrace.mockReturnValue([
      {
        batchId: 'b1',
        insumoId: 'ins-raw',
        consumedQuantity: 4,
        unitCostNio: 2,
        totalCostNio: 8,
        isSoftExpired: false,
      },
    ]);
    manager.createQueryBuilder
      .mockImplementationOnce(() => ({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          id: 'ins-raw',
          stock: 10,
          existenciaActual: 10,
          averageCost: 3,
        }),
      }))
      .mockImplementationOnce(() => ({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      }));

    await expect(
      service.replayProductionClose({
        tenantId: 'tenant-A',
        document: {
          id: 'prod-doc-missing-produced-insumo',
          recipeVersionId: 'v3',
          producedInsumoId: 'missing-finished',
          producedBatchNumber: 'PB-MISSING-FINISHED',
          producedExpirationDate: '2026-12-01T00:00:00.000Z',
          plannedQuantity: 4,
          actualQuantity: 4,
          outcome: 'COMPLETED',
          terminalId: 'terminal-1',
          sourceSequence: 23,
          idempotencyKey: 'production:terminal-1:prod-doc-missing-produced',
          payloadHash: 'client-hash',
          operationDate: '2026-05-01T00:00:00.000Z',
          movementReferences: ['out-1', 'in-1'],
        },
      }),
    ).rejects.toThrow('Production close references an unknown insumo');

    expect(manager.create).not.toHaveBeenCalledWith(
      ProductionBatchHistory,
      expect.anything(),
    );
    expect(manager.create).not.toHaveBeenCalledWith(
      InventorySyncReceipt,
      expect.anything(),
    );
  });

  it('rejects an idempotency key replayed with a different payload hash', async () => {
    inventoryReceiptRepo.findOneBy.mockResolvedValueOnce({
      idempotency_key: 'production:terminal-1:prod-doc-1',
      payload_hash: 'hash-a',
    });

    await expect(
      service.replayProductionClose({
        tenantId: 'tenant-A',
        document: {
          id: 'prod-doc-1',
          recipeVersionId: 'v3',
          producedInsumoId: 'ins-finished',
          producedBatchNumber: 'PB-001',
          producedExpirationDate: '2026-12-01T00:00:00.000Z',
          plannedQuantity: 4,
          actualQuantity: 4,
          outcome: 'COMPLETED',
          terminalId: 'terminal-1',
          sourceSequence: 7,
          idempotencyKey: 'production:terminal-1:prod-doc-1',
          payloadHash: 'hash-b',
          operationDate: '2026-05-01T00:00:00.000Z',
          movementReferences: [],
        },
      }),
    ).rejects.toThrow(
      'Idempotency key already exists with a different payload hash',
    );
  });

  it('records failed production as consumed OUT history without a finished IN movement', async () => {
    recipeService.getSnapshot.mockResolvedValue({
      recipeVersion: { id: 'v3' },
      components: [{ insumo_id: 'ins-raw', quantity: 2 }],
    });
    bomExplosionService.explode.mockReturnValue(new Map([['ins-raw', 4]]));
    batchRepo.find.mockResolvedValue([
      { id: 'b1', remaining_stock: 10, cost: 2 },
    ]);
    batchCostingService.buildValuationTrace.mockReturnValue([
      {
        batchId: 'b1',
        consumedQuantity: 4,
        unitCostNio: 2,
        totalCostNio: 8,
        isSoftExpired: false,
      },
    ]);

    await service.replayProductionClose({
      tenantId: 'tenant-A',
      document: {
        id: 'failed-doc-1',
        recipeVersionId: 'v3',
        producedInsumoId: 'ins-finished',
        producedBatchNumber: 'PB-FAIL',
        producedExpirationDate: '2026-12-01T00:00:00.000Z',
        plannedQuantity: 4,
        actualQuantity: 0,
        outcome: 'FAILED',
        failureReason: 'DESECHO_COCINA',
        terminalId: 'terminal-1',
        sourceSequence: 8,
        idempotencyKey: 'production:terminal-1:failed-doc-1',
        payloadHash: 'hash-fail',
        totalConsumedCostNio: 8,
        operationDate: '2026-05-01T00:00:00.000Z',
        movementReferences: ['out-1'],
      },
    });

    const createdMovements = manager.create.mock.calls.filter(
      ([entity]) => entity === InventoryMovement,
    );
    expect(createdMovements).toHaveLength(1);
    expect(createdMovements[0][1]).toEqual(
      expect.objectContaining({
        quantity: -4,
        sourceDocumentId: 'failed-doc-1',
        sourceDocumentType: 'PRODUCTION_CLOSE',
      }),
    );
    expect(manager.create).toHaveBeenCalledWith(
      ProductionBatchHistory,
      expect.objectContaining({
        production_document_id: 'failed-doc-1',
        actual_quantity: 0,
        outcome: 'FAILED',
        failure_reason: 'DESECHO_COCINA',
      }),
    );
  });

  it('creates a produced batch with received date from the close operation date', async () => {
    recipeService.getSnapshot.mockResolvedValue({
      recipeVersion: { id: 'v3' },
      components: [{ insumo_id: 'ins-raw', quantity: 2 }],
    });
    bomExplosionService.explode.mockReturnValue(new Map([['ins-raw', 4]]));
    batchRepo.find.mockResolvedValue([
      { id: 'b1', remaining_stock: 10, cost: 2, expiration_date: new Date() },
    ]);
    batchCostingService.buildValuationTrace.mockReturnValue([
      {
        batchId: 'b1',
        consumedQuantity: 4,
        unitCostNio: 2,
        totalCostNio: 8,
        isSoftExpired: false,
      },
    ]);

    await service.replayProductionClose({
      tenantId: 'tenant-A',
      document: {
        id: 'prod-doc-new-batch',
        recipeVersionId: 'v3',
        producedInsumoId: 'ins-finished',
        producedBatchNumber: 'PB-NEW',
        producedExpirationDate: '2026-12-01T00:00:00.000Z',
        plannedQuantity: 4,
        actualQuantity: 4,
        outcome: 'COMPLETED',
        terminalId: 'terminal-1',
        sourceSequence: 9,
        idempotencyKey: 'production:terminal-1:prod-doc-new-batch',
        payloadHash: 'client-hash',
        operationDate: '2026-05-01T10:30:00.000Z',
        movementReferences: ['out-1', 'in-1'],
      },
    });

    expect(manager.create).toHaveBeenCalledWith(
      Batch,
      expect.objectContaining({
        batch_number: 'PB-NEW',
        received_date: new Date('2026-05-01T10:30:00.000Z'),
        expiration_date: new Date('2026-12-01T00:00:00.000Z'),
        remaining_stock: 4,
        cost: 2,
      }),
    );
  });
});
