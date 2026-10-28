import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { createMigrationBuiltSchemaFixture } from '../../../test/support/migration-built-schema.helper';
import { Tenant } from '../tenant/entities/tenant.entity';
import { normalizeTenantSlug } from '../tenant/tenant-slug';
import { calendarDayOf } from '../../core/database/calendar-day';
import { runInTenantTransaction } from '../../core/database/tenant-transaction';
import { BatchCostingService } from './batch-costing.service';
import { BomExplosionService } from './bom-explosion.service';
import { Batch } from './entities/batch.entity';
import { Insumo } from './entities/insumo.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { InventorySyncReceipt } from './entities/inventory-sync-receipt.entity';
import { Product } from './entities/product.entity';
import { ProductionBatchHistory } from './entities/production-batch-history.entity';
import { RecipeDetail } from './entities/recipe-detail.entity';
import { RecipeVersion } from './entities/recipe-version.entity';
import { UomConversion } from './entities/uom-conversion.entity';
import { ProductionService } from './production.service';
import { RecipeService } from './recipe.service';
import { UomConversionCalculator } from './uom-conversion-calculator';

/**
 * R3 + R4 (odd/tasks/nucleo-inventario-paridad-contrato.md): the DATE CONTRACT
 * of the live production close, pinned against a migration-built schema.
 *
 * Two things are proven here, and they are deliberately kept in one call
 * because they are the same request:
 *
 * 1. **R3 — a `date` column must round-trip its calendar day.** `batches
 *    .expiration_date` is `type: 'date'`, so the driver hands back a plain
 *    `'YYYY-MM-DD'` string; the entity declares `Date`, and the write side
 *    wraps the string in `new Date(...)` un zone negative, which serializes to
 *    the PREVIOUS calendar day. Empirically observed through the live API:
 *    `2026-12-31` was stored as `2026-12-30`. The same mistake is why the live
 *    close CRASHES: `BatchCostingService.isSoftExpired` calls `.getTime()` on
 *    that string.
 *
 * 2. **R4 — the live close path is otherwise sound.** `replayProductionClose`
 *    reaches `applyProductionMovement`, whose movement insert sets
 *    `sourceDocumentId` correctly. This spec pins that, because the earlier
 *    claim that production carried "two stacked bugs" was wrong: the broken
 *    receipt insert used to live in `processOrder`, which had no consumers —
 *    that dead path was removed in R7 (see L9).
 *
 * The recipe is seeded WITH NO COMPONENTS on purpose: `explode` then yields an
 * empty map, so the component loop — and with it the crashing
 * `buildValuationTrace` — is never entered, and the order reaches the output
 * writes. That isolates the write-side date contract from the read-side crash
 * instead of tangling them into one failure.
 *
 * Asserts OBSERVABLE OUTCOME (the calendar day actually stored, and the ledger
 * row actually written), never that a repository method was called. Expected
 * to FAIL until R3 lands the type parity.
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

const OPERATION_DAY = '2026-10-03';
const PRODUCED_EXPIRY_DAY = '2026-11-15';

/**
 * R4 / H6 fixtures. The two source batches are seeded with CHOSEN ids so the
 * lexicographic order is known, and it is deliberately INVERTED against the FEFO
 * order:
 *
 *   `0000…` sorts FIRST lexicographically, and expires LAST  (2026-12-31), cost 200
 *   `ffff…` sorts LAST  lexicographically, and expires FIRST (2026-11-01), cost 100
 *
 * With `operationDate` before both expiries, neither is soft-expired, so the
 * ordering decision falls entirely to the tiebreaker and the two rules point at
 * opposite batches. Random ids could not show this: half the time they would
 * agree and the test would pass for the wrong reason.
 */
const LATER_EXPIRY_BATCH_ID = '00000000-0000-4000-8000-00000000000a';
const EARLIER_EXPIRY_BATCH_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const LATER_EXPIRY_DAY = '2026-12-31';
const EARLIER_EXPIRY_DAY = '2026-11-01';
const EXPENSIVE_BATCH_COST_NIO = 200;
const CHEAP_BATCH_COST_NIO = 100;
const BATCH_REMAINING_STOCK = 10;
const COMPONENT_STOCK = 2 * BATCH_REMAINING_STOCK;

/**
 * The stored calendar day, whatever shape the driver handed back.
 *
 * H-R10: the SAME `date` column arrives as a `string` through TypeORM entity
 * hydration, and as a `Date` at LOCAL midnight through a raw query. Asserting
 * the DAY keeps this spec about the contract instead of about the driver's
 * representation — and comparing a driver `Date` straight against a string is
 * exactly the false negative that made this test look red after the fix had
 * already landed.
 */
const storedCalendarDay = (value: string | Date): string =>
  typeof value === 'string' ? value.slice(0, 10) : calendarDayOf(value);

describe('ProductionService date contract on the live close (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;

  const seedTenant = async (label: string): Promise<string> => {
    const tenantId = randomUUID();
    await admin.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)`,
      [tenantId, label, normalizeTenantSlug(label)],
    );
    return tenantId;
  };

  /**
   * The produced insumo carries stock 0 and NO ledger row: the running-balance
   * trigger COALESCEs the latest `stock_after` to 0 for a first movement, so a
   * `stock_before` of 0 is consistent and the production receipt can post.
   */
  const seedProducedInsumo = async (tenantId: string): Promise<string> => {
    const insumoId = randomUUID();
    await admin.query(
      `INSERT INTO insumos
         (id, tenant_id, name, "purchaseUom", "consumptionUom",
          stock, existencia_actual, costo_promedio_nio)
       VALUES ($1, $2, $3, 'kg', 'kg', 0, 0, 0)`,
      [insumoId, tenantId, 'Producto elaborado (R3)'],
    );
    return insumoId;
  };

  /**
   * A COMPOUND product with a recipe version that has NO detail rows. The
   * version still needs a product because `recipe_versions.product_id` is NOT
   * NULL, and `product_type` is set explicitly because it defaults to SIMPLE.
   */
  const seedComponentlessRecipe = async (
    tenantId: string,
  ): Promise<{ productId: string; recipeVersionId: string }> => {
    const productId = randomUUID();
    await admin.query(
      `INSERT INTO products (id, tenant_id, name, uom, product_type)
       VALUES ($1, $2, $3, 'UND', 'COMPOUND')`,
      [productId, tenantId, 'Plato sin componentes (R3)'],
    );

    const recipeVersionId = randomUUID();
    await admin.query(
      `INSERT INTO recipe_versions
         (id, tenant_id, product_id, version_number, is_active, yield_quantity)
       VALUES ($1, $2, $3, 1, true, 1)`,
      [recipeVersionId, tenantId, productId],
    );

    return { productId, recipeVersionId };
  };

  /**
   * A component insumo with a ledger-consistent opening balance and two batches
   * whose FEFO order contradicts their lexicographic id order (see the fixture
   * constants). The insumo's `costo_promedio_nio` is set to a value that is
   * NEITHER batch's cost, so any assertion that accidentally reads the insumo
   * average instead of the consumed batch cost fails loudly instead of passing.
   */
  const seedComponentInsumoWithBatches = async (
    tenantId: string,
  ): Promise<string> => {
    const insumoId = randomUUID();
    await admin.query(
      `INSERT INTO insumos
         (id, tenant_id, name, "purchaseUom", "consumptionUom",
          stock, existencia_actual, costo_promedio_nio, is_perishable)
       VALUES ($1, $2, $3, 'kg', 'kg', $4, $4, 150, true)`,
      [insumoId, tenantId, 'Componente con lotes (R4)', COMPONENT_STOCK],
    );
    await admin.query(
      `INSERT INTO inventory_kardex
         (tenant_id, insumo_id, movement_type, quantity, unit_cost_nio,
          total_cost_nio, stock_before, stock_after, source_document_type,
          source_document_id, occurred_at)
       VALUES ($1, $2, 'INITIAL_STOCK', $3, 150, $4, 0.0000, $3, 'SEED',
               'seed-initial', NOW())`,
      [tenantId, insumoId, COMPONENT_STOCK, COMPONENT_STOCK * 150],
    );

    await admin.query(
      `INSERT INTO batches
         (id, tenant_id, insumo_id, batch_number, received_date,
          expiration_date, remaining_stock, cost)
       VALUES ($1, $2, $3, 'R4-TARDE-CARO', '2026-10-01', $4, $5, $6),
              ($7, $2, $3, 'R4-PRONTO-BARATO', '2026-10-01', $8, $5, $9)`,
      [
        LATER_EXPIRY_BATCH_ID,
        tenantId,
        insumoId,
        LATER_EXPIRY_DAY,
        BATCH_REMAINING_STOCK,
        EXPENSIVE_BATCH_COST_NIO,
        EARLIER_EXPIRY_BATCH_ID,
        EARLIER_EXPIRY_DAY,
        CHEAP_BATCH_COST_NIO,
      ],
    );

    return insumoId;
  };

  /** A COMPOUND product whose recipe consumes one unit of `componentInsumoId`. */
  const seedRecipeWithComponent = async (input: {
    tenantId: string;
    componentInsumoId: string;
    quantityPerUnit: number;
  }): Promise<{ productId: string; recipeVersionId: string }> => {
    const productId = randomUUID();
    await admin.query(
      `INSERT INTO products (id, tenant_id, name, uom, product_type)
       VALUES ($1, $2, $3, 'UND', 'COMPOUND')`,
      [productId, input.tenantId, 'Plato con componente (R4)'],
    );

    const recipeVersionId = randomUUID();
    await admin.query(
      `INSERT INTO recipe_versions
         (id, tenant_id, product_id, version_number, is_active, yield_quantity)
       VALUES ($1, $2, $3, 1, true, 1)`,
      [recipeVersionId, input.tenantId, productId],
    );
    await admin.query(
      `INSERT INTO recipe_details
         (id, tenant_id, recipe_version_id, insumo_id, quantity)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        randomUUID(),
        input.tenantId,
        recipeVersionId,
        input.componentInsumoId,
        input.quantityPerUnit,
      ],
    );

    return { productId, recipeVersionId };
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

    // Entity list is the RELATION CLOSURE of everything this path touches.
    // Batch declares Tenant and Insumo; Insumo declares Tenant and
    // UomConversion; UomConversion declares Tenant and Insumo; Product,
    // InventoryMovement, RecipeVersion and InventorySyncReceipt declare
    // Tenant; RecipeVersion also declares Product; RecipeDetail declares
    // Tenant and RecipeVersion; ProductionBatchHistory declares NO relations
    // (plain columns only). Tenant declares none, which closes the graph.
    //
    // Two entities were added only after the run named them:
    // `EntityMetadataNotFoundError: No metadata for "<Entity>" was found`
    // means the list is short by exactly that entity. Read the missing name
    // off the error instead of guessing.
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
        RecipeVersion,
        RecipeDetail,
        Batch,
        ProductionBatchHistory,
      ],
      ...poolCleanupExtra,
    });
    await runtime.initialize();
  });

  afterAll(async () => {
    if (runtime?.isInitialized) await runtime.destroy();
    if (admin?.isInitialized) await admin.destroy();
    if (fixture) await fixture.close();
  });

  /**
   * The real service with real collaborators. Stubbing `RecipeService` or
   * `BomExplosionService` here would move the mock boundary back onto the path
   * under test, which is the defect this whole workstream closes.
   */
  const buildProductionService = (): ProductionService =>
    new ProductionService(
      runtime,
      new RecipeService(
        runtime.getRepository(RecipeVersion),
        runtime.getRepository(RecipeDetail),
        new UomConversionCalculator(),
        runtime,
      ),
      new BomExplosionService(),
      new BatchCostingService(),
      runtime.getRepository(Batch),
    );

  it('stores the produced batch expiry and receipt day as the calendar day it was given, and writes the receipt with its source document', async () => {
    const tenantId = await seedTenant('r3-production-date');
    const producedInsumoId = await seedProducedInsumo(tenantId);
    const { recipeVersionId } = await seedComponentlessRecipe(tenantId);

    const service = buildProductionService();

    const actualQuantity = 5;

    const result = await service.replayProductionClose({
      tenantId,
      document: {
        id: randomUUID(),
        recipeVersionId,
        producedInsumoId,
        producedBatchNumber: 'R3-LOTE-001',
        producedExpirationDate: PRODUCED_EXPIRY_DAY,
        plannedQuantity: actualQuantity,
        actualQuantity,
        outcome: 'COMPLETED',
        terminalId: 'RIG-TERMINAL-1',
        sourceSequence: 1,
        idempotencyKey: 'r3-production-close-1',
        payloadHash: 'r3-rig',
        operationDate: OPERATION_DAY,
        movementReferences: ['r3-ref-1'],
      },
    });

    // The live close completes at all — the precondition for everything below.
    expect(result.skippedExisting).toBe(false);

    const [batch] = await admin.query<
      Array<{
        expiration_date: string | Date;
        received_date: string | Date;
        remaining_stock: string;
      }>
    >(
      `SELECT expiration_date, received_date, remaining_stock
         FROM batches WHERE tenant_id = $1 AND insumo_id = $2`,
      [tenantId, producedInsumoId],
    );

    expect(batch).toBeDefined();
    expect(Number(batch.remaining_stock)).toBe(actualQuantity);

    // R3: the calendar day must survive the round trip. A `new Date(...)` wrap
    // on a `date` column serializes to the PREVIOUS day in a negative-offset
    // zone, which is what this assertion catches.
    expect(storedCalendarDay(batch.expiration_date)).toBe(PRODUCED_EXPIRY_DAY);
    expect(storedCalendarDay(batch.received_date)).toBe(OPERATION_DAY);

    // And the APPLICATION-visible half of H-R10: read back through TypeORM the
    // way the services do (tenant-bound, since the table is under FORCE RLS),
    // the column hydrates as the `string` the entity now declares. Pinning both
    // shapes is what keeps the contract from silently drifting back.
    const hydrated = await runInTenantTransaction(
      runtime,
      tenantId,
      (manager) =>
        manager.findOne(Batch, {
          where: { tenant_id: tenantId, insumo_id: producedInsumoId },
        }),
    );
    expect(typeof hydrated?.expiration_date).toBe('string');
    expect(hydrated?.expiration_date).toBe(PRODUCED_EXPIRY_DAY);

    // Same contract on the history row: the fix has to be systematic, not a
    // single-site patch, so the class is pinned in more than one place.
    const [history] = await admin.query<
      Array<{ produced_expiration_date: string | Date }>
    >(
      `SELECT produced_expiration_date
         FROM production_batch_history WHERE tenant_id = $1`,
      [tenantId],
    );
    expect(history).toBeDefined();
    expect(storedCalendarDay(history.produced_expiration_date)).toBe(
      PRODUCED_EXPIRY_DAY,
    );

    // R4: the LIVE receipt insert carries its source document. This is the
    // assertion that would have caught the "two stacked bugs" misreading.
    const receiptMovements = await admin.query<
      Array<{
        movement_type: string;
        quantity: string;
        source_document_id: string | null;
      }>
    >(
      `SELECT movement_type, quantity, source_document_id
         FROM inventory_kardex
        WHERE tenant_id = $1 AND movement_type = 'PRODUCTION'
        ORDER BY id`,
      [tenantId],
    );

    expect(receiptMovements).toHaveLength(1);
    expect(Number(receiptMovements[0].quantity)).toBe(actualQuantity);
    expect(receiptMovements[0].source_document_id).toBeTruthy();
  });

  it('consumes source batches in FEFO order and derives the produced unit cost from what it consumed', async () => {
    const tenantId = await seedTenant('r4-fefo-order');
    const componentInsumoId = await seedComponentInsumoWithBatches(tenantId);
    const producedInsumoId = await seedProducedInsumo(tenantId);
    const { recipeVersionId } = await seedRecipeWithComponent({
      tenantId,
      componentInsumoId,
      quantityPerUnit: 1,
    });

    const actualQuantity = 5;

    const result = await buildProductionService().replayProductionClose({
      tenantId,
      document: {
        id: randomUUID(),
        recipeVersionId,
        producedInsumoId,
        producedBatchNumber: 'R4-LOTE-001',
        producedExpirationDate: PRODUCED_EXPIRY_DAY,
        plannedQuantity: actualQuantity,
        actualQuantity,
        outcome: 'COMPLETED',
        terminalId: 'RIG-TERMINAL-1',
        sourceSequence: 1,
        idempotencyKey: 'r4-production-close-1',
        payloadHash: 'r4-rig',
        operationDate: OPERATION_DAY,
        movementReferences: ['r4-ref-1'],
      },
    });

    // First, the 500 is gone: the live close completes with a perishable
    // component that actually consumes from a batch.
    expect(result.skippedExisting).toBe(false);

    // H6: WHICH batch was consumed. The component's OUT movement carries
    // `unit_cost_nio = consumedValueNio / consumedTotal`, so it names the
    // consumed batch by its cost. FEFO must take the EARLIER-expiring batch;
    // the seeded ids make the lexicographic rule pick the other one, so this
    // assertion separates the two rules instead of accepting either.
    const [componentOut] = await admin.query<
      Array<{
        quantity: string;
        unit_cost_nio: string;
        source_document_id: string | null;
      }>
    >(
      `SELECT quantity, unit_cost_nio, source_document_id
         FROM inventory_kardex
        WHERE tenant_id = $1 AND insumo_id = $2 AND movement_type = 'PRODUCTION'
        ORDER BY id`,
      [tenantId, componentInsumoId],
    );

    expect(componentOut).toBeDefined();
    expect(Number(componentOut.quantity)).toBe(-actualQuantity);
    expect(Number(componentOut.unit_cost_nio)).toBe(CHEAP_BATCH_COST_NIO);
    expect(componentOut.source_document_id).toBeTruthy();

    // And the batch balances followed the same decision: the earlier-expiring
    // batch was drawn down, the later-expiring one was not touched.
    const batches = await admin.query<
      Array<{ id: string; remaining_stock: string }>
    >(
      `SELECT id, remaining_stock FROM batches WHERE tenant_id = $1 ORDER BY id`,
      [tenantId],
    );
    const remainingById = new Map(
      batches.map((batch) => [batch.id, Number(batch.remaining_stock)]),
    );

    expect(remainingById.get(EARLIER_EXPIRY_BATCH_ID)).toBe(
      BATCH_REMAINING_STOCK - actualQuantity,
    );
    expect(remainingById.get(LATER_EXPIRY_BATCH_ID)).toBe(
      BATCH_REMAINING_STOCK,
    );

    // T4's open question, measured instead of assumed: the produced unit cost is
    // the consumed value over the produced quantity.
    const consumedValueNio = actualQuantity * CHEAP_BATCH_COST_NIO;

    const [receipt] = await admin.query<Array<{ unit_cost_nio: string }>>(
      `SELECT unit_cost_nio FROM inventory_kardex
        WHERE tenant_id = $1 AND insumo_id = $2 AND movement_type = 'PRODUCTION'`,
      [tenantId, producedInsumoId],
    );

    expect(receipt).toBeDefined();
    expect(Number(receipt.unit_cost_nio)).toBe(
      consumedValueNio / actualQuantity,
    );
  });
});
