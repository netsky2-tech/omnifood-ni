import { randomUUID } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Tenant } from '../tenant/entities/tenant.entity';
import { Insumo } from './entities/insumo.entity';
import { Supplier } from './entities/supplier.entity';
import { UomConversion } from './entities/uom-conversion.entity';
import { PurchaseDocument } from './entities/purchase-document.entity';
import { Batch } from './entities/batch.entity';
import {
  InventoryMovement,
  MovementType,
} from './entities/inventory-movement.entity';
import { CostCalculatorService } from './cost-calculator.service';
import {
  CURRENCY,
  FxRateResolver,
  InventoryPurchaseService,
} from './inventory-purchase.service';

/**
 * Real-PostgreSQL integration net for #938 (resto): a purchase must demand lot
 * metadata for an insumo that ALREADY carries batches, even when the insumo is
 * not perishable.
 *
 * Why a DB spec and not only the unit spec: the unit spec mocks
 * `manager.count` and the driver. Two things can only be proven against the
 * real database — that the batch count sees ALL rows (a consumed lot with
 * `remaining_stock = 0` still counts), and that the refusal lands **before**
 * any write, so `insumos.stock` never rises without a matching batch. The
 * whole point of the guard is the invariant `stock == SUM(batches)`, and that
 * invariant is a fact about stored rows, not about mock calls.
 */
function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for DB-backed service tests`);
  }
  return value;
}

function readPostgresPort(): number {
  const value = process.env.DB_PORT?.trim() ?? '5432';
  const port = Number(value);
  if (!Number.isInteger(port)) {
    throw new Error('DB_PORT must be a valid integer');
  }
  return port;
}

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: readPostgresPort(),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: getRequiredEnv('DB_PASSWORD'),
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

async function withIsolatedSchema(
  schemaPrefix: string,
  assertion: (ctx: {
    dataSource: DataSource;
    service: InventoryPurchaseService;
  }) => Promise<void>,
): Promise<void> {
  const bootstrap = new DataSource({ type: 'postgres', ...postgresConnection });
  const schema = `${schemaPrefix}_${randomUUID().replace(/-/g, '')}`;
  let dataSource: DataSource | null = null;

  try {
    await bootstrap.initialize();
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);

    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      entities: [
        Tenant,
        Insumo,
        UomConversion,
        Supplier,
        PurchaseDocument,
        Batch,
        InventoryMovement,
      ],
      synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(`SET search_path TO "${schema}"`);

    const fxRateResolver: FxRateResolver = {
      // Every case here buys in NIO: a USD purchase would reach the resolver,
      // and reaching it means the test built the wrong input.
      resolveBcnRateByDate: () =>
        Promise.reject(new Error('NIO purchases must not resolve a BCN rate')),
    };

    const service = new InventoryPurchaseService(
      dataSource,
      new CostCalculatorService(),
      fxRateResolver,
    );

    await assertion({ dataSource, service });
  } finally {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (bootstrap.isInitialized) {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    }
  }
}

interface Seeded {
  tenantId: string;
  insumoId: string;
  supplierId: string;
}

async function seedTenant(
  dataSource: DataSource,
  options: { isPerishable: boolean },
): Promise<Seeded> {
  const tenantId = randomUUID();
  await dataSource.query(
    `INSERT INTO tenants (id, name, is_active, created_at, updated_at, slug) VALUES ($1, $2, true, now(), now(), $3)`,
    [
      tenantId,
      `Lot Guard Tenant ${tenantId.slice(0, 8)}`,
      `lot-guard-${tenantId.slice(0, 8)}`,
    ],
  );

  const insumoRepo = dataSource.getRepository(Insumo);
  const insumo = await insumoRepo.save(
    insumoRepo.create({
      tenant_id: tenantId,
      name: 'Leche Entera',
      purchaseUom: 'L',
      consumptionUom: 'ML',
      conversionFactor: 1000,
      stock: 0,
      existenciaActual: 0,
      averageCost: 0,
      parLevel: null,
      minStock: null,
      maxStock: null,
      is_perishable: options.isPerishable,
    }),
  );

  const supplierRepo = dataSource.getRepository(Supplier);
  const supplier = await supplierRepo.save(
    supplierRepo.create({ tenant_id: tenantId, name: 'Distribuidora Nica' }),
  );

  return { tenantId, insumoId: insumo.id, supplierId: supplier.id };
}

async function seedBatch(
  dataSource: DataSource,
  seeded: Seeded,
  remainingStock: number,
): Promise<void> {
  const repo = dataSource.getRepository(Batch);
  await repo.save(
    repo.create({
      tenant_id: seeded.tenantId,
      insumo_id: seeded.insumoId,
      batch_number: `LOT-SEED-${remainingStock}`,
      received_date: '2026-01-01',
      expiration_date: '2026-12-31',
      remaining_stock: remainingStock,
      cost: 10,
    }),
  );

  // A real batch-tracked insumo starts COHERENT: the aggregate equals the sum
  // of its lots. Seeding a lot without raising the aggregate would hand the
  // test a pre-diverged fixture and hide what the guard is protecting.
  await dataSource.query(
    `UPDATE insumos SET stock = $2, existencia_actual = $2 WHERE id = $1`,
    [seeded.insumoId, remainingStock],
  );
}

/** The invariant the guard exists to protect, read from stored rows. */
async function readStockAndBatchSum(
  dataSource: DataSource,
  seeded: Seeded,
): Promise<{ stock: number; batchSum: number; purchaseDocs: number; batches: number }> {
  const stockRows = await dataSource.query(
    `SELECT stock FROM insumos WHERE id = $1`,
    [seeded.insumoId],
  );
  const batchRows = await dataSource.query(
    `SELECT COALESCE(SUM(remaining_stock), 0) AS total, COUNT(*) AS rows FROM batches WHERE insumo_id = $1`,
    [seeded.insumoId],
  );
  const purchaseRows = await dataSource.query(
    `SELECT COUNT(*) AS rows FROM inventory_purchase_documents WHERE insumo_id = $1`,
    [seeded.insumoId],
  );

  return {
    stock: Number(stockRows[0].stock),
    batchSum: Number(batchRows[0].total),
    batches: Number(batchRows[0].rows),
    purchaseDocs: Number(purchaseRows[0].rows),
  };
}

function recordInput(seeded: Seeded, invoiceNumber: string) {
  return {
    id: randomUUID(),
    tenantId: seeded.tenantId,
    insumoId: seeded.insumoId,
    supplierId: seeded.supplierId,
    invoiceNumber,
    quantity: 2,
    unitCost: 50,
    currency: CURRENCY.NIO as typeof CURRENCY.NIO,
    invoiceDate: '2026-01-03',
    entryTimestamp: '2026-01-03T10:00:00.000Z',
  };
}

describe('purchase lot guard (#938) — real PostgreSQL', () => {
  const TEST_TIMEOUT_MS = 60000;

  it(
    'demands a lot for a NON-perishable insumo that already has a batch',
    async () => {
      await withIsolatedSchema('lot_guard_preview', async ({ dataSource, service }) => {
        const seeded = await seedTenant(dataSource, { isPerishable: false });
        await seedBatch(dataSource, seeded, 5);

        const preview = await service.previewPurchase({
          ...recordInput(seeded, 'PREVIEW-1'),
          id: randomUUID(),
        });

        expect(preview.requiresBatchTracking).toBe(true);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'still demands a lot when the only batch is fully consumed (remaining_stock = 0)',
    async () => {
      // The edge case that decides the predicate: a lot with no balance left
      // is still proof the insumo is tracked by lot, and `drawBatchOutflow`
      // keeps reading it. Counting only `remaining_stock > 0` would reopen the
      // exact divergence #938 describes.
      await withIsolatedSchema('lot_guard_consumed', async ({ dataSource, service }) => {
        const seeded = await seedTenant(dataSource, { isPerishable: false });
        await seedBatch(dataSource, seeded, 0);

        const preview = await service.previewPurchase({
          ...recordInput(seeded, 'PREVIEW-CONSUMED'),
          id: randomUUID(),
        });

        expect(preview.requiresBatchTracking).toBe(true);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'refuses the purchase without a lot and leaves stock, lots and kardex untouched',
    async () => {
      await withIsolatedSchema('lot_guard_refuse', async ({ dataSource, service }) => {
        const seeded = await seedTenant(dataSource, { isPerishable: false });
        await seedBatch(dataSource, seeded, 5);
        const before = await readStockAndBatchSum(dataSource, seeded);

        await expect(
          service.recordPurchase(recordInput(seeded, 'REFUSED-1')),
        ).rejects.toThrow(
          'This item is already tracked by lot: lotCode, receivedDate, and expirationDate are required so the batch balances do not fall behind the aggregate stock',
        );

        const after = await readStockAndBatchSum(dataSource, seeded);
        // Nothing moved: a refusal that wrote anything would BE the divergence.
        expect(after.stock).toBe(before.stock);
        expect(after.batchSum).toBe(before.batchSum);
        expect(after.batches).toBe(before.batches);
        expect(after.purchaseDocs).toBe(0);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'records the purchase WITH a lot and keeps stock equal to the sum of lots',
    async () => {
      await withIsolatedSchema('lot_guard_accept', async ({ dataSource, service }) => {
        const seeded = await seedTenant(dataSource, { isPerishable: false });
        await seedBatch(dataSource, seeded, 5);

        await service.recordPurchase({
          ...recordInput(seeded, 'ACCEPTED-1'),
          lotCode: 'LOT-NEW',
          receivedDate: '2026-01-03',
          expirationDate: '2026-06-03',
        });

        const after = await readStockAndBatchSum(dataSource, seeded);
        // quantity 2 purchase units x 1000 = 2000 consumption units.
        expect(after.stock).toBe(2005);
        // The invariant: the aggregate and the lot balances agree.
        expect(after.batchSum).toBe(after.stock);
        expect(after.batches).toBe(2);
        expect(after.purchaseDocs).toBe(1);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'does not let another tenant’s batches force a lot here',
    async () => {
      await withIsolatedSchema('lot_guard_tenant', async ({ dataSource, service }) => {
        const tenantWithLots = await seedTenant(dataSource, {
          isPerishable: false,
        });
        await seedBatch(dataSource, tenantWithLots, 5);

        const tenantWithoutLots = await seedTenant(dataSource, {
          isPerishable: false,
        });

        const preview = await service.previewPurchase({
          ...recordInput(tenantWithoutLots, 'PREVIEW-TENANT'),
          id: randomUUID(),
        });

        // A tenant-scoped count that forgot `tenant_id` would answer `true`
        // here and demand a lot for an insumo that carries none.
        expect(preview.requiresBatchTracking).toBe(false);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'keeps buying a NON-perishable insumo with no lots without any lot field',
    async () => {
      await withIsolatedSchema('lot_guard_nolots', async ({ dataSource, service }) => {
        const seeded = await seedTenant(dataSource, { isPerishable: false });

        const preview = await service.previewPurchase({
          ...recordInput(seeded, 'PREVIEW-NOLOTS'),
          id: randomUUID(),
        });
        expect(preview.requiresBatchTracking).toBe(false);

        await service.recordPurchase(recordInput(seeded, 'NOLOTS-1'));

        const after = await readStockAndBatchSum(dataSource, seeded);
        expect(after.stock).toBe(2000);
        expect(after.batches).toBe(0);
        expect(after.purchaseDocs).toBe(1);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'keeps the exact previous refusal for a perishable insumo without a lot',
    async () => {
      await withIsolatedSchema('lot_guard_perishable', async ({ dataSource, service }) => {
        const seeded = await seedTenant(dataSource, { isPerishable: true });

        await expect(
          service.recordPurchase(recordInput(seeded, 'PERISHABLE-1')),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
          service.recordPurchase(recordInput(seeded, 'PERISHABLE-2')),
        ).rejects.toThrow(
          'Batch-managed purchases require lotCode, receivedDate, and expirationDate',
        );
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'creates the lot even when the client labelled the purchase as not batch-tracked',
    async () => {
      // The backend is the authority: the client flag never decides whether a
      // lot row is written, because a client that says "no batch" cannot be
      // trusted with the invariant.
      await withIsolatedSchema('lot_guard_client', async ({ dataSource, service }) => {
        const seeded = await seedTenant(dataSource, { isPerishable: false });
        await seedBatch(dataSource, seeded, 5);

        await service.recordPurchase({
          ...recordInput(seeded, 'CLIENT-FLAG-1'),
          lotCode: 'LOT-FROM-CLIENT',
          receivedDate: '2026-01-03',
          expirationDate: '2026-06-03',
        });

        const after = await readStockAndBatchSum(dataSource, seeded);
        expect(after.batches).toBe(2);
        expect(after.batchSum).toBe(after.stock);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'treats a whitespace-only lot code as no lot and refuses the purchase',
    async () => {
      await withIsolatedSchema('lot_guard_blank', async ({ dataSource, service }) => {
        const seeded = await seedTenant(dataSource, { isPerishable: false });
        await seedBatch(dataSource, seeded, 5);

        await expect(
          service.recordPurchase({
            ...recordInput(seeded, 'BLANK-LOT-1'),
            lotCode: '   ',
            receivedDate: '2026-01-03',
            expirationDate: '2026-06-03',
          }),
        ).rejects.toThrow(
          'This item is already tracked by lot: lotCode, receivedDate, and expirationDate are required so the batch balances do not fall behind the aggregate stock',
        );

        const after = await readStockAndBatchSum(dataSource, seeded);
        expect(after.stock).toBe(5);
        expect(after.batches).toBe(1);
        expect(after.purchaseDocs).toBe(0);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'stores the lot code trimmed',
    async () => {
      await withIsolatedSchema('lot_guard_trim', async ({ dataSource, service }) => {
        const seeded = await seedTenant(dataSource, { isPerishable: false });
        await seedBatch(dataSource, seeded, 5);

        await service.recordPurchase({
          ...recordInput(seeded, 'TRIM-1'),
          lotCode: '  LOT-TRIMMED  ',
          receivedDate: '2026-01-03',
          expirationDate: '2026-06-03',
        });

        const batches = await dataSource.getRepository(Batch).find({
          where: { tenant_id: seeded.tenantId },
        });
        expect(batches.map((b) => b.batch_number)).toContain('LOT-TRIMMED');
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'writes the outflow-guard-visible moving parts for one purchase end to end',
    async () => {
      await withIsolatedSchema('lot_guard_kardex', async ({ dataSource, service }) => {
        const seeded = await seedTenant(dataSource, { isPerishable: false });
        await seedBatch(dataSource, seeded, 5);

        await service.recordPurchase({
          ...recordInput(seeded, 'KARDEX-1'),
          lotCode: 'LOT-KARDEX',
          receivedDate: '2026-01-03',
          expirationDate: '2026-06-03',
        });

        const movements = await dataSource.getRepository(InventoryMovement).find({
          where: { tenant_id: seeded.tenantId },
        });

        expect(movements).toHaveLength(1);
        expect(movements[0].type).toBe(MovementType.ENTRADA_COMPRA);
        expect(Number(movements[0].quantity)).toBe(2000);
        expect(Number(movements[0].newStock)).toBe(2005);
      });
    },
    TEST_TIMEOUT_MS,
  );
});
