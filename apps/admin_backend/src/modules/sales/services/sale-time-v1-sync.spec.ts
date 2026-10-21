import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { InvoicesService } from './invoices.service';
import { SaleInventoryOutcomeService } from './sale-inventory-outcome.service';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { InvoiceItemModifier } from '../entities/invoice-item-modifier.entity';
import { Payment } from '../entities/payment.entity';
import { User } from '../../identity/entities/user.entity';
import {
  InventoryMovement,
  MovementType,
} from '../../inventory/entities/inventory-movement.entity';
import { InventorySyncReceipt } from '../../inventory/entities/inventory-sync-receipt.entity';
import { InventorySyncOutbox } from '../../inventory/entities/inventory-sync-outbox.entity';
import { RecipeService } from '../../inventory/recipe.service';
import { BomExplosionService } from '../../inventory/bom-explosion.service';
import { SyncBatchRecordDto } from '../dto/sync-batch.dto';
import { Batch } from '../../inventory/entities/batch.entity';
import { BatchOutflowTrace } from '../../inventory/entities/batch-outflow-trace.entity';
import { InventoryDivergence } from '../../inventory/entities/inventory-divergence.entity';
import { ProductInventoryMappingVersion } from '../../inventory/entities/product-inventory-mapping-version.entity';
import { RecipeVersion } from '../../inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../inventory/entities/recipe-detail.entity';
import { Insumo } from '../../inventory/entities/insumo.entity';

describe('InvoicesService SALE_TIME_V1 syncBatch integration', () => {
  let service: InvoicesService;
  let savedReceipts: any[] = [];
  let savedMovements: any[] = [];
  let savedInvoices: any[] = [];
  let savedItems: any[] = [];
  let updatedInsumos: any[] = [];
  // FD-01: the declared differences (the divergence ledger).
  let savedDivergences: any[] = [];
  let currentMockInsumo: any;

  const tenantId = 'tenant-test-v1';
  const insumoId = '11111111-2222-3333-4444-555555555555';
  const mappingVersionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  beforeEach(async () => {
    savedReceipts = [];
    savedMovements = [];
    savedInvoices = [];
    savedItems = [];
    updatedInsumos = [];
    savedDivergences = [];

    const mockInsumo: any = {
      id: insumoId,
      tenant_id: tenantId,
      stock: 100,
      existenciaActual: 100,
      averageCost: 15,
      negativeStockPolicy: 'ALLOW',
    };
    currentMockInsumo = mockInsumo;

    const mockMapping: any = {
      id: mappingVersionId,
      tenant_id: tenantId,
      product_id: 'prod-direct-1',
      insumo_id: insumoId,
    };

    const mockTxManager: any = {
      query: jest.fn(async () => []),
      getRepository: jest.fn((entity: any) => {
        if (entity === ProductInventoryMappingVersion) {
          return {
            findOne: jest.fn(async ({ where }: any) => {
              if (
                where.id === mappingVersionId &&
                where.tenant_id === tenantId &&
                where.product_id === 'prod-direct-1' &&
                where.insumo_id === insumoId
              ) {
                return mockMapping;
              }
              return null;
            }),
          };
        }
        if (entity === RecipeVersion) {
          return { findOne: jest.fn(async () => null) };
        }
        if (entity === RecipeDetail) {
          return { find: jest.fn(async () => []) };
        }
        if (entity === Insumo) {
          return {
            findOne: jest.fn(async ({ where }: any) => {
              if (where.id === insumoId && where.tenant_id === tenantId) {
                return mockInsumo;
              }
              return null;
            }),
          };
        }
        // The sale path mirrors an item's modifier lines inside the same
        // transaction (delete-then-insert). The mock must expose that repo or
        // the fall-through hands back an object without those methods.
        if (entity === InvoiceItemModifier) {
          return { delete: jest.fn(), insert: jest.fn() };
        }
        // R3: the sale path draws the batch outflow and records its trace.
        // No batches / no traces keeps both the draw and the restore as
        // no-ops, exactly like a non batch-managed insumo.
        if (entity === Batch) {
          return { find: jest.fn(async () => []), save: jest.fn() };
        }
        if (entity === BatchOutflowTrace) {
          return {
            find: jest.fn(async () => []),
            save: jest.fn(),
            create: jest.fn((d: any) => d),
          };
        }
        // FD-01: the divergence ledger. The sale path DECLARES the difference
        // it could not back, in the same transaction as the invoice.
        if (entity === InventoryDivergence) {
          return {
            findOne: jest.fn(async () => null),
            save: jest.fn(async (row: any) => {
              savedDivergences.push(row);
              return row;
            }),
            create: jest.fn((dto: any) => dto),
          };
        }
        if (entity === Invoice) {
          return {
            upsert: jest.fn(async (payload: any) => {
              savedInvoices.push(payload);
            }),
            findOne: jest.fn(async () => null),
          };
        }
        if (entity === InvoiceItem) {
          return {
            find: jest.fn(async () => []),
            upsert: jest.fn(async (payload: any) => {
              savedItems.push(...payload);
            }),
          };
        }
        if (entity === InventorySyncReceipt) {
          return {
            findOne: jest.fn(async ({ where }: any = {}) => {
              if (savedReceipts.length === 0) return null;
              if (where?.idempotency_key) {
                return (
                  savedReceipts.find(
                    (r) => r.idempotency_key === where.idempotency_key,
                  ) ?? null
                );
              }
              if (where?.source_sequence) {
                return (
                  savedReceipts.find(
                    (r) =>
                      String(r.source_sequence) ===
                      String(where.source_sequence),
                  ) ?? null
                );
              }
              return savedReceipts[savedReceipts.length - 1];
            }),
            save: jest.fn(async (receipt: any) => {
              savedReceipts.push(receipt);
              return receipt;
            }),
            create: jest.fn((dto: any) => dto),
          };
        }
        if (entity === InventorySyncOutbox) {
          return {
            findOne: jest.fn(async () => null),
            save: jest.fn(async (dto: any) => dto),
            create: jest.fn((dto: any) => dto),
            delete: jest.fn(),
          };
        }
        if (entity === InventoryMovement) {
          return {
            save: jest.fn(async (mov: any) => {
              savedMovements.push(mov);
              return mov;
            }),
            create: jest.fn((dto: any) => dto),
          };
        }
        return {} as any;
      }),
      createQueryBuilder: jest.fn((entity: any) => {
        return {
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getOne: jest.fn(async () => {
            if (entity === Insumo) return mockInsumo;
            return null;
          }),
        } as any;
      }),
      // FD-01: the sale path amends the invoice with the declared divergence.
      update: jest.fn(async () => ({})),
      save: jest.fn(async (entityOrTarget: any, maybeEntity?: any) => {
        const entity = maybeEntity !== undefined ? maybeEntity : entityOrTarget;
        if (entityOrTarget === Insumo || entity.stock !== undefined) {
          updatedInsumos.push(entity);
        } else if (
          entity.insumoId !== undefined ||
          entity.type === MovementType.SALE
        ) {
          savedMovements.push(entity);
        } else if (
          entity.result_status !== undefined ||
          entity.payload_hash !== undefined
        ) {
          savedReceipts.push(entity);
        }
        return entity;
      }),
    };

    const mockDataSource: Partial<DataSource> = {
      transaction: jest.fn(async (isolationOrCb: any, maybeCb?: any) => {
        const cb =
          typeof isolationOrCb === 'function' ? isolationOrCb : maybeCb;
        return cb(mockTxManager as EntityManager);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        SaleInventoryOutcomeService,
        { provide: DataSource, useValue: mockDataSource },
        {
          provide: getRepositoryToken(Invoice),
          useValue: {
            upsert: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(InvoiceItem),
          useValue: {
            upsert: jest.fn(),
            findOne: jest.fn(),
          },
        },
        { provide: getRepositoryToken(Payment), useValue: { save: jest.fn() } },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn() } },
        {
          provide: getRepositoryToken(InventoryMovement),
          useValue: {
            create: jest.fn((dto) => dto),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(InventorySyncReceipt),
          useValue: {
            create: jest.fn((dto) => dto),
            save: jest.fn(),
            findOne: jest.fn(async () => null),
          },
        },
        {
          provide: getRepositoryToken(InventorySyncOutbox),
          useValue: {
            findOne: jest.fn(async () => null),
            delete: jest.fn(),
            create: jest.fn((dto) => dto),
            save: jest.fn(),
          },
        },
        {
          provide: RecipeService,
          useValue: {
            getSnapshot: jest.fn(),
            findActiveVersion: jest.fn(),
          },
        },
        {
          provide: BomExplosionService,
          useValue: {
            explode: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
  });

  it('processes a SALE_TIME_V1 DIRECT sale, creates Kardex movement with saleCorrelationId, and returns APPLIED outcome', async () => {
    const correlationId = 'sha256-corr-direct-100';
    const record: SyncBatchRecordDto = {
      idempotencyKey: 'idemp-sale-direct-1',
      sourceDeviceId: 'dev-pos-1',
      sourceSequence: 1,
      flowType: 'sales',
      documentType: 'SALE',
      invoice: {
        id: 'inv-v1-direct',
        number: '001-001-00000010',
        createdAt: new Date().toISOString(),
        userId: 'cashier-1',
        subtotal: 100,
        totalTax: 15,
        total: 115,
        paymentStatus: 'PAID',
        inventoryPolicyVersion: 'SALE_TIME_V1',
        inventoryOutcome: 'APPLIED',
        items: [
          {
            id: 'item-d1',
            productId: 'prod-direct-1',
            productName: 'Direct Product',
            quantity: 2,
            unitPrice: 50,
            originalTaxRate: 0.15,
            appliedTaxRate: 0.15,
            taxAmount: 15,
            total: 115,
            discount: 0,
            inventorySnapshotVersion: 'SALE_TIME_V1',
            inventorySnapshot: {
              classification: 'SIMPLE',
              disposition: 'DIRECT',
              catalogRevision: 'rev-001',
              mappingVersionId: mappingVersionId,
              bindings: [
                {
                  bindingOrdinal: 0,
                  insumoId: insumoId,
                  quantityPerSaleUnit: 1.5,
                  saleCorrelationId: correlationId,
                },
              ],
            },
          },
        ],
        payments: [],
      },
    };

    const result = await service.syncBatch(tenantId, [record]);

    expect(result.processed).toBe(1);
    expect(result.results).toHaveLength(1);
    const itemResult = result.results[0];
    expect(itemResult.status).toBe('ACCEPTED');
    expect(itemResult.code).toBe('APPLIED');
    expect(itemResult.inventoryOutcome).toBe('APPLIED');
    expect(itemResult.policyVersion).toBe('SALE_TIME_V1');
    expect(itemResult.acknowledgedMovementCorrelationIds).toEqual([
      correlationId,
    ]);

    // Check Kardex movements
    expect(savedMovements).toHaveLength(1);
    const movement = savedMovements[0];
    expect(movement.insumoId).toBe(insumoId);
    expect(movement.type).toBe(MovementType.SALE);
    expect(movement.quantity).toBe(-3.0); // 2 * 1.5
    expect(movement.idempotencyKey).toBe(correlationId);

    // Check Receipt
    expect(savedReceipts).toHaveLength(1);
    const receipt = savedReceipts[0];
    expect(receipt.result_code).toBe('APPLIED');
    expect(receipt.inventoryPolicyVersion).toBe('SALE_TIME_V1');
    expect(receipt.inventoryOutcome).toBe('APPLIED');
    expect(receipt.acknowledgedCorrelationIds).toEqual([correlationId]);
  });

  it('processes a SALE_TIME_V1 NO_IMPACT sale with zero movements and APPLIED_NO_INVENTORY_IMPACT', async () => {
    const record: SyncBatchRecordDto = {
      idempotencyKey: 'idemp-sale-no-impact',
      sourceDeviceId: 'dev-pos-1',
      sourceSequence: 1,
      flowType: 'sales',
      documentType: 'SALE',
      invoice: {
        id: 'inv-v1-no-impact',
        number: '001-001-00000011',
        createdAt: new Date().toISOString(),
        userId: 'cashier-1',
        subtotal: 50,
        totalTax: 7.5,
        total: 57.5,
        paymentStatus: 'PAID',
        inventoryPolicyVersion: 'SALE_TIME_V1',
        inventoryOutcome: 'APPLIED_NO_INVENTORY_IMPACT',
        items: [
          {
            id: 'item-ni1',
            productId: 'prod-no-mapping',
            productName: 'Service Item',
            quantity: 1,
            unitPrice: 50,
            originalTaxRate: 0.15,
            appliedTaxRate: 0.15,
            taxAmount: 7.5,
            total: 57.5,
            discount: 0,
            inventorySnapshotVersion: 'SALE_TIME_V1',
            inventorySnapshot: {
              classification: 'SIMPLE',
              disposition: 'NO_IMPACT',
              reasonCode: 'NO_EXPLICIT_INSUMO_MAPPING',
              catalogRevision: 'rev-001',
              bindings: [],
            },
          },
        ],
        payments: [],
      },
    };

    const result = await service.syncBatch(tenantId, [record]);

    expect(result.processed).toBe(1);
    const itemResult = result.results[0];
    expect(itemResult.code).toBe('APPLIED_NO_INVENTORY_IMPACT');
    expect(itemResult.inventoryOutcome).toBe('APPLIED_NO_INVENTORY_IMPACT');
    expect(itemResult.acknowledgedMovementCorrelationIds).toEqual([]);
    expect(itemResult.inventoryOutcomeReason).toEqual({
      code: 'NO_EXPLICIT_INSUMO_MAPPING',
      lines: ['item-ni1'],
    });

    // Zero movements must be created
    expect(savedMovements).toHaveLength(0);
    expect(updatedInsumos).toHaveLength(0);

    // Receipt records zero correlations
    expect(savedReceipts).toHaveLength(1);
    expect(savedReceipts[0].result_code).toBe('APPLIED_NO_INVENTORY_IMPACT');
    expect(savedReceipts[0].inventoryOutcome).toBe(
      'APPLIED_NO_INVENTORY_IMPACT',
    );
    expect(savedReceipts[0].acknowledgedCorrelationIds).toEqual([]);
  });

  it('processes a SALE_TIME_V1 PENDING_RECIPE sale with zero movements and APPLIED_INVENTORY_PENDING', async () => {
    const record: SyncBatchRecordDto = {
      idempotencyKey: 'idemp-sale-pending',
      sourceDeviceId: 'dev-pos-1',
      sourceSequence: 1,
      flowType: 'sales',
      documentType: 'SALE',
      invoice: {
        id: 'inv-v1-pending',
        number: '001-001-00000012',
        createdAt: new Date().toISOString(),
        userId: 'cashier-1',
        subtotal: 120,
        totalTax: 18,
        total: 138,
        paymentStatus: 'PAID',
        inventoryPolicyVersion: 'SALE_TIME_V1',
        inventoryOutcome: 'APPLIED_INVENTORY_PENDING',
        items: [
          {
            id: 'item-pr1',
            productId: 'prod-dish-unmapped',
            productName: 'Special Dish',
            quantity: 1,
            unitPrice: 120,
            originalTaxRate: 0.15,
            appliedTaxRate: 0.15,
            taxAmount: 18,
            total: 138,
            discount: 0,
            inventorySnapshotVersion: 'SALE_TIME_V1',
            inventorySnapshot: {
              classification: 'PREPARED',
              disposition: 'PENDING_RECIPE',
              reasonCode: 'MISSING_PUBLISHED_RECIPE',
              catalogRevision: 'rev-001',
              bindings: [],
            },
          },
        ],
        payments: [],
      },
    };

    const result = await service.syncBatch(tenantId, [record]);

    expect(result.processed).toBe(1);
    const itemResult = result.results[0];
    expect(itemResult.code).toBe('APPLIED_INVENTORY_PENDING');
    expect(itemResult.inventoryOutcome).toBe('APPLIED_INVENTORY_PENDING');
    expect(itemResult.acknowledgedMovementCorrelationIds).toEqual([]);
    expect(itemResult.inventoryOutcomeReason).toEqual({
      code: 'MISSING_PUBLISHED_RECIPE',
      lines: ['item-pr1'],
    });

    // Zero movements must be created
    expect(savedMovements).toHaveLength(0);
    expect(updatedInsumos).toHaveLength(0);

    // Receipt records zero correlations
    expect(savedReceipts).toHaveLength(1);
    expect(savedReceipts[0].result_code).toBe('APPLIED_INVENTORY_PENDING');
    expect(savedReceipts[0].inventoryOutcome).toBe('APPLIED_INVENTORY_PENDING');
    expect(savedReceipts[0].acknowledgedCorrelationIds).toEqual([]);
  });

  it('FD-01: DECLARES the RESTRICT breach (instead of degrading), persisting the invoice and advancing the stream sequence', async () => {
    // Modify mock insumo to have 0 stock and RESTRICT policy
    currentMockInsumo.stock = 0;
    currentMockInsumo.negativeStockPolicy = 'RESTRICT';

    const record1: SyncBatchRecordDto = {
      idempotencyKey: 'idemp-sale-restrict-neg',
      sourceDeviceId: 'dev-pos-1',
      sourceSequence: 1,
      flowType: 'sales',
      documentType: 'SALE',
      invoice: {
        id: 'inv-v1-restrict-neg',
        number: '001-001-00000065',
        createdAt: new Date().toISOString(),
        userId: 'cashier-1',
        subtotal: 100,
        totalTax: 15,
        total: 115,
        paymentStatus: 'PAID',
        inventoryPolicyVersion: 'SALE_TIME_V1',
        inventoryOutcome: 'APPLIED',
        items: [
          {
            id: 'item-salmon-1',
            productId: 'prod-direct-1',
            productName: 'Salmon Dish',
            quantity: 1,
            unitPrice: 100,
            originalTaxRate: 0.15,
            appliedTaxRate: 0.15,
            taxAmount: 15,
            total: 115,
            discount: 0,
            inventorySnapshotVersion: 'SALE_TIME_V1',
            inventorySnapshot: {
              classification: 'SIMPLE',
              disposition: 'DIRECT',
              catalogRevision: 'rev-001',
              mappingVersionId: mappingVersionId,
              bindings: [
                {
                  bindingOrdinal: 0,
                  insumoId: insumoId,
                  quantityPerSaleUnit: 1.0,
                  saleCorrelationId: 'corr-salmon-65',
                },
              ],
            },
          },
        ],
        payments: [],
      },
    };

    const record2: SyncBatchRecordDto = {
      idempotencyKey: 'idemp-sale-after-restrict',
      sourceDeviceId: 'dev-pos-1',
      sourceSequence: 2,
      flowType: 'sales',
      documentType: 'SALE',
      invoice: {
        id: 'inv-v1-subsequent-66',
        number: '001-001-00000066',
        createdAt: new Date().toISOString(),
        userId: 'cashier-1',
        subtotal: 50,
        totalTax: 7.5,
        total: 57.5,
        paymentStatus: 'PAID',
        inventoryPolicyVersion: 'SALE_TIME_V1',
        inventoryOutcome: 'APPLIED_NO_INVENTORY_IMPACT',
        items: [
          {
            id: 'item-soda-2',
            productId: 'prod-soda',
            productName: 'Soda',
            quantity: 1,
            unitPrice: 50,
            originalTaxRate: 0.15,
            appliedTaxRate: 0.15,
            taxAmount: 7.5,
            total: 57.5,
            discount: 0,
            inventorySnapshotVersion: 'SALE_TIME_V1',
            inventorySnapshot: {
              classification: 'SIMPLE',
              disposition: 'NO_IMPACT',
              catalogRevision: 'rev-001',
              reasonCode: 'NO_EXPLICIT_INSUMO_MAPPING',
              bindings: [],
            },
          },
        ],
        payments: [],
      },
    };

    const result = await service.syncBatch(tenantId, [record1, record2]);

    // Both records processed, stream is NOT blocked
    expect(result.processed).toBe(2);
    expect(result.results).toHaveLength(2);

    // Record 1 was accepted and DECLARED what did not add up (FD-01: the
    // invoice is always applied; the difference is recorded).
    const res1 = result.results[0];
    expect(res1.status).toBe('ACCEPTED');
    expect(res1.code).toBe('APPLIED_WITH_DIVERGENCE');
    expect(res1.inventoryOutcome).toBe('APPLIED_WITH_DIVERGENCE');
    expect(res1.inventoryOutcomeReason).toEqual(
      expect.objectContaining({
        code: 'INVENTORY_DIVERGENCE_DECLARED',
        lines: [insumoId],
      }),
    );

    // The difference is RECORDED with the sale that caused it.
    expect(savedDivergences).toHaveLength(1);
    expect(savedDivergences[0]).toEqual(
      expect.objectContaining({
        tenant_id: tenantId,
        invoice_id: 'inv-v1-restrict-neg',
        insumo_id: insumoId,
        cause: 'DECLARED_STOCK_INSUFFICIENT',
        status: 'OPEN',
      }),
    );

    // Record 2 is also accepted, proving sequence 1 did not block sequence 2
    const res2 = result.results[1];
    expect(res2.status).toBe('ACCEPTED');
    expect(res2.code).toBe('APPLIED_NO_INVENTORY_IMPACT');

    // Fiscal invoices: BOTH invoices were saved in database (DGI compliance!)
    expect(savedInvoices.map((inv) => inv.id)).toContain('inv-v1-restrict-neg');
    expect(savedInvoices.map((inv) => inv.id)).toContain('inv-v1-subsequent-66');

    // The movement IS created (the goods left the business) and the stock
    // goes negative: the cloud mirrors the terminal instead of freezing.
    expect(savedMovements).toHaveLength(1);
    expect(updatedInsumos).toHaveLength(1);
  });
});
