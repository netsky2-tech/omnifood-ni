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

  const inventoryReceiptRepo = { findOneBy: jest.fn() };
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
    inventoryReceiptRepo.findOneBy.mockResolvedValue(null);
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
