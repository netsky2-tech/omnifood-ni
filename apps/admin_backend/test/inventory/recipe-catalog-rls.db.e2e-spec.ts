import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../src/core/database/tenant-transaction';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';
import { normalizeTenantSlug } from '../../src/modules/tenant/tenant-slug';

/**
 * Issue #512 T3 slice 2 part B: tenant isolation for the recipe-catalog
 * tables `recipes`, `recipe_versions`, `recipe_details`, `uom_conversions`
 * and `batches`.
 *
 * The schema is built by RUNNING THE FULL MIGRATION SET (via
 * test/support/migration-built-schema.helper.ts), so the RLS shape asserted
 * here is migration 1809260000000's own output — never a hand-written copy.
 * The application-shaped connection is the fixture's runtime role:
 * `NOSUPERUSER NOBYPASSRLS`, owner of nothing, holding exactly ordinary
 * SELECT/INSERT/UPDATE/DELETE on the scratch schema's tables. Under FORCEd
 * row-level security every query it makes is subject to the migrated
 * policies; the superuser connection exists only to seed tenants and the
 * fixture rows.
 *
 * Every runtime-role observation runs inside a transaction that binds the
 * tenant context with the production SQL (TENANT_CONTEXT_SET_CONFIG_SQL,
 * transaction-local) and is then ROLLED BACK: the GUC is discarded with the
 * transaction, so the pool is never left with a defined-and-empty
 * `app.tenant_id` (the issue #358 poisoning), and the runtime role never
 * mutates the fixtures. An insert "success" is proven inside its own
 * transaction — the statement returning a row IS the WITH CHECK passing.
 *
 * Real-schema constraint hygiene (nothing may mask the RLS verdict):
 * - All five tables FK `tenant_id -> tenants(id)`, so real tenant rows are
 *   seeded for every synthetic tenant context used below.
 * - `recipes` FK `productId -> products(id)` and `recipe_versions` FK
 *   `product_id -> products(id)`: products are seeded for tenants A, B (the
 *   visibility probes) and C (the own-tenant INSERT proof).
 * - `uom_conversions` and `batches` FK `insumo_id -> insumos(id)`, and
 *   `recipe_details` references `recipe_version_id -> recipe_versions(id)`:
 *   insumos are seeded for A, B, C and a version for C, so the insert proofs
 *   fail (or pass) on RLS alone, never on a missing FK parent.
 * - `recipe_versions` carries two PARTIAL unique indexes —
 *   `(tenant_id, pos_document_id) WHERE pos_document_id IS NOT NULL` and
 *   `(tenant_id, product_id) WHERE is_active = true` — so every
 *   recipe_versions insert below uses `is_active = false` and
 *   `pos_document_id IS NULL`: no unique index can fire before or instead of
 *   the RLS verdict. Both tables are append-only in practice, but only
 *   `recipe_versions` lacks a production DELETE path today (versions are
 *   deactivated, never deleted, so its DELETE policy is inert but kept for
 *   the uniform per-command contract); `recipe_details` DOES have one —
 *   `replaceExistingVersion` in recipe.service.ts deletes the outgoing
 *   detail rows before rewriting them, reached from the POS ingest path —
 *   so its DELETE policy is required, not incidental, and the four command
 *   policies are still created on every table.
 */

const TABLES = [
  'recipes',
  'recipe_versions',
  'recipe_details',
  'uom_conversions',
  'batches',
] as const;

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

const poolCleanupExtra = { extra: { allowExitOnIdle: true } };

/**
 * Runs `assertion` on the runtime role inside a rolled-back transaction,
 * bound to `tenantId` through the production set_config binding (or
 * genuinely unbound when `tenantId` is null).
 */
async function asRuntimeRole<T>(
  runtime: DataSource,
  tenantId: string | null,
  assertion: (
    runner: ReturnType<DataSource['createQueryRunner']>,
  ) => Promise<T>,
): Promise<T> {
  const runner = runtime.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    if (tenantId !== null) {
      await runner.query(TENANT_CONTEXT_SET_CONFIG_SQL, [tenantId]);
    }
    return await assertion(runner);
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
  }
}

/**
 * TypeORM's postgres query runner hands DML-with-RETURNING results back as
 * `[rows, affectedRowCount]` while SELECTs arrive as a plain rows array.
 * Normalizes both shapes to the rows array so assertions read on `id`.
 */
function returningRows(
  result: unknown,
): Array<{ id: string; tenant_id?: string }> {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as Array<{ id: string }>;
  }
  return (Array.isArray(result) ? result : []) as Array<{ id: string }>;
}

describe('recipe catalog tenant RLS (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let schema: string;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;

  // A and B own the seeded probes; C and D are fresh synthetic tenant
  // contexts for the INSERT proofs (an own-tenant INSERT bound to A or B
  // would sit next to seeded rows, and C/D keep the WITH CHECK proofs free
  // of unique-index interference — every recipe_versions insert below is
  // inactive and pos_document_id-less). All four exist as real tenant rows
  // because all five tables FK to tenants(id).
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const tenantCId = randomUUID();
  const tenantDId = randomUUID();

  // FK support rows: products for recipes/recipe_versions, insumos for
  // uom_conversions/batches/recipe_details, one recipe_version for C (the
  // parent of C's own recipe_details INSERT proof).
  const productAId = randomUUID();
  const productBId = randomUUID();
  const productCId = randomUUID();
  const insumoAId = randomUUID();
  const insumoBId = randomUUID();
  const insumoCId = randomUUID();
  const versionCId = randomUUID();

  // Seeded probe rows, one per tenant per table (A and B).
  const recipeAId = randomUUID();
  const recipeBId = randomUUID();
  const versionAId = randomUUID();
  const versionBId = randomUUID();
  const detailAId = randomUUID();
  const detailBId = randomUUID();
  const uomAId = randomUUID();
  const uomBId = randomUUID();
  const batchAId = randomUUID();
  const batchBId = randomUUID();

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();
    schema = fixture.schema;
    process.stdout.write(
      `[timing] migration-built setup = ${fixture.setupDurationMs} ms (migrations alone: ${fixture.migrationDurationMs} ms)\n`,
    );

    // Superuser connection: seeding and catalog facts only. It bypasses the
    // FORCED row-level security, which is what makes cross-tenant seeding
    // possible. search_path is pinned so unqualified SQL lands in the
    // scratch schema.
    admin = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      ...poolCleanupExtra,
      extra: {
        ...poolCleanupExtra.extra,
        options: `-c search_path=${schema},public`,
      },
    });
    await admin.initialize();

    // Real tenant rows first: all five tables FK to tenants(id).
    await admin.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $9), ($3, $4, $10), ($5, $6, $11), ($7, $8, $12)`,
      [
        tenantAId,
        'recipe-rls-tenant-a',
        tenantBId,
        'recipe-rls-tenant-b',
        tenantCId,
        'recipe-rls-tenant-c',
        tenantDId,
        'recipe-rls-tenant-d',
        normalizeTenantSlug('recipe-rls-tenant-a'),
        normalizeTenantSlug('recipe-rls-tenant-b'),
        normalizeTenantSlug('recipe-rls-tenant-c'),
        normalizeTenantSlug('recipe-rls-tenant-d'),
      ],
    );

    // FK parents: products (recipes.productId, recipe_versions.product_id)
    // and insumos (uom_conversions.insumo_id, batches.insumo_id).
    await admin.query(
      `INSERT INTO products (id, tenant_id, name, uom) VALUES
         ($1, $2, 'recipe-rls-product-a', 'unidad'),
         ($3, $4, 'recipe-rls-product-b', 'unidad'),
         ($5, $6, 'recipe-rls-product-c', 'unidad')`,
      [productAId, tenantAId, productBId, tenantBId, productCId, tenantCId],
    );
    await admin.query(
      `INSERT INTO insumos (id, tenant_id, name, "purchaseUom", "consumptionUom") VALUES
         ($1, $2, 'recipe-rls-insumo-a', 'kg', 'kg'),
         ($3, $4, 'recipe-rls-insumo-b', 'kg', 'kg'),
         ($5, $6, 'recipe-rls-insumo-c', 'kg', 'kg')`,
      [insumoAId, tenantAId, insumoBId, tenantBId, insumoCId, tenantCId],
    );

    // Seeded probes, one row per table per tenant A and B. recipe_versions
    // rows are is_active = false with pos_document_id NULL so neither
    // partial unique index can interfere with any proof below.
    await admin.query(
      `INSERT INTO recipes (id, tenant_id, "productId", "ingredientId", quantity)
       VALUES ($1, $2, $3, $4, 1.5), ($5, $6, $7, $8, 1.5)`,
      [
        recipeAId,
        tenantAId,
        productAId,
        insumoAId,
        recipeBId,
        tenantBId,
        productBId,
        insumoBId,
      ],
    );
    await admin.query(
      `INSERT INTO recipe_versions (id, tenant_id, product_id, version_number, is_active)
       VALUES ($1, $2, $3, 1, false), ($4, $5, $6, 1, false)`,
      [versionAId, tenantAId, productAId, versionBId, tenantBId, productBId],
    );
    await admin.query(
      `INSERT INTO recipe_details (id, tenant_id, recipe_version_id, insumo_id, quantity)
       VALUES ($1, $2, $3, $4, 0.5), ($5, $6, $7, $8, 0.5)`,
      [
        detailAId,
        tenantAId,
        versionAId,
        insumoAId,
        detailBId,
        tenantBId,
        versionBId,
        insumoBId,
      ],
    );
    await admin.query(
      `INSERT INTO uom_conversions (id, tenant_id, insumo_id, unit_name, factor)
       VALUES ($1, $2, $3, 'lb', 2.0), ($4, $5, $6, 'lb', 2.0)`,
      [uomAId, tenantAId, insumoAId, uomBId, tenantBId, insumoBId],
    );
    await admin.query(
      `INSERT INTO batches (id, tenant_id, insumo_id, batch_number, received_date, expiration_date, remaining_stock, cost)
       VALUES ($1, $2, $3, 'B-A-1', '2025-01-10', '2026-01-10', 10, 100),
              ($4, $5, $6, 'B-B-1', '2025-01-10', '2026-01-10', 10, 100)`,
      [batchAId, tenantAId, insumoAId, batchBId, tenantBId, insumoBId],
    );

    // A parent version for tenant C so C's own recipe_details INSERT proof
    // satisfies its FK on RLS alone.
    await admin.query(
      `INSERT INTO recipe_versions (id, tenant_id, product_id, version_number, is_active)
       VALUES ($1, $2, $3, 1, false)`,
      [versionCId, tenantCId, productCId],
    );

    // The fixture's runtime role: NOSUPERUSER NOBYPASSRLS, non-owner, exact
    // ordinary DML grants. Production-shaped for RLS evaluation.
    runtime = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      ...poolCleanupExtra,
    });
    await runtime.initialize();
  });

  afterAll(async () => {
    if (runtime?.isInitialized) await runtime.destroy();
    if (admin?.isInitialized) await admin.destroy();
    if (fixture) await fixture.close();
  });

  it('seeds both tenants through the superuser and proves the runtime role is a table non-owner that cannot bypass RLS', async () => {
    const seeded = await admin.query(
      `SELECT (SELECT count(*)::int FROM recipes) AS recipes,
              (SELECT count(*)::int FROM recipe_versions) AS recipe_versions,
              (SELECT count(*)::int FROM recipe_details) AS recipe_details,
              (SELECT count(*)::int FROM uom_conversions) AS uom_conversions,
              (SELECT count(*)::int FROM batches) AS batches`,
    );
    expect(seeded[0]).toEqual({
      recipes: 2,
      recipe_versions: 3,
      recipe_details: 2,
      uom_conversions: 2,
      batches: 2,
    });

    const role = (
      await admin.query(
        `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`,
        [fixture.runtimeRoleName],
      )
    )[0];
    expect(role).toBeDefined();
    expect(role.rolsuper).toBe(false);
    expect(role.rolbypassrls).toBe(false);

    const ownership = await admin.query(
      `SELECT count(*)::int AS count
         FROM pg_tables
        WHERE schemaname = $1
          AND tablename IN ('recipes', 'recipe_versions', 'recipe_details', 'uom_conversions', 'batches')
          AND tableowner = $2`,
      [schema, fixture.runtimeRoleName],
    );
    expect(ownership[0].count).toBe(0);
  });

  it('enables AND forces row level security on all five recipe-catalog tables with exactly one command-specific policy per command', async () => {
    const facts = await admin.query(
      `SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relname IN ('recipes', 'recipe_versions', 'recipe_details', 'uom_conversions', 'batches')
        ORDER BY c.relname`,
      [schema],
    );

    expect(facts).toEqual([
      { relname: 'batches', rls_enabled: true, rls_forced: true },
      { relname: 'recipe_details', rls_enabled: true, rls_forced: true },
      { relname: 'recipe_versions', rls_enabled: true, rls_forced: true },
      { relname: 'recipes', rls_enabled: true, rls_forced: true },
      { relname: 'uom_conversions', rls_enabled: true, rls_forced: true },
    ]);

    for (const table of TABLES) {
      const policies = await admin.query(
        `SELECT policyname, cmd FROM pg_policies WHERE schemaname = $1 AND tablename = $2 ORDER BY policyname`,
        [schema, table],
      );
      // EXACTLY the four command policies: an extra policy would widen
      // access beyond the tenant contract, a missing one narrows it.
      expect(policies).toEqual([
        { policyname: `${table}_tenant_delete`, cmd: 'DELETE' },
        { policyname: `${table}_tenant_insert`, cmd: 'INSERT' },
        { policyname: `${table}_tenant_select`, cmd: 'SELECT' },
        { policyname: `${table}_tenant_update`, cmd: 'UPDATE' },
      ]);
    }
  });

  it('denies an unbound runtime role every row of all five tables', async () => {
    await asRuntimeRole(runtime, null, async (runner) => {
      for (const table of TABLES) {
        const rows = (await runner.query(
          `SELECT count(*)::int AS count FROM ${table}`,
        )) as Array<{ count: number }>;
        expect(rows[0].count).toBe(0);
      }
    });
  });

  it('shows tenant A only its own rows in all five tables, never tenant B’s', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const own = {
        recipes: recipeAId,
        recipe_versions: versionAId,
        recipe_details: detailAId,
        uom_conversions: uomAId,
        batches: batchAId,
      } as const;
      for (const [table, id] of Object.entries(own)) {
        const rows = (await runner.query(`SELECT id FROM ${table}`)) as Array<{
          id: string;
        }>;
        expect(rows.map((r) => r.id)).toEqual([id]);
      }
    });
  });

  it('shows tenant B only its own rows in all five tables (triangulation)', async () => {
    await asRuntimeRole(runtime, tenantBId, async (runner) => {
      const own = {
        recipes: recipeBId,
        recipe_versions: versionBId,
        recipe_details: detailBId,
        uom_conversions: uomBId,
        batches: batchBId,
      } as const;
      for (const [table, id] of Object.entries(own)) {
        const rows = (await runner.query(`SELECT id FROM ${table}`)) as Array<{
          id: string;
        }>;
        expect(rows.map((r) => r.id)).toEqual([id]);
      }
    });
  });

  it('accepts a tenant-bound runtime role inserting its own rows into all five tables', async () => {
    // Bound to tenant C: the own-tenant INSERT is the WITH CHECK half
    // passing. Proven inside the rolled-back transaction — the statement
    // returning its row IS the success. Column lists respect each table's
    // NOT NULL shape; recipe_versions inserts are is_active = false with
    // pos_document_id NULL so neither partial unique index can fire.
    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      const insertedRecipe = returningRows(
        await runner.query(
          `INSERT INTO recipes (tenant_id, "productId", "ingredientId", quantity)
           VALUES ($1, $2, $3, 2.0) RETURNING id, tenant_id`,
          [tenantCId, productCId, insumoCId],
        ),
      );
      expect(insertedRecipe).toHaveLength(1);
      expect(insertedRecipe[0].tenant_id).toBe(tenantCId);

      const insertedVersion = returningRows(
        await runner.query(
          `INSERT INTO recipe_versions (tenant_id, product_id, version_number, is_active)
           VALUES ($1, $2, 2, false) RETURNING id, tenant_id`,
          [tenantCId, productCId],
        ),
      );
      expect(insertedVersion).toHaveLength(1);
      expect(insertedVersion[0].tenant_id).toBe(tenantCId);

      const insertedDetail = returningRows(
        await runner.query(
          `INSERT INTO recipe_details (tenant_id, recipe_version_id, insumo_id, quantity)
           VALUES ($1, $2, $3, 0.25) RETURNING id, tenant_id`,
          [tenantCId, versionCId, insumoCId],
        ),
      );
      expect(insertedDetail).toHaveLength(1);
      expect(insertedDetail[0].tenant_id).toBe(tenantCId);

      const insertedUom = returningRows(
        await runner.query(
          `INSERT INTO uom_conversions (tenant_id, insumo_id, unit_name, factor)
           VALUES ($1, $2, 'g', 1000.0) RETURNING id, tenant_id`,
          [tenantCId, insumoCId],
        ),
      );
      expect(insertedUom).toHaveLength(1);
      expect(insertedUom[0].tenant_id).toBe(tenantCId);

      const insertedBatch = returningRows(
        await runner.query(
          `INSERT INTO batches (tenant_id, insumo_id, batch_number, received_date, expiration_date, remaining_stock, cost)
           VALUES ($1, $2, 'B-C-1', '2025-02-01', '2026-02-01', 5, 50) RETURNING id, tenant_id`,
          [tenantCId, insumoCId],
        ),
      );
      expect(insertedBatch).toHaveLength(1);
      expect(insertedBatch[0].tenant_id).toBe(tenantCId);
    });
  });

  it('rejects a tenant-bound runtime role inserting a foreign-tenant row into any of the five tables', async () => {
    // Bound to tenant C, inserting tenant D: a fresh synthetic foreign
    // value, so pre-policy the write itself goes through (the FK parents are
    // C's own rows; recipe_versions is inactive/pos_document_id-less so no
    // unique index fires) and post-policy the WITH CHECK clause rejects it.
    // One transaction per rejection: the first WITH CHECK failure aborts its
    // transaction, which would otherwise poison the next statement with
    // "current transaction is aborted".
    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO recipes (tenant_id, "productId", "ingredientId", quantity)
           VALUES ($1, $2, $3, 2.0) RETURNING id`,
          [tenantDId, productCId, insumoCId],
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO recipe_versions (tenant_id, product_id, version_number, is_active)
           VALUES ($1, $2, 2, false) RETURNING id`,
          [tenantDId, productCId],
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO recipe_details (tenant_id, recipe_version_id, insumo_id, quantity)
           VALUES ($1, $2, $3, 0.25) RETURNING id`,
          [tenantDId, versionCId, insumoCId],
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO uom_conversions (tenant_id, insumo_id, unit_name, factor)
           VALUES ($1, $2, 'g', 1000.0) RETURNING id`,
          [tenantDId, insumoCId],
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO batches (tenant_id, insumo_id, batch_number, received_date, expiration_date, remaining_stock, cost)
           VALUES ($1, $2, 'B-D-1', '2025-02-01', '2026-02-01', 5, 50) RETURNING id`,
          [tenantDId, insumoCId],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it('lets tenant A update and delete its own rows in all five tables', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const updatedRecipe = returningRows(
        await runner.query(
          `UPDATE recipes SET quantity = 9.5 WHERE id = $1 RETURNING id`,
          [recipeAId],
        ),
      );
      expect(updatedRecipe.map((r) => r.id)).toEqual([recipeAId]);

      const updatedVersion = returningRows(
        await runner.query(
          `UPDATE recipe_versions SET version_number = 7 WHERE id = $1 RETURNING id`,
          [versionAId],
        ),
      );
      expect(updatedVersion.map((r) => r.id)).toEqual([versionAId]);

      const updatedDetail = returningRows(
        await runner.query(
          `UPDATE recipe_details SET quantity = 0.75 WHERE id = $1 RETURNING id`,
          [detailAId],
        ),
      );
      expect(updatedDetail.map((r) => r.id)).toEqual([detailAId]);

      const updatedUom = returningRows(
        await runner.query(
          `UPDATE uom_conversions SET factor = 2.2 WHERE id = $1 RETURNING id`,
          [uomAId],
        ),
      );
      expect(updatedUom.map((r) => r.id)).toEqual([uomAId]);

      const updatedBatch = returningRows(
        await runner.query(
          `UPDATE batches SET remaining_stock = remaining_stock - 1 WHERE id = $1 RETURNING id`,
          [batchAId],
        ),
      );
      expect(updatedBatch.map((r) => r.id)).toEqual([batchAId]);

      // Delete of throwaway own rows: insert then delete inside the same
      // transaction, proving DELETE's USING clause admits tenant A's rows.
      const throwawayRecipe = returningRows(
        await runner.query(
          `INSERT INTO recipes (tenant_id, "productId", "ingredientId", quantity)
           VALUES ($1, $2, $3, 1.0) RETURNING id`,
          [tenantAId, productAId, insumoAId],
        ),
      );
      const deletedRecipe = returningRows(
        await runner.query(`DELETE FROM recipes WHERE id = $1 RETURNING id`, [
          throwawayRecipe[0].id,
        ]),
      );
      expect(deletedRecipe.map((r) => r.id)).toEqual([throwawayRecipe[0].id]);

      const throwawayVersion = returningRows(
        await runner.query(
          `INSERT INTO recipe_versions (tenant_id, product_id, version_number, is_active)
           VALUES ($1, $2, 99, false) RETURNING id`,
          [tenantAId, productAId],
        ),
      );
      const deletedVersion = returningRows(
        await runner.query(
          `DELETE FROM recipe_versions WHERE id = $1 RETURNING id`,
          [throwawayVersion[0].id],
        ),
      );
      expect(deletedVersion.map((r) => r.id)).toEqual([throwawayVersion[0].id]);

      const throwawayDetail = returningRows(
        await runner.query(
          `INSERT INTO recipe_details (tenant_id, recipe_version_id, insumo_id, quantity)
           VALUES ($1, $2, $3, 0.1) RETURNING id`,
          [tenantAId, versionAId, insumoAId],
        ),
      );
      const deletedDetail = returningRows(
        await runner.query(
          `DELETE FROM recipe_details WHERE id = $1 RETURNING id`,
          [throwawayDetail[0].id],
        ),
      );
      expect(deletedDetail.map((r) => r.id)).toEqual([throwawayDetail[0].id]);

      const throwawayUom = returningRows(
        await runner.query(
          `INSERT INTO uom_conversions (tenant_id, insumo_id, unit_name, factor)
           VALUES ($1, $2, 'oz', 16.0) RETURNING id`,
          [tenantAId, insumoAId],
        ),
      );
      const deletedUom = returningRows(
        await runner.query(
          `DELETE FROM uom_conversions WHERE id = $1 RETURNING id`,
          [throwawayUom[0].id],
        ),
      );
      expect(deletedUom.map((r) => r.id)).toEqual([throwawayUom[0].id]);

      const throwawayBatch = returningRows(
        await runner.query(
          `INSERT INTO batches (tenant_id, insumo_id, batch_number, received_date, expiration_date, remaining_stock, cost)
           VALUES ($1, $2, 'B-A-THROWAWAY', '2025-03-01', '2026-03-01', 1, 10) RETURNING id`,
          [tenantAId, insumoAId],
        ),
      );
      const deletedBatch = returningRows(
        await runner.query(`DELETE FROM batches WHERE id = $1 RETURNING id`, [
          throwawayBatch[0].id,
        ]),
      );
      expect(deletedBatch.map((r) => r.id)).toEqual([throwawayBatch[0].id]);
    });
  });

  it('stops tenant A’s UPDATE and DELETE from touching tenant B’s rows in any of the five tables', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const updatedRecipe = returningRows(
        await runner.query(
          `UPDATE recipes SET quantity = 999.0 WHERE id = $1 RETURNING id`,
          [recipeBId],
        ),
      );
      expect(updatedRecipe).toEqual([]);

      const updatedVersion = returningRows(
        await runner.query(
          `UPDATE recipe_versions SET version_number = 999 WHERE id = $1 RETURNING id`,
          [versionBId],
        ),
      );
      expect(updatedVersion).toEqual([]);

      const updatedDetail = returningRows(
        await runner.query(
          `UPDATE recipe_details SET quantity = 999.0 WHERE id = $1 RETURNING id`,
          [detailBId],
        ),
      );
      expect(updatedDetail).toEqual([]);

      const updatedUom = returningRows(
        await runner.query(
          `UPDATE uom_conversions SET factor = 999.0 WHERE id = $1 RETURNING id`,
          [uomBId],
        ),
      );
      expect(updatedUom).toEqual([]);

      const updatedBatch = returningRows(
        await runner.query(
          `UPDATE batches SET remaining_stock = 999.0 WHERE id = $1 RETURNING id`,
          [batchBId],
        ),
      );
      expect(updatedBatch).toEqual([]);

      const deletedRecipe = returningRows(
        await runner.query(`DELETE FROM recipes WHERE id = $1 RETURNING id`, [
          recipeBId,
        ]),
      );
      expect(deletedRecipe).toEqual([]);

      const deletedVersion = returningRows(
        await runner.query(
          `DELETE FROM recipe_versions WHERE id = $1 RETURNING id`,
          [versionBId],
        ),
      );
      expect(deletedVersion).toEqual([]);

      const deletedDetail = returningRows(
        await runner.query(
          `DELETE FROM recipe_details WHERE id = $1 RETURNING id`,
          [detailBId],
        ),
      );
      expect(deletedDetail).toEqual([]);

      const deletedUom = returningRows(
        await runner.query(
          `DELETE FROM uom_conversions WHERE id = $1 RETURNING id`,
          [uomBId],
        ),
      );
      expect(deletedUom).toEqual([]);

      const deletedBatch = returningRows(
        await runner.query(`DELETE FROM batches WHERE id = $1 RETURNING id`, [
          batchBId,
        ]),
      );
      expect(deletedBatch).toEqual([]);
    });
  });
});
