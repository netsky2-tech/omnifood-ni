import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { createMigrationBuiltSchemaFixture } from '../../../../test/support/migration-built-schema.helper';
import { normalizeTenantSlug } from '../../tenant/tenant-slug';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { InvoiceItemModifier } from '../entities/invoice-item-modifier.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { Invoice } from '../entities/invoice.entity';
import { Payment } from '../entities/payment.entity';
import { ReconciliationListService } from './reconciliation-list.service';
import { ReconciliationListQueryDto } from '../dto/reconciliation-list-query.dto';

/**
 * DB-backed integration spec for the reconciliation drill-down list
 * service. The schema is built by the FULL migration set (never
 * `synchronize: true`) so the `invoice_payments` table, its parent-owned
 * FORCE RLS policies (1809330000000) and the `override_supervisor_ref`
 * column (1809600000000) are exactly what production runs. The service
 * executes through the fixture's dedicated runtime role — NOSUPERUSER,
 * NOBYPASSRLS — so the transaction-local `app.tenant_id` binding done by
 * `runInTenantTransaction` is actually enforced by PostgreSQL, and the
 * tenant isolation is exercised through real RLS, not a mock.
 */

const TEST_TIMEOUT_MS = 180000;

describe('ReconciliationListService (db - Real PostgreSQL, migration-built schema, RLS enforced)', () => {
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();

  // Tenant A: reconciled voucher rows under test.
  const invoiceA1Id = randomUUID(); // MANUAL_OVERRIDE + override ref
  const invoiceA2Id = randomUUID(); // PENDIENTE with voucher
  const invoiceA3Id = randomUUID(); // CANCELED invoice (payments must be excluded)
  const invoiceA4Id = randomUUID(); // CONCILIADO with voucher (date-range probe)
  const invoiceB1Id = randomUUID(); // tenant B, isolation probe

  const payA1Id = randomUUID();
  const payA2Id = randomUUID();
  const payA3Id = randomUUID();
  const payA4Id = randomUUID();
  const payB1Id = randomUUID();

  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;
  /** Superuser connection: seeds fixtures and asserts raw row state. */
  let bootstrap: DataSource;
  /** The application-like connection: NOSUPERUSER, NOBYPASSRLS. */
  let runtime: DataSource;
  let service: ReconciliationListService;

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();
    process.stdout.write(
      `[timing] migration-built setup = ${fixture.setupDurationMs} ms (migrations alone: ${fixture.migrationDurationMs} ms)\n`,
    );

    bootstrap = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
      port: Number(process.env.DB_PORT?.trim() ?? 5432),
      username: process.env.DB_USERNAME?.trim() ?? 'postgres',
      password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
      database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
      extra: {
        allowExitOnIdle: true,
        max: 2,
        options: `-c search_path=${fixture.schema},public -c statement_timeout=15000`,
      },
    });
    await bootstrap.initialize();

    // Seed as superuser (RLS does not apply to the seeding connection; the
    // migration-built policies belong to the migration role).
    await bootstrap.query(
      `INSERT INTO tenants (id, name, slug, created_at, updated_at) VALUES
         ($1, 'Tenant A', $3, now(), now()),
         ($2, 'Tenant B', $4, now(), now())`,
      [
        tenantAId,
        tenantBId,
        normalizeTenantSlug('Tenant A'),
        normalizeTenantSlug('Tenant B'),
      ],
    );
    await bootstrap.query(
      `INSERT INTO invoices (
         id, tenant_id, invoice_number, created_at, user_id, subtotal,
         total_tax, total, is_canceled, payment_status, global_tax_override,
         type, updated_at
       ) VALUES
         ($1, $6, 'RA-001', now(), 'a0000000-0000-4000-8000-00000000000a', 10.00, 1.50, 11.50, false, 'PAID', false, 'regular', now()),
         ($2, $6, 'RA-002', now(), 'a0000000-0000-4000-8000-00000000000a', 20.00, 3.00, 23.00, false, 'PAID', false, 'regular', now()),
         ($3, $6, 'RA-003', now(), 'a0000000-0000-4000-8000-00000000000a', 30.00, 4.50, 34.50, true,  'PAID', false, 'regular', now()),
         ($4, $6, 'RA-004', now(), 'a0000000-0000-4000-8000-00000000000a', 40.00, 6.00, 46.00, false, 'PAID', false, 'regular', now()),
         ($5, $7, 'RB-001', now(), 'b0000000-0000-4000-8000-00000000000b', 60.00, 9.00, 69.00, false, 'PAID', false, 'regular', now())`,
      [
        invoiceA1Id,
        invoiceA2Id,
        invoiceA3Id,
        invoiceA4Id,
        invoiceB1Id,
        tenantAId,
        tenantBId,
      ],
    );
    await bootstrap.query(
      `INSERT INTO invoice_payments (
         id, invoice_id, method, amount, currency, exchange_rate, amount_nio,
         change_given, change_currency, voucher_code, card_brand, card_type,
         bank_pos, reconciliation_status, "last4", override_supervisor_ref,
         reconciled_at, reconciled_by_user_id, created_at
       ) VALUES
         ($1,  $6,  'card', 1500.00, 'NIO', 1.0, 1500.00, 0, 'NIO', 'VCH-A1', 'VISA', 'CREDITO', 'Banco Lafise', 'MANUAL_OVERRIDE', '9999', 'sup-ref-42', '2026-09-02T15:30:00Z', 'user-1', now()),
         ($2,  $7,  'card', 2500.00, 'NIO', 1.0, 2500.00, 0, 'NIO', 'VCH-A2', 'MC',   'CREDITO', 'Bac',           'PENDIENTE',       '8888', NULL,         NULL,                  NULL,     now()),
         ($3,  $8,  'card', 3500.00, 'NIO', 1.0, 3500.00, 0, 'NIO', 'VCH-A3', 'VISA', 'CREDITO', 'Banco Lafise', 'PENDIENTE',       '7777', NULL,         NULL,                  NULL,     now()),
         ($4,  $9,  'card', 4500.00, 'NIO', 1.0, 4500.00, 0, 'NIO', 'VCH-A4', 'VISA', 'DEBITO',  'Banco Lafise', 'CONCILIADO',      '6666', NULL,         '2026-08-15T10:00:00Z', 'user-2',              now()),
         ($5,  $10, 'card', 6500.00, 'NIO', 1.0, 6500.00, 0, 'NIO', 'VCH-B1', 'VISA', 'CREDITO', 'Bac',           'PENDIENTE',       '5555', NULL,         NULL,                  NULL,     now())`,
      [
        payA1Id,
        payA2Id,
        payA3Id,
        payA4Id,
        payB1Id,
        invoiceA1Id,
        invoiceA2Id,
        invoiceA3Id,
        invoiceA4Id,
        invoiceB1Id,
      ],
    );

    // The service must run exactly like the deployed app: an ordinary
    // non-owner, non-bypassing role against the migration-built schema.
    runtime = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
      port: Number(process.env.DB_PORT?.trim() ?? 5432),
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
      entities: [Tenant, Invoice, InvoiceItem, InvoiceItemModifier, Payment],
      extra: {
        allowExitOnIdle: true,
        max: 2,
        options: '-c statement_timeout=15000',
      },
    });
    await runtime.initialize();

    service = new ReconciliationListService(runtime);
  });

  afterAll(async () => {
    if (runtime?.isInitialized) {
      await runtime.destroy();
    }
    if (bootstrap?.isInitialized) {
      await bootstrap.destroy();
    }
    await fixture?.close();
  });

  it(
    'returns a MANUAL_OVERRIDE row when filtered by status, with its override_supervisor_ref',
    async () => {
      const result = await service.getReconciliationList(tenantAId, {
        status: 'MANUAL_OVERRIDE',
      } as ReconciliationListQueryDto);

      expect(result.pagination.total).toBe(1);
      expect(result.reconciliations).toHaveLength(1);
      const row = result.reconciliations[0];
      expect(row.paymentId).toBe(payA1Id);
      expect(row.invoiceId).toBe(invoiceA1Id);
      expect(row.invoiceNumber).toBe('RA-001');
      expect(row.reconciliationStatus).toBe('MANUAL_OVERRIDE');
      expect(row.voucherCode).toBe('VCH-A1');
      expect(row.overrideSupervisorRef).toBe('sup-ref-42');
      expect(row.reconciledAt).toBe('2026-09-02T15:30:00.000Z');
      expect(row.reconciledByUserId).toBe('user-1');
      expect(row.amount).toBe(1500);
      expect(row.amountNio).toBe(1500);
      expect(row.createdAt).toEqual(expect.any(String));
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'returns a PENDIENTE row when filtered by status (PENDIENTE and MANUAL_OVERRIDE are distinct)',
    async () => {
      const result = await service.getReconciliationList(tenantAId, {
        status: 'PENDIENTE',
      } as ReconciliationListQueryDto);

      // payA2 (invoice RA-002, voucher-bearing) only: payA3 rides the
      // canceled invoice RA-003 and payB1 belongs to tenant B.
      expect(result.pagination.total).toBe(1);
      expect(result.reconciliations).toHaveLength(1);
      expect(result.reconciliations[0].paymentId).toBe(payA2Id);
      expect(result.reconciliations[0].reconciliationStatus).toBe('PENDIENTE');
      expect(result.reconciliations[0].overrideSupervisorRef).toBeNull();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'excludes canceled invoices and other tenants from every listing',
    async () => {
      const result = await service.getReconciliationList(
        tenantAId,
        new ReconciliationListQueryDto(),
      );

      const paymentIds = result.reconciliations.map((r) => r.paymentId);
      // payA3 (canceled invoice RA-003) and payB1 (tenant B) never appear.
      expect(paymentIds).not.toContain(payA3Id);
      expect(paymentIds).not.toContain(payB1Id);
      expect(paymentIds).toEqual(
        expect.arrayContaining([payA1Id, payA2Id, payA4Id]),
      );
      expect(result.pagination.total).toBe(3);

      // Tenant B sees only its own row.
      const tenantBResult = await service.getReconciliationList(
        tenantBId,
        new ReconciliationListQueryDto(),
      );
      expect(tenantBResult.reconciliations.map((r) => r.paymentId)).toEqual([
        payB1Id,
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'filters by reconciliation date range (inclusive of the end day)',
    async () => {
      const result = await service.getReconciliationList(tenantAId, {
        startDate: '2026-09-01',
        endDate: '2026-09-03',
      } as ReconciliationListQueryDto);

      // Only payA1 was reconciled inside 2026-09-01..2026-09-03;
      // payA4 (2026-08-15) falls outside, the never-reconciled rows have
      // reconciled_at NULL and are excluded by the range predicate.
      expect(result.reconciliations.map((r) => r.paymentId)).toEqual([payA1Id]);
    },
    TEST_TIMEOUT_MS,
  );
});
