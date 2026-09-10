import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InvoicesService } from './invoices.service';
import { SaleInventoryOutcomeService } from './sale-inventory-outcome.service';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
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
import { ProductInventoryMappingVersion } from '../../inventory/entities/product-inventory-mapping-version.entity';
import { RecipeVersion, RecipePublicationState } from '../../inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../inventory/entities/recipe-detail.entity';
import { Insumo } from '../../inventory/entities/insumo.entity';

describe('InvoicesService SALE_TIME_V1 syncBatch integration', () => {
  let service: InvoicesService;
  let savedReceipts: any[] = [];
  let savedMovements: any[] = [];
  let savedInvoices: any[] = [];
  let savedItems: any[] = [];
  let updatedInsumos: any[] = [];

  const tenantId = 'tenant-test-v1';
  const insumoId = '11111111-2222-3333-4444-555555555555';
  const mappingVersionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  beforeEach(async () => {
    savedReceipts = [];
    savedMovements = [];
    savedInvoices = [];
    savedItems = [];
    updatedInsumos = [];

    const mockInsumo: any = {
      id: insumoId,
      tenant_id: tenantId,
      stock: 100,
      existenciaActual: 100,
      averageCost: 15,
      negativeStockPolicy: 'ALLOW',
    };

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
            findOne: jest.fn(async () => null),
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
      createQueryBuilder: jest.fn((entity: any, alias: string) => {
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
      save: jest.fn(async (entityOrTarget: any, maybeEntity?: any) => {
        const entity = maybeEntity !== undefined ? maybeEntity : entityOrTarget;
        if (entityOrTarget === Insumo || entity.stock !== undefined) {
          updatedInsumos.push(entity);
        } else if (entity.insumoId !== undefined || entity.type === MovementType.SALE) {
          savedMovements.push(entity);
        } else if (entity.result_status !== undefined || entity.payload_hash !== undefined) {
          savedReceipts.push(entity);
        }
        return entity;
      }),
    };

    const mockDataSource: Partial<DataSource> = {
      transaction: jest.fn(async (isolationOrCb: any, maybeCb?: any) => {
        const cb = typeof isolationOrCb === 'function' ? isolationOrCb : maybeCb;
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
    const itemResult = result.results![0];
    expect(itemResult.status).toBe('ACCEPTED');
    expect(itemResult.code).toBe('APPLIED');
    expect(itemResult.inventoryOutcome).toBe('APPLIED');
    expect(itemResult.policyVersion).toBe('SALE_TIME_V1');
    expect(itemResult.acknowledgedMovementCorrelationIds).toEqual([correlationId]);

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
    const itemResult = result.results![0];
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
    expect(savedReceipts[0].inventoryOutcome).toBe('APPLIED_NO_INVENTORY_IMPACT');
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
    const itemResult = result.results![0];
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
});
