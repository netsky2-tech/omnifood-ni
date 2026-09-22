import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import {
  LegacyTemplateRecipeScanService,
} from '../../src/modules/onboarding/services/legacy-template-recipe-scan.service';
import { IndustryTemplate } from '../../src/modules/onboarding/entities/industry-template.entity';
import { TemplateProduct } from '../../src/modules/onboarding/entities/template-product.entity';
import { TemplateRecipeItem } from '../../src/modules/onboarding/entities/template-recipe-item.entity';
import { TemplateInsumo } from '../../src/modules/onboarding/entities/template-insumo.entity';
import {
  LegacyOnboardingMigrationReceipt,
} from '../../src/modules/onboarding/entities/legacy-migration-receipt.entity';
import { OnboardingSession } from '../../src/modules/onboarding/entities/onboarding-session.entity';
import { RecipeVersion } from '../../src/modules/inventory/entities/recipe-version.entity';
import { Product } from '../../src/modules/inventory/entities/product.entity';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import { InvoiceItem } from '../../src/modules/sales/entities/invoice-item.entity';
import { Invoice } from '../../src/modules/sales/entities/invoice.entity';
import { Payment } from '../../src/modules/sales/entities/payment.entity';
import {
  InvoiceItemModifier,
} from '../../src/modules/sales/entities/invoice-item-modifier.entity';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';

/**
 * Issue #493 T2.S4b: the last template-path flow still using pooled,
 * tenant-unbound repositories against protected tables —
 * `LegacyTemplateRecipeScanService.scanAndRemediate` — must bind the tenant
 * context before its first protected access and run the whole scan inside
 * ONE tenant-bound transaction.
 *
 * The schema is built by RUNNING THE FULL MIGRATION SET (via
 * test/support/migration-built-schema.helper.ts), so what this spec observes
 * is the migrations' own RLS output — never a hand-written copy. The
 * production service (`LegacyTemplateRecipeScanService.scanAndRemediate`) is
 * constructed EXACTLY as Nest would build it, except every repository is
 * resolved from the fixture's runtime role (`NOSUPERUSER NOBYPASSRLS`, owner
 * of nothing, ordinary DML grants).
 *
 * Protected tables exercised here (per the committed policy migrations):
 * - `onboarding_sessions`        (1809220000000, ENABLE+FORCE, uuid predicate)
 * - `invoice_items`              (1782000000000, ENABLE+FORCE, text predicate)
 * - `legacy_onboarding_migration_receipts` (1809230000000, ENABLE+FORCE)
 * `recipe_versions` carries the tenant filter in the query itself, so the
 * binding proof for it is that the mutation must share the receipts'
 * transaction (atomicity proof below), not an RLS denial.
 *
 * Behavioral RED (pre-binding, on committed migrations): an unbound scan
 * cannot see the tenant's session or invoice items (usage/operational checks
 * silently degrade to false/0), cannot persist a single receipt (the INSERT
 * violates the FORCED policy), and — worst — mutates the recipe version
 * through a pooled autocommit write while the receipt write fails, losing
 * receipts and leaving non-atomic state behind.
 *
 * The superuser connection exists only to seed synthetic tenants' rows and to
 * read back cross-tenant facts after the service paths run. It never runs the
 * services. Synthetic UUIDs only; tenants/products/invoices rows are seeded
 * as admin because the tenant-bearing tables carry FKs to `tenants`.
 */

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

const poolCleanupExtra = { extra: { allowExitOnIdle: true } };

describe('legacy template recipe scan under migrated RLS (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(300000);

  let admin: DataSource;
  let runtime: DataSource;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;

  let scanService: LegacyTemplateRecipeScanService;

  // Synthetic tenants, each with a dedicated role in the proofs:
  // - tenantScan      : non-operational, one unused template recipe (auto
  //                     MOVE_TO_DRAFT) + one unknown-provenance recipe
  //                     (retained without mutation).
  // - tenantUsage     : NO session, but an invoice item referencing the
  //                     recipe (usage proof through bound invoice_items).
  // - tenantSession   : activated session, unused template recipe
  //                     (operational proof through bound onboarding_sessions).
  // - tenantForeign   : owns its own unused template recipe that must stay
  //                     invisible and unmutated.
  // - tenantAtomic    : exercises mutation+receipt atomicity (rollback proof).
  const tenantScanId = randomUUID();
  const tenantUsageId = randomUUID();
  const tenantSessionId = randomUUID();
  const tenantForeignId = randomUUID();
  const tenantAtomicId = randomUUID();

  const rvScanTemplateId = randomUUID();
  const rvScanCustomId = randomUUID();
  const rvUsageId = randomUUID();
  const rvSessionUsageId = randomUUID();
  const rvForeignId = randomUUID();
  const rvAtomicId = randomUUID();

  async function countAdmin(table: string, where: string, params: unknown[]) {
    const rows = (await admin.query(
      `SELECT count(*)::int AS count FROM ${table} WHERE ${where}`,
      params,
    )) as Array<{ count: number }>;
    return rows[0].count;
  }

  async function seedTenantWithProducts(tenantId: string, label: string) {
    await admin.query(
      `INSERT INTO tenants (id, name) VALUES ($1, $2)`,
      [tenantId, `${label} ${tenantId}`],
    );
    return admin.query(
      `INSERT INTO products (id, tenant_id, name, uom)
       VALUES ($1, $2, 'Capuchino Producto ' || $3, 'UN')`,
      [randomUUID(), tenantId, label],
    );
  }

  async function seedRecipeVersion(
    id: string,
    tenantId: string,
    productId: string,
    productName: string,
    origin: string,
  ) {
    await admin.query(
      `INSERT INTO recipe_versions
         (id, tenant_id, product_id, version_number, is_active, product_name,
          origin, publication_state, suggestion_state, yield_quantity)
       VALUES ($1, $2, $3, 1, true, $4, $5, 'PUBLISHED', 'CONFIRMED', 1)`,
      [id, tenantId, productId, productName, origin],
    );
  }

  async function seedInvoiceItemUsage(
    tenantId: string,
    productId: string,
    recipeVersionId: string,
  ) {
    const invoiceId = randomUUID();
    await admin.query(
      `INSERT INTO invoices (id, tenant_id, invoice_number, created_at, user_id,
         subtotal, total_tax, total)
       VALUES ($1, $2, $3, now(), gen_random_uuid(), 100, 0, 100)`,
      [invoiceId, tenantId, `INV-${recipeVersionId}`],
    );
    await admin.query(
      `INSERT INTO invoice_items (invoice_id, tenant_id, product_id, product_name,
         quantity, unit_price, original_tax_rate, applied_tax_rate, tax_amount,
         total, recipe_version_id)
       VALUES ($1, $2, $3, 'Capuchino 8oz', 1, 100, 0, 0, 0, 100, $4)`,
      [invoiceId, tenantId, productId, recipeVersionId],
    );
  }

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

    // tenantScan: non-operational session (no activation), unused template
    // recipe + unknown-provenance recipe.
    const scanProductId = randomUUID();
    const scanCustomProductId = randomUUID();
    await admin.query(`INSERT INTO tenants (id, name) VALUES ($1, $2)`, [
      tenantScanId,
      `Scan Tenant (S4b) ${tenantScanId}`,
    ]);
    await admin.query(
      `INSERT INTO products (id, tenant_id, name, uom) VALUES ($1, $2, 'Capuchino 8oz', 'UN'), ($3, $2, 'Plato Secreto', 'UN')`,
      [scanProductId, tenantScanId, scanCustomProductId],
    );
    await admin.query(
      `INSERT INTO onboarding_sessions (id, tenant_id) VALUES ($1, $2)`,
      [randomUUID(), tenantScanId],
    );
    await seedRecipeVersion(
      rvScanTemplateId,
      tenantScanId,
      scanProductId,
      'Capuchino 8oz',
      'INDUSTRY_TEMPLATE',
    );
    await seedRecipeVersion(
      rvScanCustomId,
      tenantScanId,
      scanCustomProductId,
      `Plato Personalizado Secreto ${tenantScanId}`,
      'MANUAL',
    );

    // tenantUsage: NO session; usage comes from an invoice item only.
    const usageProductId = randomUUID();
    await admin.query(`INSERT INTO tenants (id, name) VALUES ($1, $2)`, [
      tenantUsageId,
      `Usage Tenant (S4b) ${tenantUsageId}`,
    ]);
    await admin.query(
      `INSERT INTO products (id, tenant_id, name, uom) VALUES ($1, $2, 'Espresso Simple', 'UN')`,
      [usageProductId, tenantUsageId],
    );
    await seedRecipeVersion(
      rvUsageId,
      tenantUsageId,
      usageProductId,
      'Espresso Simple',
      'INDUSTRY_TEMPLATE',
    );
    await seedInvoiceItemUsage(tenantUsageId, usageProductId, rvUsageId);

    // tenantSession: activated session, unused template recipe, no usage.
    const sessionProductId = randomUUID();
    await admin.query(`INSERT INTO tenants (id, name) VALUES ($1, $2)`, [
      tenantSessionId,
      `Session Tenant (S4b) ${tenantSessionId}`,
    ]);
    await admin.query(
      `INSERT INTO products (id, tenant_id, name, uom) VALUES ($1, $2, 'Latte 12oz', 'UN')`,
      [sessionProductId, tenantSessionId],
    );
    await admin.query(
      `INSERT INTO onboarding_sessions (id, tenant_id, activated_at) VALUES ($1, $2, now())`,
      [randomUUID(), tenantSessionId],
    );
    await seedRecipeVersion(
      rvSessionUsageId,
      tenantSessionId,
      sessionProductId,
      'Latte 12oz',
      'INDUSTRY_TEMPLATE',
    );

    // tenantForeign: own unused template recipe that must stay untouched.
    const foreignProductId = randomUUID();
    await seedTenantWithProducts(tenantForeignId, 'Foreign Tenant (S4b)');
    await admin.query(
      `INSERT INTO products (id, tenant_id, name, uom) VALUES ($1, $2, 'Espresso Doble', 'UN')`,
      [foreignProductId, tenantForeignId],
    );
    await seedRecipeVersion(
      rvForeignId,
      tenantForeignId,
      foreignProductId,
      'Espresso Doble',
      'INDUSTRY_TEMPLATE',
    );

    // tenantAtomic: unused template recipe for the rollback proof.
    const atomicProductId = randomUUID();
    await admin.query(`INSERT INTO tenants (id, name) VALUES ($1, $2)`, [
      tenantAtomicId,
      `Atomic Tenant (S4b) ${tenantAtomicId}`,
    ]);
    await admin.query(
      `INSERT INTO products (id, tenant_id, name, uom) VALUES ($1, $2, 'Espresso Doble', 'UN')`,
      [atomicProductId, tenantAtomicId],
    );
    await seedRecipeVersion(
      rvAtomicId,
      tenantAtomicId,
      atomicProductId,
      'Espresso Doble',
      'INDUSTRY_TEMPLATE',
    );

    // The fixture's runtime role: NOSUPERUSER NOBYPASSRLS, non-owner, exact
    // ordinary DML grants. Entity classes are registered for TypeORM metadata
    // only — `synchronize` stays false, so the schema remains exactly what
    // the migrations built.
    runtime = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      synchronize: false,
      entities: [
        IndustryTemplate,
        TemplateProduct,
        TemplateRecipeItem,
        TemplateInsumo,
        LegacyOnboardingMigrationReceipt,
        OnboardingSession,
        RecipeVersion,
        Product,
        Tenant,
        InvoiceItem,
        Invoice,
        Payment,
        InvoiceItemModifier,
      ],
      ...poolCleanupExtra,
    });
    await runtime.initialize();

    // The production service built exactly as production builds it:
    // repositories resolved from the same pool that opens the tenant-bound
    // transaction, with the DataSource appended LAST (S4a precedent).
    scanService = new LegacyTemplateRecipeScanService(
      runtime.getRepository(RecipeVersion),
      runtime.getRepository(LegacyOnboardingMigrationReceipt),
      runtime.getRepository(OnboardingSession),
      runtime.getRepository(InvoiceItem),
      runtime.getRepository(IndustryTemplate),
      runtime,
    );
  });

  afterAll(async () => {
    if (runtime?.isInitialized) await runtime.destroy();
    if (admin?.isInitialized) await admin.destroy();
    if (fixture) await fixture.close();
  });

  it('proves the runtime role is table non-owner, non-bypassing (raw probe, no service)', async () => {
    const probe = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      extra: { max: 1, allowExitOnIdle: true },
    });
    await probe.initialize();
    try {
      // Unbound, the runtime role must see no protected rows.
      const unboundSessions = await probe.query(
        `SELECT count(*)::int AS count FROM onboarding_sessions`,
      );
      expect(unboundSessions[0].count).toBe(0);
      const unboundReceipts = await probe.query(
        `SELECT count(*)::int AS count FROM legacy_onboarding_migration_receipts`,
      );
      expect(unboundReceipts[0].count).toBe(0);

      // And be denied a foreign-tenant receipt insert by the FORCED policy.
      await expect(
        probe.transaction(async (manager) => {
          await manager.query(`SELECT set_config('app.tenant_id', $1, true)`, [
            tenantForeignId,
          ]);
          await manager.query(
            `INSERT INTO legacy_onboarding_migration_receipts
               (tenant_id, receipt_type, target_entity_type, target_entity_id, decision, reason)
             VALUES ($1, 'LEGACY_TEMPLATE_RECIPE_SCAN', 'RECIPE_VERSION', 'probe', 'KEEP_PUBLISHED', 'probe')`,
            [tenantScanId],
          );
        }),
      ).rejects.toThrow(/row-level security/i);
    } finally {
      await probe.destroy();
    }
  });

  it('fails closed on a blank tenant with TenantContextRequiredError before any SQL', async () => {
    await expect(scanService.scanAndRemediate('   ')).rejects.toThrow(
      'TENANT_CONTEXT_REQUIRED',
    );
    // No receipt anywhere for the synthetic tenants.
    expect(
      await countAdmin('legacy_onboarding_migration_receipts', 'tenant_id = ANY($1)', [
        [tenantScanId, tenantUsageId, tenantSessionId, tenantAtomicId],
      ]),
    ).toBe(0);
  });

  it('scans the bound tenant: migrates its unused template recipe, retains unknown provenance, persists both receipts', async () => {
    const report = await scanService.scanAndRemediate(tenantScanId);

    expect(report).toMatchObject({
      tenantId: tenantScanId,
      scannedCount: 2,
      migratedToDraftCount: 1,
      keptPublishedCount: 0,
      unknownProvenanceCount: 1,
    });
    expect(report.receipts).toHaveLength(2);

    const moved = report.receipts.find((r) => r.recipeVersionId === rvScanTemplateId);
    expect(moved?.decision).toBe('MOVE_TO_DRAFT');
    expect(moved?.receiptId).toBeDefined();

    const unknown = report.receipts.find((r) => r.recipeVersionId === rvScanCustomId);
    expect(unknown?.decision).toBe('UNKNOWN_PROVENANCE');
    expect(unknown?.receiptId).toBeDefined();

    // Recipe mutation persisted, tenant-local.
    const recipe = (await admin.query(
      `SELECT is_active, publication_state, suggestion_state FROM recipe_versions WHERE id = $1`,
      [rvScanTemplateId],
    )) as Array<{
      is_active: boolean;
      publication_state: string;
      suggestion_state: string;
    }>;
    expect(recipe[0]).toEqual({
      is_active: false,
      publication_state: 'DRAFT',
      suggestion_state: 'SUGGESTED',
    });

    // Unknown provenance never mutates.
    const customRecipe = (await admin.query(
      `SELECT is_active, publication_state FROM recipe_versions WHERE id = $1`,
      [rvScanCustomId],
    )) as Array<{ is_active: boolean; publication_state: string }>;
    expect(customRecipe[0]).toEqual({ is_active: true, publication_state: 'PUBLISHED' });

    // Both receipts persisted, tenant-local, scan type.
    expect(
      await countAdmin(
        'legacy_onboarding_migration_receipts',
        'tenant_id = $1 AND receipt_type = $2',
        [tenantScanId, 'LEGACY_TEMPLATE_RECIPE_SCAN'],
      ),
    ).toBe(2);
  });

  it('keeps a used template recipe PUBLISHED through the bound invoice_items read (no session)', async () => {
    const report = await scanService.scanAndRemediate(tenantUsageId);

    expect(report.scannedCount).toBe(1);
    expect(report.receipts[0].decision).toBe('KEEP_PUBLISHED');
    expect(report.migratedToDraftCount).toBe(0);

    const recipe = (await admin.query(
      `SELECT is_active, publication_state FROM recipe_versions WHERE id = $1`,
      [rvUsageId],
    )) as Array<{ is_active: boolean; publication_state: string }>;
    expect(recipe[0]).toEqual({ is_active: true, publication_state: 'PUBLISHED' });
    expect(
      await countAdmin('legacy_onboarding_migration_receipts', 'tenant_id = $1', [
        tenantUsageId,
      ]),
    ).toBe(1);
  });

  it('keeps the unused recipe of an activated tenant PUBLISHED through the bound session read', async () => {
    const report = await scanService.scanAndRemediate(tenantSessionId);

    expect(report.scannedCount).toBe(1);
    expect(report.receipts[0].decision).toBe('KEEP_PUBLISHED');
    expect(report.migratedToDraftCount).toBe(0);

    const recipe = (await admin.query(
      `SELECT is_active, publication_state FROM recipe_versions WHERE id = $1`,
      [rvSessionUsageId],
    )) as Array<{ is_active: boolean; publication_state: string }>;
    expect(recipe[0]).toEqual({ is_active: true, publication_state: 'PUBLISHED' });
  });

  it('never touches a foreign tenant recipe or writes foreign receipts', async () => {
    // After the bound tenants' scans above ran, the foreign tenant's own
    // unused template recipe must be untouched and carry no receipts: the
    // scan's tenant filter and the bound context never reached it.
    const foreignRecipe = (await admin.query(
      `SELECT is_active, publication_state FROM recipe_versions WHERE id = $1`,
      [rvForeignId],
    )) as Array<{ is_active: boolean; publication_state: string }>;
    expect(foreignRecipe[0]).toEqual({ is_active: true, publication_state: 'PUBLISHED' });

    // No receipts were ever attributed to the foreign tenant by other scans.
    expect(
      await countAdmin('legacy_onboarding_migration_receipts', 'tenant_id = $1', [
        tenantForeignId,
      ]),
    ).toBe(0);
  });

  it('rolls back the recipe mutation and receipt writes together when the receipt write fails', async () => {
    // Force the receipt INSERT to fail mid-scan by revoking the INSERT
    // privilege from the runtime role. The mutation that already happened in
    // the same transaction must roll back with it: recipes and receipts move
    // as ONE unit.
    await admin.query(
      `REVOKE INSERT ON TABLE legacy_onboarding_migration_receipts FROM "${fixture.runtimeRoleName}"`,
    );
    try {
      await expect(scanService.scanAndRemediate(tenantAtomicId)).rejects.toThrow();
    } finally {
      await admin.query(
        `GRANT INSERT ON TABLE legacy_onboarding_migration_receipts TO "${fixture.runtimeRoleName}"`,
      );
    }

    // The mutation did NOT survive the failed receipt write.
    const recipe = (await admin.query(
      `SELECT is_active, publication_state, suggestion_state FROM recipe_versions WHERE id = $1`,
      [rvAtomicId],
    )) as Array<{
      is_active: boolean;
      publication_state: string;
      suggestion_state: string;
    }>;
    expect(recipe[0]).toEqual({
      is_active: true,
      publication_state: 'PUBLISHED',
      suggestion_state: 'CONFIRMED',
    });
    expect(
      await countAdmin('legacy_onboarding_migration_receipts', 'tenant_id = $1', [
        tenantAtomicId,
      ]),
    ).toBe(0);

    // After re-granting, the same scan succeeds end to end.
    const report = await scanService.scanAndRemediate(tenantAtomicId);
    expect(report).toMatchObject({
      tenantId: tenantAtomicId,
      scannedCount: 1,
      migratedToDraftCount: 1,
    });
    const recipeAfter = (await admin.query(
      `SELECT is_active, publication_state FROM recipe_versions WHERE id = $1`,
      [rvAtomicId],
    )) as Array<{ is_active: boolean; publication_state: string }>;
    expect(recipeAfter[0]).toEqual({ is_active: false, publication_state: 'DRAFT' });
    expect(
      await countAdmin('legacy_onboarding_migration_receipts', 'tenant_id = $1', [
        tenantAtomicId,
      ]),
    ).toBe(1);
  });
});
