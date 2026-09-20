import { randomUUID } from 'crypto';
import { DataSource, type EntityMetadata } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../src/core/database/tenant-transaction';
import { InventoryReadinessAdapter } from '../../src/modules/onboarding/adapters/inventory-readiness.adapter';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import { User } from '../../src/modules/identity/entities/user.entity';
import { SecurityProfile } from '../../src/modules/identity/entities/security-profile.entity';
import { SystemParametersConfig } from '../../src/modules/inventory/entities/system-parameters-config.entity';
import {
  Product,
  ProductType,
} from '../../src/modules/inventory/entities/product.entity';
import { Insumo } from '../../src/modules/inventory/entities/insumo.entity';
import { Recipe } from '../../src/modules/inventory/entities/recipe.entity';
import { RecipeVersion } from '../../src/modules/inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../src/modules/inventory/entities/recipe-detail.entity';
import { UomConversion } from '../../src/modules/inventory/entities/uom-conversion.entity';
import { Warehouse } from '../../src/modules/inventory/entities/warehouse.entity';
import { Supplier } from '../../src/modules/inventory/entities/supplier.entity';
import { InventoryMovement } from '../../src/modules/inventory/entities/inventory-movement.entity';
import { Invoice } from '../../src/modules/sales/entities/invoice.entity';
import { InvoiceItem } from '../../src/modules/sales/entities/invoice-item.entity';
import { InvoiceItemModifier } from '../../src/modules/sales/entities/invoice-item-modifier.entity';
import { Payment } from '../../src/modules/sales/entities/payment.entity';
import { IndustryTemplate } from '../../src/modules/onboarding/entities/industry-template.entity';
import { TemplateInsumo } from '../../src/modules/onboarding/entities/template-insumo.entity';
import { TemplateProduct } from '../../src/modules/onboarding/entities/template-product.entity';
import { TemplateRecipeItem } from '../../src/modules/onboarding/entities/template-recipe-item.entity';
import { ImportStaging } from '../../src/modules/onboarding/entities/import-staging.entity';
import { OnboardingSession } from '../../src/modules/onboarding/entities/onboarding-session.entity';
import { OnboardingIdempotencyRecord } from '../../src/modules/onboarding/entities/onboarding-idempotency.entity';
import { OnboardingTelemetryEvent } from '../../src/modules/onboarding/entities/onboarding-telemetry-event.entity';
import { ChangeLog } from '../../src/modules/audit/entities/change-log.entity';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';

/**
 * Issue #358 regression test: `GET /onboarding/readiness` and activation
 * diagnostics used to fail with `QueryFailedError: invalid input syntax for
 * type uuid: ""` on pooled connections poisoned by a previous request.
 *
 * The mechanism (NOT "a blank tenant context reaches RLS tables"): the
 * `invoices` RLS policy (migration 1809060000000-AlignInvoiceTenantPolicyPredicate)
 * uses the uuid-form predicate `tenant_id = current_setting('app.tenant_id',
 * true)::uuid`. An UNDEFINED `app.tenant_id` is harmless: current_setting(..., true)
 * returns NULL, NULL::uuid is NULL, the predicate matches nothing. The failure
 * needs the setting DEFINED AND EMPTY, which happens after a
 * `set_config('app.tenant_id', ..., is_local => true)` COMMITS on a pooled
 * connection: PostgreSQL resets the never-session-set GUC to the empty string
 * (not to undefined) at commit. Any later unbound read of `invoices` on that
 * same pooled connection then throws on the `::uuid` cast.
 *
 * ISSUE #418: the schema is built by RUNNING THE FULL MIGRATION SET (via
 * test/support/migration-built-schema.helper.ts) instead of
 * `synchronize: true`, as a role that does not bypass RLS. The migration set
 * creates the REAL RLS policies (~100 across the schema, four on `invoices`
 * with the uuid-form predicate), so this file no longer hand-writes the
 * `invoices` policy — it stopped asserting against a copy of reality and now
 * asserts against the migrations' own output. The first two tests additionally
 * pin the conversion itself: the entity-declared column types are compared
 * against `information_schema` for the migration-built schema (a wrong entity
 * annotation is now a RED test instead of an invisible divergence), and
 * `pg_policies` must contain rows. Everything else — the poisoned-pool
 * reproduction, the fixed-path success, the not-ready snapshot — is the
 * original #358 regression, unchanged, and still holding on a
 * migration-built schema is the proof the conversion did not weaken it.
 */

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

// Forwarded to the underlying pg Pool via TypeORM's `extra` block: unrefs the
// pool's idle timers so jest exits cleanly once the DataSources are destroyed.
const poolCleanupExtra = { extra: { allowExitOnIdle: true } };

const entities = [
  Tenant,
  User,
  SecurityProfile,
  SystemParametersConfig,
  Product,
  Insumo,
  Recipe,
  RecipeVersion,
  RecipeDetail,
  UomConversion,
  IndustryTemplate,
  TemplateInsumo,
  TemplateProduct,
  TemplateRecipeItem,
  ImportStaging,
  OnboardingSession,
  OnboardingIdempotencyRecord,
  Warehouse,
  Supplier,
  InventoryMovement,
  Invoice,
  InvoiceItem,
  InvoiceItemModifier,
  Payment,
  OnboardingTelemetryEvent,
  ChangeLog,
];

/**
 * The entity/schema drift scope: every column this spec's fixtures and
 * adapter queries actually depend on, checked by comparing the TypeORM
 * entity metadata's declared type against `information_schema` for the
 * MIGRATION-BUILT schema. A synchronized schema could never catch drift
 * here (the entity IS the schema); against the migrations a lying annotation
 * goes red.
 *
 * Deliberately scoped, not exhaustive: the full-schema comparison is the
 * column-type ratchet's job (scripts/verify-schema-build.sh). This spec
 * asserts only what it touches.
 */
const DRIFT_SCOPE: ReadonlyArray<{
  readonly table: string;
  readonly column: string;
}> = [
  { table: 'invoices', column: 'tenant_id' },
  { table: 'invoices', column: 'invoice_number' },
  { table: 'invoices', column: 'user_id' },
  { table: 'invoices', column: 'subtotal' },
  { table: 'invoices', column: 'total' },
  { table: 'invoices', column: 'inventory_outcome' },
  { table: 'invoices', column: 'created_at' },
  { table: 'warehouses', column: 'tenant_id' },
  { table: 'products', column: 'tenant_id' },
  { table: 'products', column: 'stock' },
  { table: 'insumos', column: 'tenant_id' },
];

/**
 * Folds a TypeORM column metadata declaration onto PostgreSQL's
 * `information_schema` vocabulary so the two sides compare types, not
 * spellings. Fail-closed: a declared type this table does not know makes the
 * drift assertion FAIL naming the column, because an unknown declaration must
 * be judged by a human, never silently skipped.
 */
const declaredTypeOf = (metadata: EntityMetadata, column: string): string => {
  const col = metadata.columns.find((c) => c.databaseName === column);
  if (!col) {
    return `missing-from-entity:${metadata.tableName}.${column}`;
  }
  const raw = typeof col.type === 'function' ? col.type.name : String(col.type);
  // String is TypeORM's reflection of a bare @Column() on a string property
  // and maps to character varying unambiguously on PostgreSQL. Number and
  // Date are deliberately NOT normalized: deciding integer vs numeric, or
  // timestamp vs timestamptz, is a per-column design decision — a scoped
  // column declared that way fails closed and must be judged by a human.
  const base = (
    {
      String: 'character varying',
      uuid: 'uuid',
      varchar: 'character varying',
      text: 'text',
      decimal: 'numeric',
      numeric: 'numeric',
      integer: 'integer',
      bigint: 'bigint',
      boolean: 'boolean',
      jsonb: 'jsonb',
      timestamptz: 'timestamp with time zone',
      timestamp: 'timestamp without time zone',
    } as Record<string, string>
  )[raw];
  if (!base) {
    return `unknown-declared-type:${metadata.tableName}.${column}:${raw}`;
  }
  if (col.isArray) return `${base}[]`;
  if (base === 'character varying' && col.length)
    return `${base}(${col.length})`;
  if (base === 'numeric' && col.precision) {
    return `${base}(${col.precision},${col.scale})`;
  }
  return base;
};

const actualTypeOf = async (
  dataSource: DataSource,
  schema: string,
  table: string,
  column: string,
): Promise<string> => {
  const rows = await dataSource.query<
    Array<{
      data_type: string;
      character_maximum_length: number | null;
      numeric_precision: number | null;
      numeric_scale: number | null;
    }>
  >(
    `SELECT data_type,
            character_maximum_length,
            numeric_precision,
            numeric_scale
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
    [schema, table, column],
  );
  if (rows.length === 0) {
    return `missing-from-schema:${schema}.${table}.${column}`;
  }
  const {
    data_type,
    character_maximum_length,
    numeric_precision,
    numeric_scale,
  } = rows[0];
  if (character_maximum_length !== null)
    return `${data_type}(${character_maximum_length})`;
  if (data_type === 'numeric' && numeric_precision !== null) {
    return `${data_type}(${numeric_precision},${numeric_scale})`;
  }
  return data_type;
};

describe('InventoryReadiness tenant binding on poisoned pooled connections (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(60000);

  let dataSource: DataSource;
  let restricted: DataSource;
  let schema: string;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;

  const tenantAId = randomUUID();
  const tenantBId = randomUUID();

  beforeAll(async () => {
    // The schema is the migrations' output, built as a restricted role; the
    // helper provisions the scratch schema, uuid-ossp, and both roles, and
    // measures its own setup cost (logged below for the issue's measurement).
    fixture = await createMigrationBuiltSchemaFixture();
    schema = fixture.schema;
    process.stdout.write(
      `[timing] migration-built setup = ${fixture.setupDurationMs} ms (migrations alone: ${fixture.migrationDurationMs} ms)\n`,
    );

    // Admin (superuser) connection for seeding only: superuser bypasses the
    // FORCED row-level security, which is what makes cross-tenant seeding
    // possible. search_path is pinned on the connection itself so every
    // pooled connection resolves the entities' unqualified SQL.
    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      entities,
      extra: {
        allowExitOnIdle: true,
        options: `-c search_path=${schema},public`,
      },
    });
    await dataSource.initialize();

    // Seed two tenants: tenant A owns readiness-relevant rows, tenant B owns
    // nothing (triangulates the not-ready snapshot).
    const tenantRepo = dataSource.getRepository(Tenant);
    await tenantRepo.save([
      tenantRepo.create({
        id: tenantAId,
        name: 'Café El Buen Sabor',
        ruc: 'J0310000001234',
        is_active: true,
      }),
      tenantRepo.create({
        id: tenantBId,
        name: 'Pupusería Vacía',
        ruc: 'J0310000009999',
        is_active: true,
      }),
    ]);

    await dataSource.getRepository(Warehouse).save(
      dataSource.getRepository(Warehouse).create({
        id: randomUUID(),
        tenant_id: tenantAId,
        name: 'Bodega Principal',
        is_active: true,
      }),
    );

    const productRepo = dataSource.getRepository(Product);
    await productRepo.save([
      productRepo.create({
        id: randomUUID(),
        tenant_id: tenantAId,
        name: 'Café Latte',
        uom: 'UN',
        stock: 5,
        averageCost: 20,
        sellPrice: 65,
        is_active: true,
        product_type: ProductType.SIMPLE,
      }),
      productRepo.create({
        id: randomUUID(),
        tenant_id: tenantAId,
        name: 'Té Chai',
        uom: 'UN',
        stock: 0,
        averageCost: 8,
        sellPrice: 25,
        is_active: true,
        product_type: ProductType.SIMPLE,
      }),
    ]);

    const insumoRepo = dataSource.getRepository(Insumo);
    await insumoRepo.save(
      insumoRepo.create({
        id: randomUUID(),
        tenant_id: tenantAId,
        name: 'Leche entera',
        purchaseUom: 'L',
        consumptionUom: 'ml',
        stock: 3,
      }),
    );

    // One pending-enrichment invoice for tenant A: under a correctly bound
    // tenant context this row is visible to the RLS policy; under the
    // poisoned empty-string setting the read throws instead.
    await dataSource.getRepository(Invoice).save(
      dataSource.getRepository(Invoice).create({
        id: randomUUID(),
        tenant_id: tenantAId,
        number: 'FAC-0001',
        created_at: new Date('2026-01-15T10:00:00.000Z'),
        userId: randomUUID(),
        subtotal: 65,
        totalTax: 0,
        total: 65,
        inventoryOutcome: 'APPLIED_INVENTORY_PENDING',
      }),
    );

    // The reader role provisioned by the helper: NOSUPERUSER NOBYPASSRLS
    // (so RLS policies apply to it) and SELECT-only (so it can never mutate
    // fixtures). Its role-level search_path is pinned to the scratch schema,
    // so unqualified queries resolve against it on every pooled connection.
    restricted = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.readerRoleName,
      password: fixture.readerRolePassword,
      entities,
      ...poolCleanupExtra,
    });
    await restricted.initialize();
  });

  afterAll(async () => {
    // The helper's close() drops the schema and roles; the spec's own
    // connections must be gone first, because sessions block DROP ROLE.
    if (restricted?.isInitialized) {
      await restricted.destroy();
    }
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    if (fixture) {
      await fixture.close();
    }
  });

  it('declares the same column types the migration-built schema has: entity metadata vs information_schema for every column this spec depends on (issue #418 drift assertion)', async () => {
    const mismatches: string[] = [];
    for (const { table, column } of DRIFT_SCOPE) {
      const metadata = dataSource.entityMetadatas.find(
        (m) => m.tableName === table,
      );
      if (!metadata) {
        mismatches.push(`entity metadata not loaded: ${table}`);
        continue;
      }
      const declared = declaredTypeOf(metadata, column);
      if (
        declared.startsWith('unknown-declared-type:') ||
        declared.startsWith('missing-from-entity:')
      ) {
        mismatches.push(declared);
        continue;
      }
      const actual = await actualTypeOf(dataSource, schema, table, column);
      if (actual.startsWith('missing-from-schema:')) {
        mismatches.push(actual);
        continue;
      }
      if (declared !== actual) {
        mismatches.push(
          `${table}.${column}: entity declares ${declared}, migrations built ${actual}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('exercises the real RLS policy set: pg_policies has rows in the migration-built schema and the invoices SELECT policy is the uuid-form predicate', async () => {
    // With synchronize:true this table was EMPTY unless the spec hand-wrote
    // policies — which is exactly how RLS behavior went untested in CI.
    // The migration set creates the real set; assert it exists and that the
    // policy this spec's failure mode depends on has the uuid-form predicate
    // (the empty-string setting explodes on `::uuid`, which is the point).
    const invoicePolicies = await dataSource.query<
      Array<{ policyname: string; qual: string }>
    >(
      `SELECT policyname, qual
         FROM pg_policies
        WHERE schemaname = $1 AND tablename = 'invoices'
        ORDER BY policyname`,
      [schema],
    );

    expect(invoicePolicies.map((p) => p.policyname)).toContain(
      'credit_note_invoices_tenant_select',
    );
    // pg_policies stores the deparsed expression, which spells the setting
    // argument as 'app.tenant_id'::text and parenthesizes the cast; assert on
    // the semantic content, not the original migration's spelling.
    const selectPolicy = invoicePolicies.find(
      (p) => p.policyname === 'credit_note_invoices_tenant_select',
    );
    expect(selectPolicy?.qual).toContain(
      "current_setting('app.tenant_id'::text, true))::uuid",
    );

    const totals = await dataSource.query<Array<{ count: number }>>(
      `SELECT count(*)::int AS count FROM pg_policies WHERE schemaname = $1`,
      [schema],
    );
    expect(totals[0].count).toBeGreaterThan(0);
  });

  it('reproduces the pool poisoning: after a transaction-local set_config commits, the pooled connection has app.tenant_id defined-and-empty and an unbound read of invoices throws on the uuid cast', async () => {
    // Warm-up (mandatory — without it the bug never reproduces on a fresh
    // connection): borrow ONE pooled connection, issue the exact
    // transaction-local bind used across the codebase, and commit. After
    // commit the GUC is left DEFINED AND EMPTY on that connection.
    const warmTenantId = randomUUID();
    const runner = restricted.createQueryRunner();
    await runner.connect();
    try {
      await runner.startTransaction();
      await runner.query(TENANT_CONTEXT_SET_CONFIG_SQL, [warmTenantId]);
      await runner.commitTransaction();

      // The runner still holds the same pooled connection after commit.
      const settingRows = (await runner.query(
        `SELECT current_setting('app.tenant_id', true) AS setting`,
      )) as Array<{ setting: string | null }>;
      expect(settingRows).toHaveLength(1);
      expect(settingRows[0].setting).toBe('');

      // The unbound read on the SAME executor now fails exactly as the
      // pre-fix readiness path did in production.
      await expect(
        runner.query(`SELECT count(*) FROM invoices`),
      ).rejects.toThrow(/invalid input syntax for type uuid: ""/);
    } finally {
      // Release returns the poisoned connection to the pool for the
      // fixed-path assertions below.
      await runner.release();
    }
  });

  it('evaluates inventory readiness successfully against the poisoned pool: every query runs inside a tenant-bound transaction (issue #358 fix)', async () => {
    // The pool now contains a connection poisoned by the previous test
    // (app.tenant_id defined-and-empty after a committed transaction-local
    // set_config). The adapter binds the tenant context at the start of its
    // transaction on the same executor, so the invoice count must succeed.
    const adapter = new InventoryReadinessAdapter(restricted);

    const result = await adapter.evaluateInventoryReadiness(tenantAId);

    expect(result).toEqual({
      inventoryReady: true,
      scope: 'ADVANCED',
      warehouseCount: 1,
      trackedProductCount: 2,
      trackedInsumoCount: 1,
      itemsWithStockCount: 2,
      hasDefaultWarehouse: true,
      notes: ['INVENTORY_ENRICHMENT_PENDING'],
      inventoryEnrichmentPendingCount: 1,
    });
  });

  it('returns the not-ready snapshot for an empty tenant and keeps the blank-tenant guard fail-closed without touching the database', async () => {
    const adapter = new InventoryReadinessAdapter(restricted);

    // Triangulation: a tenant with no rows yields the NONE snapshot through
    // the bound transaction.
    const emptyTenant = await adapter.evaluateInventoryReadiness(tenantBId);
    expect(emptyTenant.inventoryReady).toBe(false);
    expect(emptyTenant.scope).toBe('NONE');
    expect(emptyTenant.warehouseCount).toBe(0);
    expect(emptyTenant.hasDefaultWarehouse).toBe(false);
    expect(emptyTenant.inventoryEnrichmentPendingCount).toBe(0);

    // The blank-tenant guard stays exactly as it was: not-ready, no throw,
    // no SQL, no authorization.
    const blank = await adapter.evaluateInventoryReadiness('   ');
    expect(blank).toEqual({
      inventoryReady: false,
      scope: 'NONE',
      warehouseCount: 0,
      trackedProductCount: 0,
      trackedInsumoCount: 0,
      itemsWithStockCount: 0,
      hasDefaultWarehouse: false,
      notes: ['Tenant context is empty or invalid'],
      inventoryEnrichmentPendingCount: 0,
    });
  });
});
