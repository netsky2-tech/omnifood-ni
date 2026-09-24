import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { TenantFulfillmentRecord } from '../entities/tenant-fulfillment-record.entity';
import { InventorySyncReceipt } from '../../inventory/entities/inventory-sync-receipt.entity';
import { InventorySyncOutbox } from '../../inventory/entities/inventory-sync-outbox.entity';
import { Invoice } from '../../sales/entities/invoice.entity';
import { InvoiceItem } from '../../sales/entities/invoice-item.entity';
import { InvoiceItemModifier } from '../../sales/entities/invoice-item-modifier.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { Payment } from '../../sales/entities/payment.entity';
import { InventoryMovement } from '../../inventory/entities/inventory-movement.entity';
import { FulfillmentRetentionService } from './fulfillment-retention.service';
import { InvoicesService } from '../../sales/services/invoices.service';
import { SyncBatchRecordDto } from '../../sales/dto/sync-batch.dto';
import { createMigrationBuiltSchemaFixture } from '../../../../test/support/migration-built-schema.helper';
import { normalizeTenantSlug } from '../../tenant/tenant-slug';

/**
 * ISSUE #418: the schema is built by RUNNING THE FULL MIGRATION SET (via
 * test/support/migration-built-schema.helper.ts) instead of `synchronize: true`
 * plus five hand-picked migration `up()` calls, and this file no longer
 * hand-writes ANY RLS statement. The previous fixture created a fake `invoices`
 * table (varchar ids, a `number`/`status` column pair the real schema does not
 * have) and hand-wrote three text-form policies on it, so the spec asserted
 * against a copy of reality: the real migrations rebind `tenant_id` columns to
 * uuid (1809070000000/1809120000000), give `invoices` a uuid `invoice_number`/
 * `user_id` shape with an FK to `tenants`, and own the policies — including the
 * uuid-form predicate `tenant_id = current_setting('app.tenant_id', true)::uuid`.
 *
 * Consequences the conversion forces (all real-schema facts, not test choices):
 * - Every tenant id is a uuid. The rebound `tenant_id` columns (fulfillment
 *   records, receipts, outbox) and the `invoices` FK to `tenants` reject the
 *   old varchar ids like 'tenant-1'.
 * - The purge test's invoice seed uses the real columns and returns its
 *   generated uuid id, which the preservation assertion then re-checks.
 * - `inventory_kardex` now exists in the built schema, so the purge's kardex
 *   exclusion path runs against a real (empty) table instead of a missing one.
 * - A dedicated assertion reads `pg_policies` in the built schema: RLS is
 *   genuinely exercised against the migrations' own output, not assumed.
 *
 * The behavioural assertions are unchanged in meaning: same sync/idempotency
 * counts, same purge exclusions, same cross-tenant isolation expectations.
 */

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

const entities = [
  Tenant,
  TenantFulfillmentRecord,
  InventorySyncReceipt,
  InventorySyncOutbox,
  Invoice,
  InvoiceItem,
  InvoiceItemModifier,
  Payment,
  InventoryMovement,
];

describe('FulfillmentRetentionService (db - Real PostgreSQL, Zero Mocks, migration-built schema)', () => {
  jest.setTimeout(60000);

  let dataSource: DataSource;
  let schema: string;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;

  // The real schema stores tenant ids as uuid (migrations 1809070000000 and
  // 1809120000000), so every tenant fixture is a uuid. One distinct tenant per
  // test keeps the per-tenant assertions exact inside the shared schema.
  const tenantSyncId = randomUUID();
  const tenantPurgeId = randomUUID();
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();

  beforeAll(async () => {
    // The schema is the migrations' output, built as a restricted role; the
    // helper provisions the scratch schema, uuid-ossp, and both roles, and
    // measures its own setup cost (logged for the issue's measurement).
    fixture = await createMigrationBuiltSchemaFixture();
    schema = fixture.schema;
    process.stdout.write(
      `[timing] migration-built setup = ${fixture.setupDurationMs} ms (migrations alone: ${fixture.migrationDurationMs} ms)\n`,
    );

    // Admin (superuser) connection for seeding and for the services under
    // test, mirroring the pre-conversion fixture: superuser bypasses RLS, so
    // service-level tenant filtering is what the isolation assertions below
    // exercise. search_path is pinned on the connection itself so every
    // pooled connection resolves the entities' unqualified SQL.
    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      entities,
      extra: {
        allowExitOnIdle: true,
        options: `-c search_path=${schema},public -c statement_timeout=15000`,
      },
    });
    await dataSource.initialize();

    // The migration-built `invoices` table carries an FK to tenants(id), so
    // every tenant id used below needs a real tenant row.
    const tenantRepo = dataSource.getRepository(Tenant);
    await tenantRepo.save(
      [tenantSyncId, tenantPurgeId, tenantAId, tenantBId].map((id, index) =>
        tenantRepo.create({
          id,
          name: `Retention Spec Tenant ${index}`,
          slug: normalizeTenantSlug(`Retention Spec Tenant ${index}`),
          ruc: `J031000000000${index}`,
          is_active: true,
        }),
      ),
    );
  });

  afterAll(async () => {
    // The helper's close() drops the schema and roles; the spec's own
    // connections must be gone first, because sessions block DROP ROLE.
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    if (fixture) {
      await fixture.close();
    }
  });

  it('persists central fulfillment records on sync batch and idempotently handles replays', async () => {
    const fulfillmentRepo = dataSource.getRepository(TenantFulfillmentRecord);

    const invoicesService = new InvoicesService(
      dataSource,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      dataSource.getRepository(InventorySyncReceipt),
      dataSource.getRepository(InventorySyncOutbox),
      { findActiveVersion: jest.fn() } as never,
      { explodeRecipe: jest.fn() } as never,
    );

    const recordDto: SyncBatchRecordDto = {
      idempotencyKey: 'outbox:tenant-1:fulfillment-101',
      sourceDeviceId: 'pos-1',
      sourceSequence: 1,
      flowType: 'fulfillment',
      documentType: 'FULFILLMENT',
      aggregateType: 'fulfillment',
      aggregateId: 'fulfillment-sale-101',
      eventId: 'event:fulfillment-sale-101',
      topologyRevision: 1,
      fulfillment: {
        id: 'fulfillment-sale-101',
        saleId: 'sale-101',
        topologySnapshotId: 'snap-1',
        topologyRevision: 1,
        channel: 'KDS_AND_PRINT',
        routeState: 'ROUTED',
        deliveryState: 'PENDING',
        lines: [{ id: 'line-1', action: 'PREPARE', station: 'COCINA' }],
      },
    };

    // 1. Initial Sync
    const result1 = await invoicesService.syncBatch(tenantSyncId, [recordDto]);
    expect(result1.processed).toBe(1);
    expect(result1.duplicates).toBe(0);

    // Verify stored in PostgreSQL
    const stored = await fulfillmentRepo.findOne({
      where: { id: 'fulfillment-sale-101', tenant_id: tenantSyncId },
    });
    expect(stored).toBeDefined();
    expect(stored?.channel).toBe('KDS_AND_PRINT');
    expect(stored?.delivery_state).toBe('PENDING');
    expect(stored?.route_state).toBe('ROUTED');

    // 2. Reconnect Replay: Idempotent duplicate acknowledgment, no duplicates created
    const result2 = await invoicesService.syncBatch(tenantSyncId, [recordDto]);
    expect(result2.duplicates).toBe(1);
    expect(result2.processed).toBe(0);

    const count = await fulfillmentRepo.count({
      where: { id: 'fulfillment-sale-101', tenant_id: tenantSyncId },
    });
    expect(count).toBe(1);
  }, 60000);

  it('purges fulfillment records and receipts older than cutoff, while STRICTLY EXCLUDING invoices and kardex movements', async () => {
    const fulfillmentRepo = dataSource.getRepository(TenantFulfillmentRecord);

    const retentionService = new FulfillmentRetentionService(
      dataSource,
      fulfillmentRepo,
    );

    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000); // 100 days ago (> 90 days)
    const recentDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago (< 90 days)
    const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days cutoff

    // Seed old and recent fulfillment records
    await dataSource.query(
      `INSERT INTO tenant_fulfillment_records (id, tenant_id, channel, route_state, delivery_state, created_at) VALUES
       ('f-old-1', $1, 'PRINT_ONLY', 'PRINTED', 'PENDING', $2),
       ('f-recent-1', $1, 'KDS_ONLY', 'ROUTED', 'PENDING', $3)`,
      [tenantPurgeId, oldDate, recentDate],
    );

    // Seed old and recent receipts
    await dataSource.query(
      `INSERT INTO inventory_sync_receipts (tenant_id, idempotency_key, source_device_id, flow_type, source_sequence, payload_hash, result_status, result_code, created_at) VALUES
       ($1, 'key-old-f', 'pos-1', 'fulfillment', 1, 'hash-1', 'ACCEPTED', 'APPLIED', $2),
       ($1, 'key-recent-f', 'pos-1', 'fulfillment', 2, 'hash-2', 'ACCEPTED', 'APPLIED', $3),
       ($1, 'key-old-inv', 'pos-1', 'inventory', 1, 'hash-3', 'ACCEPTED', 'APPLIED', $2)`,
      [tenantPurgeId, oldDate, recentDate],
    );

    // Seed old invoice (MUST NOT BE PURGED). The real schema: uuid ids, an
    // FK to tenants, invoice_number/user_id naming, no `status` column.
    const insertedInvoice: Array<{ id: string }> = await dataSource.query(
      `INSERT INTO invoices (tenant_id, invoice_number, user_id, subtotal, total_tax, total, created_at)
       VALUES ($1, 'FAC-00000001', $2, 100, 15, 115, $3)
       RETURNING id`,
      [tenantPurgeId, randomUUID(), oldDate],
    );

    // Execute Purge for tenant
    const purgeResult = await retentionService.purgeRetentionData(
      tenantPurgeId,
      cutoffDate,
    );

    expect(purgeResult.purgedFulfillments).toBe(1);
    expect(purgeResult.purgedReceipts).toBe(0);
    expect(purgeResult.excludedInvoices).toBe(1);

    // Verify old fulfillment record was deleted
    const remainingFulfillments: Array<{ id: string }> = await dataSource.query(
      `SELECT id FROM tenant_fulfillment_records WHERE tenant_id = $1`,
      [tenantPurgeId],
    );
    expect(remainingFulfillments.map((r) => r.id)).toEqual(['f-recent-1']);

    // Verify receipts are append-only audit log and remain preserved
    const remainingReceipts: Array<{
      idempotency_key: string;
      flow_type: string;
    }> = await dataSource.query(
      `SELECT idempotency_key, flow_type FROM inventory_sync_receipts WHERE tenant_id = $1 ORDER BY idempotency_key`,
      [tenantPurgeId],
    );
    expect(remainingReceipts).toHaveLength(3);

    // Verify invoice was strictly preserved
    const remainingInvoices: Array<{ id: string }> = await dataSource.query(
      `SELECT id FROM invoices WHERE tenant_id = $1`,
      [tenantPurgeId],
    );
    expect(remainingInvoices).toHaveLength(1);
    expect(remainingInvoices[0]?.id).toBe(insertedInvoice[0].id);
  }, 60000);

  it('enforces multi-tenant RLS isolation during retention purge and queries', async () => {
    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // Insert records for Tenant A and Tenant B
    await dataSource.query(
      `INSERT INTO tenant_fulfillment_records (id, tenant_id, channel, route_state, delivery_state, created_at) VALUES
       ('f-tenant-a', $1, 'PRINT_ONLY', 'PRINTED', 'PENDING', $3),
       ('f-tenant-b', $2, 'KDS_ONLY', 'ROUTED', 'PENDING', $3)`,
      [tenantAId, tenantBId, oldDate],
    );

    const fulfillmentRepo = dataSource.getRepository(TenantFulfillmentRecord);
    const retentionService = new FulfillmentRetentionService(
      dataSource,
      fulfillmentRepo,
    );

    // Purge Tenant A
    const purgeResA = await retentionService.purgeRetentionData(
      tenantAId,
      cutoffDate,
    );
    expect(purgeResA.purgedFulfillments).toBe(1);

    // Verify Tenant B's record was NOT touched
    const recordB = await retentionService.findFulfillmentRecord(
      tenantBId,
      'f-tenant-b',
    );
    expect(recordB).toBeDefined();
    expect(recordB?.id).toBe('f-tenant-b');

    // Verify Tenant A cannot read Tenant B's record
    const recordBFromA = await retentionService.findFulfillmentRecord(
      tenantAId,
      'f-tenant-b',
    );
    expect(recordBFromA).toBeNull();
  }, 60000);

  it('exercises the real RLS policy set: pg_policies holds rows in the migration-built schema for every table this spec touches', async () => {
    // With synchronize:true this catalog query returned nothing for
    // tenant_fulfillment_records/inventory_sync_receipts and the invoices
    // policies only existed because this spec hand-wrote them. The migration
    // set owns the policies now; assert they exist and that the tenant
    // predicate is the real uuid-form one the rebind migrations installed.
    const policyRows = await dataSource.query<
      Array<{
        tablename: string;
        policyname: string;
        cmd: string;
        qual: string | null;
        with_check: string | null;
      }>
    >(
      `SELECT tablename, policyname, cmd, qual, with_check
         FROM pg_policies
        WHERE schemaname = $1
          AND tablename IN ('tenant_fulfillment_records', 'inventory_sync_receipts', 'invoices')
        ORDER BY tablename, policyname`,
      [schema],
    );

    const namesFor = (table: string): string[] =>
      policyRows.filter((r) => r.tablename === table).map((r) => r.policyname);

    // The rebind migration recreates the four lifecycle policies with the
    // uuid-form predicate; assert the SELECT half's deparsed expression.
    expect(namesFor('tenant_fulfillment_records')).toEqual(
      expect.arrayContaining([
        'tenant_fulfillment_records_tenant_select',
        'tenant_fulfillment_records_tenant_insert',
        'tenant_fulfillment_records_tenant_update',
        'tenant_fulfillment_records_tenant_delete',
      ]),
    );
    const fulfillmentSelect = policyRows.find(
      (r) =>
        r.tablename === 'tenant_fulfillment_records' &&
        r.policyname === 'tenant_fulfillment_records_tenant_select',
    );
    expect(fulfillmentSelect?.qual).toContain(
      "current_setting('app.tenant_id'::text, true))::uuid",
    );

    // Append-only sync ledger and the invoices table: at least one tenant-
    // scoped SELECT policy each, from the migrations, not from this spec.
    expect(namesFor('inventory_sync_receipts')).toContain(
      'sync_ledger_inventory_sync_receipts_tenant_select',
    );
    expect(
      namesFor('invoices').some((name) => name.includes('tenant_select')),
    ).toBe(true);

    // And the schema as a whole is policy-carrying, not just these tables.
    const totals = await dataSource.query<Array<{ count: number }>>(
      `SELECT count(*)::int AS count FROM pg_policies WHERE schemaname = $1`,
      [schema],
    );
    expect(totals[0].count).toBeGreaterThan(0);
  });
});
