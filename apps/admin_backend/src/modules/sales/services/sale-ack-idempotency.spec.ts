import { EntityManager } from 'typeorm';
import { InvoicesService, calculateSyncPayloadHash } from './invoices.service';
import { SaleInventoryOutcomeService } from './sale-inventory-outcome.service';
import { InventoryMovement, MovementType } from '../../inventory/entities/inventory-movement.entity';
import { InventorySyncReceipt } from '../../inventory/entities/inventory-sync-receipt.entity';
import { InventorySyncOutbox } from '../../inventory/entities/inventory-sync-outbox.entity';
import { ProductInventoryMappingVersion } from '../../inventory/entities/product-inventory-mapping-version.entity';
import { RecipeVersion, RecipePublicationState } from '../../inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../inventory/entities/recipe-detail.entity';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { Product, ProductType } from '../../inventory/entities/product.entity';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { SyncBatchRecordDto } from '../dto/sync-batch.dto';

describe('Slice 7B: Backend sale ACK, idempotency, and legacy classification', () => {
  let service: InvoicesService, outcomeService: SaleInventoryOutcomeService, mockTxManager: any;
  const tenantId = 'tenant-slice-7', insumoId = '11111111-1111-1111-1111-111111111111';
  const mappingVersionId = '22222222-2222-2222-2222-222222222222', recipeVersionId = '33333333-3333-3333-3333-333333333333';
  let savedReceipts: any[] = [], savedMovements: any[] = [], existingReceipts: any[] = [], existingMovements: any[] = [], mockMapping: any, mockDetails: any[];

  const makeRecord = (key: string, items: any[] = [], extra: Partial<SyncBatchRecordDto> = {}): SyncBatchRecordDto => ({
    idempotencyKey: key, sourceDeviceId: 'dev-1', sourceSequence: 1, flowType: 'sales', documentType: 'SALE',
    invoice: { id: `inv-${key}`, number: '001-0001', createdAt: '2026-01-01T12:00:00.000Z', userId: 'cashier-1', subtotal: 100, totalTax: 15, total: 115, paymentStatus: 'PAID', items, payments: [] },
    ...extra,
  });
  const makeV1Item = (id = 'i1', corrId = 'sha256-corr-1') => ({
    id, productId: 'prod-direct-1', productName: 'Direct Item', quantity: 1, unitPrice: 100, originalTaxRate: 0.15, appliedTaxRate: 0.15, taxAmount: 15, total: 115, discount: 0,
    inventorySnapshotVersion: 'SALE_TIME_V1',
    inventorySnapshot: { classification: 'SIMPLE', disposition: 'DIRECT', catalogRevision: 'rev-1', mappingVersionId, bindings: [{ bindingOrdinal: 0, insumoId, quantityPerSaleUnit: 1, saleCorrelationId: corrId }] },
  });
  const makeLegItem = (id: string, productId: string, qty = 1) => ({ id, productId, productName: 'Legacy Item', quantity: qty, unitPrice: 50, originalTaxRate: 0.15, appliedTaxRate: 0.15, taxAmount: 7.5, total: 57.5, discount: 0 });
  const applyV1 = (r: SyncBatchRecordDto) => { r.invoice!.inventoryPolicyVersion = 'SALE_TIME_V1'; r.invoice!.inventoryOutcome = 'APPLIED'; return r; };

  beforeEach(() => {
    savedReceipts = []; savedMovements = []; existingReceipts = []; existingMovements = [];
    const mockInsumo = { id: insumoId, tenant_id: tenantId, stock: 100, existenciaActual: 100, averageCost: 10, negativeStockPolicy: 'ALLOW' };
    mockMapping = { id: mappingVersionId, tenant_id: tenantId, product_id: 'prod-direct-1', insumo_id: insumoId, effective_at: new Date('2026-01-01T00:00:00.000Z'), superseded_at: null };
    const mockRecipeVer = { id: recipeVersionId, tenant_id: tenantId, product_id: 'prod-prepared-1', publication_state: RecipePublicationState.PUBLISHED, fecha_inicio_vigencia: new Date('2026-01-01T00:00:00.000Z'), fecha_fin_vigencia: null, version_number: 1 };
    mockDetails = [{ id: 'detail-1', recipe_version_id: recipeVersionId, tenant_id: tenantId, insumo_id: insumoId, quantity: 2.0 }];
    const receiptRepoMock = {
      findOne: jest.fn(async ({ where }: any) => existingReceipts.find((r) => r.tenant_id === where.tenant_id && (r.idempotency_key === where.idempotency_key || (r.source_device_id === where.source_device_id && r.source_sequence === where.source_sequence))) ?? null),
      create: jest.fn((d: any) => d), save: jest.fn(async (r: any) => { savedReceipts.push(r); existingReceipts.push(r); return r; }),
    };
    const repos = new Map<any, any>([
      [ProductInventoryMappingVersion, { findOne: jest.fn(async ({ where }: any) => (where?.id === mappingVersionId ? mockMapping : null)), createQueryBuilder: () => { let pId: string, eff: Date; const b: any = { where: (_: string, p: any) => { if (p?.productId) pId = p.productId; if (p?.acceptedAt) eff = p.acceptedAt; return b; }, andWhere: (_: string, p: any) => { if (p?.productId) pId = p.productId; if (p?.acceptedAt) eff = p.acceptedAt; return b; }, orderBy: () => b, getOne: async () => (pId === 'prod-direct-1' && (!mockMapping.superseded_at || eff < mockMapping.superseded_at) && (!mockMapping.effective_at || eff >= mockMapping.effective_at) ? mockMapping : null) }; return b; } }],
      [Product, { findOne: jest.fn(async ({ where }: any) => ({ id: where?.id, tenant_id: tenantId, product_type: (where?.id === 'prod-prepared-1' || where?.id === 'prod-prep-unpub') ? ProductType.PREPARED : ProductType.SIMPLE })) }],
      [RecipeVersion, { findOne: jest.fn(async () => null), createQueryBuilder: () => { let pId: string; const b: any = { where: (_: string, p: any) => { if (p?.productId) pId = p.productId; return b; }, andWhere: (_: string, p: any) => { if (p?.productId) pId = p.productId; return b; }, orderBy: () => b, addOrderBy: () => b, getOne: async () => (pId === 'prod-prepared-1' ? mockRecipeVer : null) }; return b; } }],
      [RecipeDetail, { find: jest.fn(async () => mockDetails) }],
      [Insumo, { findOne: jest.fn(async () => mockInsumo) }],
      [Invoice, { upsert: jest.fn(), findOne: jest.fn(async () => null) }],
      [InvoiceItem, { find: jest.fn(async () => []), upsert: jest.fn() }],
      [InventorySyncReceipt, receiptRepoMock],
      [InventorySyncOutbox, { findOne: jest.fn(async () => null), delete: jest.fn() }],
      [InventoryMovement, { findOne: jest.fn(async ({ where }: any) => existingMovements.find((m) => m.tenant_id === where.tenant_id && m.saleCorrelationId === where.saleCorrelationId) ?? null), save: jest.fn(async (m: any) => (savedMovements.push(m), existingMovements.push(m), m)), create: jest.fn((d: any) => d) }],
    ]);
    mockTxManager = {
      query: jest.fn(async () => []),
      getRepository: jest.fn((e: any) => repos.get(e) ?? {}),
      createQueryBuilder: () => ({ setLock: () => mockTxManager.createQueryBuilder(), where: () => mockTxManager.createQueryBuilder(), andWhere: () => mockTxManager.createQueryBuilder(), getOne: async () => mockInsumo } as any),
      save: jest.fn(async (t: any, m?: any) => {
        const item = m !== undefined ? m : t;
        if (item.result_status !== undefined || item.payload_hash !== undefined) { savedReceipts.push(item); existingReceipts.push(item); }
        else if (item.insumoId !== undefined || item.type === MovementType.SALE) { savedMovements.push(item); existingMovements.push(item); }
        return item;
      }),
    };
    outcomeService = new SaleInventoryOutcomeService();
    service = new InvoicesService(
      { transaction: jest.fn(async (iso: any, cb?: any) => (typeof iso === 'function' ? iso : cb)(mockTxManager as EntityManager)) } as any,
      { upsert: jest.fn(), findOne: jest.fn() } as any, { upsert: jest.fn(), find: jest.fn() } as any, { save: jest.fn() } as any, { findOne: jest.fn() } as any,
      { findOne: jest.fn(), save: jest.fn(), create: jest.fn((d: any) => d) } as any, receiptRepoMock as any,
      { findOne: jest.fn(), delete: jest.fn(), save: jest.fn(), create: jest.fn((d: any) => d) } as any, { getSnapshot: jest.fn() } as any, { explode: jest.fn() } as any, outcomeService,
    );
  });

  it('same-key replay avoids duplicate Kardex writes and increments duplicate count', async () => {
    const record = applyV1(makeRecord('idemp-dup-1', [makeV1Item('i1', 'sha256-corr-replay-test-1')]));
    expect((await service.syncBatch(tenantId, [record])).processed).toBe(1);
    const movCount = savedMovements.length, res2 = await service.syncBatch(tenantId, [record]);
    expect(res2.duplicates).toBe(1); expect(res2.results![0].status).toBe('DUPLICATE'); expect(savedMovements.length).toBe(movCount);
  });
  it('enriched ACK replay preserves acknowledged correlation IDs and canonical outcome', async () => {
    const record = applyV1(makeRecord('idemp-dup-ack', [makeV1Item('i1', 'sha256-corr-enriched-1')]));
    await service.syncBatch(tenantId, [record]);
    const item = (await service.syncBatch(tenantId, [record])).results![0];
    expect(item.code).toBe('APPLIED'); expect(item.inventoryOutcome).toBe('APPLIED'); expect(item.acknowledgedMovementCorrelationIds).toEqual(['sha256-corr-enriched-1']); expect(item.policyVersion).toBe('SALE_TIME_V1');
  });
  it('same-key with different hash fails IDEMPOTENCY_MISMATCH non-retryable', async () => {
    const record1 = makeRecord('idemp-mismatch-key', [makeV1Item('i1', 'c1')]);
    await service.syncBatch(tenantId, [record1]);
    const res = await service.syncBatch(tenantId, [{ ...record1, invoice: { ...record1.invoice!, subtotal: 999 } }]);
    expect(res.results![0].status).toBe('IDEMPOTENCY_MISMATCH'); expect(res.results![0].retryable).toBe(false);
  });
  it('effective mapping interval: selects DIRECT with mappingVersionId', async () => {
    const res = await service.syncBatch(tenantId, [makeRecord('idemp-legacy-map', [makeLegItem('i1', 'prod-direct-1', 2)])]), item = res.results![0];
    expect(res.processed).toBe(1); expect(item.status).toBe('ACCEPTED'); expect(item.inventoryOutcome).toBe('APPLIED'); expect(item.policyVersion).toBe('LEGACY_SYNC_TIME_V1');
    expect(item.acknowledgedMovementCorrelationIds).toHaveLength(1); expect(savedMovements[0].saleCorrelationId).toBeDefined(); expect(savedMovements[0].quantity).toBe(-2);
  });
  it('superseded mapping is ignored and falls back to product type', async () => {
    mockMapping.superseded_at = new Date('2026-01-01T00:00:00.000Z');
    const res = await service.syncBatch(tenantId, [makeRecord('idemp-superseded', [makeLegItem('i1', 'prod-direct-1', 1)])]);
    expect(res.results![0].inventoryOutcome).toBe('APPLIED_NO_INVENTORY_IMPACT'); expect(res.results![0].code).toBe('APPLIED_NO_INVENTORY_IMPACT');
    expect(res.results![0].inventoryOutcomeReason).toEqual({ code: 'NO_EXPLICIT_INSUMO_MAPPING', lines: ['i1'] });
  });
  it('legacy no-mapping: SIMPLE product yields APPLIED_NO_INVENTORY_IMPACT', async () => {
    const res = await service.syncBatch(tenantId, [makeRecord('idemp-simple', [makeLegItem('i1', 'prod-simple-1', 1)])]);
    expect(res.results![0].inventoryOutcome).toBe('APPLIED_NO_INVENTORY_IMPACT'); expect(res.results![0].code).toBe('APPLIED_NO_INVENTORY_IMPACT');
    expect(res.results![0].inventoryOutcomeReason).toEqual({ code: 'NO_EXPLICIT_INSUMO_MAPPING', lines: ['i1'] }); expect(res.results![0].acknowledgedMovementCorrelationIds).toEqual([]);
  });
  it('legacy no-mapping: PREPARED product with published recipe yields APPLIED', async () => {
    const res = await service.syncBatch(tenantId, [makeRecord('idemp-prep-pub', [makeLegItem('i2', 'prod-prepared-1', 2)], { sourceDeviceId: 'dev-2' })]);
    expect(res.results![0].inventoryOutcome).toBe('APPLIED'); expect(res.results![0].acknowledgedMovementCorrelationIds).toHaveLength(1); expect(savedMovements.find((m) => m.quantity === -4.0)).toBeDefined();
  });
  it('legacy no-mapping: PREPARED product without published recipe yields APPLIED_INVENTORY_PENDING', async () => {
    const res = await service.syncBatch(tenantId, [makeRecord('idemp-prep-unpub', [makeLegItem('i3', 'prod-prep-unpub', 1)], { sourceDeviceId: 'dev-3' })]);
    expect(res.results![0].inventoryOutcome).toBe('APPLIED_INVENTORY_PENDING'); expect(res.results![0].code).toBe('APPLIED_INVENTORY_PENDING');
    expect(res.results![0].inventoryOutcomeReason).toEqual({ code: 'MISSING_PUBLISHED_RECIPE', lines: ['i3'] }); expect(res.results![0].acknowledgedMovementCorrelationIds).toEqual([]);
  });
  it('mixed legacy and SALE_TIME_V1 snapshots are rejected', async () => {
    const res = await service.syncBatch(tenantId, [makeRecord('idemp-mixed', [makeV1Item('i1'), makeLegItem('i2', 'prod-simple-1')])]);
    expect(res.results![0].status).toBe('REJECTED'); expect(res.results![0].message).toContain('Mixed legacy and SALE_TIME_V1 snapshots are rejected');
  });
  it('duplicate Kardex saleCorrelationId across different sales fails closed', async () => {
    const dupCorrelation = 'sha256-already-used-in-kardex';
    existingMovements.push({ tenant_id: tenantId, saleCorrelationId: dupCorrelation, insumoId, quantity: -1 });
    const res = await service.syncBatch(tenantId, [applyV1(makeRecord('idemp-dup-kardex', [makeV1Item('i1', dupCorrelation)]))]);
    expect(res.results![0].status).toBe('REJECTED'); expect(res.results![0].message).toContain('Duplicate sale correlation ID');
  });
  it('replay preserves unknown raw outcomes and legacy untracked receipt compatibility', async () => {
    const pushRec = (k: string, extra: any) => existingReceipts.push({ tenant_id: tenantId, idempotency_key: k, source_device_id: 'dev-1', flow_type: 'sales', source_sequence: '1', payload_hash: calculateSyncPayloadHash(makeRecord(k)), result_status: 'ACCEPTED', ...extra });
    pushRec('idemp-unknown', { result_code: 'FUTURE_CUSTOM_OUTCOME', inventoryPolicyVersion: 'FUTURE_VERSION_V9', inventoryOutcome: 'FUTURE_CUSTOM_OUTCOME', inventoryOutcomeReason: { note: 'custom' }, acknowledgedCorrelationIds: ['corr-custom-1'] });
    const itU = (await service.syncBatch(tenantId, [makeRecord('idemp-unknown')])).results![0];
    expect(itU.status).toBe('DUPLICATE'); expect(itU.code).toBe('FUTURE_CUSTOM_OUTCOME'); expect(itU.inventoryOutcome).toBe('FUTURE_CUSTOM_OUTCOME'); expect(itU.policyVersion).toBe('FUTURE_VERSION_V9'); expect(itU.acknowledgedMovementCorrelationIds).toEqual(['corr-custom-1']);
    pushRec('idemp-untracked', { result_code: 'APPLIED' });
    const itLeg = (await service.syncBatch(tenantId, [makeRecord('idemp-untracked')])).results![0];
    expect(itLeg.status).toBe('DUPLICATE'); expect(itLeg.code).toBe('DUPLICATE_REPLAY'); expect(itLeg.inventoryOutcome).toBeUndefined(); expect(itLeg.acknowledgedMovementCorrelationIds).toBeUndefined();
  });
  it('R3-002: reversed-input same-insumo recipe details deterministically sort by (insumoId, recipeComponentId)', async () => {
    const dAlpha = { id: 'detail-alpha', recipe_version_id: recipeVersionId, tenant_id: tenantId, insumo_id: insumoId, quantity: 1.0 };
    const dBeta = { id: 'detail-beta', recipe_version_id: recipeVersionId, tenant_id: tenantId, insumo_id: insumoId, quantity: 2.0 };
    const fixedDate = new Date('2026-01-01T12:00:00.000Z');
    mockDetails = [dBeta, dAlpha];
    const recRev = makeRecord('r3-002-same', [makeLegItem('item-1', 'prod-prepared-1', 1)]);
    await outcomeService.classifyLegacySyncTime(tenantId, recRev, mockTxManager, fixedDate);
    const snapRev = (recRev.invoice!.items[0] as any).inventorySnapshot;
    mockDetails = [dAlpha, dBeta];
    const recNat = makeRecord('r3-002-same', [makeLegItem('item-1', 'prod-prepared-1', 1)]);
    await outcomeService.classifyLegacySyncTime(tenantId, recNat, mockTxManager, fixedDate);
    const snapNat = (recNat.invoice!.items[0] as any).inventorySnapshot;
    expect(snapRev.bindings[0].recipeComponentId).toBe('detail-alpha'); expect(snapRev.bindings[1].recipeComponentId).toBe('detail-beta');
    expect(snapNat.bindings[0].recipeComponentId).toBe('detail-alpha'); expect(snapNat.bindings[1].recipeComponentId).toBe('detail-beta');
    expect(snapRev.bindings[0].saleCorrelationId).toBe(snapNat.bindings[0].saleCorrelationId);
    expect(snapRev.bindings[1].saleCorrelationId).toBe(snapNat.bindings[1].saleCorrelationId);
  });
  it('R3-003: exact transaction-selected acceptedAt is frozen into legacy snapshots and sync receipt', async () => {
    const rec = makeRecord('r3-003-accepted', [makeLegItem('item-1', 'prod-direct-1', 1)]);
    const before = new Date();
    await service.syncBatch(tenantId, [rec]);
    const after = new Date();
    const snap = (rec.invoice!.items[0] as any).inventorySnapshot;
    expect(snap.acceptedAt).toBeDefined();
    const snapTime = new Date(snap.acceptedAt).getTime();
    expect(snapTime).toBeGreaterThanOrEqual(before.getTime()); expect(snapTime).toBeLessThanOrEqual(after.getTime());
    const savedReceipt = savedReceipts.find((r) => r.idempotency_key === 'r3-003-accepted');
    expect(savedReceipt.acceptedAt).toBeDefined();
    expect(new Date(savedReceipt.acceptedAt).getTime()).toBe(snapTime);
  });
});
