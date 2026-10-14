import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { createMigrationBuiltSchemaFixture } from '../../../test/support/migration-built-schema.helper';
import { Tenant } from '../tenant/entities/tenant.entity';
import { normalizeTenantSlug } from '../tenant/tenant-slug';
import { BomExplosionService } from './bom-explosion.service';
import { Insumo } from './entities/insumo.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { Batch } from './entities/batch.entity';
import { Shrinkage } from './entities/shrinkage.entity';
import { Product } from './entities/product.entity';
import { RecipeDetail } from './entities/recipe-detail.entity';
import { RecipeVersion } from './entities/recipe-version.entity';
import { UomConversion } from './entities/uom-conversion.entity';
import { RecipeService } from './recipe.service';
import { ShrinkageService } from './shrinkage.service';
import { UomConversionCalculator } from './uom-conversion-calculator';

/**
 * R2 (odd/tasks/nucleo-inventario-paridad-contrato.md): the kardex write
 * contract for BOTH shrinkage paths, pinned against a MIGRATION-BUILT schema.
 *
 * Why this spec exists. `docs/audits/inventory-core-flow-truth-v1.md` recorded
 * that recording a shrinkage returns HTTP 500 because both movement inserts
 * (`shrinkage.service.ts:95-107` for an insumo, `:201-213` for a product) set
 * `sourceDocumentType` but never `sourceDocumentId`, while
 * `inventory_kardex.source_document_id` is `NOT NULL` since the ledger
 * foundation (`1766000000000-BohInventoryLedgerFoundation.ts:19`).
 *
 * The existing `shrinkage.service.spec.ts` cannot see it: it mocks the
 * persistence layer, so no constraint is ever installed. This spec runs the
 * FULL migration set (the same glob the production data source resolves) into
 * a scratch schema and drives the real service through the fixture's runtime
 * role — `NOSUPERUSER NOBYPASSRLS`, owner of nothing — so the migrated
 * constraints and the FORCEd row-level security both apply exactly as they do
 * in production.
 *
 * Each test seeds its OWN tenant, insumo and recipe so the cases stay
 * independent and order-free. Assertions are on OBSERVABLE OUTCOME (a kardex
 * row whose required columns are populated, and stock that moved), never on
 * "a repository method was called". Both tests are expected to FAIL until R5
 * lands the fix.
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

interface KardexRow {
  movement_type: string;
  quantity: string;
  unit_cost_nio: string;
  total_cost_nio: string;
  stock_before: string;
  stock_after: string;
  source_document_type: string | null;
  source_document_id: string | null;
}

describe('ShrinkageService kardex write contract (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;
  let recipeService: RecipeService;

  const INSUMO_STOCK = 100;
  const INSUMO_CPP_NIO = 100;

  const seedTenant = async (label: string): Promise<string> => {
    const tenantId = randomUUID();
    await admin.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)`,
      [tenantId, label, normalizeTenantSlug(label)],
    );
    return tenantId;
  };

  /**
   * The opening balance MUST be a ledger row, not just a column value.
   * `trg_inventory_kardex_running_balance` (1774000000000, lines 80-99)
   * requires `stock_before` to equal the latest `stock_after` for the
   * (tenant, insumo) pair — COALESCEd to 0 for a first movement — and
   * `stock_after` to equal that balance plus `quantity`. Seeding stock 100
   * with no movement therefore makes every later insert fail with
   * `inventory_kardex balance invariant violated`, before the NOT NULL check
   * these tests are about ever runs. Mirrors `scripts/seed-test-data.ts`,
   * which writes exactly this INITIAL_STOCK row.
   *
   * Only tenant_id, name, purchaseUom and consumptionUom are NOT NULL without
   * a default on `insumos`.
   */
  const seedInsumo = async (input: {
    tenantId: string;
    name: string;
    stock: number;
    cppNio: number;
  }): Promise<string> => {
    const insumoId = randomUUID();
    await admin.query(
      `INSERT INTO insumos
         (id, tenant_id, name, "purchaseUom", "consumptionUom",
          stock, existencia_actual, costo_promedio_nio)
       VALUES ($1, $2, $3, 'kg', 'kg', $4, $4, $5)`,
      [insumoId, input.tenantId, input.name, input.stock, input.cppNio],
    );
    await admin.query(
      `INSERT INTO inventory_kardex
         (tenant_id, insumo_id, movement_type, quantity, unit_cost_nio,
          total_cost_nio, stock_before, stock_after, source_document_type,
          source_document_id, occurred_at)
       VALUES ($1, $2, 'INITIAL_STOCK', $3, $4, $5, 0.0000, $3, 'SEED',
               'seed-initial', NOW())`,
      [
        input.tenantId,
        insumoId,
        input.stock,
        input.cppNio,
        input.stock * input.cppNio,
      ],
    );
    return insumoId;
  };

  /**
   * A COMPOUND product with a one-component recipe. `products.product_type`
   * carries a SIMPLE default so it is set explicitly; `recipe_versions
   * .is_active` defaults to false, so it is set to true.
   * `recipe_details.quantity` is the per-sold-unit NET consumption that
   * `BomExplosionService.explode` multiplies by the order quantity.
   */
  const seedCompoundProductWithRecipe = async (input: {
    tenantId: string;
    componentInsumoId: string;
    quantityPerUnit: number;
  }): Promise<{ productId: string; recipeVersionId: string }> => {
    const productId = randomUUID();
    await admin.query(
      `INSERT INTO products (id, tenant_id, name, uom, product_type)
       VALUES ($1, $2, $3, 'UND', 'COMPOUND')`,
      [productId, input.tenantId, 'Plato de prueba (R2)'],
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

    // Superuser connection: seeding only. It bypasses the FORCEd row-level
    // security, which is what makes it usable as the fixture seeder.
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

    // Application-shaped connection: the fixture's runtime role. The schema
    // comes from the migration set (synchronize stays off), so the entity
    // classes are registered ONLY so TypeORM can resolve repository metadata;
    // they never define DDL.
    //
    // The list is the RELATION CLOSURE of the entities under test, not just
    // those the service names: `DataSource.initialize()` builds the full
    // metadata graph, so every relation target must be present or it throws
    // `Entity metadata for <Entity>#<relation> was not found`.
    //   Insumo -> Tenant, UomConversion
    //   UomConversion -> Tenant, Insumo
    //   Product, InventoryMovement, RecipeVersion -> Tenant
    //   RecipeVersion -> Product
    //   RecipeDetail -> Tenant, RecipeVersion
    //   Tenant declares no relations, which is what closes the graph.
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
        // R20: ShrinkageService now PERSISTS the shrinkage document (its motive
        // and observation finally have a home), so this DataSource must carry
        // the Shrinkage metadata. Same loud failure as R13's Batch note below:
        // a missing entity is not skipped, `manager.getRepository(Shrinkage)`
        // throws EntityMetadataNotFoundError. That is exactly what turned all
        // three of these tests red when the service learned to write it.
        Shrinkage,
        RecipeVersion,
        RecipeDetail,
        // R13: ShrinkageService now draws the outflow from the batches, so this
        // spec's DataSource must carry the Batch metadata. A missing entity is
        // not skipped — `manager.getRepository(Batch)` throws
        // `EntityMetadataNotFoundError`, which is the correct, loud failure.
        Batch,
      ],
      ...poolCleanupExtra,
    });
    await runtime.initialize();

    // Real collaborators: the product path resolves its components through
    // `RecipeService.getSnapshot` and explodes them with the real
    // `BomExplosionService`. Stubbing either would move the boundary of the
    // mock back onto the path under test, which is the defect this whole
    // workstream is closing.
    recipeService = new RecipeService(
      runtime.getRepository(RecipeVersion),
      runtime.getRepository(RecipeDetail),
      new UomConversionCalculator(),
      runtime,
    );
  });

  afterAll(async () => {
    if (runtime?.isInitialized) await runtime.destroy();
    if (admin?.isInitialized) await admin.destroy();
    if (fixture) await fixture.close();
  });

  /**
   * `forensicAlertService` is a stub on purpose: with valuations of C$300 and
   * C$200 the alert threshold (C$1,500) is never reached, so
   * `createHighValueShrinkageAlertIfNeeded` returns early and the collaborator
   * is never exercised. Its own defect is tracked separately (H7) and is not
   * part of this contract.
   */
  const buildService = (): ShrinkageService =>
    new ShrinkageService(
      runtime.getRepository(Insumo),
      runtime.getRepository(Product),
      runtime.getRepository(InventoryMovement),
      runtime,
      { create: jest.fn() } as never,
      recipeService,
      new BomExplosionService(),
    );

  const readShrinkageMovements = async (
    tenantId: string,
  ): Promise<KardexRow[]> =>
    admin.query<KardexRow[]>(
      `SELECT movement_type, quantity, unit_cost_nio, total_cost_nio,
              stock_before, stock_after, source_document_type, source_document_id
         FROM inventory_kardex
        WHERE tenant_id = $1 AND movement_type = 'SHRINKAGE'
        ORDER BY id`,
      [tenantId],
    );

  it('records an INSUMO shrinkage as a kardex movement that satisfies every NOT NULL column and moves stock', async () => {
    const tenantId = await seedTenant('r2-insumo-shrinkage');
    const insumoId = await seedInsumo({
      tenantId,
      name: 'Harina de trigo (R2)',
      stock: INSUMO_STOCK,
      cppNio: INSUMO_CPP_NIO,
    });

    const quantity = 3;

    await buildService().recordShrinkage(
      tenantId,
      insumoId,
      quantity,
      'VENCIDO',
      'R2: contrato de escritura al kardex (insumo)',
    );

    const movements = await readShrinkageMovements(tenantId);
    expect(movements).toHaveLength(1);
    const movement = movements[0];

    expect(movement.movement_type).toBe('SHRINKAGE');
    expect(Number(movement.quantity)).toBe(-quantity);
    expect(Number(movement.stock_before)).toBe(INSUMO_STOCK);
    expect(Number(movement.stock_after)).toBe(INSUMO_STOCK - quantity);
    expect(Number(movement.unit_cost_nio)).toBe(INSUMO_CPP_NIO);
    expect(Number(movement.total_cost_nio)).toBe(quantity * INSUMO_CPP_NIO);

    // The two columns the broken inserts omit. `source_document_id` is the one
    // that raises the NOT NULL violation at runtime.
    expect(movement.source_document_type).toBe('SHRINKAGE');
    expect(movement.source_document_id).toBeTruthy();

    const [insumo] = await admin.query<
      Array<{ stock: string; existencia_actual: string }>
    >(`SELECT stock, existencia_actual FROM insumos WHERE id = $1`, [insumoId]);

    expect(Number(insumo.stock)).toBe(INSUMO_STOCK - quantity);
    expect(Number(insumo.existencia_actual)).toBe(INSUMO_STOCK - quantity);
  });

  it('R20: persists the shrinkage DOCUMENT its kardex row points at, with the taxonomy and the observation', async () => {
    const tenantId = await seedTenant('r20-shrinkage-document');
    const insumoId = await seedInsumo({
      tenantId,
      name: 'Harina de trigo (R20)',
      stock: INSUMO_STOCK,
      cppNio: INSUMO_CPP_NIO,
    });

    const observation = 'R20: se mojo en el traslado y no es apta para consumo';

    await buildService().recordShrinkage(
      tenantId,
      insumoId,
      2,
      'VENCIDO',
      observation,
    );

    const movements = await readShrinkageMovements(tenantId);
    expect(movements).toHaveLength(1);

    // The row's document identity has to RESOLVE. Before this fix the id was
    // minted, stored here as `source_document_id`, and NO shrinkage document was
    // ever created — so the motive was unrecoverable and the reference dangled.
    const documentId = movements[0].source_document_id;
    expect(documentId).toBeTruthy();

    const documents = await admin.query<
      Array<{
        id: string;
        shrinkage_type: string;
        observation: string;
        reason: string | null;
      }>
    >(
      `SELECT id, shrinkage_type, observation, reason
         FROM shrinkages WHERE id = $1`,
      [documentId],
    );

    expect(documents).toHaveLength(1);

    // The taxonomy is recorded on the document (its NOT NULL column).
    expect(documents[0].shrinkage_type).toBeTruthy();

    // And the observation is the whole point: the service REQUIRED it
    // (`requireMermaObservation`) and then threw it away, because no column
    // anywhere could hold it. This assertion is what proves it now lands.
    expect(documents[0].observation).toBe(observation);

    // The taxonomy has ONE home. `reason` stays empty on purpose rather than
    // carrying a duplicate of the same string — duplicating one value into two
    // columns is how the disagreements this codebase keeps finding begin.
    expect(documents[0].reason).toBeNull();
  });

  it('records a PRODUCT shrinkage by exploding its BOM and satisfies every NOT NULL column on the ledger row', async () => {
    const tenantId = await seedTenant('r2-product-shrinkage');
    const insumoId = await seedInsumo({
      tenantId,
      name: 'Salsa base (R2)',
      stock: INSUMO_STOCK,
      cppNio: INSUMO_CPP_NIO,
    });
    const { productId, recipeVersionId } = await seedCompoundProductWithRecipe({
      tenantId,
      componentInsumoId: insumoId,
      quantityPerUnit: 1,
    });

    const unitsThrownAway = 2;

    await buildService().recordProductShrinkage(tenantId, {
      productId,
      recipeVersionId,
      quantity: unitsThrownAway,
      reason: 'DESECHO_COCINA',
      observation: 'R2: contrato de escritura al kardex (plato)',
    });

    const movements = await readShrinkageMovements(tenantId);
    expect(movements).toHaveLength(1);
    const movement = movements[0];

    // One kilo per unit thrown away, exploded from the recipe.
    const expectedConsumed = unitsThrownAway;

    expect(movement.movement_type).toBe('SHRINKAGE');
    expect(Number(movement.quantity)).toBe(-expectedConsumed);
    expect(Number(movement.stock_before)).toBe(INSUMO_STOCK);
    expect(Number(movement.stock_after)).toBe(
      INSUMO_STOCK - expectedConsumed,
    );
    expect(Number(movement.total_cost_nio)).toBe(
      expectedConsumed * INSUMO_CPP_NIO,
    );
    expect(movement.source_document_type).toBe('SHRINKAGE');
    expect(movement.source_document_id).toBeTruthy();

    const [insumo] = await admin.query<Array<{ stock: string }>>(
      `SELECT stock FROM insumos WHERE id = $1`,
      [insumoId],
    );
    expect(Number(insumo.stock)).toBe(INSUMO_STOCK - expectedConsumed);
  });
});
