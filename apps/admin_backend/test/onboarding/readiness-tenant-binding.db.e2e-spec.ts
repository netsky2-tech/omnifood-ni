import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
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
 * WHY THE RESTRICTED ROLE MATTERS: this spec builds the schema with
 * `synchronize: true`, so no RLS policies exist unless this file creates them,
 * and the CI role `postgres` is a SUPERUSER that BYPASSES row level security
 * entirely — a superuser never evaluates the policy, never hits the broken
 * `::uuid` cast, and the test would prove nothing. The connection used for the
 * poisoned-pool reads therefore runs as a dedicated LOGIN role provisioned
 * exactly like the one in scripts/verify-schema-build.sh:
 * NOSUPERUSER NOBYPASSRLS, so RLS policies apply to it.
 */

const RESTRICTED_ROLE = 'omnifood_readiness_rls_reader';
const RESTRICTED_PASSWORD = 'omnifood_readiness_rls_reader';

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

describe('InventoryReadiness tenant binding on poisoned pooled connections (Real PostgreSQL DB)', () => {
  jest.setTimeout(30000);

  let bootstrap: DataSource;
  let dataSource: DataSource;
  let restricted: DataSource;
  let schema: string;

  const tenantAId = randomUUID();
  const tenantBId = randomUUID();

  beforeAll(async () => {
    bootstrap = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      ...poolCleanupExtra,
    });
    await bootstrap.initialize();

    schema = `onb_readiness_binding_${randomUUID().replace(/-/g, '')}`;
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);

    // synchronize: true builds bare tables with NO policies; the invoices RLS
    // policy below is created manually to mirror the uuid-form SELECT policy
    // from migration 1809060000000-AlignInvoiceTenantPolicyPredicate.
    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      entities,
      synchronize: true,
      ...poolCleanupExtra,
    });
    await dataSource.initialize();
    await dataSource.query(`SET search_path TO "${schema}"`);

    // Parity with the readiness DB spec: the active-config view entity does
    // not get its DDL from synchronize, so create it explicitly.
    await dataSource.query(`
      CREATE OR REPLACE VIEW v_sys_parametros_config_active
      WITH (security_invoker = true)
      AS
      SELECT DISTINCT ON (tenant_id, param_key)
        id,
        tenant_id,
        param_key,
        param_value,
        version,
        effective_from,
        effective_to,
        is_active,
        created_by,
        created_at
      FROM sys_parametros_config
      WHERE is_active = true
        AND (effective_to IS NULL OR effective_to > now())
      ORDER BY tenant_id, param_key, version DESC, effective_from DESC;
    `);

    // Provision the non-bypassing reader role (same posture as
    // scripts/verify-schema-build.sh's omnifood_schema_build_migrator) and
    // pin its search_path to the isolated schema so unqualified queries in
    // the adapter resolve against it on every pooled connection.
    const database = postgresConnection.database;
    await bootstrap.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RESTRICTED_ROLE}') THEN
          CREATE ROLE "${RESTRICTED_ROLE}" LOGIN;
        END IF;
      END
      $$;
    `);
    await bootstrap.query(
      `ALTER ROLE "${RESTRICTED_ROLE}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${RESTRICTED_PASSWORD}'`,
    );
    await bootstrap.query(
      `GRANT CONNECT ON DATABASE "${database}" TO "${RESTRICTED_ROLE}"`,
    );
    await bootstrap.query(
      `GRANT USAGE ON SCHEMA "${schema}" TO "${RESTRICTED_ROLE}"`,
    );
    await bootstrap.query(
      `ALTER ROLE "${RESTRICTED_ROLE}" SET search_path TO "${schema}"`,
    );

    // RLS on invoices, exactly the predicate that makes the empty-string
    // setting explode on the uuid cast.
    await dataSource.query(`ALTER TABLE invoices ENABLE ROW LEVEL SECURITY`);
    await dataSource.query(`
      CREATE POLICY credit_note_invoices_tenant_select ON invoices
      FOR SELECT
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    `);

    // The reader only needs SELECT; it must never be able to mutate fixtures.
    await bootstrap.query(
      `GRANT SELECT ON ALL TABLES IN SCHEMA "${schema}" TO "${RESTRICTED_ROLE}"`,
    );

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

    restricted = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: RESTRICTED_ROLE,
      password: RESTRICTED_PASSWORD,
      entities,
      ...poolCleanupExtra,
    });
    await restricted.initialize();
  });

  afterAll(async () => {
    if (restricted?.isInitialized) {
      await restricted.destroy();
    }
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    if (bootstrap?.isInitialized) {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    }
    // Best-effort: a failed mid-test run may leave the role behind; that is
    // harmless (it owns no objects and has cluster-wide LOGIN only).
    try {
      const admin = new DataSource({
        type: 'postgres',
        ...postgresConnection,
        ...poolCleanupExtra,
      });
      await admin.initialize();
      await admin.query(`DROP ROLE IF EXISTS "${RESTRICTED_ROLE}"`);
      await admin.destroy();
    } catch {
      // ignore cleanup failures; the original test result takes precedence.
    }
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
