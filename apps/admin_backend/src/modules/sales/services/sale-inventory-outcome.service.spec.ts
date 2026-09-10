import { BadRequestException } from '@nestjs/common';
import { SaleInventoryOutcomeService } from './sale-inventory-outcome.service';
import { SyncInvoiceDto } from '../dto/sync-invoice.dto';
import { ProductInventoryMappingVersion } from '../../inventory/entities/product-inventory-mapping-version.entity';
import { RecipeVersion, RecipePublicationState } from '../../inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../inventory/entities/recipe-detail.entity';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { EntityManager } from 'typeorm';

describe('SaleInventoryOutcomeService (SALE_TIME_V1)', () => {
  let service: SaleInventoryOutcomeService;
  let mockEntityManager: Partial<EntityManager>;

  const tenantId = 'tenant-123';
  const insumoAId = '11111111-1111-1111-1111-111111111111';
  const mappingAId = '22222222-2222-2222-2222-222222222222';
  const recipeVerAId = '33333333-3333-3333-3333-333333333333';
  const componentAId = '44444444-4444-4444-4444-444444444444';

  beforeEach(() => {
    service = new SaleInventoryOutcomeService();
  });

  const createMockManager = (overrides: {
    mappings?: any[];
    recipeVersions?: any[];
    recipeDetails?: any[];
    insumos?: any[];
  } = {}) => {
    const mappings = overrides.mappings ?? [
      {
        id: mappingAId,
        tenant_id: tenantId,
        product_id: 'prod-simple-mapped',
        insumo_id: insumoAId,
      },
    ];

    const recipeVersions = overrides.recipeVersions ?? [
      {
        id: recipeVerAId,
        tenant_id: tenantId,
        product_id: 'prod-prepared-recipe',
        publication_state: RecipePublicationState.PUBLISHED,
      },
    ];

    const recipeDetails = overrides.recipeDetails ?? [
      {
        id: componentAId,
        recipe_version_id: recipeVerAId,
        tenant_id: tenantId,
        insumo_id: insumoAId,
        gross_quantity: 2.5,
      },
    ];

    const insumos = overrides.insumos ?? [
      {
        id: insumoAId,
        tenant_id: tenantId,
        stock: 50,
        existenciaActual: 50,
        averageCost: 10,
        negativeStockPolicy: 'ALLOW',
      },
    ];

    return {
      getRepository: jest.fn((entity: any) => {
        if (entity === ProductInventoryMappingVersion) {
          return {
            findOne: jest.fn(async ({ where }: any) => {
              return mappings.find(
                (m) =>
                  (!where.id || m.id === where.id) &&
                  (!where.tenant_id || m.tenant_id === where.tenant_id) &&
                  (!where.product_id || m.product_id === where.product_id) &&
                  (!where.insumo_id || m.insumo_id === where.insumo_id),
              ) ?? null;
            }),
          };
        }
        if (entity === RecipeVersion) {
          return {
            findOne: jest.fn(async ({ where }: any) => {
              return recipeVersions.find(
                (v) =>
                  (!where.id || v.id === where.id) &&
                  (!where.tenant_id || v.tenant_id === where.tenant_id) &&
                  (!where.product_id || v.product_id === where.product_id) &&
                  (!where.publication_state || v.publication_state === where.publication_state),
              ) ?? null;
            }),
          };
        }
        if (entity === RecipeDetail) {
          return {
            find: jest.fn(async ({ where }: any) => {
              return recipeDetails.filter(
                (d) =>
                  (!where.recipe_version_id || d.recipe_version_id === where.recipe_version_id) &&
                  (!where.tenant_id || d.tenant_id === where.tenant_id),
              );
            }),
          };
        }
        if (entity === Insumo) {
          return {
            findOne: jest.fn(async ({ where }: any) => {
              return insumos.find(
                (i) =>
                  (!where.id || i.id === where.id) &&
                  (!where.tenant_id || i.tenant_id === where.tenant_id),
              ) ?? null;
            }),
          };
        }
        throw new Error(`Unexpected getRepository for ${entity.name}`);
      }),
    } as unknown as EntityManager;
  };

  it('returns null if invoice does not use SALE_TIME_V1 snapshots', async () => {
    const invoice = {
      id: 'inv-legacy',
      items: [
        {
          id: 'item-1',
          productId: 'prod-1',
          quantity: 2,
        },
      ],
    } as SyncInvoiceDto;

    const result = await service.validateSaleTimeSnapshot(tenantId, invoice, createMockManager());
    expect(result).toBeNull();
  });

  it('rejects mixed legacy and SALE_TIME_V1 snapshots in the same invoice', async () => {
    const invoice = {
      id: 'inv-mixed',
      items: [
        {
          id: 'item-1',
          productId: 'prod-1',
          quantity: 2,
          inventorySnapshotVersion: 'SALE_TIME_V1',
          inventorySnapshot: {
            classification: 'SIMPLE',
            disposition: 'NO_IMPACT',
            reasonCode: 'NO_EXPLICIT_INSUMO_MAPPING',
            catalogRevision: 'rev-1',
            bindings: [],
          },
        },
        {
          id: 'item-2',
          productId: 'prod-2',
          quantity: 1,
        },
      ],
    } as SyncInvoiceDto;

    await expect(
      service.validateSaleTimeSnapshot(tenantId, invoice, createMockManager()),
    ).rejects.toThrow('Mixed legacy and SALE_TIME_V1 snapshots are rejected');
  });

  it('validates a SIMPLE product with DIRECT disposition and resolves APPLIED outcome', async () => {
    const invoice = {
      id: 'inv-direct',
      items: [
        {
          id: 'item-1',
          productId: 'prod-simple-mapped',
          quantity: 2,
          inventorySnapshotVersion: 'SALE_TIME_V1',
          inventorySnapshot: {
            classification: 'SIMPLE',
            disposition: 'DIRECT',
            reasonCode: null,
            catalogRevision: 'rev-1',
            mappingVersionId: mappingAId,
            recipeVersionId: null,
            bindings: [
              {
                bindingOrdinal: 0,
                insumoId: insumoAId,
                quantityPerSaleUnit: 1.5,
                saleCorrelationId: 'corr-sha256-direct-1',
              },
            ],
          },
        },
      ],
    } as SyncInvoiceDto;

    const result = await service.validateSaleTimeSnapshot(tenantId, invoice, createMockManager());
    expect(result).not.toBeNull();
    expect(result!.outcome).toBe('APPLIED');
    expect(result!.policyVersion).toBe('SALE_TIME_V1');
    expect(result!.acknowledgedMovementCorrelationIds).toEqual(['corr-sha256-direct-1']);
    expect(result!.bindingsToApply).toHaveLength(1);
    expect(result!.bindingsToApply[0].explodedQuantity).toBe(3.0); // 2 * 1.5
  });

  it('validates a PREPARED product with RECIPE disposition and published recipe version', async () => {
    const invoice = {
      id: 'inv-recipe',
      items: [
        {
          id: 'item-1',
          productId: 'prod-prepared-recipe',
          quantity: 3,
          inventorySnapshotVersion: 'SALE_TIME_V1',
          inventorySnapshot: {
            classification: 'PREPARED',
            disposition: 'RECIPE',
            reasonCode: null,
            catalogRevision: 'rev-1',
            mappingVersionId: null,
            recipeVersionId: recipeVerAId,
            bindings: [
              {
                bindingOrdinal: 0,
                insumoId: insumoAId,
                recipeComponentId: componentAId,
                quantityPerSaleUnit: 2.5,
                saleCorrelationId: 'corr-sha256-recipe-1',
              },
            ],
          },
        },
      ],
    } as SyncInvoiceDto;

    const result = await service.validateSaleTimeSnapshot(tenantId, invoice, createMockManager());
    expect(result).not.toBeNull();
    expect(result!.outcome).toBe('APPLIED');
    expect(result!.acknowledgedMovementCorrelationIds).toEqual(['corr-sha256-recipe-1']);
    expect(result!.bindingsToApply[0].explodedQuantity).toBe(7.5); // 3 * 2.5
  });

  it('validates NO_IMPACT disposition with zero movements and APPLIED_NO_INVENTORY_IMPACT', async () => {
    const invoice = {
      id: 'inv-no-impact',
      items: [
        {
          id: 'item-1',
          productId: 'prod-simple-unmapped',
          quantity: 1,
          inventorySnapshotVersion: 'SALE_TIME_V1',
          inventorySnapshot: {
            classification: 'SIMPLE',
            disposition: 'NO_IMPACT',
            reasonCode: 'NO_EXPLICIT_INSUMO_MAPPING',
            catalogRevision: 'rev-1',
            mappingVersionId: null,
            recipeVersionId: null,
            bindings: [],
          },
        },
      ],
    } as SyncInvoiceDto;

    const result = await service.validateSaleTimeSnapshot(tenantId, invoice, createMockManager());
    expect(result).not.toBeNull();
    expect(result!.outcome).toBe('APPLIED_NO_INVENTORY_IMPACT');
    expect(result!.acknowledgedMovementCorrelationIds).toEqual([]);
    expect(result!.bindingsToApply).toEqual([]);
    expect(result!.reason).toEqual({
      code: 'NO_EXPLICIT_INSUMO_MAPPING',
      lines: ['item-1'],
    });
  });

  it('validates PENDING_RECIPE disposition with atomic APPLIED_INVENTORY_PENDING outcome and zero movements', async () => {
    const invoice = {
      id: 'inv-pending',
      items: [
        {
          id: 'item-1',
          productId: 'prod-simple-mapped',
          quantity: 2,
          inventorySnapshotVersion: 'SALE_TIME_V1',
          inventorySnapshot: {
            classification: 'SIMPLE',
            disposition: 'DIRECT',
            reasonCode: null,
            catalogRevision: 'rev-1',
            mappingVersionId: mappingAId,
            bindings: [
              {
                bindingOrdinal: 0,
                insumoId: insumoAId,
                quantityPerSaleUnit: 1.0,
                saleCorrelationId: 'corr-sha256-1',
              },
            ],
          },
        },
        {
          id: 'item-2',
          productId: 'prod-prepared-unmapped',
          quantity: 1,
          inventorySnapshotVersion: 'SALE_TIME_V1',
          inventorySnapshot: {
            classification: 'PREPARED',
            disposition: 'PENDING_RECIPE',
            reasonCode: 'MISSING_PUBLISHED_RECIPE',
            catalogRevision: 'rev-1',
            bindings: [],
          },
        },
      ],
    } as SyncInvoiceDto;

    const result = await service.validateSaleTimeSnapshot(tenantId, invoice, createMockManager());
    expect(result).not.toBeNull();
    // Atomic: any pending line gives APPLIED_INVENTORY_PENDING and zero cloud movements for entire invoice!
    expect(result!.outcome).toBe('APPLIED_INVENTORY_PENDING');
    expect(result!.acknowledgedMovementCorrelationIds).toEqual([]);
    expect(result!.bindingsToApply).toEqual([]);
    expect(result!.reason).toEqual({
      code: 'MISSING_PUBLISHED_RECIPE',
      lines: ['item-2'],
    });
  });

  it('rejects duplicate saleCorrelationId within the invoice', async () => {
    const invoice = {
      id: 'inv-dup-corr',
      items: [
        {
          id: 'item-1',
          productId: 'prod-simple-mapped',
          quantity: 1,
          inventorySnapshotVersion: 'SALE_TIME_V1',
          inventorySnapshot: {
            classification: 'SIMPLE',
            disposition: 'DIRECT',
            mappingVersionId: mappingAId,
            catalogRevision: 'rev-1',
            bindings: [
              {
                bindingOrdinal: 0,
                insumoId: insumoAId,
                quantityPerSaleUnit: 1.0,
                saleCorrelationId: 'DUPLICATE_CORRELATION',
              },
              {
                bindingOrdinal: 1,
                insumoId: insumoAId,
                quantityPerSaleUnit: 1.0,
                saleCorrelationId: 'DUPLICATE_CORRELATION',
              },
            ],
          },
        },
      ],
    } as SyncInvoiceDto;

    await expect(
      service.validateSaleTimeSnapshot(tenantId, invoice, createMockManager()),
    ).rejects.toThrow('Duplicate saleCorrelationId');
  });

  it('fails closed when mappingVersionId belongs to another tenant or product', async () => {
    const invoice = {
      id: 'inv-foreign-map',
      items: [
        {
          id: 'item-1',
          productId: 'prod-different',
          quantity: 1,
          inventorySnapshotVersion: 'SALE_TIME_V1',
          inventorySnapshot: {
            classification: 'SIMPLE',
            disposition: 'DIRECT',
            mappingVersionId: mappingAId,
            catalogRevision: 'rev-1',
            bindings: [
              {
                bindingOrdinal: 0,
                insumoId: insumoAId,
                quantityPerSaleUnit: 1.0,
                saleCorrelationId: 'corr-1',
              },
            ],
          },
        },
      ],
    } as SyncInvoiceDto;

    await expect(
      service.validateSaleTimeSnapshot(tenantId, invoice, createMockManager()),
    ).rejects.toThrow(/mappingVersionId/);
  });

  it('fails closed when recipeVersionId is not published', async () => {
    const unpublishedVerId = '55555555-5555-5555-5555-555555555555';
    const mockManager = createMockManager({
      recipeVersions: [
        {
          id: unpublishedVerId,
          tenant_id: tenantId,
          product_id: 'prod-prepared-recipe',
          publication_state: RecipePublicationState.DRAFT,
        },
      ],
    });

    const invoice = {
      id: 'inv-draft-ver',
      items: [
        {
          id: 'item-1',
          productId: 'prod-prepared-recipe',
          quantity: 1,
          inventorySnapshotVersion: 'SALE_TIME_V1',
          inventorySnapshot: {
            classification: 'PREPARED',
            disposition: 'RECIPE',
            recipeVersionId: unpublishedVerId,
            catalogRevision: 'rev-1',
            bindings: [
              {
                bindingOrdinal: 0,
                insumoId: insumoAId,
                recipeComponentId: componentAId,
                quantityPerSaleUnit: 1.0,
                saleCorrelationId: 'corr-1',
              },
            ],
          },
        },
      ],
    } as SyncInvoiceDto;

    await expect(
      service.validateSaleTimeSnapshot(tenantId, invoice, mockManager),
    ).rejects.toThrow(/recipeVersionId/);
  });

  it('fails closed when an insumo belongs to a foreign tenant', async () => {
    const foreignInsumoId = 'foreign-insumo';
    const invoice = {
      id: 'inv-foreign-insumo',
      items: [
        {
          id: 'item-1',
          productId: 'prod-simple-mapped',
          quantity: 1,
          inventorySnapshotVersion: 'SALE_TIME_V1',
          inventorySnapshot: {
            classification: 'SIMPLE',
            disposition: 'DIRECT',
            mappingVersionId: mappingAId,
            catalogRevision: 'rev-1',
            bindings: [
              {
                bindingOrdinal: 0,
                insumoId: foreignInsumoId,
                quantityPerSaleUnit: 1.0,
                saleCorrelationId: 'corr-1',
              },
            ],
          },
        },
      ],
    } as SyncInvoiceDto;

    await expect(
      service.validateSaleTimeSnapshot(tenantId, invoice, createMockManager()),
    ).rejects.toThrow(/insumoId/);
  });

  it('rejects transaction when client-supplied inventoryOutcome mismatches calculated outcome', async () => {
    const invoice = {
      id: 'inv-mismatch',
      inventoryOutcome: 'APPLIED', // client claims APPLIED
      items: [
        {
          id: 'item-1',
          productId: 'prod-simple-unmapped',
          quantity: 1,
          inventorySnapshotVersion: 'SALE_TIME_V1',
          inventorySnapshot: {
            classification: 'SIMPLE',
            disposition: 'NO_IMPACT', // but snapshot is NO_IMPACT -> APPLIED_NO_INVENTORY_IMPACT!
            reasonCode: 'NO_EXPLICIT_INSUMO_MAPPING',
            catalogRevision: 'rev-1',
            bindings: [],
          },
        },
      ],
    } as SyncInvoiceDto;

    await expect(
      service.validateSaleTimeSnapshot(tenantId, invoice, createMockManager()),
    ).rejects.toThrow(/Snapshot outcome mismatch/);
  });
});
