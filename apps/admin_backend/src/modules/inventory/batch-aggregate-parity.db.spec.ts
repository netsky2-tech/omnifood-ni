import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { createMigrationBuiltSchemaFixture } from '../../../test/support/migration-built-schema.helper';
import { Insumo } from './entities/insumo.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { InventorySyncOutbox } from './entities/inventory-sync-outbox.entity';
import { InventorySyncReceipt } from './entities/inventory-sync-receipt.entity';
import { Product } from './entities/product.entity';
import { RecipeDetail } from './entities/recipe-detail.entity';
import { RecipeVersion } from './entities/recipe-version.entity';
import { UomConversion } from './entities/uom-conversion.entity';
import { Batch } from './entities/batch.entity';
import { Shrinkage } from './entities/shrinkage.entity';
import { CountSessionService } from './count-session.service';
import { ShrinkageService } from './shrinkage.service';
import { InvoicesService } from '../sales/services/invoices.service';
import { Tenant } from '../tenant/entities/tenant.entity';
import { normalizeTenantSlug } from '../tenant/tenant-slug';

/**
 * R13 / H-R12 (odd/tasks/nucleo-inventario-paridad-contrato.md): the AGGREGATE
 * stock and the BATCH balances must not drift apart.
 *
 * Measured before the fix: `insumos.stock = 36` against a batch sum of `60` for
 * the same insumo, because `ShrinkageService`, the sync-delta branch and the
 * count-session variance all decrement `insumos.stock` and **never touch
 * `batches.remaining_stock`**. `openspec/specs/inventory-batch-management/
 * spec.md` states the requirement directly: *"Batch-managed items MUST keep
 * per-batch balances consistent with aggregate stock after purchases,
 * production receipts, and consumption outflows."*
 *
 * The consequence is not cosmetic: **FEFO reads batches**, so production
 * consumption and its coverage guard (`assertSourceBatchCoverage`) compute
 * against a balance that no longer represents reality — and now that R14 made
 * the delta flow reachable, that divergence propagates to the cloud.
 *
 * The allocation rule (which batch leaves) is FEFO, the same rule R4 verified
 * for production and reused through `BatchCostingService.buildValuationTrace`.
 * It is a PRACTICE-based choice and is declared as such: NIC 2 and Ley 822
 * regulate COST FORMULAS, not physical rotation (see
 * docs/inventario_marco_normativo.md §5).
 *
 * Scope: OUTFLOWS only. A POSITIVE delta or a positive count variance means
 * stock appearing with no known lot, and `batches.expiration_date` is NOT NULL,
 * so no batch can be invented — that case is documented as OPEN and is not
 * silently approximated here.
 */

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

const poolCleanupExtra = {
  extra: { max: 2, allowExitOnIdle: true },
} as const;

/**
 * Batch ids for one test, chosen so the LEXICOGRAPHIC order CONTRADICTS FEFO:
 * the first id sorts first and expires later, the second sorts last and expires
 * sooner. `index` (0..15, one hex digit) keeps ids unique across tests, because
 * `batches` has a GLOBAL primary key and not a per-tenant one — with a fixed id
 * the second test's insert collides, and that collision is not a result.
 */
const batchIdsFor = (
  index: number,
): { laterBatchId: string; earlierBatchId: string } => {
  const hex = index.toString(16);
  return {
    laterBatchId: `0000000${hex}-0000-4000-8000-000000000001`,
    earlierBatchId: `fffffff${hex}-ffff-4fff-8fff-fffffffffff1`,
  };
};

const LATER_EXPIRY_DAY = '2026-12-31';
const EARLIER_EXPIRY_DAY = '2026-11-01';
const EXPENSIVE_BATCH_COST_NIO = 200;
const CHEAP_BATCH_COST_NIO = 100;
const BATCH_REMAINING_STOCK = 10;
const STOCK = 2 * BATCH_REMAINING_STOCK;
const DEVICE_ID = 'RIG-TERMINAL-1';
const OPERATION_DAY = '2026-10-03';

describe('batch balances vs aggregate stock parity (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;
  let shrinkageService: ShrinkageService;
  let invoicesService: InvoicesService;
  let countSessionService: CountSessionService;

  const seedTenant = async (label: string): Promise<string> => {
    const tenantId = randomUUID();
    await admin.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)`,
      [tenantId, label, normalizeTenantSlug(label)],
    );
    return tenantId;
  };

  /**
   * An insumo with a ledger-consistent opening balance AND two batches whose
   * FEFO order contradicts their id order. Stock and batch sum start EQUAL, so
   * any later divergence is caused by the operation under test and nothing else.
   */
  const seedInsumoWithBatches = async (
    tenantId: string,
    index: number,
  ): Promise<{
    insumoId: string;
    laterBatchId: string;
    earlierBatchId: string;
  }> => {
    const { laterBatchId, earlierBatchId } = batchIdsFor(index);
    const insumoId = randomUUID();

    await admin.query(
      `INSERT INTO insumos
         (id, tenant_id, name, "purchaseUom", "consumptionUom",
          stock, existencia_actual, costo_promedio_nio, is_perishable)
       VALUES ($1, $2, $3, 'kg', 'kg', $4, $4, 150, true)`,
      [insumoId, tenantId, 'Componente con lotes (R13)', STOCK],
    );
    await admin.query(
      `INSERT INTO inventory_kardex
         (tenant_id, insumo_id, movement_type, quantity, unit_cost_nio,
          total_cost_nio, stock_before, stock_after, source_document_type,
          source_document_id, occurred_at)
       VALUES ($1, $2, 'INITIAL_STOCK', $3, 150, $4, 0.0000, $3, 'SEED',
               'seed-initial', NOW())`,
      [tenantId, insumoId, STOCK, STOCK * 150],
    );
    await admin.query(
      `INSERT INTO batches
         (id, tenant_id, insumo_id, batch_number, received_date,
          expiration_date, remaining_stock, cost)
       VALUES ($1, $2, $3, 'R13-TARDE-CARO', '2026-10-01', $4, $5, $6),
              ($7, $2, $3, 'R13-PRONTO-BARATO', '2026-10-01', $8, $5, $9)`,
      [
        laterBatchId,
        tenantId,
        insumoId,
        LATER_EXPIRY_DAY,
        BATCH_REMAINING_STOCK,
        EXPENSIVE_BATCH_COST_NIO,
        earlierBatchId,
        EARLIER_EXPIRY_DAY,
        CHEAP_BATCH_COST_NIO,
      ],
    );

    return { insumoId, laterBatchId, earlierBatchId };
  };

  const aggregateStock = async (insumoId: string): Promise<number> => {
    const [insumo] = await admin.query<Array<{ stock: string }>>(
      `SELECT stock FROM insumos WHERE id = $1`,
      [insumoId],
    );
    return Number(insumo.stock);
  };

  const batchBalances = async (
    tenantId: string,
  ): Promise<Map<string, number>> => {
    const rows = await admin.query<
      Array<{ id: string; remaining_stock: string }>
    >(`SELECT id, remaining_stock FROM batches WHERE tenant_id = $1`, [
      tenantId,
    ]);
    return new Map(rows.map((row) => [row.id, Number(row.remaining_stock)]));
  };

  /**
   * The invariant under test, asserted in one place so all three outflow paths
   * are held to exactly the same rule.
   */
  const expectParity = async (
    tenantId: string,
    insumoId: string,
  ): Promise<void> => {
    const aggregate = await aggregateStock(insumoId);
    const batches = Array.from((await batchBalances(tenantId)).values()).reduce(
      (total, value) => total + value,
      0,
    );
    expect(batches).toBeCloseTo(aggregate, 4);
  };

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();
    process.stdout.write(
      `[timing] migration-built setup = ${fixture.setupDurationMs} ms (migrations alone: ${fixture.migrationDurationMs} ms)\n`,
    );

    admin = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema: fixture.schema,
      ...poolCleanupExtra,
      extra: {
        ...poolCleanupExtra.extra,
        options: `-c search_path=${fixture.schema},public`,
      },
    });
    await admin.initialize();

    // RELATION CLOSURE of everything these three services touch.
    runtime = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      schema: fixture.schema,
      entities: [
        Tenant,
        Insumo,
        UomConversion,
        Product,
        InventoryMovement,
        InventorySyncReceipt,
        InventorySyncOutbox,
        RecipeVersion,
        RecipeDetail,
        Batch,
        Shrinkage,
      ],
      ...poolCleanupExtra,
    });
    await runtime.initialize();

    shrinkageService = new ShrinkageService(
      runtime.getRepository(Insumo),
      runtime.getRepository(Product),
      runtime.getRepository(InventoryMovement),
      runtime,
      { create: jest.fn() } as never,
      {} as never,
      {} as never,
    );

    const unusedRepository = {} as never;
    invoicesService = new InvoicesService(
      runtime,
      unusedRepository, // invoiceRepository    (record carries no invoice)
      unusedRepository, // itemRepository
      unusedRepository, // paymentRepository
      unusedRepository, // userRepository
      runtime.getRepository(InventoryMovement),
      runtime.getRepository(InventorySyncReceipt),
      runtime.getRepository(InventorySyncOutbox),
      unusedRepository, // recipeService       (no invoice -> skipped)
      unusedRepository, // bomExplosionService (delta path never uses it)
    );

    countSessionService = new CountSessionService(runtime);
  });

  afterAll(async () => {
    if (runtime?.isInitialized) await runtime.destroy();
    if (admin?.isInitialized) await admin.destroy();
    if (fixture) await fixture.close();
  });

  it('decrements the batches FEFO when an INSUMO shrinkage leaves the aggregate', async () => {
    const tenantId = await seedTenant('r13-shrinkage-parity');
    const { insumoId, laterBatchId, earlierBatchId } =
      await seedInsumoWithBatches(tenantId, 0);

    const quantity = 5;

    await shrinkageService.recordShrinkage(
      tenantId,
      insumoId,
      quantity,
      'VENCIDO',
      'R13: paridad lotes/agregado (merma de insumo)',
    );

    await expectParity(tenantId, insumoId);

    // And it drew from the SOONEST-expiring batch, not from the id that sorts
    // first: the rule is FEFO, not identity.
    const balances = await batchBalances(tenantId);
    expect(balances.get(earlierBatchId)).toBe(BATCH_REMAINING_STOCK - quantity);
    expect(balances.get(laterBatchId)).toBe(BATCH_REMAINING_STOCK);
  });

  it('decrements a batch when an inventory DELTA leaves the aggregate', async () => {
    const tenantId = await seedTenant('r13-delta-parity');
    const { insumoId } = await seedInsumoWithBatches(tenantId, 1);

    const quantity = 4;

    const result = await invoicesService.syncBatch(tenantId, [
      {
        idempotencyKey: 'r13-delta-1',
        sourceDeviceId: DEVICE_ID,
        sourceSequence: 1,
        flowType: 'inventory',
        documentType: 'ADJUSTMENT',
        movements: [{ insumoId, quantity: -quantity }],
      },
    ]);

    if (result.results[0].status !== 'ACCEPTED') {
      throw new Error(
        `Delta was not accepted: ${JSON.stringify(result.results[0])}`,
      );
    }

    await expectParity(tenantId, insumoId);
  });

  it('decrements a batch when a NEGATIVE count variance leaves the aggregate', async () => {
    const tenantId = await seedTenant('r13-count-parity');
    const { insumoId } = await seedInsumoWithBatches(tenantId, 2);

    const countedQuantity = STOCK - 6;

    const result = await countSessionService.replayCountSession({
      tenantId,
      document: {
        id: randomUUID(),
        warehouseId: randomUUID(),
        warehouseName: 'R13 almacen',
        cutoffAt: `${OPERATION_DAY}T20:00:00.000Z`,
        status: 'posted',
        createdAt: `${OPERATION_DAY}T19:00:00.000Z`,
        updatedAt: `${OPERATION_DAY}T20:00:00.000Z`,
        postedAt: `${OPERATION_DAY}T20:00:00.000Z`,
        lines: [
          {
            id: randomUUID(),
            insumoId,
            insumoName: 'Componente con lotes (R13)',
            uom: 'kg',
            theoreticalQuantity: STOCK,
            approvedEntryIndex: 0,
            entries: [{ countedQuantity }],
          },
        ],
      },
    });

    expect(result.movementsCreated).toBe(1);

    await expectParity(tenantId, insumoId);
  });
});
