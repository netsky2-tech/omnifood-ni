import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { runInTenantTransaction } from '../../src/core/database/tenant-transaction';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';
import {
  poolCleanupExtra,
  pooledReadsPostgresConnection,
} from '../support/pooled-reads-rls.helper';
import { provisionDeviceSyncCredential } from '../support/device-sync-e2e.helper';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import {
  User,
  UserRole,
} from '../../src/modules/identity/entities/user.entity';
import { SecurityProfile } from '../../src/modules/identity/entities/security-profile.entity';
import { Invoice } from '../../src/modules/sales/entities/invoice.entity';
import { InvoiceItem } from '../../src/modules/sales/entities/invoice-item.entity';
import { InvoiceItemModifier } from '../../src/modules/sales/entities/invoice-item-modifier.entity';
import { Payment } from '../../src/modules/sales/entities/payment.entity';
import { ActivationAttempt } from '../../src/modules/onboarding/entities/activation-attempt.entity';
import { DeviceSyncCredential } from '../../src/modules/identity/entities/device-sync-credential.entity';
import { InventorySyncReceipt } from '../../src/modules/inventory/entities/inventory-sync-receipt.entity';
import { InventorySyncOutbox } from '../../src/modules/inventory/entities/inventory-sync-outbox.entity';
import { ChangeLog } from '../../src/modules/audit/entities/change-log.entity';
import { SalesReportsService } from '../../src/modules/sales/services/sales-reports.service';
import { SyncHealthService } from '../../src/modules/sales/sync-health/sync-health.service';
import { AuditSummaryService } from '../../src/modules/audit/audit-summary.service';
import { CardReconciliationSummaryService } from '../../src/modules/sales/sync-health/card-reconciliation-summary.service';

/**
 * Dashboard V2 Batch 8 — pilot acceptance & hardening, backend half
 * (PRD v1.0 §29–30, Gates A–F; execution roadmap Batch 8).
 *
 * Two-tenant isolation proof (Gate F) for every new dashboard endpoint:
 *
 * - GET /sales/reports/dashboard                     -> SalesReportsService.getDashboard
 * - GET /sales/reports/dashboard/daily-series        -> SalesReportsService.getDashboardDailySeries
 * - GET /operations/sync/freshness                   -> SyncHealthService.getFreshness
 * - GET /operations/audit/summary                    -> AuditSummaryService.getExecutiveSummary
 * - GET /sales/reports/card-reconciliation-summary   -> CardReconciliationSummaryService.getCardReconciliationSummary
 *
 * The schema is built by RUNNING THE FULL MIGRATION SET
 * (test/support/migration-built-schema.helper.ts) and every service read
 * runs as the NOSUPERUSER NOBYPASSRLS runtime role (issue #581/#592 gate
 * shape), so the migrated FORCED tenant RLS policies apply exactly as
 * production. Tenant A data must NEVER leak into Tenant B queries — each
 * endpoint asserts A's totals with B's conflicting rows in place.
 *
 * Acceptance scenarios proven here (the frontend half lives in
 * apps/owner_dashboard/src/__tests__/dashboard-v2-acceptance.spec.tsx):
 *
 * - AC-03 backend reconciliation: preDiscount = net + itemized discounts,
 *   over deterministic fixture totals.
 * - AC-08: a tenant whose streams completed 20 minutes ago is STALE, not
 *   COMPLETE.
 * - AC-09A: a quiet store (no business activity) with receipt checkpoints
 *   current within the threshold stays COMPLETE — freshness ages from the
 *   watermark, never from the last sale.
 */

const acceptedEntities = [
  Tenant,
  User,
  SecurityProfile,
  Invoice,
  InvoiceItem,
  InvoiceItemModifier,
  Payment,
  ActivationAttempt,
  DeviceSyncCredential,
  InventorySyncReceipt,
  InventorySyncOutbox,
  ChangeLog,
];

/** Managua local calendar-day key (YYYY-MM-DD) of an instant. */
const managuaDayKey = (instant: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Managua',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);

describe('Dashboard V2 acceptance — two-tenant isolation across the new dashboard endpoints (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(240000);

  let admin: DataSource;
  let runtime: DataSource;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;

  let salesReports: SalesReportsService;
  let syncHealth: SyncHealthService;
  let auditSummary: AuditSummaryService;
  let cardReconciliation: CardReconciliationSummaryService;

  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const cashierAId = randomUUID();
  const cashierBId = randomUUID();
  const invoiceA1Id = randomUUID();
  const invoiceA2Id = randomUUID();
  const invoiceB1Id = randomUUID();
  const auditCriticalAId = randomUUID();
  const auditCriticalBId = randomUUID();
  const deviceA = 'acceptance-dev-a';
  const deviceB = 'acceptance-dev-b';

  const auditHighRowIdsByTenant = new Map<string, string[]>();

  const now = new Date();
  const twentyMinutesAgo = new Date(now.getTime() - 20 * 60_000);
  const oneMinuteAgo = new Date(now.getTime() - 60_000);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60_000);

  const seedInvoice = async (
    manager: EntityManager,
    input: {
      id: string;
      tenantId: string;
      number: string;
      userId: string;
      createdAt: Date;
      subtotal: number;
      totalTax: number;
      total: number;
      itemDiscount: number;
      payments?: Array<{
        method: string;
        amount: number;
        amountNio: number;
        reconciliationStatus?: string;
      }>;
    },
  ): Promise<void> => {
    await manager.getRepository(Invoice).save({
      id: input.id,
      tenant_id: input.tenantId,
      number: input.number,
      created_at: input.createdAt,
      userId: input.userId,
      subtotal: input.subtotal,
      totalTax: input.totalTax,
      total: input.total,
      isCanceled: false,
      paymentStatus: input.payments?.length ? 'paid' : 'pending',
      customerId: 'J0310000123456',
      type: 'regular',
      items: [
        {
          tenant_id: input.tenantId,
          productId: randomUUID(),
          productName: 'Acceptance Fixture Product',
          quantity: 1,
          unitPrice: input.total,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: input.totalTax,
          total: input.total,
          discount: input.itemDiscount,
        },
      ],
      payments: (input.payments ?? []).map(
        (payment): Partial<Payment> => ({
          method: payment.method,
          amount: payment.amount,
          currency: 'NIO',
          exchangeRate: 1.0,
          amountNio: payment.amountNio,
          changeGiven: 0,
          changeCurrency: 'NIO',
          reconciliationStatus: payment.reconciliationStatus ?? 'PENDIENTE',
        }),
      ),
    });
  };

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();

    admin = new DataSource({
      type: 'postgres',
      ...pooledReadsPostgresConnection,
      schema: fixture.schema,
      entities: acceptedEntities,
      ...poolCleanupExtra,
      extra: {
        ...poolCleanupExtra.extra,
        options: `-c search_path=${fixture.schema},public`,
      },
    });
    await admin.initialize();

    // Production-shaped connection: NOSUPERUSER NOBYPASSRLS, non-owner.
    runtime = new DataSource({
      type: 'postgres',
      ...pooledReadsPostgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      entities: acceptedEntities,
      ...poolCleanupExtra,
    });
    await runtime.initialize();

    // ---------------- Tenant A: sales on two days, discounts, cash + one
    // pending card voucher, fresh sync checkpoints, one of each audit
    // severity (plus one historical NULL row).
    await runInTenantTransaction(admin, tenantAId, async (manager) => {
      await manager.getRepository(Tenant).save({
        id: tenantAId,
        name: 'acceptance-tenant-a',
        slug: 'acceptance-tenant-a',
      } as Partial<Tenant>);
      await manager.getRepository(User).save({
        id: cashierAId,
        tenant_id: tenantAId,
        name: 'Elena Perez',
        email: 'elena.perez@acceptance-a.test',
        role: UserRole.CASHIER,
        is_active: true,
      } as Partial<User>);

      await seedInvoice(manager, {
        id: invoiceA1Id,
        tenantId: tenantAId,
        number: '001-001-01-00000101',
        userId: cashierAId,
        createdAt: now,
        subtotal: 1000,
        totalTax: 150,
        total: 1150,
        itemDiscount: 100,
        payments: [
          { method: 'CASH', amount: 1150, amountNio: 1150 },
        ],
      });
      await seedInvoice(manager, {
        id: invoiceA2Id,
        tenantId: tenantAId,
        number: '001-001-01-00000102',
        userId: cashierAId,
        createdAt: yesterday,
        subtotal: 500,
        totalTax: 75,
        total: 575,
        itemDiscount: 50,
        payments: [
          { method: 'CARD', amount: 575, amountNio: 575, reconciliationStatus: 'PENDIENTE' },
        ],
      });

      // Fresh checkpoints (AC-09A): accepted receipts 1..3, accepted 1
      // minute ago; no pending outbox work. The store is otherwise quiet —
      // nothing may age this tenant out of COMPLETE.
      for (const sequence of ['1', '2', '3']) {
        await manager.getRepository(InventorySyncReceipt).save({
          tenant_id: tenantAId,
          idempotency_key: randomUUID(),
          source_device_id: deviceA,
          flow_type: 'inventory',
          source_sequence: sequence,
          payload_hash: `hash-${sequence}`,
          result_status: 'ACCEPTED',
          acceptedAt: oneMinuteAgo,
        });
      }

      // Audit summary fixtures: 1 CRITICAL + 1 WARNING + 1 INFO + 1
      // historical NULL-severity row (surfaces as INFO — never backfilled).
      for (const severity of ['CRITICAL', 'WARNING', 'INFO', null]) {
        await manager.getRepository(ChangeLog).save({
          tenant_id: tenantAId,
          user_id: null,
          actor_ref: 'acceptance-spec',
          action: 'UPDATE',
          target_type: 'acceptance-fixture',
          target_id: severity === 'CRITICAL' ? auditCriticalAId : randomUUID(),
          changes: null,
          severity,
        });
      }
    });

    // ---------------- Tenant B: its own invoice with a pending card
    // voucher for a DIFFERENT amount, STALE checkpoints (AC-08) and its own
    // critical audit row — every B figure must stay out of A's reads.
    await runInTenantTransaction(admin, tenantBId, async (manager) => {
      await manager.getRepository(Tenant).save({
        id: tenantBId,
        name: 'acceptance-tenant-b',
        slug: 'acceptance-tenant-b',
      } as Partial<Tenant>);
      await manager.getRepository(User).save({
        id: cashierBId,
        tenant_id: tenantBId,
        name: 'Bruna Campos',
        email: 'bruna.campos@acceptance-b.test',
        role: UserRole.CASHIER,
        is_active: true,
      } as Partial<User>);

      await seedInvoice(manager, {
        id: invoiceB1Id,
        tenantId: tenantBId,
        number: '001-001-01-00000201',
        userId: cashierBId,
        createdAt: now,
        subtotal: 900,
        totalTax: 0,
        total: 900,
        itemDiscount: 0,
        payments: [
          { method: 'CARD', amount: 900, amountNio: 900, reconciliationStatus: 'PENDIENTE' },
        ],
      });

      for (const sequence of ['1', '2']) {
        await manager.getRepository(InventorySyncReceipt).save({
          tenant_id: tenantBId,
          idempotency_key: randomUUID(),
          source_device_id: deviceB,
          flow_type: 'inventory',
          source_sequence: sequence,
          payload_hash: `hash-b-${sequence}`,
          result_status: 'ACCEPTED',
          acceptedAt: twentyMinutesAgo,
        });
      }

      await manager.getRepository(ChangeLog).save({
        tenant_id: tenantBId,
        user_id: null,
        actor_ref: 'acceptance-spec',
        action: 'UPDATE',
        target_type: 'acceptance-fixture',
        target_id: auditCriticalBId,
        changes: null,
        severity: 'CRITICAL',
      });
    });

    // Active device credentials gate freshness participation (spec §17.2).
    await provisionDeviceSyncCredential(admin, {
      tenantId: tenantAId,
      deviceId: deviceA,
      schema: fixture.schema,
    });
    await provisionDeviceSyncCredential(admin, {
      tenantId: tenantBId,
      deviceId: deviceB,
      schema: fixture.schema,
    });

    // latestHighSeverity carries the change_log row id (c.id) and picks the
    // newest CRITICAL/WARNING row — capture all seeded high-severity row ids
    // for exact tenant-scoped assertions.
    const highRows = (await admin.query(
      `SELECT tenant_id, id, severity FROM change_log WHERE severity IN ('CRITICAL', 'WARNING')`,
    )) as Array<{ tenant_id: string; id: string; severity: string }>;
    auditHighRowIdsByTenant.set(tenantAId, highRows.filter((row) => row.tenant_id === tenantAId).map((row) => row.id));
    auditHighRowIdsByTenant.set(tenantBId, highRows.filter((row) => row.tenant_id === tenantBId).map((row) => row.id));

    // Lightest workable assembly: services instantiated directly against the
    // runtime-role DataSource, exactly like the pooled-reads RLS gate.
    salesReports = new SalesReportsService(
      runtime.getRepository(Invoice),
      runtime.getRepository(InvoiceItem),
      runtime.getRepository(Payment),
      runtime.getRepository(User),
      runtime,
    );
    syncHealth = new SyncHealthService(runtime);
    auditSummary = new AuditSummaryService(runtime);
    cardReconciliation = new CardReconciliationSummaryService(runtime);
  });

  afterAll(async () => {
    if (runtime?.isInitialized) await runtime.destroy();
    if (admin?.isInitialized) await admin.destroy();
    if (fixture) await fixture.close();
  });

  it('proves the runtime role is NOSUPERUSER NOBYPASSRLS (gate teeth)', async () => {
    const role = (
      await admin.query(
        `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`,
        [fixture.runtimeRoleName],
      )
    )[0];
    expect(role).toBeDefined();
    expect(role.rolsuper).toBe(false);
    expect(role.rolbypassrls).toBe(false);
  });

  // ------------------------------------------------------------------------
  // GET /sales/reports/dashboard
  // ------------------------------------------------------------------------

  it('dashboard report: tenant A totals only — B sales, discounts and tax never leak', async () => {
    const report = await salesReports.getDashboard(tenantAId);

    // A holds exactly two completed invoices; B's row is excluded by the
    // same bound read (RLS + explicit predicate).
    expect(report.invoiceCount).toBe(2);
    expect(report.grossSales).toBe(1725);
    expect(report.netTaxableSales).toBe(1500);
    expect(report.netSalesNio).toBe(1500);
    expect(report.totalTaxNio).toBe(225);
    expect(report.completedTicketCount).toBe(2);
    expect(report.averageTicketNetNio).toBe(750);
    expect(report.preDiscountSalesNio).toBe(1650);
    expect(report.totalDiscountsNio).toBe(150);
    // Payments bound-read too: A1 cash 1150 + A2 pending card 575.
    expect(report.paymentMethodsBreakdown.totalNio).toBe(1725);
    expect(report.paymentMethodsBreakdown.cashNio).toBe(1150);
    expect(report.paymentMethodsBreakdown.cardNio).toBe(575);
  });

  it('dashboard report (AC-03 reconciliation): preDiscount = net + discounts over the fixture', async () => {
    const report = await salesReports.getDashboard(tenantAId);

    expect(report.netSalesNio).toBe(1500);
    expect(report.totalDiscountsNio).toBe(150);
    expect(report.preDiscountSalesNio).toBe(1650);
    expect(report.netSalesNio + report.totalDiscountsNio).toBeCloseTo(
      report.preDiscountSalesNio,
      2,
    );
    const discountRate = (report.totalDiscountsNio / report.preDiscountSalesNio) * 100;
    expect(discountRate).toBeCloseTo((150 / 1650) * 100, 6);
  });

  it('dashboard report: tenant B sees only its own invoice', async () => {
    const report = await salesReports.getDashboard(tenantBId);

    // B holds exactly one invoice; A's two rows (1725 gross) are excluded.
    expect(report.invoiceCount).toBe(1);
    expect(report.grossSales).toBe(900);
    expect(report.netSalesNio).toBe(900);
    expect(report.completedTicketCount).toBe(1);
  });

  // ------------------------------------------------------------------------
  // GET /sales/reports/dashboard/daily-series
  // ------------------------------------------------------------------------

  it('daily series: two Managua days of tenant A only, with the §7.2 parity invariant', async () => {
    const startKey = managuaDayKey(yesterday);
    const endKey = managuaDayKey(now);

    const series = await salesReports.getDashboardDailySeries(tenantAId, {
      startDate: startKey,
      endDate: endKey,
    });

    expect(series.days).toHaveLength(2);
    const byDate = new Map(series.days.map((day) => [day.date, day]));
    expect(byDate.get(startKey)?.netSalesNio).toBe(500);
    expect(byDate.get(endKey)?.netSalesNio).toBe(1000);
    // Parity: Σ days.netSalesNio === dashboard netSalesNio over the window.
    const seriesTotal = series.days.reduce((sum, day) => sum + day.netSalesNio, 0);
    expect(seriesTotal).toBe(1500);
    // Tenant B's 900-sales day never leaks into A's buckets.
    for (const day of series.days) {
      expect(day.netSalesNio).not.toBe(900);
    }
  });

  it('daily series: tenant B queries never see tenant A buckets', async () => {
    const series = await salesReports.getDashboardDailySeries(tenantBId, {
      startDate: managuaDayKey(yesterday),
      endDate: managuaDayKey(now),
    });

    const total = series.days.reduce((sum, day) => sum + day.netSalesNio, 0);
    expect(total).toBe(900);
  });

  // ------------------------------------------------------------------------
  // GET /operations/sync/freshness
  // ------------------------------------------------------------------------

  it('freshness (AC-09A): the quiet tenant with checkpoints current within the threshold stays COMPLETE', async () => {
    const freshness = await syncHealth.getFreshness(tenantAId, now);

    expect(freshness.state).toBe('COMPLETE');
    expect(freshness.perTerminal).toHaveLength(1);
    expect(freshness.perTerminal[0]?.terminalId).toBe(deviceA);
    expect(freshness.perTerminal[0]?.state).toBe('COMPLETE');
    expect(freshness.perTerminal[0]?.acceptedThroughSequence).toBe(3);
    expect(freshness.lastCompleteAt).not.toBeNull();
    // Tenant B's STALE evidence never appears in A's terminal set.
    expect(
      freshness.perTerminal.some((terminal) => terminal.terminalId === deviceB),
    ).toBe(false);
  });

  it('freshness (AC-08): complete streams 20 minutes old roll up to STALE, not COMPLETE', async () => {
    const freshness = await syncHealth.getFreshness(tenantBId, now);

    expect(freshness.state).toBe('STALE');
    expect(freshness.perTerminal[0]?.terminalId).toBe(deviceB);
    expect(freshness.perTerminal[0]?.state).toBe('STALE');
    expect(freshness.lastCompleteAt).not.toBeNull();
  });

  it('freshness: the stale tenant is fully isolated from the fresh tenant', async () => {
    const [fresh, stale] = await Promise.all([
      syncHealth.getFreshness(tenantAId, now),
      syncHealth.getFreshness(tenantBId, now),
    ]);

    expect(fresh.state).toBe('COMPLETE');
    expect(stale.state).toBe('STALE');
    const freshDevices = fresh.perTerminal.map((terminal) => terminal.terminalId);
    const staleDevices = stale.perTerminal.map((terminal) => terminal.terminalId);
    expect(freshDevices).not.toContain(deviceB);
    expect(staleDevices).not.toContain(deviceA);
  });

  // ------------------------------------------------------------------------
  // GET /operations/audit/summary
  // ------------------------------------------------------------------------

  it('audit summary: tenant A counts its own severities (NULL history as INFO) and never B rows', async () => {
    const summary = await auditSummary.getExecutiveSummary(tenantAId);

    expect(summary.criticalCount).toBe(1);
    expect(summary.warningCount).toBe(1);
    // 1 explicit INFO + 1 historical NULL-severity row resolved as INFO.
    expect(summary.infoCount).toBe(2);
    expect(summary.latestHighSeverity?.id);
    // The latest high-severity row must be one of A's own rows — never a
    // tenant B row (rows were seeded within the same second, so the newest
    // may be either A's CRITICAL or A's WARNING row).
    expect(auditHighRowIdsByTenant.get(tenantAId)).toContain(
      summary.latestHighSeverity?.id,
    );
    expect(summary.latestHighSeverity?.severity).toBeDefined();
  });

  it('audit summary: tenant B counts only its own critical event', async () => {
    const summary = await auditSummary.getExecutiveSummary(tenantBId);

    expect(summary.criticalCount).toBe(1);
    expect(summary.warningCount).toBe(0);
    expect(summary.infoCount).toBe(0);
    expect(auditHighRowIdsByTenant.get(tenantBId)).toContain(
      summary.latestHighSeverity?.id,
    );
  });

  // ------------------------------------------------------------------------
  // GET /sales/reports/card-reconciliation-summary
  // ------------------------------------------------------------------------

  it('card reconciliation summary: tenant A counts only its own pending voucher', async () => {
    const summary = await cardReconciliation.getCardReconciliationSummary(tenantAId);

    expect(summary.pendingCount).toBe(1);
    expect(summary.pendingAmountNio).toBe(575);
    expect(summary.oldestPendingAt).not.toBeNull();
    // Tenant B's 900 pending voucher must never inflate A's debt.
    expect(summary.pendingAmountNio).not.toBe(1475);
  });

  it('card reconciliation summary: tenant B counts only its own pending voucher', async () => {
    const summary = await cardReconciliation.getCardReconciliationSummary(tenantBId);

    expect(summary.pendingCount).toBe(1);
    expect(summary.pendingAmountNio).toBe(900);
    expect(summary.oldestPendingAt).not.toBeNull();
  });
});
