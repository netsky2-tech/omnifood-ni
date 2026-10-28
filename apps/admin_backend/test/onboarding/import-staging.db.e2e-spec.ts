import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { ImportStagingService } from '../../src/modules/onboarding/services/import-staging.service';
import { CanonicalCsvParserService } from '../../src/modules/onboarding/services/canonical-csv-parser.service';
import { ImportStaging } from '../../src/modules/onboarding/entities/import-staging.entity';
import { ProductImportSession } from '../../src/modules/onboarding/entities/product-import-session.entity';
import { LegacyOnboardingMigrationReceipt } from '../../src/modules/onboarding/entities/legacy-migration-receipt.entity';
import { Product } from '../../src/modules/inventory/entities/product.entity';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import {
  UploadBatchDto,
  UploadSummaryResponse,
  CommitSummaryResponse,
  ImportPreviewResponse,
  RowErrorDiagnostic,
} from '../../src/modules/onboarding/dto/import-staging.dto';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';
import { normalizeTenantSlug } from '../../src/modules/tenant/tenant-slug';

/**
 * Issue #493 T2.S4c: the PRODUCTION import application paths
 * (`ImportStagingService.uploadRawCsv`, `uploadBatch`, `commitImport`,
 * `getPreview`, `getFailedRows`) touch the FORCE-RLS tables
 * `staging_importacion_productos`, `product_import_sessions` and
 * `legacy_onboarding_migration_receipts`, so every protected access must run
 * inside ONE transaction whose `app.tenant_id` is bound before the first
 * protected statement.
 *
 * The schema is built by RUNNING THE FULL MIGRATION SET (via
 * test/support/migration-built-schema.helper.ts), so what this spec observes
 * is migration 1809240000000's own RLS output — never a hand-written copy.
 * The production service is constructed EXACTLY as Nest would build it,
 * except every repository is resolved from the fixture's runtime role
 * (`NOSUPERUSER NOBYPASSRLS`, owner of nothing, ordinary DML grants). Under
 * FORCED row-level security, an unbound path cannot read or write a single
 * protected row: that is the behavioral RED this spec captures BEFORE the
 * binding change, on the committed policy migrations — staging inserts are
 * denied, previews/commits find zero visible rows, and receipts are denied.
 * `products` is still RLS debt until T3, but the flows read and write it on
 * the same bound manager for forward correctness.
 *
 * The superuser connection exists only to seed synthetic tenants' rows and to
 * read back cross-tenant facts after the service paths run. It never runs the
 * services.
 *
 * Synthetic UUIDs only: `tenants` rows are seeded because `products` carries a
 * foreign key to `tenants`; the import tables carry none.
 */

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

const poolCleanupExtra = { extra: { allowExitOnIdle: true } };

describe('import staging application paths under migrated RLS (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(300000);

  let admin: DataSource;
  let runtime: DataSource;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;

  let importService: ImportStagingService;

  // Synthetic tenants, each with a dedicated role in the proofs:
  // - tenantMain    : full batch journey (upload → preview → commit → failed
  //                   rows) with duplicate REPLACE and AC-24 zero defaults.
  // - tenantCsv     : raw-CSV upload journey (upload → commit) proving the
  //                   parser path is equally bound.
  // - tenantRollback: ALL_OR_NOTHING abort with zero persisted writes.
  // - tenantForeign : owns seeded staging/session/product rows that must stay
  //                   invisible and unmutated to every other tenant's flows.
  const tenantMainId = randomUUID();
  const tenantCsvId = randomUUID();
  const tenantRollbackId = randomUUID();
  const tenantForeignId = randomUUID();

  // One synthetic session token per upload: the staging unique constraint is
  // scoped by (tenant_id, token_sesion_importacion, row_ordinal), so fresh
  // tokens keep every proof constraint-clean.
  const tokenMain = randomUUID();
  const tokenCsv = randomUUID();
  const tokenRollback = randomUUID();
  const tokenForeign = randomUUID();

  async function countAdmin(table: string, where: string, params: unknown[]) {
    const rows = await admin.query(
      `SELECT count(*)::int AS count FROM ${table} WHERE ${where}`,
      params,
    );
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

    // Tenants: products carries FK to tenants(id), so real (synthetic-UUID)
    // tenant rows are seeded as admin. Names are unique per run.
    await admin.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $9), ($3, $4, $10), ($5, $6, $11), ($7, $8, $12)`,
      [
        tenantMainId,
        `Import Main (S4c) ${tenantMainId}`,
        tenantCsvId,
        `Import Csv (S4c) ${tenantCsvId}`,
        tenantRollbackId,
        `Import Rollback (S4c) ${tenantRollbackId}`,
        tenantForeignId,
        `Import Foreign (S4c) ${tenantForeignId}`,
        normalizeTenantSlug(`Import Main (S4c) ${tenantMainId}`),
        normalizeTenantSlug(`Import Csv (S4c) ${tenantCsvId}`),
        normalizeTenantSlug(`Import Rollback (S4c) ${tenantRollbackId}`),
        normalizeTenantSlug(`Import Foreign (S4c) ${tenantForeignId}`),
      ],
    );

    // tenantMain's existing product: duplicate REPLACE proof target (AC-52:
    // REPLACE must not touch stock/averageCost).
    await admin.query(
      `INSERT INTO products (id, tenant_id, name, uom, "sellPrice", "averageCost", stock, is_active, is_perishable, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, false, now(), now())`,
      [
        randomUUID(),
        tenantMainId,
        'Tacos al Pastor',
        'ORDEN',
        120.0,
        60.0,
        25.0,
      ],
    );

    // Foreign tenant provenance: one product, one staged row and one import
    // session that must never leak into (or be mutated by) other tenants'
    // flows.
    await admin.query(
      `INSERT INTO products (id, tenant_id, name, uom, "sellPrice", "averageCost", stock, is_active, is_perishable, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, false, now(), now())`,
      [
        randomUUID(),
        tenantForeignId,
        'Producto Extranjero',
        'UN',
        90.0,
        40.0,
        5.0,
      ],
    );
    await admin.query(
      `INSERT INTO staging_importacion_productos
         (id, tenant_id, token_sesion_importacion, raw_nombre, parsed_nombre, raw_precio_venta, row_ordinal, estado_fila)
       VALUES ($1, $2, $3, 'Fila Extranjera', 'Fila Extranjera', '90', 1, 'VALIDO')`,
      [randomUUID(), tenantForeignId, tokenForeign],
    );
    await admin.query(
      `INSERT INTO product_import_sessions (id, tenant_id, source_hash, status, total_rows, valid_rows, error_rows)
       VALUES ($1, $2, 'foreign-proof-hash', 'READY', 1, 1, 0)`,
      [tokenForeign, tenantForeignId],
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
        ProductImportSession,
        LegacyOnboardingMigrationReceipt,
      ],
      ...poolCleanupExtra,
    });
    await runtime.initialize();

    // The service built exactly as production builds it: repositories
    // resolved from the same pool that opens the transactions. The optional
    // onboarding collaborators stay absent — the post-commit best-effort
    // calls are skipped, exactly as in a module wiring without them.
    importService = new ImportStagingService(
      runtime.getRepository(ImportStaging),
      runtime.getRepository(Product),
      runtime,
      runtime.getRepository(ProductImportSession),
      runtime.getRepository(LegacyOnboardingMigrationReceipt),
      new CanonicalCsvParserService(),
    );
  });

  afterAll(async () => {
    if (runtime?.isInitialized) await runtime.destroy();
    if (admin?.isInitialized) await admin.destroy();
    if (fixture) await fixture.close();
  });

  it('proves the runtime role is table non-owner, non-bypassing (raw probe, no service)', async () => {
    // Unbound, the runtime role must see no protected rows and be denied a
    // cross-tenant insert — the migrated policies are what make the UNBOUND
    // service paths fail closed (the observable RED mechanism pre-binding,
    // proven here directly).
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
      const unboundSessions = await probe.query(
        `SELECT count(*)::int AS count FROM product_import_sessions`,
      );
      expect(unboundSessions[0].count).toBe(0);

      await expect(
        probe.transaction(async (manager) => {
          await manager.query(`SELECT set_config('app.tenant_id', $1, true)`, [
            tenantForeignId,
          ]);
          await manager.query(
            `INSERT INTO staging_importacion_productos
               (id, tenant_id, token_sesion_importacion, raw_nombre, row_ordinal)
             VALUES ($1, $2, $3, 'cross-tenant-proof', 1)`,
            [randomUUID(), tenantMainId, randomUUID()],
          );
        }),
      ).rejects.toThrow(/row-level security/i);
    } finally {
      await probe.destroy();
    }
  });

  it('runs the full batch journey tenant-locally: upload → preview → commit → failed rows', async () => {
    // 1. Upload: two valid rows (one duplicate of the seeded product) and one
    //    error row.
    const dto: UploadBatchDto = {
      sessionToken: tokenMain,
      rows: [
        {
          nombre: 'Tacos al Pastor',
          sku: 'TAC-1',
          precioVenta: '150.00',
          uom: 'ORDEN',
        },
        { nombre: 'Refresco Natural', precioVenta: 45 },
        { nombre: '', precioVenta: 'Gratis' },
      ],
    };

    const upload: UploadSummaryResponse = await importService.uploadBatch(
      tenantMainId,
      dto,
    );
    expect(upload).toMatchObject({
      sessionToken: tokenMain,
      totalRows: 3,
      validRows: 2,
      errorRows: 1,
    });
    expect(upload.errors).toHaveLength(1);
    expect(upload.errors[0].rowNumber).toBe(3);

    // Staging rows and the READY session are persisted tenant-locally.
    expect(
      await countAdmin(
        'staging_importacion_productos',
        'tenant_id = $1 AND token_sesion_importacion = $2',
        [tenantMainId, tokenMain],
      ),
    ).toBe(3);
    const sessions = await admin.query(
      `SELECT status, total_rows, valid_rows, error_rows, parser_contract_version
         FROM product_import_sessions WHERE tenant_id = $1 AND id = $2`,
      [tenantMainId, tokenMain],
    );
    expect(sessions[0]).toMatchObject({
      status: 'READY',
      total_rows: 3,
      valid_rows: 2,
      error_rows: 1,
      parser_contract_version: 'v1.0',
    });

    // 2. Preview: duplicates resolved tenant-locally (currentPrice proves the
    //    product read shares the bound read path).
    const preview: ImportPreviewResponse = await importService.getPreview(
      tenantMainId,
      tokenMain,
    );
    expect(preview).toMatchObject({
      sessionToken: tokenMain,
      status: 'READY',
      parserContractVersion: 'v1.0',
      totalRows: 3,
      validRows: 2,
      errorRows: 1,
      duplicatesCount: 1,
      conflictsCount: 0,
    });
    expect(preview.duplicates[0]).toMatchObject({
      rowOrdinal: 1,
      productName: 'Tacos al Pastor',
      matchedBy: 'NORMALIZED_NAME',
      currentPrice: 120,
      newPrice: 150,
      currentUom: 'ORDEN',
      newUom: 'ORDEN',
      fieldsToChange: ['sellPrice'],
      isConflict: false,
    });

    // 3. Commit with REPLACE.
    const commit: CommitSummaryResponse = await importService.commitImport(
      tenantMainId,
      {
        sessionToken: tokenMain,
        mode: 'VALID_ONLY',
        duplicatePolicy: 'REPLACE',
      },
    );
    expect(commit).toMatchObject({
      sessionToken: tokenMain,
      mode: 'VALID_ONLY',
      productsCreated: 1,
      productsUpdated: 1,
      productsSkipped: 0,
      totalCommitted: 2,
    });
    expect(commit.committedAt).toBeInstanceOf(Date);

    // AC-24: the created product carries zero stock and zero averageCost.
    const created = await admin.query(
      `SELECT name, "sellPrice", "averageCost", stock, uom FROM products WHERE tenant_id = $1 AND name = 'Refresco Natural'`,
      [tenantMainId],
    );
    expect(created).toHaveLength(1);
    expect(Number(created[0].sellPrice)).toBe(45);
    expect(Number(created[0].averageCost)).toBe(0);
    expect(Number(created[0].stock)).toBe(0);

    // AC-52: REPLACE updates only the Product Master denylisted-free fields.
    const replaced = await admin.query(
      `SELECT name, "sellPrice", "averageCost", stock FROM products WHERE tenant_id = $1 AND name = 'Tacos al Pastor'`,
      [tenantMainId],
    );
    expect(Number(replaced[0].sellPrice)).toBe(150);
    expect(Number(replaced[0].averageCost)).toBe(60);
    expect(Number(replaced[0].stock)).toBe(25);

    // The IMPORT_COMMIT receipt is written with the commit, same transaction.
    const receipts = await admin.query(
      `SELECT receipt_type, decision, target_entity_id, evidence_json, reason
         FROM legacy_onboarding_migration_receipts WHERE tenant_id = $1`,
      [tenantMainId],
    );
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      receipt_type: 'IMPORT_COMMIT',
      decision: 'IMPORT_COMMITTED',
      target_entity_id: tokenMain,
    });
    expect(receipts[0].evidence_json).toMatchObject({
      sessionToken: tokenMain,
      mode: 'VALID_ONLY',
      duplicatePolicy: 'REPLACE',
      productsCreated: 1,
      productsUpdated: 1,
      productsSkipped: 0,
    });
    expect(receipts[0].reason).toContain(
      'Import committed with mode VALID_ONLY',
    );

    // Session lifecycle persisted with the commit. The batch carries one
    // ERROR row, so the preserved lifecycle semantic is PARTIALLY_COMMITTED
    // (the error-free COMMITTED proof lives in the raw-CSV journey below).
    const committedSession = await admin.query(
      `SELECT status, commit_mode, duplicate_policy, committed_rows, skipped_rows, committed_at
         FROM product_import_sessions WHERE tenant_id = $1 AND id = $2`,
      [tenantMainId, tokenMain],
    );
    expect(committedSession[0]).toMatchObject({
      status: 'PARTIALLY_COMMITTED',
      commit_mode: 'VALID_ONLY',
      duplicate_policy: 'REPLACE',
      committed_rows: 2,
      skipped_rows: 0,
    });
    expect(committedSession[0].committed_at).not.toBeNull();

    // Staging rows flipped to COMMITTED for the valid rows.
    const estados = await admin.query(
      `SELECT estado_fila, count(*)::int AS count
         FROM staging_importacion_productos
        WHERE tenant_id = $1 AND token_sesion_importacion = $2
        GROUP BY estado_fila ORDER BY estado_fila`,
      [tenantMainId, tokenMain],
    );
    expect(estados).toEqual([
      { estado_fila: 'COMMITTED', count: 2 },
      { estado_fila: 'ERROR', count: 1 },
    ]);

    // 4. Failed-rows diagnostics export.
    const failedRows: RowErrorDiagnostic[] = await importService.getFailedRows(
      tenantMainId,
      tokenMain,
    );
    expect(failedRows).toHaveLength(1);
    expect(failedRows[0]).toMatchObject({
      rowNumber: 3,
      reason: 'El nombre del producto es obligatorio',
    });
  });

  it('runs the raw CSV upload journey tenant-locally with AC-24 zero defaults (upload → commit)', async () => {
    const upload = await importService.uploadRawCsv(tenantCsvId, {
      sessionToken: tokenCsv,
      csvContent: [
        'nombre,precio_venta,uom',
        'Café Americano,60.00,UN',
        'Pan Simple,25.00,UN',
      ].join('\n'),
      fileName: 'catalogo.csv',
    });

    expect(upload).toMatchObject({
      sessionToken: tokenCsv,
      totalRows: 2,
      validRows: 2,
      errorRows: 0,
      errors: [],
    });

    const session = await admin.query(
      `SELECT status, file_name, total_rows, valid_rows FROM product_import_sessions WHERE tenant_id = $1 AND id = $2`,
      [tenantCsvId, tokenCsv],
    );
    expect(session[0]).toMatchObject({
      status: 'READY',
      file_name: 'catalogo.csv',
      total_rows: 2,
      valid_rows: 2,
    });

    const commit = await importService.commitImport(tenantCsvId, {
      sessionToken: tokenCsv,
      mode: 'VALID_ONLY',
      duplicatePolicy: 'REPLACE',
    });
    expect(commit).toMatchObject({
      sessionToken: tokenCsv,
      productsCreated: 2,
      productsUpdated: 0,
      totalCommitted: 2,
    });

    // AC-24: every created product carries zero stock/averageCost outside Kardex.
    const created = await admin.query(
      `SELECT name, "averageCost", stock FROM products WHERE tenant_id = $1 AND name IN ('Café Americano', 'Pan Simple') ORDER BY name`,
      [tenantCsvId],
    );
    expect(created).toHaveLength(2);
    for (const product of created) {
      expect(Number(product.averageCost)).toBe(0);
      expect(Number(product.stock)).toBe(0);
    }

    expect(
      await countAdmin(
        'legacy_onboarding_migration_receipts',
        'tenant_id = $1',
        [tenantCsvId],
      ),
    ).toBe(1);

    // Error-free commit reaches the full COMMITTED lifecycle state.
    const csvSession = await admin.query(
      `SELECT status, committed_rows FROM product_import_sessions WHERE tenant_id = $1 AND id = $2`,
      [tenantCsvId, tokenCsv],
    );
    expect(csvSession[0]).toMatchObject({
      status: 'COMMITTED',
      committed_rows: 2,
    });
  });

  it('rolls back the whole ALL_OR_NOTHING commit with zero persisted writes (AC-20)', async () => {
    const upload = await importService.uploadBatch(tenantRollbackId, {
      sessionToken: tokenRollback,
      rows: [
        { nombre: 'Válido Rollback', precioVenta: 100 },
        { nombre: '', precioVenta: 'Gratis' },
      ],
    });
    expect(upload.validRows).toBe(1);
    expect(upload.errorRows).toBe(1);

    await expect(
      importService.commitImport(tenantRollbackId, {
        sessionToken: tokenRollback,
        mode: 'ALL_OR_NOTHING',
      }),
    ).rejects.toThrow(/ALL_OR_NOTHING/);

    // Nothing persisted: no products, no receipt, session stays READY, and
    // the staged rows keep their upload-time estados.
    expect(
      await countAdmin('products', 'tenant_id = $1 AND name = $2', [
        tenantRollbackId,
        'Válido Rollback',
      ]),
    ).toBe(0);
    expect(
      await countAdmin(
        'legacy_onboarding_migration_receipts',
        'tenant_id = $1',
        [tenantRollbackId],
      ),
    ).toBe(0);
    const session = await admin.query(
      `SELECT status FROM product_import_sessions WHERE tenant_id = $1 AND id = $2`,
      [tenantRollbackId, tokenRollback],
    );
    expect(session[0].status).toBe('READY');
    const estados = await admin.query(
      `SELECT estado_fila, count(*)::int AS count
         FROM staging_importacion_productos
        WHERE tenant_id = $1 AND token_sesion_importacion = $2
        GROUP BY estado_fila ORDER BY estado_fila`,
      [tenantRollbackId, tokenRollback],
    );
    expect(estados).toEqual([
      { estado_fila: 'ERROR', count: 1 },
      { estado_fila: 'VALIDO', count: 1 },
    ]);
  });

  it('keeps foreign tenant rows non-disclosing and unmutated across every flow', async () => {
    // Foreign rows untouched by the other tenants' uploads, previews and
    // commits.
    expect(
      await countAdmin(
        'staging_importacion_productos',
        'tenant_id = $1 AND token_sesion_importacion = $2',
        [tenantForeignId, tokenForeign],
      ),
    ).toBe(1);
    expect(
      await countAdmin('product_import_sessions', 'tenant_id = $1', [
        tenantForeignId,
      ]),
    ).toBe(1);
    const foreignProduct = await admin.query(
      `SELECT "sellPrice", "averageCost", stock FROM products WHERE tenant_id = $1 AND name = 'Producto Extranjero'`,
      [tenantForeignId],
    );
    expect(Number(foreignProduct[0].sellPrice)).toBe(90);
    expect(Number(foreignProduct[0].averageCost)).toBe(40);
    expect(Number(foreignProduct[0].stock)).toBe(5);

    // Bound to the foreign tenant, the runtime role still sees exactly its
    // own seeded staging row and session — never the other tenants' rows.
    // The probe runs on a DISPOSABLE single-connection pool: set_config +
    // rollback leaves `app.tenant_id` defined-and-empty on a session (the
    // issue #358 poisoning), and the shared runtime pool must stay clean
    // because the production services bind per transaction but this raw
    // probe does not.
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
        const visibleStaging = await manager.query(
          `SELECT count(*)::int AS count FROM staging_importacion_productos`,
        );
        expect(visibleStaging[0].count).toBe(1);
        const visibleSessions = await manager.query(
          `SELECT count(*)::int AS count FROM product_import_sessions`,
        );
        expect(visibleSessions[0].count).toBe(1);
      });
    } finally {
      await probe.destroy();
    }

    // And the foreign tenant's own paths see its data tenant-locally.
    const foreignPreview = await importService.getPreview(
      tenantForeignId,
      tokenForeign,
    );
    expect(foreignPreview).toMatchObject({
      sessionToken: tokenForeign,
      totalRows: 1,
      validRows: 1,
      errorRows: 0,
      duplicatesCount: 0,
    });
  });

  it('fails closed on a blank tenant before any SQL', async () => {
    const stagingBefore = await countAdmin(
      'staging_importacion_productos',
      'TRUE',
      [],
    );
    const sessionsBefore = await countAdmin(
      'product_import_sessions',
      'TRUE',
      [],
    );

    await expect(
      importService.uploadRawCsv('   ', {
        csvContent: 'nombre,precio_venta\nX,10',
      }),
    ).rejects.toThrow(/tenant/i);
    await expect(
      importService.uploadBatch('   ', {
        rows: [{ nombre: 'X', precioVenta: 10 }],
      }),
    ).rejects.toThrow(/tenant/i);
    await expect(
      importService.commitImport('   ', { sessionToken: tokenMain }),
    ).rejects.toThrow(/tenant/i);
    await expect(importService.getPreview('   ', tokenMain)).rejects.toThrow(
      /tenant/i,
    );
    await expect(importService.getFailedRows('   ', tokenMain)).rejects.toThrow(
      /tenant/i,
    );

    // No tenant rows were created anywhere by the failed calls.
    expect(await countAdmin('staging_importacion_productos', 'TRUE', [])).toBe(
      stagingBefore,
    );
    expect(await countAdmin('product_import_sessions', 'TRUE', [])).toBe(
      sessionsBefore,
    );
  });
});
