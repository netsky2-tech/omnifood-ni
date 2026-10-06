import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { createMigrationBuiltSchemaFixture } from '../../../../test/support/migration-built-schema.helper';
import { normalizeTenantSlug } from '../../tenant/tenant-slug';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { InvoiceItemModifier } from '../entities/invoice-item-modifier.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { Invoice } from '../entities/invoice.entity';
import { Payment } from '../entities/payment.entity';
import { PaymentReconciliationSyncIngestionService } from './payment-reconciliation-sync-ingestion.service';
import type { PaymentReconciliationSyncItemDto } from '../dto/payment-reconciliation-sync.dto';

/**
 * DB-backed integration spec for the payment reconciliation sync ingestion
 * (backlog #68, slice S1b). The schema is built by the FULL migration set
 * (never `synchronize: true`) so the `invoice_payments` row, its
 * `parent-owned` FORCE RLS policies (1809330000000) and the uuid predicate
 * form are exactly what production runs. The service executes through the
 * fixture's dedicated runtime role — NOSUPERUSER, NOBYPASSRLS — so the
 * transaction-local `app.tenant_id` binding done by
 * `runInTenantTransaction` is actually enforced by PostgreSQL, and the
 * tenant-isolation test exercises real RLS, not a mock.
 *
 * One fixture + seed is shared across the file; every test uses its own
 * payments (and the unknown-payment case uses a fresh random id), so the
 * tests stay order-independent while the expensive migration build runs
 * once. Row state is always asserted through the bootstrap superuser
 * connection, which bypasses RLS and therefore sees the raw table.
 */

const TEST_TIMEOUT_MS = 180000;

function reconciliation(overrides: Partial<PaymentReconciliationSyncItemDto> = {}) {
  return {
    paymentId: randomUUID(),
    invoiceId: randomUUID(),
    reconciliationStatus: 'CONCILIADO',
    reconciledAt: '2026-01-01T12:30:00.000Z',
    reconciledByUserId: 'cashier-1',
    voucherCode: 'VCH-123456',
    batchNumber: 'B-001',
    ...overrides,
  } as PaymentReconciliationSyncItemDto;
}

interface PaymentRowSnapshot {
  method: string;
  amount: string;
  currency: string;
  exchange_rate: string;
  amount_nio: string;
  change_given: string;
  change_currency: string;
  card_brand: string | null;
  card_type: string | null;
  bank_pos: string | null;
  last4: string | null;
  voucher_code: string | null;
  reconciliation_status: string | null;
  batch_number: string | null;
  reconciled_by_user_id: string | null;
  reconciled_at: string | null;
}

describe('PaymentReconciliationSyncIngestionService (db - Real PostgreSQL, migration-built schema, RLS enforced)', () => {
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();

  const invoiceA1Id = randomUUID(); // tenant A, happy path
  const invoiceA2Id = randomUUID(); // tenant A, invoice-mismatch source
  const invoiceA3Id = randomUUID(); // tenant A, invalid-status record
  const invoiceA4Id = randomUUID(); // tenant A, mixed batch
  const invoiceA5Id = randomUUID(); // tenant A, idempotent replay
  const invoiceB1Id = randomUUID(); // tenant B, isolation probe

  const payA1Id = randomUUID();
  const payA2Id = randomUUID();
  const payA3Id = randomUUID();
  const payA4Id = randomUUID();
  const payA5Id = randomUUID();
  const payB1Id = randomUUID();

  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;
  /** Superuser connection: seeds fixtures and asserts raw row state. */
  let bootstrap: DataSource;
  /** The application-like connection: NOSUPERUSER, NOBYPASSRLS. */
  let runtime: DataSource;
  let service: PaymentReconciliationSyncIngestionService;

  const snapshotPayment = async (
    paymentId: string,
  ): Promise<PaymentRowSnapshot> => {
    const rows = await bootstrap.query<PaymentRowSnapshot[]>(
      `SELECT method, amount, currency, exchange_rate, amount_nio,
              change_given, change_currency, card_brand, card_type, bank_pos,
              "last4", voucher_code, reconciliation_status, batch_number,
              reconciled_by_user_id, reconciled_at::text AS reconciled_at
         FROM invoice_payments
        WHERE id = $1`,
      [paymentId],
    );
    expect(rows).toHaveLength(1);
    return rows[0];
  };

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
      // Pin the scratch schema first, exactly like the sibling db specs:
      // every unqualified seed/assertion SQL must resolve to the fixture's
      // migration-built schema, never to the shared public schema.
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
         ($1, $7, 'PA-001', now(), 'a0000000-0000-4000-8000-00000000000a', 10.00, 1.50, 11.50, false, 'PAID', false, 'regular', now()),
         ($2, $7, 'PA-002', now(), 'a0000000-0000-4000-8000-00000000000a', 20.00, 3.00, 23.00, false, 'PAID', false, 'regular', now()),
         ($3, $7, 'PA-003', now(), 'a0000000-0000-4000-8000-00000000000a', 30.00, 4.50, 34.50, false, 'PAID', false, 'regular', now()),
         ($4, $7, 'PA-004', now(), 'a0000000-0000-4000-8000-00000000000a', 40.00, 6.00, 46.00, false, 'PAID', false, 'regular', now()),
         ($5, $7, 'PA-005', now(), 'a0000000-0000-4000-8000-00000000000a', 50.00, 7.50, 57.50, false, 'PAID', false, 'regular', now()),
         ($6, $8, 'PB-001', now(), 'b0000000-0000-4000-8000-00000000000b', 60.00, 9.00, 69.00, false, 'PAID', false, 'regular', now())`,
      [
        invoiceA1Id,
        invoiceA2Id,
        invoiceA3Id,
        invoiceA4Id,
        invoiceA5Id,
        invoiceB1Id,
        tenantAId,
        tenantBId,
      ],
    );
    await bootstrap.query(
      `INSERT INTO invoice_payments (
         id, invoice_id, method, amount, currency, exchange_rate, amount_nio,
         change_given, change_currency, voucher_code, card_brand, card_type,
         bank_pos, reconciliation_status, "last4", created_at
       ) VALUES
         ($1, $7, 'card', 1500.00, 'NIO', 1.0, 1500.00, 0, 'NIO', NULL, 'VISA', 'CREDITO', 'Banco Lafise', 'PENDIENTE', '9999', now()),
         ($2, $8, 'card', 2500.00, 'NIO', 1.0, 2500.00, 0, 'NIO', NULL, 'VISA', 'CREDITO', 'Banco Lafise', 'PENDIENTE', '8888', now()),
         ($3, $9, 'card', 3500.00, 'NIO', 1.0, 3500.00, 0, 'NIO', NULL, 'MC', 'CREDITO', 'Bac', 'PENDIENTE', '7777', now()),
         ($4, $10, 'cash', 4500.00, 'NIO', 1.0, 4500.00, 0, 'NIO', NULL, NULL, NULL, NULL, 'PENDIENTE', NULL, now()),
         ($5, $11, 'card', 5500.00, 'NIO', 1.0, 5500.00, 0, 'NIO', NULL, 'VISA', 'DEBITO', 'Banco Lafise', 'PENDIENTE', '6666', now()),
         ($6, $12, 'card', 6500.00, 'NIO', 1.0, 6500.00, 0, 'NIO', NULL, 'VISA', 'CREDITO', 'Bac', 'PENDIENTE', '5555', now())`,
      [
        payA1Id,
        payA2Id,
        payA3Id,
        payA4Id,
        payA5Id,
        payB1Id,
        invoiceA1Id,
        invoiceA2Id,
        invoiceA3Id,
        invoiceA4Id,
        invoiceA5Id,
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

    service = new PaymentReconciliationSyncIngestionService(
      runtime,
      runtime.getRepository(Payment),
    );
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
    'happy path: updates exactly the five reconciliation columns on the real invoice_payments row and leaves the fiscal snapshot untouched',
    async () => {
      const before = await snapshotPayment(payA1Id);

      const result = await service.ingestReconciliationBatch(tenantAId, {
        reconciliations: [
          reconciliation({
            paymentId: payA1Id,
            invoiceId: invoiceA1Id,
            reconciliationStatus: 'CONCILIADO',
            reconciledAt: '2026-02-03T14:05:00.000Z',
            reconciledByUserId: 'cashier-a1',
            voucherCode: 'VCH-HP-0001',
            batchNumber: 'BATCH-HP',
          }),
        ],
      });

      expect(result).toMatchObject({
        received: 1,
        processed: 1,
        failed: 0,
        results: [
          { paymentId: payA1Id, status: 'ACCEPTED' },
        ],
      });

      const after = await snapshotPayment(payA1Id);
      // The whole write surface: the five reconciliation columns.
      expect(after.voucher_code).toBe('VCH-HP-0001');
      expect(after.reconciliation_status).toBe('CONCILIADO');
      expect(after.reconciled_by_user_id).toBe('cashier-a1');
      expect(after.batch_number).toBe('BATCH-HP');
      expect(after.reconciled_at).not.toBeNull();
      // Everything else is the sale sync's fiscal snapshot and must be
      // byte-identical to the seeded row.
      expect(after.method).toBe(before.method);
      expect(after.amount).toBe(before.amount);
      expect(after.currency).toBe(before.currency);
      expect(after.exchange_rate).toBe(before.exchange_rate);
      expect(after.amount_nio).toBe(before.amount_nio);
      expect(after.change_given).toBe(before.change_given);
      expect(after.change_currency).toBe(before.change_currency);
      expect(after.card_brand).toBe(before.card_brand);
      expect(after.card_type).toBe(before.card_type);
      expect(after.bank_pos).toBe(before.bank_pos);
      expect(after.last4).toBe(before.last4);
      // The payment stays a single row: upsert, never insert.
      await expect(
        bootstrap.query('SELECT count(*)::int AS n FROM invoice_payments'),
      ).resolves.toEqual([{ n: 6 }]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'unknown paymentId: fails closed with UNKNOWN_PAYMENT and never inserts a row',
    async () => {
      const unknownId = randomUUID();
      const countBefore = await bootstrap.query<{ n: number }[]>(
        'SELECT count(*)::int AS n FROM invoice_payments',
      );

      const result = await service.ingestReconciliationBatch(tenantAId, {
        reconciliations: [
          reconciliation({
            paymentId: unknownId,
            invoiceId: invoiceA1Id,
          }),
        ],
      });

      expect(result.processed).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.results[0]).toMatchObject({
        paymentId: unknownId,
        status: 'FAILED',
        code: 'UNKNOWN_PAYMENT',
      });
      // A reconciliation arriving before its sale is never a silent success
      // and never materializes a row.
      const countAfter = await bootstrap.query<{ n: number }[]>(
        'SELECT count(*)::int AS n FROM invoice_payments',
      );
      expect(countAfter).toEqual(countBefore);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'invoice mismatch: a payment of invoice A claimed under invoice B fails with INVOICE_MISMATCH and the row is untouched',
    async () => {
      const before = await snapshotPayment(payA2Id);

      const result = await service.ingestReconciliationBatch(tenantAId, {
        reconciliations: [
          reconciliation({
            paymentId: payA2Id,
            invoiceId: invoiceB1Id, // belongs to invoiceA2, claims B1
          }),
        ],
      });

      expect(result.failed).toBe(1);
      expect(result.results[0]).toMatchObject({
        paymentId: payA2Id,
        status: 'FAILED',
        code: 'INVOICE_MISMATCH',
      });
      // Nothing was written on the mis-keyed record.
      expect(await snapshotPayment(payA2Id)).toEqual(before);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'invalid reconciliation status: fails the record with INVALID_STATUS and writes nothing',
    async () => {
      const before = await snapshotPayment(payA3Id);

      const result = await service.ingestReconciliationBatch(tenantAId, {
        reconciliations: [
          reconciliation({
            paymentId: payA3Id,
            invoiceId: invoiceA3Id,
            reconciliationStatus: 'REVISADO',
          }),
        ],
      });

      expect(result.failed).toBe(1);
      expect(result.results[0]).toMatchObject({
        paymentId: payA3Id,
        status: 'FAILED',
        code: 'INVALID_STATUS',
      });
      expect(await snapshotPayment(payA3Id)).toEqual(before);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'mixed batch: the good record applies against real Postgres while the bad record fails with its code',
    async () => {
      const beforeGood = await snapshotPayment(payA4Id);

      const badRecord = reconciliation({
        paymentId: payA3Id,
        invoiceId: invoiceA3Id,
        reconciliationStatus: 'NO_EXISTE',
      });
      const goodRecord = reconciliation({
        paymentId: payA4Id,
        invoiceId: invoiceA4Id,
        reconciliationStatus: 'MANUAL_OVERRIDE',
        reconciledAt: '2026-03-04T09:00:00.000Z',
        reconciledByUserId: 'supervisor-1',
        voucherCode: 'VCH-MIX-0004',
        batchNumber: 'BATCH-MIX',
      });

      const result = await service.ingestReconciliationBatch(tenantAId, {
        reconciliations: [badRecord, goodRecord],
      });

      expect(result).toMatchObject({
        received: 2,
        processed: 1,
        failed: 1,
      });
      expect(result.results[0]).toMatchObject({
        paymentId: badRecord.paymentId,
        status: 'FAILED',
        code: 'INVALID_STATUS',
      });
      expect(result.results[1]).toMatchObject({
        paymentId: payA4Id,
        status: 'ACCEPTED',
      });

      // The good record landed; the bad one changed nothing.
      const afterGood = await snapshotPayment(payA4Id);
      expect(afterGood.reconciliation_status).toBe('MANUAL_OVERRIDE');
      expect(afterGood.voucher_code).toBe('VCH-MIX-0004');
      expect(afterGood.reconciled_by_user_id).toBe('supervisor-1');
      expect(afterGood.batch_number).toBe('BATCH-MIX');
      expect(afterGood.reconciled_at).not.toBeNull();
      expect(afterGood.amount).toBe(beforeGood.amount);
      expect(afterGood.method).toBe(beforeGood.method);
      // The bad record's row stays exactly as seeded.
      const afterBad = await snapshotPayment(payA3Id);
      expect(afterBad.reconciliation_status).toBe('PENDIENTE');
      expect(afterBad.voucher_code).toBeNull();
      expect(afterBad.batch_number).toBeNull();
      expect(afterBad.reconciled_at).toBeNull();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'tenant isolation: a payment owned by Tenant A is invisible (and unwritable) under Tenant B — UNKNOWN_PAYMENT, row untouched — while Tenant A keeps access',
    async () => {
      const before = await snapshotPayment(payA1Id);

      // Tenant B pushes a reconciliation for Tenant A's payment. The RLS
      // predicate walks invoice_payments -> invoices.tenant_id, so the row
      // is simply not found under Tenant B's transaction-local context.
      const tenantBResult = await service.ingestReconciliationBatch(tenantBId, {
        reconciliations: [
          reconciliation({
            paymentId: payA1Id,
            invoiceId: invoiceA1Id,
          }),
        ],
      });
      expect(tenantBResult.results[0]).toMatchObject({
        paymentId: payA1Id,
        status: 'FAILED',
        code: 'UNKNOWN_PAYMENT',
      });

      // ...and even a correct-looking Tenant B invoice id cannot move the row.
      const tenantBSpoofedResult = await service.ingestReconciliationBatch(
        tenantBId,
        {
          reconciliations: [
            reconciliation({
              paymentId: payA1Id,
              invoiceId: invoiceB1Id,
            }),
          ],
        },
      );
      expect(tenantBSpoofedResult.results[0]).toMatchObject({
        status: 'FAILED',
        code: 'UNKNOWN_PAYMENT',
      });

      // Tenant B reconciling its OWN payment still works: isolation, not a
      // blanket denial.
      const ownResult = await service.ingestReconciliationBatch(tenantBId, {
        reconciliations: [
          reconciliation({
            paymentId: payB1Id,
            invoiceId: invoiceB1Id,
            reconciliationStatus: 'CONCILIADO',
            voucherCode: 'VCH-TB-0001',
          }),
        ],
      });
      expect(ownResult.results[0]).toMatchObject({
        paymentId: payB1Id,
        status: 'ACCEPTED',
      });

      // Tenant A's row is byte-identical to before Tenant B tried anything.
      expect(await snapshotPayment(payA1Id)).toEqual(before);
      // ...while Tenant B's own row was reconciled.
      expect((await snapshotPayment(payB1Id)).reconciliation_status).toBe(
        'CONCILIADO',
      );
      expect((await snapshotPayment(payB1Id)).voucher_code).toBe(
        'VCH-TB-0001',
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'idempotent replay: the exact same batch run twice produces identical per-record outcomes and identical persisted state',
    async () => {
      const batch = {
        reconciliations: [
          reconciliation({
            paymentId: payA5Id,
            invoiceId: invoiceA5Id,
            reconciliationStatus: 'CONCILIADO',
            reconciledAt: '2026-04-05T10:15:00.000Z',
            reconciledByUserId: 'cashier-a5',
            voucherCode: 'VCH-IDEM-0005',
            batchNumber: 'BATCH-IDEM',
          }),
        ],
      };

      const first = await service.ingestReconciliationBatch(tenantAId, batch);
      const afterFirst = await snapshotPayment(payA5Id);

      // The terminal retries the same batch after a lost response.
      const second = await service.ingestReconciliationBatch(tenantAId, batch);
      const afterSecond = await snapshotPayment(payA5Id);

      expect(first.failed).toBe(0);
      expect(first.processed).toBe(1);
      expect(second.failed).toBe(0);
      expect(second.processed).toBe(1);
      // Identical outcomes, including message text (no error noise).
      expect(second.results).toEqual(first.results);

      // Identical persisted state: same row count, same values, and the
      // reconciled_at timestamp is derived from the payload, so a replay
      // does not shift it.
      expect(afterSecond).toEqual(afterFirst);
      expect(afterFirst.reconciliation_status).toBe('CONCILIADO');
      expect(afterFirst.voucher_code).toBe('VCH-IDEM-0005');
      expect(afterFirst.batch_number).toBe('BATCH-IDEM');
      expect(afterFirst.reconciled_by_user_id).toBe('cashier-a5');
      await expect(
        bootstrap.query('SELECT count(*)::int AS n FROM invoice_payments'),
      ).resolves.toEqual([{ n: 6 }]);
    },
    TEST_TIMEOUT_MS,
  );
});
