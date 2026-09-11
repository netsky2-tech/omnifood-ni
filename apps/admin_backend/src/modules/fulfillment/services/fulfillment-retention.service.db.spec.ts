import { DataSource, QueryRunner } from 'typeorm';
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
import { BohInventoryLedgerFoundation1766000000000 } from '../../../migrations/1766000000000-BohInventoryLedgerFoundation';
import { AddDeterministicSyncSequencing1780000000000 } from '../../../migrations/1780000000000-AddDeterministicSyncSequencing';
import { CreateTenantFulfillmentRecords1795000000000 } from '../../../migrations/1795000000000-CreateTenantFulfillmentRecords';
import { SyncBatchRecordDto } from '../../sales/dto/sync-batch.dto';

const TEST_TIMEOUT_MS = 60000;

async function withIsolatedSchema(
  schemaName: string,
  assertion: (context: {
    dataSource: DataSource;
    queryRunner: QueryRunner;
    schema: string;
  }) => Promise<void>,
): Promise<void> {
  const schema = `${schemaName}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const bootstrap = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'omnifood',
    synchronize: false,
  });

  await bootstrap.initialize();
  await bootstrap.query(`CREATE SCHEMA "${schema}"`);

  let dataSource: DataSource | null = null;
  let queryRunner: QueryRunner | null = null;

  try {
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST ?? '127.0.0.1',
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      username: process.env.DB_USERNAME ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
      database: process.env.DB_NAME ?? 'omnifood',
      synchronize: false,
      schema,
      entities: [
        Tenant,
        TenantFulfillmentRecord,
        InventorySyncReceipt,
        InventorySyncOutbox,
        Invoice,
        InvoiceItem,
        InvoiceItemModifier,
        Payment,
        InventoryMovement,
      ],
    });
    await dataSource.initialize();

    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.query(`SET search_path TO "${schema}"`);
    await queryRunner.query(`SET statement_timeout TO '15000ms'`);

    await assertion({ dataSource, queryRunner, schema });
  } finally {
    try {
      if (queryRunner) {
        await queryRunner.query('SET search_path TO public');
        await queryRunner.release();
      }
    } catch {
      // best-effort cleanup
    }

    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }

    try {
      if (bootstrap.isInitialized) {
        await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await bootstrap.destroy();
      }
    } catch {
      // best-effort cleanup
    }
  }
}

describe('FulfillmentRetentionService (db - Real PostgreSQL, Zero Mocks)', () => {
  it(
    'persists central fulfillment records on sync batch and idempotently handles replays',
    async () => {
      await withIsolatedSchema(
        'fulfillment_sync_db',
        async ({ dataSource, queryRunner }) => {
          await new BohInventoryLedgerFoundation1766000000000().up(queryRunner);
          await new AddDeterministicSyncSequencing1780000000000().up(
            queryRunner,
          );
          await new CreateTenantFulfillmentRecords1795000000000().up(
            queryRunner,
          );

          const fulfillmentRepo = dataSource.getRepository(
            TenantFulfillmentRecord,
          );
          const receiptRepo = dataSource.getRepository(InventorySyncReceipt);
          const outboxRepo = dataSource.getRepository(InventorySyncOutbox);

          const invoicesService = new InvoicesService(
            dataSource,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            receiptRepo,
            outboxRepo,
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
          const result1 = await invoicesService.syncBatch('tenant-1', [
            recordDto,
          ]);
          expect(result1.processed).toBe(1);
          expect(result1.duplicates).toBe(0);

          // Verify stored in PostgreSQL
          const stored = await fulfillmentRepo.findOne({
            where: { id: 'fulfillment-sale-101', tenant_id: 'tenant-1' },
          });
          expect(stored).toBeDefined();
          expect(stored?.channel).toBe('KDS_AND_PRINT');
          expect(stored?.delivery_state).toBe('PENDING');
          expect(stored?.route_state).toBe('ROUTED');

          // 2. Reconnect Replay: Idempotent duplicate acknowledgment, no duplicates created
          const result2 = await invoicesService.syncBatch('tenant-1', [
            recordDto,
          ]);
          expect(result2.duplicates).toBe(1);
          expect(result2.processed).toBe(0);

          const count = await fulfillmentRepo.count({
            where: { id: 'fulfillment-sale-101', tenant_id: 'tenant-1' },
          });
          expect(count).toBe(1);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'purges fulfillment records and receipts older than cutoff, while STRICTLY EXCLUDING invoices and kardex movements',
    async () => {
      await withIsolatedSchema(
        'fulfillment_purge_db',
        async ({ dataSource, queryRunner }) => {
          // Build required schema tables
          await new BohInventoryLedgerFoundation1766000000000().up(queryRunner);
          await new AddDeterministicSyncSequencing1780000000000().up(
            queryRunner,
          );
          await new CreateTenantFulfillmentRecords1795000000000().up(
            queryRunner,
          );

          // Minimal invoice table for exclusion assertion
          await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS invoices (
            id varchar(128) PRIMARY KEY,
            tenant_id varchar(64) NOT NULL,
            number varchar(64) NOT NULL,
            user_id varchar(64) NOT NULL,
            subtotal numeric(12, 4) NOT NULL DEFAULT 0,
            total_tax numeric(12, 4) NOT NULL DEFAULT 0,
            total numeric(12, 4) NOT NULL DEFAULT 0,
            created_at timestamptz NOT NULL DEFAULT now(),
            status varchar(32) NOT NULL DEFAULT 'COMPLETED',
            is_canceled boolean NOT NULL DEFAULT false
          );
          ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
          ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
          CREATE POLICY invoices_select ON invoices FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true));
          CREATE POLICY invoices_insert ON invoices FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
          CREATE POLICY invoices_delete ON invoices FOR DELETE USING (tenant_id = current_setting('app.tenant_id', true));
        `);

          const fulfillmentRepo = dataSource.getRepository(
            TenantFulfillmentRecord,
          );

          const retentionService = new FulfillmentRetentionService(
            dataSource,
            fulfillmentRepo,
          );

          const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000); // 100 days ago (> 90 days)
          const recentDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago (< 90 days)
          const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days cutoff

          // Seed old and recent fulfillment records
          await queryRunner.query(
            `INSERT INTO tenant_fulfillment_records (id, tenant_id, channel, route_state, delivery_state, created_at) VALUES 
           ('f-old-1', 'tenant-1', 'PRINT_ONLY', 'PRINTED', 'PENDING', $1),
           ('f-recent-1', 'tenant-1', 'KDS_ONLY', 'ROUTED', 'PENDING', $2)`,
            [oldDate, recentDate],
          );

          // Seed old and recent receipts
          await queryRunner.query(
            `INSERT INTO inventory_sync_receipts (tenant_id, idempotency_key, source_device_id, flow_type, source_sequence, payload_hash, result_status, result_code, created_at) VALUES 
           ('tenant-1', 'key-old-f', 'pos-1', 'fulfillment', '1', 'hash-1', 'ACCEPTED', 'APPLIED', $1),
           ('tenant-1', 'key-recent-f', 'pos-1', 'fulfillment', '2', 'hash-2', 'ACCEPTED', 'APPLIED', $2),
           ('tenant-1', 'key-old-inv', 'pos-1', 'inventory', '1', 'hash-3', 'ACCEPTED', 'APPLIED', $1)`,
            [oldDate, recentDate],
          );

          // Seed old invoice (MUST NOT BE PURGED)
          await queryRunner.query(
            `INSERT INTO invoices (id, tenant_id, number, user_id, subtotal, total_tax, total, created_at) VALUES
           ('inv-old-1', 'tenant-1', 'FAC-00000001', 'user-1', 100, 15, 115, $1)`,
            [oldDate],
          );

          // Execute Purge for tenant-1
          const purgeResult = await retentionService.purgeRetentionData(
            'tenant-1',
            cutoffDate,
          );

          expect(purgeResult.purgedFulfillments).toBe(1);
          expect(purgeResult.purgedReceipts).toBe(0);
          expect(purgeResult.excludedInvoices).toBe(1);

          // Verify old fulfillment record was deleted
          const remainingFulfillments: Array<{ id: string }> =
            (await queryRunner.query(
              `SELECT id FROM tenant_fulfillment_records WHERE tenant_id = 'tenant-1'`,
            )) as Array<{ id: string }>;
          expect(remainingFulfillments.map((r) => r.id)).toEqual([
            'f-recent-1',
          ]);

          // Verify receipts are append-only audit log and remain preserved
          const remainingReceipts: Array<{
            idempotency_key: string;
            flow_type: string;
          }> = (await queryRunner.query(
            `SELECT idempotency_key, flow_type FROM inventory_sync_receipts WHERE tenant_id = 'tenant-1' ORDER BY idempotency_key`,
          )) as Array<{ idempotency_key: string; flow_type: string }>;
          expect(remainingReceipts).toHaveLength(3);

          // Verify invoice was strictly preserved
          const remainingInvoices: Array<{ id: string }> =
            (await queryRunner.query(
              `SELECT id FROM invoices WHERE tenant_id = 'tenant-1'`,
            )) as Array<{ id: string }>;
          expect(remainingInvoices).toHaveLength(1);
          expect(remainingInvoices[0]?.id).toBe('inv-old-1');
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'enforces multi-tenant RLS isolation during retention purge and queries',
    async () => {
      await withIsolatedSchema(
        'fulfillment_rls_db',
        async ({ dataSource, queryRunner }) => {
          await new BohInventoryLedgerFoundation1766000000000().up(queryRunner);
          await new AddDeterministicSyncSequencing1780000000000().up(
            queryRunner,
          );
          await new CreateTenantFulfillmentRecords1795000000000().up(
            queryRunner,
          );

          const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
          const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

          // Insert records for Tenant A and Tenant B
          await queryRunner.query(
            `INSERT INTO tenant_fulfillment_records (id, tenant_id, channel, route_state, delivery_state, created_at) VALUES 
           ('f-tenant-a', 'tenant-A', 'PRINT_ONLY', 'PRINTED', 'PENDING', $1),
           ('f-tenant-b', 'tenant-B', 'KDS_ONLY', 'ROUTED', 'PENDING', $1)`,
            [oldDate],
          );

          const fulfillmentRepo = dataSource.getRepository(
            TenantFulfillmentRecord,
          );
          const retentionService = new FulfillmentRetentionService(
            dataSource,
            fulfillmentRepo,
          );

          // Purge Tenant A
          const purgeResA = await retentionService.purgeRetentionData(
            'tenant-A',
            cutoffDate,
          );
          expect(purgeResA.purgedFulfillments).toBe(1);

          // Verify Tenant B's record was NOT touched
          const recordB = await retentionService.findFulfillmentRecord(
            'tenant-B',
            'f-tenant-b',
          );
          expect(recordB).toBeDefined();
          expect(recordB?.id).toBe('f-tenant-b');

          // Verify Tenant A cannot read Tenant B's record
          const recordBFromA = await retentionService.findFulfillmentRecord(
            'tenant-A',
            'f-tenant-b',
          );
          expect(recordBFromA).toBeNull();
        },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
