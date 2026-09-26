import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import {
  IndustryTemplateService,
} from '../../src/modules/onboarding/services/industry-template.service';
import {
  TemplatePreviewService,
} from '../../src/modules/onboarding/services/template-preview.service';
import { IndustryTemplate } from '../../src/modules/onboarding/entities/industry-template.entity';
import { TemplateInsumo } from '../../src/modules/onboarding/entities/template-insumo.entity';
import { TemplateProduct } from '../../src/modules/onboarding/entities/template-product.entity';
import { TemplateRecipeItem } from '../../src/modules/onboarding/entities/template-recipe-item.entity';
import { TemplateApplication } from '../../src/modules/onboarding/entities/template-application.entity';
import { TemplateSeedLink } from '../../src/modules/onboarding/entities/template-seed-link.entity';
import { OnboardingSession } from '../../src/modules/onboarding/entities/onboarding-session.entity';
import { Insumo } from '../../src/modules/inventory/entities/insumo.entity';
import { Product } from '../../src/modules/inventory/entities/product.entity';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import { RecipeVersion } from '../../src/modules/inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../src/modules/inventory/entities/recipe-detail.entity';
import { Recipe } from '../../src/modules/inventory/entities/recipe.entity';
import { UomConversion } from '../../src/modules/inventory/entities/uom-conversion.entity';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';
import { normalizeTenantSlug } from '../../src/modules/tenant/tenant-slug';

/**
 * Issue #493 T2.S4a: the PRODUCTION application paths that touch the
 * FORCE-RLS tables `onboarding_template_applications`,
 * `onboarding_template_seed_links` and the already-protected
 * `onboarding_sessions` must bind the tenant context before their first
 * protected access.
 *
 * The schema is built by RUNNING THE FULL MIGRATION SET (via
 * test/support/migration-built-schema.helper.ts), so what this spec observes
 * is migration 1809230000000's own RLS output — never a hand-written copy.
 * The production services (`IndustryTemplateService.applyTemplate`,
 * `TemplatePreviewService.buildPreview`) are constructed EXACTLY as Nest
 * would build them, except every repository is resolved from the fixture's
 * runtime-role DataSource (`NOSUPERUSER NOBYPASSRLS`, owner of nothing,
 * ordinary DML grants). Under FORCED row-level security, an unbound path
 * cannot read or write a single protected row: that is the behavioral RED
 * this spec captures BEFORE the binding change, on the committed policy
 * migrations.
 *
 * The superuser connection exists only to seed synthetic tenants' rows
 * (tenants, sessions, one foreign application + seed links) and to read back
 * cross-tenant facts after the service paths run. It never runs the services.
 *
 * Synthetic UUIDs only: template tables are global (seeded by migration
 * 1787000000000), and `onboarding_template_applications`,
 * `onboarding_template_seed_links` carry no FK to `tenants`, while the
 * tenant-bearing inventory tables need real `tenants` rows, which are seeded
 * here as admin with generated UUIDs.
 */

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

const poolCleanupExtra = { extra: { allowExitOnIdle: true } };

describe('industry template application paths under migrated RLS (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(300000);

  let admin: DataSource;
  let runtime: DataSource;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;

  let applyService: IndustryTemplateService;
  let previewService: TemplatePreviewService;

  // Synthetic tenants, each with a dedicated role in the proofs:
  // - tenantApply    : exercises a full apply, replay idempotency and the
  //                    session-linked apply (its own and a foreign one).
  // - tenantForeign  : owns seeded application/seed-link/insumo rows that
  //                    must never leak into other tenants' reads.
  // - tenantPreview  : exercises buildPreview against seeded provenance.
  // - tenantRollback : exercises the mid-flow failure rollback proof.
  const tenantApplyId = randomUUID();
  const tenantForeignId = randomUUID();
  const tenantPreviewId = randomUUID();
  const tenantRollbackId = randomUUID();

  const sessionApplyId = randomUUID();
  const sessionForeignId = randomUUID();

  async function countAdmin(table: string, where: string, params: unknown[]) {
    const rows = (await admin.query(
      `SELECT count(*)::int AS count FROM ${table} WHERE ${where}`,
      params,
    )) as Array<{ count: number }>;
    return rows[0].count;
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

    // Tenants: the inventory/sales tables carry FKs to tenants(id), so real
    // (synthetic-UUID) tenant rows are seeded as admin.
    // Tenant names are unique; suffix with the run's tenant ids so a shared
    // provisioned database can never collide with a previous run.
    await admin.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $9), ($3, $4, $10), ($5, $6, $11), ($7, $8, $12)`,
      [
        tenantApplyId,
        `Apply Tenant (S4a) ${tenantApplyId}`,
        tenantForeignId,
        `Foreign Tenant (S4a) ${tenantForeignId}`,
        tenantPreviewId,
        `Preview Tenant (S4a) ${tenantPreviewId}`,
        tenantRollbackId,
        `Rollback Tenant (S4a) ${tenantRollbackId}`,
        normalizeTenantSlug(`Apply Tenant (S4a) ${tenantApplyId}`),
        normalizeTenantSlug(`Foreign Tenant (S4a) ${tenantForeignId}`),
        normalizeTenantSlug(`Preview Tenant (S4a) ${tenantPreviewId}`),
        normalizeTenantSlug(`Rollback Tenant (S4a) ${tenantRollbackId}`),
      ],
    );

    // Sessions for the session-linked apply proof (one own, one foreign).
    await admin.query(
      `INSERT INTO onboarding_sessions (id, tenant_id) VALUES ($1, $2), ($3, $4)`,
      [sessionApplyId, tenantApplyId, sessionForeignId, tenantForeignId],
    );

    // Foreign tenant provenance: one application and one seed link bound to
    // CAFETERIA, which must stay invisible to the other tenants' paths.
    const templateInsumos = (await admin.query(
      `SELECT id, name FROM template_insumos WHERE template_id = 'CAFETERIA'
        AND name IN ('Granos de Café Especial', 'Leche Entera', 'Leche de Almendras', 'Azúcar Blanca')`,
    )) as Array<{ id: string; name: string }>;
    const granosId = templateInsumos.find((t) => t.name === 'Granos de Café Especial')!.id;
    const lecheId = templateInsumos.find((t) => t.name === 'Leche Entera')!.id;

    await admin.query(
      `INSERT INTO onboarding_template_applications
         (id, tenant_id, template_code, selection_hash, idempotency_key, status, applied_at, summary_json)
       VALUES ($1, $2, 'CAFETERIA', 'hash-foreign', 'foreign-proof-key', 'APPLIED', now(), '{}'::jsonb)`,
      [randomUUID(), tenantForeignId],
    );
    await admin.query(
      `INSERT INTO onboarding_template_seed_links
         (tenant_id, template_code, source_item_id, source_item_type, target_entity_type, target_entity_id, last_source_fingerprint)
       VALUES ($1, 'CAFETERIA', $2, 'INGREDIENT', 'INSUMO', 'foreign-target-1', 'fp-foreign')`,
      [tenantForeignId, lecheId],
    );

    // Preview tenant provenance: one own seed link (must surface as
    // EXISTING_LINKED through the bound preview) and one own insumo whose
    // name matches a template insumo (must surface as EXISTING_UNLINKED).
    await admin.query(
      `INSERT INTO onboarding_template_seed_links
         (tenant_id, template_code, source_item_id, source_item_type, target_entity_type, target_entity_id, last_source_fingerprint)
       VALUES ($1, 'CAFETERIA', $2, 'INGREDIENT', 'INSUMO', 'own-target-1', 'fp-own')`,
      [tenantPreviewId, granosId],
    );
    await admin.query(
      `INSERT INTO insumos (tenant_id, name, "purchaseUom", "consumptionUom")
       VALUES ($1, 'Azúcar Blanca', 'KG', 'G')`,
      [tenantPreviewId],
    );
    // Foreign name-matching insumo: must NOT make tenantPreview's preview see
    // an EXISTING_UNLINKED row for 'Leche de Almendras'.
    await admin.query(
      `INSERT INTO insumos (tenant_id, name, "purchaseUom", "consumptionUom")
       VALUES ($1, 'Leche de Almendras', 'L', 'ML')`,
      [tenantForeignId],
    );

    // The fixture's runtime role: NOSUPERUSER NOBYPASSRLS, non-owner, exact
    // ordinary DML grants. Production-shaped for RLS evaluation. Entity
    // classes are registered for TypeORM metadata only — `synchronize` stays
    // false, so the schema remains exactly what the migrations built.
    runtime = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      synchronize: false,
      entities: [
        IndustryTemplate,
        TemplateInsumo,
        TemplateProduct,
        TemplateRecipeItem,
        TemplateApplication,
        TemplateSeedLink,
        OnboardingSession,
        Insumo,
        Product,
        RecipeVersion,
        RecipeDetail,
        Recipe,
        UomConversion,
        Tenant,
      ],
      ...poolCleanupExtra,
    });
    await runtime.initialize();

    // The services built exactly as production builds them: repositories
    // resolved from the same pool that opens the transactions.
    applyService = new IndustryTemplateService(
      runtime.getRepository(IndustryTemplate),
      runtime.getRepository(TemplateInsumo),
      runtime.getRepository(TemplateProduct),
      runtime.getRepository(TemplateRecipeItem),
      runtime.getRepository(Insumo),
      runtime.getRepository(Product),
      runtime.getRepository(RecipeVersion),
      runtime.getRepository(RecipeDetail),
      runtime.getRepository(Recipe),
      runtime.getRepository(UomConversion),
      runtime,
    );
    previewService = new TemplatePreviewService(
      runtime.getRepository(IndustryTemplate),
      runtime.getRepository(TemplateSeedLink),
      runtime.getRepository(Insumo),
      runtime.getRepository(Product),
      runtime,
    );
  });

  afterAll(async () => {
    if (runtime?.isInitialized) await runtime.destroy();
    if (admin?.isInitialized) await admin.destroy();
    if (fixture) await fixture.close();
  });

  it('proves the runtime role is table non-owner, non-bypassing (raw probe, no service)', async () => {
    // Unbound, the runtime role must see no protected rows and be denied a
    // foreign-tenant insert — the migrated policies are what make the
    // UNBOUND service paths fail closed (this is the observable RED
    // mechanism pre-binding, proven here directly).
    const probe = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      extra: { max: 1, allowExitOnIdle: true },
    });
    await probe.initialize();
    try {
      const unbound = await probe.query(
        `SELECT count(*)::int AS count FROM onboarding_template_applications`,
      );
      expect(unbound[0].count).toBe(0);

      await expect(
        probe.transaction(async (manager) => {
          await manager.query(`SELECT set_config('app.tenant_id', $1, true)`, [
            tenantForeignId,
          ]);
          await manager.query(
            `INSERT INTO onboarding_template_applications
               (tenant_id, template_code, selection_hash, idempotency_key)
             VALUES ($1, 'CAFETERIA', 'hash-x', 'foreign-insert-proof')`,
            [tenantApplyId],
          );
        }),
      ).rejects.toThrow(/row-level security/i);
    } finally {
      await probe.destroy();
    }
  });

  it('preview sees the tenant’s own seeded seed links as linked, and foreign links are invisible', async () => {
    const preview = await previewService.buildPreview(
      tenantPreviewId,
      'CAFETERIA',
    );

    const granos = preview.items.find(
      (i) => i.displayName === 'Granos de Café Especial',
    );
    // The seed link exists in the database (seeded as admin), so the only way
    // this item reads as NEW is that the unbound read was denied the row.
    expect(granos?.diffStatus).toBe('EXISTING_LINKED');
  });

  it('applies the template tenant-locally through the bound transaction', async () => {
    const result = await applyService.applyTemplate(tenantApplyId, 'CAFETERIA', {
      idempotencyKey: 'bound-apply-key',
    });

    expect(result).toMatchObject({
      tenantId: tenantApplyId,
      templateCode: 'CAFETERIA',
      templateVersion: 1,
      insumosCreated: 7,
      insumosSkipped: 0,
      productsCreated: 5,
      productsSkipped: 0,
      recipesCreated: 5,
    });

    // Application row: exactly one, tenant-local, APPLIED, with a summary.
    const applications = (await admin.query(
      `SELECT tenant_id, template_code, status, summary_json, applied_at
         FROM onboarding_template_applications WHERE tenant_id = $1`,
      [tenantApplyId],
    )) as Array<{
      tenant_id: string;
      template_code: string;
      status: string;
      summary_json: Record<string, unknown> | null;
      applied_at: Date | null;
    }>;
    expect(applications).toHaveLength(1);
    expect(applications[0]).toMatchObject({
      tenant_id: tenantApplyId,
      template_code: 'CAFETERIA',
      status: 'APPLIED',
    });
    expect(applications[0].summary_json).toMatchObject({
      insumosCreated: 7,
      productsCreated: 5,
      recipesCreated: 5,
    });
    expect(applications[0].applied_at).not.toBeNull();

    // Seed links: 7 INSUMO + 5 PRODUCT + 5 RECIPE_VERSION, all tenant-local.
    const links = (await admin.query(
      `SELECT target_entity_type, count(*)::int AS count
         FROM onboarding_template_seed_links WHERE tenant_id = $1
        GROUP BY target_entity_type ORDER BY target_entity_type`,
      [tenantApplyId],
    )) as Array<{ target_entity_type: string; count: number }>;
    expect(links).toEqual([
      { target_entity_type: 'INSUMO', count: 7 },
      { target_entity_type: 'PRODUCT', count: 5 },
      { target_entity_type: 'RECIPE_VERSION', count: 5 },
    ]);

    // Catalog writes are tenant-local too.
    expect(
      await countAdmin('insumos', 'tenant_id = $1', [tenantApplyId]),
    ).toBe(7);
    expect(
      await countAdmin('products', 'tenant_id = $1', [tenantApplyId]),
    ).toBe(5);
    expect(
      await countAdmin('recipe_versions', 'tenant_id = $1', [tenantApplyId]),
    ).toBe(5);
    expect(
      await countAdmin('uom_conversions', 'tenant_id = $1', [tenantApplyId]),
    ).toBe(4);
  });

  it('replays the same idempotency key idempotently with zero duplicate writes', async () => {
    const first = await applyService.applyTemplate(
      tenantApplyId,
      'CAFETERIA',
      { idempotencyKey: 'bound-apply-key' },
    );
    const replay = await applyService.applyTemplate(
      tenantApplyId,
      'CAFETERIA',
      { idempotencyKey: 'bound-apply-key' },
    );

    expect(replay).toEqual(first);

    expect(
      await countAdmin('onboarding_template_applications', 'tenant_id = $1', [
        tenantApplyId,
      ]),
    ).toBe(1);
    expect(
      await countAdmin('onboarding_template_seed_links', 'tenant_id = $1', [
        tenantApplyId,
      ]),
    ).toBe(17);
    expect(await countAdmin('insumos', 'tenant_id = $1', [tenantApplyId])).toBe(
      7,
    );
  });

  it('resolves a session-linked apply through the bound session read and rejects a foreign session', async () => {
    // A foreign tenant's session must not be resolvable for tenantApply.
    await expect(
      applyService.applyTemplate(tenantApplyId, 'CAFETERIA', {
        idempotencyKey: 'foreign-session-key',
        sessionId: sessionForeignId,
      }),
    ).rejects.toThrow(
      'Onboarding session does not exist for this tenant',
    );
    expect(
      await countAdmin('onboarding_template_applications', 'tenant_id = $1', [
        tenantApplyId,
      ]),
    ).toBe(1);

    // The tenant's OWN session resolves through the same bound read.
    const result = await applyService.applyTemplate(
      tenantApplyId,
      'CAFETERIA',
      { idempotencyKey: 'own-session-key', sessionId: sessionApplyId },
    );
    expect(result.tenantId).toBe(tenantApplyId);

    const linked = (await admin.query(
      `SELECT onboarding_session_id FROM onboarding_template_applications
        WHERE tenant_id = $1 AND idempotency_key = 'own-session-key'`,
      [tenantApplyId],
    )) as Array<{ onboarding_session_id: string }>;
    expect(linked).toHaveLength(1);
    expect(linked[0].onboarding_session_id).toBe(sessionApplyId);
  });

  it('keeps foreign tenant rows non-disclosing and unmutated across the applied tenant’s flows', async () => {
    // Foreign rows untouched by tenantApply's applies.
    expect(
      await countAdmin(
        'onboarding_template_applications',
        'tenant_id = $1 AND status = $2',
        [tenantForeignId, 'APPLIED'],
      ),
    ).toBe(1);
    expect(
      await countAdmin('onboarding_template_seed_links', 'tenant_id = $1', [
        tenantForeignId,
      ]),
    ).toBe(1);

    // Bound to the foreign tenant, the runtime role still sees exactly its
    // own single seeded application — never tenantApply's rows. The probe
    // runs on a DISPOSABLE single-connection pool: set_config + rollback
    // leaves `app.tenant_id` defined-and-empty on a session (the issue #358
    // poisoning), and the shared runtime pool must stay clean because the
    // production services bind per transaction but this raw probe does not.
    const probe = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      extra: { max: 1, allowExitOnIdle: true },
    });
    await probe.initialize();
    try {
      await probe.transaction(async (manager) => {
        await manager.query(`SELECT set_config('app.tenant_id', $1, true)`, [
          tenantForeignId,
        ]);
        const visible = (await manager.query(
          `SELECT count(*)::int AS count FROM onboarding_template_applications WHERE template_code = 'CAFETERIA'`,
        )) as Array<{ count: number }>;
        expect(visible[0].count).toBe(1);
      });
    } finally {
      await probe.destroy();
    }
  });

  it('rolls back application, seed-link and catalog writes when the flow fails mid-way', async () => {
    // Deterministic mid-flow failure: a CHECK constraint (added as admin on
    // the migration-built scratch schema) rejects exactly the capuchino
    // product's seed-link insert, after earlier insumo/product writes in the
    // same transaction. Retry-tolerant: a previous interrupted run may have
    // left the constraint behind.
    const capuchino = (await admin.query(
      `SELECT id FROM template_products WHERE template_id = 'CAFETERIA' AND name = 'Capuchino 8oz'`,
    )) as Array<{ id: string }>;
    expect(capuchino).toHaveLength(1);
    await admin.query(
      `ALTER TABLE onboarding_template_seed_links
         DROP CONSTRAINT IF EXISTS rollback_probe_check`,
    );
    await admin.query(
      `ALTER TABLE onboarding_template_seed_links
         ADD CONSTRAINT rollback_probe_check
         CHECK (tenant_id <> '${tenantRollbackId}' OR source_item_id <> '${capuchino[0].id}')`,
    );

    try {
      await expect(
        applyService.applyTemplate(tenantRollbackId, 'CAFETERIA', {
          idempotencyKey: 'rollback-proof-key',
        }),
      ).rejects.toThrow(/rollback_probe_check/);
    } finally {
      await admin.query(
        `ALTER TABLE onboarding_template_seed_links DROP CONSTRAINT IF EXISTS rollback_probe_check`,
      );
    }

    // The whole transaction rolled back: nothing persisted anywhere.
    expect(
      await countAdmin('onboarding_template_applications', 'tenant_id = $1', [
        tenantRollbackId,
      ]),
    ).toBe(0);
    expect(
      await countAdmin('onboarding_template_seed_links', 'tenant_id = $1', [
        tenantRollbackId,
      ]),
    ).toBe(0);
    expect(
      await countAdmin('insumos', 'tenant_id = $1', [tenantRollbackId]),
    ).toBe(0);
    expect(
      await countAdmin('products', 'tenant_id = $1', [tenantRollbackId]),
    ).toBe(0);
    expect(
      await countAdmin('recipe_versions', 'tenant_id = $1', [tenantRollbackId]),
    ).toBe(0);
  });

  it('previews the bound tenant’s provenance: own links linked, foreign rows invisible', async () => {
    const preview = await previewService.buildPreview(
      tenantPreviewId,
      'CAFETERIA',
    );

    expect(preview.templateCode).toBe('CAFETERIA');
    expect(preview.items.length).toBeGreaterThan(0);

    // Own seed link surfaces as EXISTING_LINKED.
    const granos = preview.items.find(
      (i) => i.displayName === 'Granos de Café Especial',
    );
    expect(granos?.diffStatus).toBe('EXISTING_LINKED');
    expect(granos?.existingEntityId).toBe('own-target-1');

    // Own name-matching insumo surfaces as EXISTING_UNLINKED.
    const azucar = preview.items.find((i) => i.displayName === 'Azúcar Blanca');
    expect(azucar?.diffStatus).toBe('EXISTING_UNLINKED');

    // The foreign tenant's seed link ('Leche Entera') and foreign insumo
    // ('Leche de Almendras') are invisible: both read as NEW.
    const leche = preview.items.find((i) => i.displayName === 'Leche Entera');
    expect(leche?.diffStatus).toBe('NEW');
    const almendras = preview.items.find(
      (i) => i.displayName === 'Leche de Almendras',
    );
    expect(almendras?.diffStatus).toBe('NEW');

    expect(preview.summary.existingLinkedCount).toBe(1);
    expect(preview.summary.existingUnlinkedCount).toBe(1);
  });

  it('fails closed on a blank tenant before any SQL', async () => {
    await expect(
      applyService.applyTemplate('   ', 'CAFETERIA'),
    ).rejects.toThrow(/tenant/i);
    await expect(
      previewService.buildPreview('   ', 'CAFETERIA'),
    ).rejects.toThrow(/tenant/i);
  });
});
