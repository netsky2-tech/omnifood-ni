import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { LegacyImportIntegrityReportService } from '../../src/modules/onboarding/services/legacy-import-integrity-report.service';
import { ImportStaging } from '../../src/modules/onboarding/entities/import-staging.entity';
import { Product } from '../../src/modules/inventory/entities/product.entity';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import {
  LegacyImportIntegrityReport,
  LegacyImportIntegrityStatus,
} from '../../src/modules/onboarding/entities/legacy-import-integrity-report.entity';
import { LegacyOnboardingMigrationReceipt } from '../../src/modules/onboarding/entities/legacy-migration-receipt.entity';
import { OnboardingSession } from '../../src/modules/onboarding/entities/onboarding-session.entity';
import { TenantContextRequiredError } from '../../src/core/database/tenant-transaction';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';
import { normalizeTenantSlug } from '../../src/modules/tenant/tenant-slug';

/**
 * Issue #493 T2.S4d: the PRODUCTION legacy-import integrity paths
 * (`LegacyImportIntegrityReportService.generateIntegrityReport`,
 * `expireIncompatibleLegacyStaging`, `remediateReportWithInventoryCommand`,
 * `acceptReportAsIs`, `reconcileLegacyBaselineSession`) touch the FORCE-RLS
 * tables `staging_importacion_productos`, `legacy_import_integrity_reports`,
 * `legacy_onboarding_migration_receipts` and `onboarding_sessions`, so every
 * protected access must run inside ONE transaction whose `app.tenant_id` is
 * bound before the first protected statement — and report+receipt writes must
 * commit or roll back atomically.
 *
 * The schema is built by RUNNING THE FULL MIGRATION SET (via
 * test/support/migration-built-schema.helper.ts), so what this spec observes
 * is the migrations' own RLS output — never a hand-written copy. The
 * production service is constructed EXACTLY as Nest would build it, except
 * every repository is resolved from the fixture's runtime role (`NOSUPERUSER
 * NOBYPASSRLS`, owner of nothing, ordinary DML grants). Under FORCED row-level
 * security, an unbound path cannot read or write a single protected row: that
 * is the behavioral RED this spec captures BEFORE the binding change, on the
 * committed policy migrations — report/receipt inserts are denied, staging
 * rows and onboarding sessions are invisible to reads, and the baseline
 * reconcile fails. `products` is still RLS debt until T3, but the flows read
 * it on the same bound manager for forward correctness; `inventory_kardex`
 * was already bound and is read through the caller's transaction manager.
 *
 * The superuser connection exists only to seed synthetic tenants' rows, to
 * install the rollback-poison trigger, and to read back cross-tenant facts
 * after the service paths run. It never runs the services.
 *
 * Synthetic UUIDs only: `tenants` rows are seeded because `products` carries a
 * foreign key to `tenants`; the other tables carry none.
 */

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

const poolCleanupExtra = { extra: { allowExitOnIdle: true } };

describe('legacy import integrity application paths under migrated RLS (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(300000);

  let admin: DataSource;
  let runtime: DataSource;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;

  let integrityService: LegacyImportIntegrityReportService;

  // Synthetic tenants, each with a dedicated role in the proofs:
  // - tenantScan      : committed legacy staging + product + kardex movements
  //                     → REVIEW_REQUIRED scan with observed writes.
  // - tenantClean     : no legacy rows → CLEAN scan.
  // - tenantExpire    : pending/valid legacy staging rows (plus one compatible
  //                     row that must NOT expire) → expiry flow.
  // - tenantRemediate : scan then remediate twice (idempotency proof).
  // - tenantAccept    : scan then accept-as-is.
  // - tenantReconcile : onboarding session with a REAL first_successful_sale_at
  //                     that must remain untouched.
  // - tenantRollback  : receipt insert is poisoned by a trigger, so the whole
  //                     report+receipt transaction must roll back to zero.
  // - tenantKardex    : committed legacy staging + matching product; used by
  //                     the revoked-SELECT probe that proves a hard kardex
  //                     failure inside the shared transaction fails closed.
  // - tenantForeign   : owns staging/session/product rows that must stay
  //                     invisible and unmutated to every other tenant's flows.
  const tenantScanId = randomUUID();
  const tenantCleanId = randomUUID();
  const tenantExpireId = randomUUID();
  const tenantRemediateId = randomUUID();
  const tenantAcceptId = randomUUID();
  const tenantReconcileId = randomUUID();
  const tenantRollbackId = randomUUID();
  const tenantKardexId = randomUUID();
  const tenantForeignId = randomUUID();

  const tokenScan = randomUUID();
  const tokenExpire = randomUUID();
  const tokenRemediate = randomUUID();
  const tokenAccept = randomUUID();
  const tokenRollback = randomUUID();
  const tokenKardex = randomUUID();
  const tokenForeign = randomUUID();

  const scanProductId = randomUUID();
  const remediateProductId = randomUUID();
  const acceptProductId = randomUUID();
  const rollbackProductId = randomUUID();
  const kardexPoisonProductId = randomUUID();
  const foreignProductId = randomUUID();

  async function countAdmin(
    table: string,
    where: string,
    params: unknown[],
  ): Promise<number> {
    const rows = await admin.query(
      `SELECT count(*)::int AS count FROM ${table} WHERE ${where}`,
      params,
    );
    return rows[0].count;
  }

  /** Committed legacy staging row with a direct stock/cost write, by name. */
  async function seedCommittedLegacyRow(
    tenantId: string,
    token: string,
    productName: string,
  ): Promise<void> {
    await admin.query(
      `INSERT INTO staging_importacion_productos (
        id, tenant_id, token_sesion_importacion, raw_nombre, raw_precio_venta, raw_stock_inicial, raw_costo_insumo,
        parsed_nombre, parsed_precio_venta, parsed_stock_inicial, parsed_costo_insumo, estado_fila, row_ordinal, created_at, updated_at
       ) VALUES (
        $1, $2, $3, $4, '250', '50', '60', $4, 250.0, 50.0, 60.0, 'COMMITTED', 1, now(), now()
       )`,
      [randomUUID(), tenantId, token, productName],
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

    // Tenants: products carries FK to tenants(id), so real (synthetic-UUID)
    // tenant rows are seeded as admin. Names are unique per run.
    await admin.query(
      `INSERT INTO tenants (id, name, slug) VALUES
         ($1,  $2,  $19),  ($3,  $4,  $20),  ($5,  $6,  $21),  ($7,  $8,  $22),
         ($9,  $10, $23), ($11, $12, $24), ($13, $14, $25), ($15, $16, $26), ($17, $18, $27)`,
      [
        tenantScanId,
        `Integrity Scan (S4d) ${tenantScanId}`,
        tenantCleanId,
        `Integrity Clean (S4d) ${tenantCleanId}`,
        tenantExpireId,
        `Integrity Expire (S4d) ${tenantExpireId}`,
        tenantRemediateId,
        `Integrity Remediate (S4d) ${tenantRemediateId}`,
        tenantAcceptId,
        `Integrity Accept (S4d) ${tenantAcceptId}`,
        tenantReconcileId,
        `Integrity Reconcile (S4d) ${tenantReconcileId}`,
        tenantRollbackId,
        `Integrity Rollback (S4d) ${tenantRollbackId}`,
        tenantKardexId,
        `Integrity Kardex Probe (S4d) ${tenantKardexId}`,
        tenantForeignId,
        `Integrity Foreign (S4d) ${tenantForeignId}`,
        normalizeTenantSlug(`Integrity Scan (S4d) ${tenantScanId}`),
        normalizeTenantSlug(`Integrity Clean (S4d) ${tenantCleanId}`),
        normalizeTenantSlug(`Integrity Expire (S4d) ${tenantExpireId}`),
        normalizeTenantSlug(`Integrity Remediate (S4d) ${tenantRemediateId}`),
        normalizeTenantSlug(`Integrity Accept (S4d) ${tenantAcceptId}`),
        normalizeTenantSlug(`Integrity Reconcile (S4d) ${tenantReconcileId}`),
        normalizeTenantSlug(`Integrity Rollback (S4d) ${tenantRollbackId}`),
        normalizeTenantSlug(`Integrity Kardex Probe (S4d) ${tenantKardexId}`),
        normalizeTenantSlug(`Integrity Foreign (S4d) ${tenantForeignId}`),
      ],
    );

    // tenantScan: product with direct stock (50) but kardex movements summing
    // to 30 → discrepancy 20 and kardex evidence present.
    await admin.query(
      `INSERT INTO products (id, tenant_id, name, uom, "sellPrice", "averageCost", stock, is_active, is_perishable, created_at, updated_at)
       VALUES ($1, $2, 'Ceviche Mixto Legacy', 'PLATO', 250.0, 60.0, 50.0, true, false, now(), now())`,
      [scanProductId, tenantScanId],
    );
    await admin.query(
      `INSERT INTO inventory_kardex
         (tenant_id, insumo_id, movement_type, quantity, stock_before, stock_after, unit_cost_nio, total_cost_nio, source_document_type, source_document_id)
       VALUES ($1, $2, 'INITIAL_STOCK', 30.0, 0.0, 30.0, 60.0, 1800.0, 'SYSTEM', 'seed')`,
      [tenantScanId, scanProductId],
    );
    await seedCommittedLegacyRow(
      tenantScanId,
      tokenScan,
      'Ceviche Mixto Legacy',
    );

    // tenantRemediate / tenantAccept: a discrepancy-producing legacy row each.
    await admin.query(
      `INSERT INTO products (id, tenant_id, name, uom, "sellPrice", "averageCost", stock, is_active, is_perishable, created_at, updated_at)
       VALUES ($1, $2, 'Vigorón Legacy', 'PLATO', 180.0, 90.0, 20.0, true, false, now(), now())`,
      [remediateProductId, tenantRemediateId],
    );
    await seedCommittedLegacyRow(
      tenantRemediateId,
      tokenRemediate,
      'Vigorón Legacy',
    );
    await admin.query(
      `INSERT INTO products (id, tenant_id, name, uom, "sellPrice", "averageCost", stock, is_active, is_perishable, created_at, updated_at)
       VALUES ($1, $2, 'Quesillo Legacy', 'PLATO', 120.0, 60.0, 15.0, true, false, now(), now())`,
      [acceptProductId, tenantAcceptId],
    );
    await seedCommittedLegacyRow(
      tenantAcceptId,
      tokenAccept,
      'Quesillo Legacy',
    );

    // tenantRollback: discrepancy-producing row + product; the receipt INSERT
    // will be poisoned, so the whole transaction must roll back to zero.
    await admin.query(
      `INSERT INTO products (id, tenant_id, name, uom, "sellPrice", "averageCost", stock, is_active, is_perishable, created_at, updated_at)
       VALUES ($1, $2, 'Nacatamal Legacy', 'PLATO', 200.0, 100.0, 40.0, true, false, now(), now())`,
      [rollbackProductId, tenantRollbackId],
    );
    await seedCommittedLegacyRow(
      tenantRollbackId,
      tokenRollback,
      'Nacatamal Legacy',
    );

    // tenantKardex: discrepancy-producing row + matching product so the scan
    // actually reaches the kardex aggregate; no kardex movements are seeded,
    // the probe revokes SELECT on inventory_kardex instead.
    await admin.query(
      `INSERT INTO products (id, tenant_id, name, uom, "sellPrice", "averageCost", stock, is_active, is_perishable, created_at, updated_at)
       VALUES ($1, $2, 'Vaho Legacy', 'PLATO', 150.0, 70.0, 10.0, true, false, now(), now())`,
      [kardexPoisonProductId, tenantKardexId],
    );
    await seedCommittedLegacyRow(tenantKardexId, tokenKardex, 'Vaho Legacy');

    // tenantExpire: two incompatible legacy rows (one PENDIENTE with raw
    // stock, one VALIDO with parsed cost) in ONE session, plus one compatible
    // row that must remain untouched.
    await admin.query(
      `INSERT INTO staging_importacion_productos (
        id, tenant_id, token_sesion_importacion, raw_nombre, raw_precio_venta, raw_stock_inicial,
        parsed_nombre, parsed_precio_venta, estado_fila, row_ordinal, created_at, updated_at
       ) VALUES ($1, $2, $3, 'Tostones Legacy', '80', '25', 'Tostones Legacy', 80.0, 'PENDIENTE', 1, now(), now())`,
      [randomUUID(), tenantExpireId, tokenExpire],
    );
    await admin.query(
      `INSERT INTO staging_importacion_productos (
        id, tenant_id, token_sesion_importacion, raw_nombre, raw_precio_venta, parsed_nombre, parsed_precio_venta,
        parsed_costo_insumo, estado_fila, row_ordinal, created_at, updated_at
       ) VALUES ($1, $2, $3, 'Pinol Legacy', '60', 'Pinol Legacy', 60.0, 30.0, 'VALIDO', 2, now(), now())`,
      [randomUUID(), tenantExpireId, tokenExpire],
    );
    await admin.query(
      `INSERT INTO staging_importacion_productos (
        id, tenant_id, token_sesion_importacion, raw_nombre, raw_precio_venta, parsed_nombre, parsed_precio_venta,
        estado_fila, row_ordinal, created_at, updated_at
       ) VALUES ($1, $2, $3, 'Café Compatible', '90', 'Café Compatible', 90.0, 'PENDIENTE', 3, now(), now())`,
      [randomUUID(), tenantExpireId, tokenExpire],
    );

    // tenantReconcile: an ACTIVATED session with a REAL (non-fabricated)
    // first_successful_sale_at that reconcile must never touch.
    const realSaleTimestamp = new Date('2026-02-14T15:30:00Z');
    await admin.query(
      `INSERT INTO onboarding_sessions (
        id, tenant_id, lifecycle_state, legacy_baseline, measurement_eligible,
        first_successful_sale_at, optimistic_version, created_at, updated_at
       ) VALUES ($1, $2, 'ACTIVATED', false, true, $3, 1, now(), now())`,
      [randomUUID(), tenantReconcileId, realSaleTimestamp],
    );

    // Foreign tenant provenance: one product, one staged row and one
    // onboarding session that must never leak into (or be mutated by) other
    // tenants' flows.
    await admin.query(
      `INSERT INTO products (id, tenant_id, name, uom, "sellPrice", "averageCost", stock, is_active, is_perishable, created_at, updated_at)
       VALUES ($1, $2, 'Producto Extranjero', 'UN', 90.0, 40.0, 5.0, true, false, now(), now())`,
      [foreignProductId, tenantForeignId],
    );
    await admin.query(
      `INSERT INTO staging_importacion_productos (
        id, tenant_id, token_sesion_importacion, raw_nombre, parsed_nombre, raw_precio_venta, row_ordinal, estado_fila
       ) VALUES ($1, $2, $3, 'Fila Extranjera', 'Fila Extranjera', '90', 1, 'VALIDO')`,
      [randomUUID(), tenantForeignId, tokenForeign],
    );
    await admin.query(
      `INSERT INTO onboarding_sessions (
        id, tenant_id, lifecycle_state, legacy_baseline, measurement_eligible, optimistic_version, created_at, updated_at
       ) VALUES ($1, $2, 'ACTIVATED', false, true, 1, now(), now())`,
      [randomUUID(), tenantForeignId],
    );

    // Rollback poison: any receipt INSERT for tenantRollbackId raises, so a
    // generateIntegrityReport for that tenant must fail mid-flow and roll the
    // whole transaction (report AND receipt) back to zero. Scoped to the
    // scratch schema; the fixture close drops it with the schema.
    await admin.query(
      `CREATE FUNCTION ${fixture.schema}.poison_receipt_guard() RETURNS trigger AS $fn$
       BEGIN
         IF NEW.tenant_id = $poison$${tenantRollbackId}$poison$::uuid THEN
           RAISE EXCEPTION 'POISON: receipt insert denied for rollback proof';
         END IF;
         RETURN NEW;
       END
       $fn$ LANGUAGE plpgsql`,
    );
    await admin.query(
      `CREATE TRIGGER poison_receipt_guard
         BEFORE INSERT ON ${fixture.schema}.legacy_onboarding_migration_receipts
         FOR EACH ROW EXECUTE FUNCTION ${fixture.schema}.poison_receipt_guard()`,
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
        Tenant,
        Product,
        ImportStaging,
        LegacyImportIntegrityReport,
        LegacyOnboardingMigrationReceipt,
        OnboardingSession,
      ],
      ...poolCleanupExtra,
    });
    await runtime.initialize();

    // The service built exactly as production builds it: repositories
    // resolved from the same pool that opens the transactions.
    integrityService = new LegacyImportIntegrityReportService(
      runtime.getRepository(ImportStaging),
      runtime.getRepository(Product),
      runtime.getRepository(LegacyImportIntegrityReport),
      runtime.getRepository(LegacyOnboardingMigrationReceipt),
      runtime,
      runtime.getRepository(OnboardingSession),
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
      const unboundStaging = await probe.query(
        `SELECT count(*)::int AS count FROM staging_importacion_productos`,
      );
      expect(unboundStaging[0].count).toBe(0);
      const unboundReports = await probe.query(
        `SELECT count(*)::int AS count FROM legacy_import_integrity_reports`,
      );
      expect(unboundReports[0].count).toBe(0);
      const unboundReceipts = await probe.query(
        `SELECT count(*)::int AS count FROM legacy_onboarding_migration_receipts`,
      );
      expect(unboundReceipts[0].count).toBe(0);
      const unboundSessions = await probe.query(
        `SELECT count(*)::int AS count FROM onboarding_sessions`,
      );
      expect(unboundSessions[0].count).toBe(0);

      await expect(
        probe.transaction(async (manager) => {
          await manager.query(`SELECT set_config('app.tenant_id', $1, true)`, [
            tenantForeignId,
          ]);
          await manager.query(
            `INSERT INTO legacy_import_integrity_reports
               (id, tenant_id, legacy_import_refs, affected_product_refs,
                observed_direct_stock_or_cost_writes, kardex_evidence_present,
                status, remediation_refs)
             VALUES ($1, $2, '[]', '[]', '[]', false, 'CLEAN', '[]')`,
            [randomUUID(), tenantScanId],
          );
        }),
      ).rejects.toThrow(/row-level security/i);
    } finally {
      await probe.destroy();
    }
  });

  it('fails closed on a blank tenant before any SQL in every public method', async () => {
    await expect(
      integrityService.generateIntegrityReport('   '),
    ).rejects.toThrow(TenantContextRequiredError);
    await expect(
      integrityService.expireIncompatibleLegacyStaging('   '),
    ).rejects.toThrow(TenantContextRequiredError);
    await expect(
      integrityService.remediateReportWithInventoryCommand(
        '   ',
        randomUUID(),
        'ref',
      ),
    ).rejects.toThrow(TenantContextRequiredError);
    await expect(
      integrityService.acceptReportAsIs(
        '   ',
        randomUUID(),
        'a substantive rationale',
      ),
    ).rejects.toThrow(TenantContextRequiredError);
    await expect(
      integrityService.reconcileLegacyBaselineSession('   '),
    ).rejects.toThrow(TenantContextRequiredError);

    // Fail-fast happened before any protected access: the poison guard never
    // fired and no report exists anywhere for the probe tenants.
    expect(await countAdmin('legacy_import_integrity_reports', '1=1', [])).toBe(
      0,
    );
  });

  it('generates a REVIEW_REQUIRED report with observed writes and persists report+receipt atomically', async () => {
    const report = await integrityService.generateIntegrityReport(
      tenantScanId,
      'auditor-scan-1',
    );

    expect(report.status).toBe(LegacyImportIntegrityStatus.REVIEW_REQUIRED);
    expect(report.legacy_import_refs).toEqual([tokenScan]);
    expect(report.affected_product_refs).toEqual([scanProductId]);
    expect(report.observed_direct_stock_or_cost_writes).toHaveLength(1);
    expect(report.observed_direct_stock_or_cost_writes[0]).toMatchObject({
      productId: scanProductId,
      productName: 'Ceviche Mixto Legacy',
      productStock: 50,
      kardexStock: 30,
      discrepancy: 20,
      directCostObserved: 60,
      sourceImportSession: tokenScan,
    });
    expect(report.kardex_evidence_present).toBe(true);

    // Atomic persist: exactly ONE report and ONE receipt, the receipt
    // pointing at the report.
    expect(
      await countAdmin('legacy_import_integrity_reports', 'tenant_id = $1', [
        tenantScanId,
      ]),
    ).toBe(1);
    const receipts = await admin.query(
      `SELECT receipt_type, decision, target_entity_id, executed_by
         FROM legacy_onboarding_migration_receipts WHERE tenant_id = $1`,
      [tenantScanId],
    );
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      receipt_type: 'LEGACY_IMPORT_INTEGRITY_SCAN',
      decision: 'REVIEW_REQUIRED',
      target_entity_id: report.id,
      executed_by: 'auditor-scan-1',
    });
  });

  it('generates a CLEAN report when no legacy direct writes exist, with its CLEAN receipt', async () => {
    const report =
      await integrityService.generateIntegrityReport(tenantCleanId);

    expect(report.status).toBe(LegacyImportIntegrityStatus.CLEAN);
    expect(report.observed_direct_stock_or_cost_writes).toHaveLength(0);
    expect(report.kardex_evidence_present).toBe(false);

    expect(
      await countAdmin('legacy_import_integrity_reports', 'tenant_id = $1', [
        tenantCleanId,
      ]),
    ).toBe(1);
    const receipts = await admin.query(
      `SELECT decision FROM legacy_onboarding_migration_receipts WHERE tenant_id = $1 AND receipt_type = 'LEGACY_IMPORT_INTEGRITY_SCAN'`,
      [tenantCleanId],
    );
    expect(receipts).toHaveLength(1);
    expect(receipts[0].decision).toBe('CLEAN');
  });

  it('expires incompatible legacy staging rows and writes the expiry receipt atomically, sparing compatible rows', async () => {
    const result =
      await integrityService.expireIncompatibleLegacyStaging(tenantExpireId);

    expect(result.expiredSessions).toEqual([tokenExpire]);
    expect(result.expiredRowsCount).toBe(2);

    const rows = await admin.query(
      `SELECT row_ordinal, estado_fila, mensaje_error_detalle
         FROM staging_importacion_productos WHERE tenant_id = $1 ORDER BY row_ordinal`,
      [tenantExpireId],
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      row_ordinal: 1,
      estado_fila: 'ERROR',
    });
    expect(rows[0].mensaje_error_detalle).toContain(
      'Legacy staging incompatible',
    );
    expect(rows[1]).toMatchObject({ row_ordinal: 2, estado_fila: 'ERROR' });
    // The compatible row is untouched.
    expect(rows[2]).toMatchObject({ row_ordinal: 3, estado_fila: 'PENDIENTE' });

    const receipts = await admin.query(
      `SELECT receipt_type, decision, target_entity_id, evidence_json
         FROM legacy_onboarding_migration_receipts WHERE tenant_id = $1`,
      [tenantExpireId],
    );
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      receipt_type: 'LEGACY_STAGING_EXPIRY',
      decision: 'EXPIRED_REJECTED',
      target_entity_id: tokenExpire,
    });
    expect(receipts[0].evidence_json).toMatchObject({
      sessionToken: tokenExpire,
      incompatibleRowsCount: 2,
    });
  });

  it('remediates a report via inventory command idempotently and atomically', async () => {
    const scanned =
      await integrityService.generateIntegrityReport(tenantRemediateId);
    expect(scanned.status).toBe(LegacyImportIntegrityStatus.REVIEW_REQUIRED);

    const remediated =
      await integrityService.remediateReportWithInventoryCommand(
        tenantRemediateId,
        scanned.id,
        'INV_ADJUSTMENT:cmd-kardex-adj-777',
        'auditor-remediation-1',
      );
    expect(remediated.status).toBe(LegacyImportIntegrityStatus.REMEDIATED);
    expect(remediated.remediation_refs).toEqual([
      'INV_ADJUSTMENT:cmd-kardex-adj-777',
    ]);

    // Idempotent short-circuit: a second remediation returns the report
    // without appending the ref again or writing another receipt.
    const second = await integrityService.remediateReportWithInventoryCommand(
      tenantRemediateId,
      scanned.id,
      'INV_ADJUSTMENT:cmd-kardex-adj-999',
      'auditor-remediation-2',
    );
    expect(second.status).toBe(LegacyImportIntegrityStatus.REMEDIATED);
    expect(second.remediation_refs).toEqual([
      'INV_ADJUSTMENT:cmd-kardex-adj-777',
    ]);

    const reports = await admin.query(
      `SELECT status, remediation_refs, reviewed_by FROM legacy_import_integrity_reports WHERE tenant_id = $1`,
      [tenantRemediateId],
    );
    expect(reports).toHaveLength(1);
    expect(reports[0].status).toBe('REMEDIATED');
    expect(reports[0].remediation_refs).toEqual([
      'INV_ADJUSTMENT:cmd-kardex-adj-777',
    ]);
    // The short-circuit returns the in-memory report before save; the first
    // remediation's reviewer is what persists.
    expect(reports[0].reviewed_by).toBe('auditor-remediation-1');

    const receipts = await admin.query(
      `SELECT receipt_type, decision, evidence_json FROM legacy_onboarding_migration_receipts WHERE tenant_id = $1`,
      [tenantRemediateId],
    );
    expect(receipts).toHaveLength(2); // scan receipt + ONE remediation receipt
    expect(
      receipts.filter((r) => r.receipt_type === 'LEGACY_IMPORT_REMEDIATION'),
    ).toHaveLength(1);
    expect(
      receipts.find((r) => r.receipt_type === 'LEGACY_IMPORT_REMEDIATION'),
    ).toMatchObject({ decision: 'REMEDIATED' });
  });

  it('accepts a report as-is with an audited rationale and persists report+receipt atomically', async () => {
    const scanned =
      await integrityService.generateIntegrityReport(tenantAcceptId);
    expect(scanned.status).toBe(LegacyImportIntegrityStatus.REVIEW_REQUIRED);

    const accepted = await integrityService.acceptReportAsIs(
      tenantAcceptId,
      scanned.id,
      'Variance reconciled against manual audit sheets; approved by leadership',
      'auditor-finance-1',
    );
    expect(accepted.status).toBe(LegacyImportIntegrityStatus.ACCEPTED_AS_IS);

    const reports = await admin.query(
      `SELECT status, reviewed_by FROM legacy_import_integrity_reports WHERE tenant_id = $1`,
      [tenantAcceptId],
    );
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      status: 'ACCEPTED_AS_IS',
      reviewed_by: 'auditor-finance-1',
    });

    const receipts = await admin.query(
      `SELECT receipt_type, decision, reason FROM legacy_onboarding_migration_receipts WHERE tenant_id = $1`,
      [tenantAcceptId],
    );
    expect(receipts).toHaveLength(2); // scan receipt + accept receipt
    expect(
      receipts.find((r) => r.receipt_type === 'LEGACY_IMPORT_ACCEPT_AS_IS'),
    ).toMatchObject({
      decision: 'ACCEPTED_AS_IS',
      reason:
        'Variance reconciled against manual audit sheets; approved by leadership',
    });
  });

  it('reconciles the legacy baseline session without ever touching firstSuccessfulSaleAt, writing its receipt atomically', async () => {
    const receipt = await integrityService.reconcileLegacyBaselineSession(
      tenantReconcileId,
      'auditor-compliance-1',
    );

    expect(receipt.receipt_type).toBe('LEGACY_BASELINE_RECONCILIATION');
    expect(receipt.decision).toBe('LEGACY_BASELINE_CLOSED');
    expect(receipt.evidence_json).toMatchObject({
      legacyBaseline: true,
      measurementEligible: false,
    });

    const sessions = await admin.query(
      `SELECT legacy_baseline, measurement_eligible, first_successful_sale_at
         FROM onboarding_sessions WHERE tenant_id = $1`,
      [tenantReconcileId],
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0].legacy_baseline).toBe(true);
    expect(sessions[0].measurement_eligible).toBe(false);
    // INVARIANT: the real timestamp seeded by the tenant is preserved
    // verbatim; reconcile NEVER fabricates or rewrites a TTFSS.
    expect(sessions[0].first_successful_sale_at).not.toBeNull();
    expect(sessions[0].first_successful_sale_at.toISOString()).toBe(
      '2026-02-14T15:30:00.000Z',
    );

    const receipts = await admin.query(
      `SELECT receipt_type, decision FROM legacy_onboarding_migration_receipts WHERE tenant_id = $1`,
      [tenantReconcileId],
    );
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      receipt_type: 'LEGACY_BASELINE_RECONCILIATION',
      decision: 'LEGACY_BASELINE_CLOSED',
    });
  });

  it('rolls back the whole report+receipt transaction when the receipt write fails mid-flow (positive zero-count proof)', async () => {
    // The poison trigger denies the receipt INSERT for tenantRollbackId, so
    // generateIntegrityReport must fail mid-flow...
    await expect(
      integrityService.generateIntegrityReport(tenantRollbackId),
    ).rejects.toThrow(/POISON: receipt insert denied/);

    // ...and the transaction must roll back to ZERO: no report, no receipt,
    // and the legacy staging row still COMMITTED and untouched.
    expect(
      await countAdmin('legacy_import_integrity_reports', 'tenant_id = $1', [
        tenantRollbackId,
      ]),
    ).toBe(0);
    expect(
      await countAdmin(
        'legacy_onboarding_migration_receipts',
        'tenant_id = $1',
        [tenantRollbackId],
      ),
    ).toBe(0);
    const staging = await admin.query(
      `SELECT estado_fila FROM staging_importacion_productos WHERE tenant_id = $1`,
      [tenantRollbackId],
    );
    expect(staging).toHaveLength(1);
    expect(staging[0].estado_fila).toBe('COMMITTED');
  });

  it('fails closed on real PostgreSQL when the kardex read fails hard inside the shared transaction (revoked-SELECT probe)', async () => {
    // Since S4d the kardex aggregate shares the caller's transaction: a hard
    // SQL failure there aborts the whole scan instead of degrading to a
    // silently wrong kardexStock-0 report (issue #358). Revoking SELECT on
    // inventory_kardex from the runtime role provokes exactly that failure
    // on real PostgreSQL, under the migration-built policies.
    await admin.query(
      `REVOKE SELECT ON "${fixture.schema}".inventory_kardex FROM "${fixture.runtimeRoleName}"`,
    );
    try {
      await expect(
        integrityService.generateIntegrityReport(
          tenantKardexId,
          'auditor-kardex-probe',
        ),
      ).rejects.toThrow(/current transaction is aborted|permission denied/i);

      // Fail-closed: zero orphaned reports and zero receipts for this
      // attempt, and staging/session state unchanged.
      expect(
        await countAdmin('legacy_import_integrity_reports', 'tenant_id = $1', [
          tenantKardexId,
        ]),
      ).toBe(0);
      expect(
        await countAdmin(
          'legacy_onboarding_migration_receipts',
          'tenant_id = $1',
          [tenantKardexId],
        ),
      ).toBe(0);
      const staging = await admin.query(
        `SELECT estado_fila FROM staging_importacion_productos WHERE tenant_id = $1`,
        [tenantKardexId],
      );
      expect(staging).toHaveLength(1);
      expect(staging[0].estado_fila).toBe('COMMITTED');
      expect(
        await countAdmin('onboarding_sessions', 'tenant_id = $1', [
          tenantKardexId,
        ]),
      ).toBe(0);
    } finally {
      await admin.query(
        `GRANT SELECT ON "${fixture.schema}".inventory_kardex TO "${fixture.runtimeRoleName}"`,
      );
    }

    // Control: with privileges restored, the same scan succeeds — proving
    // the failure was the revoked privilege and the role is fully functional
    // again for the remaining proofs.
    const report =
      await integrityService.generateIntegrityReport(tenantKardexId);
    expect(report.status).toBe(LegacyImportIntegrityStatus.REVIEW_REQUIRED);
    expect(report.observed_direct_stock_or_cost_writes[0]).toMatchObject({
      productId: kardexPoisonProductId,
      productStock: 10,
      kardexStock: 0,
    });
  });

  it('keeps foreign-tenant rows invisible and unmutated across every flow', async () => {
    // Nothing was ever written for the foreign tenant.
    expect(
      await countAdmin('legacy_import_integrity_reports', 'tenant_id = $1', [
        tenantForeignId,
      ]),
    ).toBe(0);
    expect(
      await countAdmin(
        'legacy_onboarding_migration_receipts',
        'tenant_id = $1',
        [tenantForeignId],
      ),
    ).toBe(0);

    // Its staging row and onboarding session are exactly as seeded.
    const staging = await admin.query(
      `SELECT estado_fila, raw_nombre FROM staging_importacion_productos WHERE tenant_id = $1`,
      [tenantForeignId],
    );
    expect(staging).toHaveLength(1);
    expect(staging[0]).toMatchObject({
      estado_fila: 'VALIDO',
      raw_nombre: 'Fila Extranjera',
    });

    const sessions = await admin.query(
      `SELECT legacy_baseline, measurement_eligible FROM onboarding_sessions WHERE tenant_id = $1`,
      [tenantForeignId],
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      legacy_baseline: false,
      measurement_eligible: true,
    });

    // A bound read through the service vocabulary still cannot see them.
    const foreignView = await runtime.transaction(async (manager) => {
      await manager.query(`SELECT set_config('app.tenant_id', $1, true)`, [
        tenantScanId,
      ]);
      return manager.query(
        `SELECT count(*)::int AS count FROM staging_importacion_productos WHERE tenant_id = $1`,
        [tenantForeignId],
      );
    });
    expect((foreignView as Array<{ count: number }>)[0].count).toBe(0);
  });
});
