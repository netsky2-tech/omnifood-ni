import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';

import type { EntityManager } from 'typeorm';

import { createMigrationBuiltSchemaFixture } from '../../../../test/support/migration-built-schema.helper';
import { ChangeLog } from '../../audit/entities/change-log.entity';
import { ChangeLogService } from '../../audit/change-log.service';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { UserRole } from '../../identity/entities/user.entity';
import {
  InventorySyncOutbox,
} from '../../inventory/entities/inventory-sync-outbox.entity';
import {
  InventorySyncReceipt,
} from '../../inventory/entities/inventory-sync-receipt.entity';
import type { SyncBatchRecordDto } from '../dto/sync-batch.dto';
import {
  InvoicesService,
  calculateSyncPayloadHash,
} from '../services/invoices.service';
import {
  GAP_FILL_ACTOR_REF,
  GAP_FILL_AUDIT_ACTION,
  GAP_FILL_PAYLOAD_HASH,
  GAP_FILL_RESULT_CODE,
  SequenceGapPolicyService,
} from './sequence-gap-policy.service';

/**
 * DB-backed proof for the sequence-gap policy (real Postgres, migration-built
 * scratch schema, non-superuser runtime role under the real RLS policies and
 * the real append-only trigger on inventory_sync_receipts).
 *
 * Unlike sequence-gap-policy.service.spec.ts (mocked repositories), this suite
 * drives the REAL InvoicesService.syncBatch and the REAL
 * SequenceGapPolicyService INSERT of fill receipts into inventory_sync_receipts.
 *
 * Harness: the same createMigrationBuiltSchemaFixture the other service-level
 * db specs use — the full migration set runs into a fresh scratch schema, so
 * the append-only trigger, the stream-sequence unique index and the RLS
 * policies are the production ones. Append-only means fixtures are built
 * forward only and never cleaned mid-test; every test uses a fresh fixture
 * tenant + device stream, so leftovers can never interfere.
 *
 * The live rig's stream (source_device_id = 'S23TEST', tenant
 * bc3bd4dd-92bb-4cfe-883e-cb5ec97bfe94) is NEVER touched: this suite only
 * writes into its own dropped-at-teardown scratch schema.
 */

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for DB-backed service tests`);
  }

  return value;
}

function readPostgresPort(): number {
  const value = process.env.DB_PORT?.trim() ?? '5432';
  const port = Number(value);

  if (!Number.isInteger(port)) {
    throw new Error(
      'DB_PORT must be a valid integer for DB-backed service tests',
    );
  }

  return port;
}

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: readPostgresPort(),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: getRequiredEnv('DB_PASSWORD'),
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

const GRACE_WINDOW_MINUTES = 60;
const AGED_BLOCK_CREATED_AT_MS = (GRACE_WINDOW_MINUTES + 60) * 60 * 1000;

interface ReceiptRow {
  source_sequence: string;
  result_status: string;
  result_code: string | null;
  payload_hash: string;
  idempotency_key: string;
  accepted_at: Date | null;
  created_at: Date;
}

interface OutboxRow {
  source_sequence: string;
  status: string;
  result_code: string | null;
  payload_hash: string;
  idempotency_key: string;
  created_at: Date;
}

interface AuditRow {
  action: string;
  actor_ref: string | null;
  target_type: string;
  target_id: string;
  changes: Record<string, unknown> | null;
}

interface FixtureStream {
  readonly tenantId: string;
  readonly deviceId: string;
  insertAcceptedReceipt(sequence: number): Promise<void>;
  stageOutboxRow(
    sequence: number,
    record: SyncBatchRecordDto,
    createdAt: Date,
  ): Promise<void>;
  readReceipts(): Promise<ReceiptRow[]>;
  readOutboxRows(): Promise<OutboxRow[]>;
  readAuditEvents(): Promise<AuditRow[]>;
}

function dumpRows(label: string, rows: unknown): void {
  process.stdout.write(
    `[sequence-gap-db] ${label} = ${JSON.stringify(rows, null, 2)}\n`,
  );
}

describe('sequence gap policy (db-backed, real Postgres)', () => {
  const TEST_TIMEOUT_MS = 30000;
  const SETUP_TIMEOUT_MS = 600000;

  let fixture: Awaited<
    ReturnType<typeof createMigrationBuiltSchemaFixture>
  > | null = null;
  let dataSource: DataSource | null = null;
  let service: InvoicesService;
  let policy: SequenceGapPolicyService;

  const buildRecord = (
    stream: { deviceId: string },
    sequence: number,
  ): SyncBatchRecordDto => ({
    idempotencyKey: `gap-spec:${stream.deviceId}:${sequence}`,
    sourceDeviceId: stream.deviceId,
    sourceSequence: sequence,
    flowType: 'inventory',
    documentType: 'PURCHASE',
  });

  /**
   * Provisions a fresh fixture tenant + device stream. Append-only table:
   * state is built forward only, one fresh stream per test.
   */
  const createFixtureStream = async (): Promise<FixtureStream> => {
    if (!dataSource) throw new Error('runtime data source not initialized');
    const db = dataSource;
    const tenantId = randomUUID();
    const deviceId = `gap-spec-${randomUUID().replace(/-/g, '').slice(0, 12)}`;

    const inTenantTx = async <T>(
      work: (manager: EntityManager, tenantId: string) => Promise<T>,
    ): Promise<T> =>
      db.transaction(async (manager) => {
        await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
          tenantId,
        ]);
        return work(manager, tenantId);
      });

    // tenants row: required because change_log.tenant_id carries a real FK.
    // Insert runs under the row's own tenant context (forced RLS).
    await inTenantTx(async (manager, boundTenantId) => {
      await manager.query(
        `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)`,
        [
          boundTenantId,
          `gap-spec-tenant-${boundTenantId.slice(0, 8)}`,
          `gap-spec-${boundTenantId.replace(/-/g, '').slice(0, 20)}`,
        ],
      );
    });

    const insertAcceptedReceipt = async (
      sequence: number,
    ): Promise<void> => {
      await inTenantTx(async (manager, boundTenantId) => {
        await manager.query(
          `INSERT INTO inventory_sync_receipts (
             tenant_id, idempotency_key, source_device_id, flow_type,
             source_sequence, payload_hash, result_status, result_code, accepted_at
           ) VALUES ($1, $2, $3, 'inventory', $4, $5, 'ACCEPTED', 'APPLIED', now())`,
          [
            boundTenantId,
            `gap-spec-seed:${deviceId}:${sequence}`,
            deviceId,
            sequence,
            `seed-hash-${sequence}`,
          ],
        );
      });
    };

    const stageOutboxRow = async (
      sequence: number,
      record: SyncBatchRecordDto,
      createdAt: Date,
    ): Promise<void> => {
      await inTenantTx(async (manager, boundTenantId) => {
        await manager.query(
          `INSERT INTO inventory_sync_outbox (
             tenant_id, idempotency_key, source_device_id, flow_type,
             source_sequence, document_type, payload_hash, payload,
             status, result_code, created_at, updated_at
           ) VALUES ($1, $2, $3, 'inventory', $4, 'PURCHASE', $5, $6::jsonb,
                      'STAGED_FUTURE', $7, $8::timestamptz, now())`,
          [
            boundTenantId,
            record.idempotencyKey,
            deviceId,
            sequence,
            calculateSyncPayloadHash(record),
            JSON.stringify(record),
            `WAITING_FOR_SEQUENCE_${sequence - 1}`,
            createdAt.toISOString(),
          ],
        );
      });
    };

    // Reads run tenant-bound too: inventory_sync_receipts, inventory_sync_outbox
    // and change_log are all under FORCED RLS whose policies cast
    // current_setting('app.tenant_id') to uuid — an unbound pooled session
    // would fail the cast instead of returning rows.
    const readReceipts = async (): Promise<ReceiptRow[]> =>
      inTenantTx(async (manager, boundTenantId) =>
        manager.query<ReceiptRow[]>(
          `SELECT source_sequence, result_status, result_code, payload_hash,
                  idempotency_key, accepted_at, created_at
             FROM inventory_sync_receipts
            WHERE tenant_id = $1::uuid AND source_device_id = $2
            ORDER BY source_sequence::bigint`,
          [boundTenantId, deviceId],
        ),
      );

    const readOutboxRows = async (): Promise<OutboxRow[]> =>
      inTenantTx(async (manager, boundTenantId) =>
        manager.query<OutboxRow[]>(
          `SELECT source_sequence, status, result_code, payload_hash,
                  idempotency_key, created_at
             FROM inventory_sync_outbox
            WHERE tenant_id = $1::uuid AND source_device_id = $2
            ORDER BY source_sequence::bigint`,
          [boundTenantId, deviceId],
        ),
      );

    const readAuditEvents = async (): Promise<AuditRow[]> =>
      inTenantTx(async (manager, boundTenantId) =>
        manager.query<AuditRow[]>(
          `SELECT action, actor_ref, target_type, target_id, changes
             FROM change_log
            WHERE tenant_id = $1::uuid AND target_type = 'inventory_sync_outbox'
            ORDER BY created_at`,
          [boundTenantId],
        ),
      );

    return {
      tenantId,
      deviceId,
      insertAcceptedReceipt,
      stageOutboxRow,
      readReceipts,
      readOutboxRows,
      readAuditEvents,
    };
  };

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();
    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      schema: fixture.schema,
      entities: [InventorySyncReceipt, InventorySyncOutbox, ChangeLog, Tenant],
    });
    await dataSource.initialize();

    const changeLogService = new ChangeLogService(
      dataSource.getRepository(ChangeLog),
      dataSource,
    );
    policy = new SequenceGapPolicyService(dataSource, changeLogService);

    // Same minimal collaborators the invoices.service.db.spec uses: the sync
    // path under test (receipts/outbox/gap policy) runs fully real.
    const unusedRepository = {} as never;
    const userRepository = {
      findOne: jest.fn().mockImplementation(
        ({ where }: { where: { id: string; tenant_id: string } }) =>
          Promise.resolve({
            id: where.id,
            tenant_id: where.tenant_id,
            role: UserRole.MANAGER,
            is_active: true,
          }),
      ),
    } as never;
    const recipeService = { findActiveVersion: jest.fn() } as never;
    const bomExplosionService = { explodeRecipe: jest.fn() } as never;

    service = new InvoicesService(
      dataSource,
      unusedRepository,
      unusedRepository,
      unusedRepository,
      userRepository,
      unusedRepository,
      dataSource.getRepository(InventorySyncReceipt),
      dataSource.getRepository(InventorySyncOutbox),
      recipeService,
      bomExplosionService,
      undefined,
      policy,
    );
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    await fixture?.close();
  }, SETUP_TIMEOUT_MS);

  it(
    'declares the gap past the grace window: fill receipt row is really inserted, watermark advances, record applied (not staged), audit event written',
    async () => {
      const stream = await createFixtureStream();
      // Watermark at 5: ACCEPTED receipts 1..5.
      for (let seq = 1; seq <= 5; seq += 1) {
        await stream.insertAcceptedReceipt(seq);
      }
      // The lost record blocked the stream: a STAGED_FUTURE outbox row for
      // sequence 7, aged well past the grace window.
      const blockedRecord = buildRecord(stream, 7);
      await stream.stageOutboxRow(
        7,
        blockedRecord,
        new Date(Date.now() - AGED_BLOCK_CREATED_AT_MS),
      );

      try {
        // The device retry loop re-sends the same record.
        const result = await service.syncBatch(stream.tenantId, [
          blockedRecord,
        ]);
        dumpRows('case1.syncResult', result);

        const receipts = await stream.readReceipts();
        const outbox = await stream.readOutboxRows();
        const audit = await stream.readAuditEvents();
        dumpRows('case1.receipts', receipts);
        dumpRows('case1.outbox', outbox);
        dumpRows('case1.audit', audit);

        expect(result.results).toHaveLength(1);
        expect(result.results[0]).toMatchObject({
          idempotencyKey: blockedRecord.idempotencyKey,
          sourceSequence: 7,
          status: 'ACCEPTED',
          code: 'APPLIED',
        });

        // The fill receipt for the missing sequence 6 exists as a REAL row.
        const fill = receipts.find((row) => row.source_sequence === '6');
        expect(fill).toBeDefined();
        expect(fill).toMatchObject({
          result_status: 'ACCEPTED',
          result_code: GAP_FILL_RESULT_CODE,
          payload_hash: GAP_FILL_PAYLOAD_HASH,
          idempotency_key: `gap-fill:${stream.deviceId}:inventory:6`,
        });

        // The arriving record itself was applied: ACCEPTED receipt for 7.
        const applied = receipts.find((row) => row.source_sequence === '7');
        expect(applied).toMatchObject({
          result_status: 'ACCEPTED',
          result_code: 'APPLIED',
        });

        // Watermark (highest ACCEPTED sequence) advanced to 7.
        const watermark = Math.max(
          ...receipts
            .filter((row) => row.result_status === 'ACCEPTED')
            .map((row) => Number(row.source_sequence)),
        );
        expect(watermark).toBe(7);

        // The audit event exists.
        expect(audit).toHaveLength(1);
        expect(audit[0]).toMatchObject({
          action: GAP_FILL_AUDIT_ACTION,
          actor_ref: GAP_FILL_ACTOR_REF,
          target_type: 'inventory_sync_outbox',
        });
        // target_id must be a uuid. change_log.target_id is a uuid column, and
        // the previous composite "device:flow" string was rejected by the
        // database inside the same SERIALIZABLE transaction, rolling back the
        // whole declaration and failing the entire batch. Asserting the shape
        // rather than a value keeps this a regression guard, and the value is
        // generated per run anyway.
        expect(audit[0].target_id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
      } finally {
        dumpRows(
          'case1.stateAfterFailure.receipts',
          await stream.readReceipts().catch(() => 'unreadable'),
        );
        dumpRows(
          'case1.stateAfterFailure.audit',
          await stream.readAuditEvents().catch(() => 'unreadable'),
        );
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'does not declare a young block: no fill receipt, record staged STAGED_FUTURE as before',
    async () => {
      const stream = await createFixtureStream();
      for (let seq = 1; seq <= 5; seq += 1) {
        await stream.insertAcceptedReceipt(seq);
      }
      const blockedRecord = buildRecord(stream, 7);
      // Same shape as case 1, but the staged block is brand new.
      await stream.stageOutboxRow(7, blockedRecord, new Date());

      const result = await service.syncBatch(stream.tenantId, [
        blockedRecord,
      ]);
      dumpRows('case2.syncResult', result);

      const receipts = await stream.readReceipts();
      const outbox = await stream.readOutboxRows();
      dumpRows('case2.receipts', receipts);
      dumpRows('case2.outbox', outbox);

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        idempotencyKey: blockedRecord.idempotencyKey,
        sourceSequence: 7,
        status: 'STAGED_FUTURE',
        code: 'WAITING_FOR_SEQUENCE_6',
        retryable: true,
      });

      // Only the five seed receipts exist: no fill receipt was inserted.
      expect(receipts.map((row) => row.source_sequence)).toEqual([
        '1',
        '2',
        '3',
        '4',
        '5',
      ]);

      // The staged row is untouched (same payload → no conflict result).
      expect(outbox).toHaveLength(1);
      expect(outbox[0]).toMatchObject({
        source_sequence: '7',
        status: 'STAGED_FUTURE',
        result_code: 'WAITING_FOR_SEQUENCE_6',
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'holds idempotency: declaring the same blocked situation twice inserts exactly one fill receipt',
    async () => {
      const stream = await createFixtureStream();
      for (let seq = 1; seq <= 5; seq += 1) {
        await stream.insertAcceptedReceipt(seq);
      }
      const blockedRecord = buildRecord(stream, 7);
      await stream.stageOutboxRow(
        7,
        blockedRecord,
        new Date(Date.now() - AGED_BLOCK_CREATED_AT_MS),
      );

      const first = await policy.declareGapIfBlocked({
        tenantId: stream.tenantId,
        sourceDeviceId: stream.deviceId,
        flowType: 'inventory',
        expectedSequence: 6,
        incomingSequence: 7,
      });
      const second = await policy.declareGapIfBlocked({
        tenantId: stream.tenantId,
        sourceDeviceId: stream.deviceId,
        flowType: 'inventory',
        expectedSequence: 6,
        incomingSequence: 7,
      });
      dumpRows('case3.declareResults', { first, second });

      const receipts = await stream.readReceipts();
      dumpRows('case3.receipts', receipts);

      expect(first).toBe(true);
      // Second declaration finds the gap already filled: no duplicate.
      expect(second).toBe(false);

      const fillsForSix = receipts.filter(
        (row) =>
          row.source_sequence === '6' && row.result_code === GAP_FILL_RESULT_CODE,
      );
      expect(fillsForSix).toHaveLength(1);
      expect(fillsForSix[0]).toMatchObject({
        result_status: 'ACCEPTED',
        payload_hash: GAP_FILL_PAYLOAD_HASH,
        idempotency_key: `gap-fill:${stream.deviceId}:inventory:6`,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'fills consecutive missing sequences exactly once each',
    async () => {
      const stream = await createFixtureStream();
      for (let seq = 1; seq <= 5; seq += 1) {
        await stream.insertAcceptedReceipt(seq);
      }
      // Watermark 5, record arrives for 8: sequences 6 and 7 are missing.
      const blockedRecord = buildRecord(stream, 8);
      await stream.stageOutboxRow(
        8,
        blockedRecord,
        new Date(Date.now() - AGED_BLOCK_CREATED_AT_MS),
      );

      const result = await service.syncBatch(stream.tenantId, [
        blockedRecord,
      ]);
      dumpRows('case4.syncResult', result);

      const receipts = await stream.readReceipts();
      const audit = await stream.readAuditEvents();
      dumpRows('case4.receipts', receipts);
      dumpRows('case4.audit', audit);

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        idempotencyKey: blockedRecord.idempotencyKey,
        sourceSequence: 8,
        status: 'ACCEPTED',
        code: 'APPLIED',
      });

      const fillSix = receipts.filter((row) => row.source_sequence === '6');
      const fillSeven = receipts.filter((row) => row.source_sequence === '7');
      expect(fillSix).toHaveLength(1);
      expect(fillSeven).toHaveLength(1);
      for (const [row, seq] of [
        [fillSix[0], 6],
        [fillSeven[0], 7],
      ] as const) {
        expect(row).toMatchObject({
          result_status: 'ACCEPTED',
          result_code: GAP_FILL_RESULT_CODE,
          payload_hash: GAP_FILL_PAYLOAD_HASH,
          idempotency_key: `gap-fill:${stream.deviceId}:inventory:${seq}`,
        });
      }

      const applied = receipts.find((row) => row.source_sequence === '8');
      expect(applied).toMatchObject({
        result_status: 'ACCEPTED',
        result_code: 'APPLIED',
      });

      const watermark = Math.max(
        ...receipts
          .filter((row) => row.result_status === 'ACCEPTED')
          .map((row) => Number(row.source_sequence)),
      );
      expect(watermark).toBe(8);
    },
    TEST_TIMEOUT_MS,
  );
});
