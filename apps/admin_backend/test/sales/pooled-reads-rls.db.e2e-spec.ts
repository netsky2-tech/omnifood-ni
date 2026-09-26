import { DataSource, Repository } from 'typeorm';
import { InternalServerErrorException } from '@nestjs/common';
import {
  runInTenantTransaction,
  TENANT_CONTEXT_SET_CONFIG_SQL,
} from '../../src/core/database/tenant-transaction';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';
import {
  poolCleanupExtra,
  pooledReadsGateEntities,
  pooledReadsPostgresConnection,
  seedPooledReadsFixtures,
} from '../support/pooled-reads-rls.helper';
import { SalesReportsService } from '../../src/modules/sales/services/sales-reports.service';
import { FiscalReportsService } from '../../src/modules/sales/services/fiscal-reports.service';
import { SalesExportService } from '../../src/modules/sales/services/sales-export.service';
import { InboundSyncService } from '../../src/modules/sales/services/inbound-sync.service';
import { Invoice } from '../../src/modules/sales/entities/invoice.entity';
import { InvoiceItem } from '../../src/modules/sales/entities/invoice-item.entity';
import { Payment } from '../../src/modules/sales/entities/payment.entity';
import { User } from '../../src/modules/identity/entities/user.entity';

/**
 * Issue #581 WU4 gate (decision D3, Option A): every endpoint fixed in WU1
 * (bound reads in SalesReportsService, FiscalReportsService and
 * SalesExportService) and WU2 (the required manager in
 * InboundSyncService.fetchUserDeltas) must return ROWS — never silent zeros
 * — when executed as a `NOSUPERUSER NOBYPASSRLS` role against a
 * migration-built schema with seeded tenant data.
 *
 * Why this gate exists: in production the application role cannot bypass
 * row-level security, while local dev roles are superusers that silently
 * bypass it. That asymmetry masked the root cause for months: a POOLED,
 * unbound repository read of a direct:SIUD RLS-forced table (invoices,
 * users) applied the tenant policy with no `app.tenant_id` GUC and returned
 * ZERO rows — eight reporting/export endpoints shipped returning empty
 * payloads. Dev superusers saw full reports; production saw empty ones.
 *
 * The schema is built by RUNNING THE FULL MIGRATION SET (via
 * test/support/migration-built-schema.helper.ts) — the same RLS shape
 * production migrates into existence, never a hand-written copy. The
 * service methods run on the fixture's runtime role (NOSUPERUSER
 * NOBYPASSRLS, owner of nothing, ordinary DML grants, role-level
 * search_path pinned to the scratch schema), so every query they make is
 * subject to the migrated FORCEd policies exactly as production is.
 *
 * The services are instantiated directly against the runtime-role
 * DataSource (the lightest workable assembly): the pooled repository
 * injections whose tables are actually read (invoices, users) are wired to
 * that same DataSource, while injections the gated paths never touch
 * (cash shifts, inbound product/catalog/insumo/recipe repositories) are
 * typed stubs — the fixed paths resolve their reads through
 * `runInTenantTransaction(this.dataSource, ...)`, which is precisely the
 * production behavior under test. The anti-mask test at the bottom uses
 * the wired pooled repositories to document the root cause in executable
 * form: the SAME query through the POOLED repo returns zero rows under
 * this role, while the bound service call returns the seeded rows.
 */

describe('pooled reads vs tenant-bound RLS gate (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;
  let ids: Awaited<ReturnType<typeof seedPooledReadsFixtures>>;

  let salesReports: SalesReportsService;
  let fiscalReports: FiscalReportsService;
  let salesExport: SalesExportService;
  let inboundSync: InboundSyncService;

  const stubPooledRepo = <T>(): Repository<T> =>
    ({}) as unknown as Repository<T>;

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();

    // Superuser connection: seeding and catalog facts only. It bypasses the
    // FORCED row-level security, which is what makes cross-tenant seeding
    // possible.
    admin = new DataSource({
      type: 'postgres',
      ...pooledReadsPostgresConnection,
      schema: fixture.schema,
      entities: pooledReadsGateEntities,
      ...poolCleanupExtra,
      extra: {
        ...poolCleanupExtra.extra,
        options: `-c search_path=${fixture.schema},public`,
      },
    });
    await admin.initialize();

    ids = await seedPooledReadsFixtures(admin);

    // The production-shaped connection: NOSUPERUSER NOBYPASSRLS, non-owner,
    // ordinary DML grants. Every service read below runs as THIS role.
    runtime = new DataSource({
      type: 'postgres',
      ...pooledReadsPostgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      entities: pooledReadsGateEntities,
      ...poolCleanupExtra,
    });
    await runtime.initialize();

    // Lightest workable assembly: direct instantiation with the real
    // runtime-role DataSource. The pooled repository injections point at
    // the same DataSource (module-shape fidelity); the fixed code paths
    // ignore them in favor of runInTenantTransaction managers. InboundSync
    // receives only its seven required repositories — its optional
    // collaborators (fiscal config, OHAC negotiation) stay undefined and
    // are not touched when `types` is narrowed to users.
    salesReports = new SalesReportsService(
      runtime.getRepository(Invoice),
      runtime.getRepository(InvoiceItem),
      runtime.getRepository(Payment),
      runtime.getRepository(User),
      runtime,
    );
    fiscalReports = new FiscalReportsService(
      runtime.getRepository(Invoice),
      runtime.getRepository(User),
      runtime,
    );
    salesExport = new SalesExportService(
      runtime.getRepository(Invoice),
      stubPooledRepo(),
      runtime,
      // FiscalSetupService backs exportSalesBook's fiscal config resolution;
      // the gate paths under test never reach it (typed stub, no DI needed).
      {
        getFiscalSetup: async () => {
          throw new Error('not exercised in the pooled-reads gate');
        },
      } as never,
    );
    // The InboundSync paths under test (types='users') never touch the
    // pooled product/catalog/insumo/recipe repositories, and WU2 made the
    // bound manager mandatory for the users read. Registering the whole
    // inventory entity closure just to hand the constructor repositories it
    // will not use would widen the gate for zero teeth; typed stubs keep
    // the assembly minimal while the real User repository (the one
    // parameter whose pooled shape is asserted in the anti-mask test) stays
    // wired to the runtime DataSource.
    inboundSync = new InboundSyncService(
      stubPooledRepo(),
      stubPooledRepo(),
      stubPooledRepo(),
      stubPooledRepo(),
      stubPooledRepo(),
      stubPooledRepo(),
      runtime.getRepository(User),
    );
  });

  afterAll(async () => {
    if (runtime?.isInitialized) await runtime.destroy();
    if (admin?.isInitialized) await admin.destroy();
    if (fixture) await fixture.close();
  });

  it('proves the runtime role is NOSUPERUSER NOBYPASSRLS and owns nothing (gate teeth)', async () => {
    const role = (
      await admin.query(
        `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`,
        [fixture.runtimeRoleName],
      )
    )[0];
    expect(role).toBeDefined();
    expect(role.rolsuper).toBe(false);
    expect(role.rolbypassrls).toBe(false);

    const ownership = await admin.query(
      `SELECT count(*)::int AS count FROM pg_tables
        WHERE schemaname = $1 AND tableowner = $2`,
      [fixture.schema, fixture.runtimeRoleName],
    );
    expect(ownership[0].count).toBe(0);
  });

  it('SalesReportsService.getDashboard returns the seeded sales, only tenant A rows, under the restricted role', async () => {
    const report = await salesReports.getDashboard(ids.tenantAId);

    // Tenant A holds two non-canceled invoices (1150 + 575); the canceled
    // one and ALL of tenant B are excluded by the same read.
    expect(report.invoiceCount).toBe(2);
    expect(report.grossSales).toBe(1725);
    expect(report.netTaxableSales).toBe(1500);
    expect(report.totalTax).toBe(225);
    expect(report.ticketAverage).toBe(862.5);
    // Only invoiceA1 carries a payment (CASH NIO 1150): the payments
    // relation loaded rows through the bound read.
    expect(report.paymentMethodsBreakdown.totalNio).toBe(1150);
    expect(report.paymentMethodsBreakdown.cashNio).toBe(1150);
  });

  it('SalesReportsService.getHourlySales buckets the seeded invoices under the restricted role', async () => {
    const report = await salesReports.getHourlySales(ids.tenantAId);

    expect(report.totalInvoices).toBe(2);
    expect(report.totalSales).toBe(1725);
    const bucket = report.hourly[ids.seededAt.getUTCHours()];
    expect(bucket.invoiceCount).toBe(2);
    expect(bucket.totalSales).toBe(1725);
  });

  it('SalesReportsService.getTopProducts aggregates the seeded invoice items under the restricted role', async () => {
    const report = await salesReports.getTopProducts(ids.tenantAId);

    // items relation loaded: one aggregate per seeded item, quantity-sorted.
    expect(report.products).toHaveLength(2);
    expect(report.products[0].productName).toBe('Cafe Latte Especial');
    expect(report.products[0].totalQuantity).toBe(2);
    expect(report.products[0].totalRevenue).toBe(1150);
    expect(report.products[1].productName).toBe('Espresso Doble');
    expect(report.products[1].totalQuantity).toBe(1);
  });

  it('SalesReportsService.getCashierPerformance resolves cashier names through the bound users read under the restricted role', async () => {
    const report = await salesReports.getCashierPerformance(ids.tenantAId);

    expect(report.cashiers).toHaveLength(1);
    const cashier = report.cashiers[0];
    expect(cashier.userId).toBe(ids.cashierAId);
    // The name comes from the users table: a pooled users read under this
    // role returns ZERO rows (pre-stage-12d bug shape) and the report would
    // degrade the name to the raw id. The bound read returns the row.
    expect(cashier.cashierName).toBe('Elena Perez');
    expect(cashier.invoiceCount).toBe(2);
    expect(cashier.totalSales).toBe(1725);
    expect(cashier.ticketAverage).toBe(862.5);
  });

  it('FiscalReportsService.getMonthlySummary totals the seeded invoices under the restricted role', async () => {
    const report = await fiscalReports.getMonthlySummary(ids.tenantAId);

    // The fixtures are stamped with "now", so they fall inside the current
    // Managua month the service resolves when no year/month is passed.
    expect(report.invoiceCount).toBe(2);
    expect(report.creditNoteCount).toBe(0);
    expect(report.totalGrossSales).toBe(1725);
    expect(report.totalTaxCollected).toBe(225);
  });

  it('FiscalReportsService.getVoidedInvoices surfaces the canceled invoice with its cashier name under the restricted role', async () => {
    const report = await fiscalReports.getVoidedInvoices(ids.tenantAId);

    expect(report.totalVoidedCount).toBe(1);
    expect(report.totalVoidedAmount).toBe(200);
    expect(report.invoices).toHaveLength(1);
    const voided = report.invoices[0];
    expect(voided.id).toBe(ids.invoiceAVoidedId);
    expect(voided.voidReason).toBe('GATE-TEST-VOID');
    expect(voided.cashierName).toBe('Elena Perez');
  });

  it('FiscalReportsService.getSequenceAudit rebuilds the contiguous 1..3 series under the restricted role', async () => {
    const report = await fiscalReports.getSequenceAudit(ids.tenantAId);

    // The canceled invoice stays in the audit (DT 09-2007: sequence
    // continuity includes voided documents).
    expect(report.actualCount).toBe(3);
    expect(report.expectedCount).toBe(3);
    expect(report.startSequence).toBe(1);
    expect(report.endSequence).toBe(3);
    expect(report.hasGaps).toBe(false);
    expect(report.missingSequences).toEqual([]);
    expect(report.series).toHaveLength(1);
    expect(report.series[0].seriesPrefix).toBe('001-001-01-');
  });

  it('SalesExportService.exportSalesBook returns every seeded invoice including the ANULADA row under the restricted role', async () => {
    const result = await salesExport.exportSalesBook(ids.tenantAId);

    expect(result.format).toBe('json');
    expect(result.data.totalRecords).toBe(3);
    // Canceled invoice is exported, marked ANULADA, and excluded from the
    // gross totals (DT 09-2007 book shape).
    expect(result.data.totalGrossNio).toBe(1725);
    expect(result.data.totalTaxNio).toBe(225);
    const canceled = result.data.records.find(
      (r) => r.invoiceNumber === '001-001-01-00000003',
    );
    expect(canceled).toBeDefined();
    expect(canceled?.status).toBe('ANULADA');
    expect(canceled?.isCanceled).toBe(true);
    // The items relation loaded: taxable subtotal derived from item bases.
    const invoiceA1 = result.data.records.find(
      (r) => r.invoiceNumber === '001-001-01-00000001',
    );
    expect(invoiceA1?.taxableSubtotalNio).toBe(1000);
  });

  it('InboundSyncService.getInboundDeltas returns user deltas through the required bound manager under the restricted role', async () => {
    // WU2 contract: the users delta read FAILS CLOSED without a
    // tenant-bound manager instead of silently reading a pooled, unbound
    // connection that returns zero rows under this role.
    await expect(
      inboundSync.getInboundDeltas(ids.tenantAId, { types: 'users' }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    // With the bound manager (the production caller shape), the seeded
    // users come back as deltas.
    const response = await runInTenantTransaction(
      runtime,
      ids.tenantAId,
      (manager) =>
        inboundSync.getInboundDeltas(
          ids.tenantAId,
          { types: 'users' },
          undefined,
          manager,
        ),
    );
    expect(response.status).toBe('success');
    expect(response.deltas.users).toHaveLength(2);
    const names = response.deltas.users.map((u) => u.name).sort();
    expect(names).toEqual(['Elena Perez', 'Mario Reyes']);
  });

  it('ANTI-MASK: an unbound pooled read returns ZERO rows on a never-bound connection while the bound path returns the seeded rows (root cause, executable)', async () => {
    // The OLD shape the audit found: a pooled repository read with no
    // app.tenant_id GUC. Under FORCEd RLS and a NOBYPASSRLS role the
    // policy's NULL tenant matches nothing — this is exactly what
    // production saw and dev superusers masked. The probe pool below never
    // runs a bound transaction, so its connections hold the pristine
    // (unset) GUC state the bug shipped in; the main runtime pool cannot
    // demonstrate this anymore because its committed bound transactions
    // have left the GUC defined-and-empty (see the corollary test).
    const probes = new DataSource({
      type: 'postgres',
      ...pooledReadsPostgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      entities: pooledReadsGateEntities,
      extra: { max: 1, allowExitOnIdle: true },
    });
    await probes.initialize();
    try {
      // Gate teeth for the probe itself: the GUC really is unset, so the
      // zero rows below come from RLS evaluation, never from missing data.
      const guc = await probes.query(
        `SELECT current_setting('app.tenant_id', true) AS v`,
      );
      expect(guc[0].v).toBeNull();

      const pooledInvoices = await probes
        .getRepository(Invoice)
        .find({ where: { tenant_id: ids.tenantAId } });
      expect(pooledInvoices).toEqual([]);

      const pooledUsers = await probes
        .getRepository(User)
        .find({ where: { tenant_id: ids.tenantAId } });
      expect(pooledUsers).toEqual([]);
    } finally {
      await probes.destroy();
    }

    // The FIXED shape (runInTenantTransaction-bound manager): the same
    // query, same role, same data — rows come back.
    const boundInvoices = await runInTenantTransaction(
      runtime,
      ids.tenantAId,
      (manager) =>
        manager
          .getRepository(Invoice)
          .find({ where: { tenant_id: ids.tenantAId } }),
    );
    expect(boundInvoices.map((i) => i.number).sort()).toEqual([
      '001-001-01-00000001',
      '001-001-01-00000002',
      '001-001-01-00000003',
    ]);

    const boundUsers = await runInTenantTransaction(
      runtime,
      ids.tenantAId,
      (manager) =>
        manager
          .getRepository(User)
          .find({ where: { tenant_id: ids.tenantAId } }),
    );
    expect(boundUsers.map((u) => u.name).sort()).toEqual([
      'Elena Perez',
      'Mario Reyes',
    ]);
  });

  it('ANTI-MASK corollary: after a committed bound transaction the session GUC is defined-and-empty, so an unbound read fails LOUDLY, not silently (issue #358 family, observed)', async () => {
    // Observed production-shaped behavior, pinned here because it is the
    // loud twin of the silent bug above: committing a transaction-local
    // set_config reverts the GUC to its defined-but-empty state, and the
    // migrated policy's current_setting(...)::uuid cast then HARD-FAILS
    // every later unbound query on that pooled connection. Dev superusers
    // never evaluate the policy, which is how this stayed invisible. If a
    // future fix resets the GUC on commit, this test is the tripwire that
    // says the runtime behavior changed — not a spec bug.
    const runner = runtime.createQueryRunner();
    await runner.connect();
    try {
      await runner.startTransaction();
      await runner.query(TENANT_CONTEXT_SET_CONFIG_SQL, [ids.tenantAId]);
      await runner.commitTransaction();

      const poisoned = (await runner.query(
        `SELECT current_setting('app.tenant_id', true) AS v`,
      )) as Array<{ v: string | null }>;
      expect(poisoned[0].v).toBe('');

      await expect(
        runner.query(`SELECT count(*)::int AS count FROM invoices`),
      ).rejects.toThrow(/invalid input syntax for type uuid/);
    } finally {
      await runner.release();
    }
  });
});
