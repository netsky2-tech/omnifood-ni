import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner, type Repository } from 'typeorm';
import { BohInventoryLedgerFoundation1766000000000 } from '../../../migrations/1766000000000-BohInventoryLedgerFoundation';
import { AddDeterministicSyncSequencing1780000000000 } from '../../../migrations/1780000000000-AddDeterministicSyncSequencing';
import { InventorySyncOutbox } from '../../inventory/entities/inventory-sync-outbox.entity';
import { InventorySyncReceipt } from '../../inventory/entities/inventory-sync-receipt.entity';
import { UserRole } from '../../identity/entities/user.entity';
import { SyncBatchRecordDto } from '../dto/sync-batch.dto';
import { InvoicesService } from './invoices.service';

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

interface IsolatedSchemaContext {
  dataSource: DataSource;
  queryRunner: QueryRunner;
  schema: string;
}

function createMockAuthorizingUserRepository() {
  return {
    findOne: jest
      .fn()
      .mockImplementation(
        ({ where }: { where: { id: string; tenant_id: string } }) =>
          Promise.resolve({
            id: where.id,
            tenant_id: where.tenant_id,
            role: UserRole.MANAGER,
            is_active: true,
          }),
      ),
  } as never;
}

async function withIsolatedSchema(
  schemaPrefix: string,
  assertion: (context: IsolatedSchemaContext) => Promise<void>,
): Promise<void> {
  const bootstrap = new DataSource({
    type: 'postgres',
    ...postgresConnection,
  });

  const schema = `${schemaPrefix}_${randomUUID().replace(/-/g, '')}`;
  let dataSource: DataSource | null = null;
  let queryRunner: QueryRunner | null = null;

  try {
    await bootstrap.initialize();
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);

    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      entities: [InventorySyncReceipt, InventorySyncOutbox],
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

function createService(
  dataSource: DataSource,
  receiptRepository: Repository<InventorySyncReceipt>,
  outboxRepository: Repository<InventorySyncOutbox>,
): InvoicesService {
  const unusedRepository = {} as never;
  const userRepository = createMockAuthorizingUserRepository();
  const recipeService = { findActiveVersion: jest.fn() } as never;
  const bomExplosionService = { explodeRecipe: jest.fn() } as never;

  return new InvoicesService(
    dataSource,
    unusedRepository,
    unusedRepository,
    unusedRepository,
    userRepository,
    unusedRepository,
    receiptRepository,
    outboxRepository,
    recipeService,
    bomExplosionService,
  );
}

const buildFulfillmentRecord = (
  sequence: number,
  overrides: Partial<SyncBatchRecordDto> = {},
): SyncBatchRecordDto => ({
  idempotencyKey: `outbox:tenant-1:fulfillment-${sequence}`,
  sourceDeviceId: 'pos-terminal-1',
  sourceSequence: sequence,
  flowType: 'fulfillment',
  documentType: 'FULFILLMENT',
  aggregateType: 'fulfillment',
  aggregateId: `fulfillment-sale-${sequence}`,
  eventId: `event:fulfillment-sale-${sequence}`,
  topologyRevision: 1,
  fulfillment: {
    id: `fulfillment-sale-${sequence}`,
    saleId: `sale-${sequence}`,
    channel: 'PRINT_ONLY',
    routeState: 'ROUTED',
    deliveryState: 'PENDING',
    topologySnapshotId: 'snap-1',
    topologyRevision: 1,
    linesPayload: JSON.stringify([
      { lineId: `line-${sequence}`, productId: 'prod-1', quantity: 1 },
    ]),
  },
  ...overrides,
});

describe('SyncOutboxReplayService (db - Real PostgreSQL)', () => {
  const TEST_TIMEOUT_MS = 30000;

  it(
    'applies in-order fulfillment outbox events and records receipts in inventory_sync_receipts',
    async () => {
      await withIsolatedSchema(
        'outbox_replay_inorder',
        async ({ dataSource, queryRunner }) => {
          await new BohInventoryLedgerFoundation1766000000000().up(queryRunner);
          await new AddDeterministicSyncSequencing1780000000000().up(
            queryRunner,
          );

          const receiptRepo = dataSource.getRepository(InventorySyncReceipt);
          const outboxRepo = dataSource.getRepository(InventorySyncOutbox);
          const service = createService(dataSource, receiptRepo, outboxRepo);

          const record = buildFulfillmentRecord(1);
          const result = await service.syncBatch('tenant-1', [record]);

          expect(result).toMatchObject({
            received: 1,
            processed: 1,
            duplicates: 0,
            results: [
              expect.objectContaining({
                idempotencyKey: record.idempotencyKey,
                status: 'ACCEPTED',
                code: 'APPLIED',
                retryable: false,
              }),
            ],
          });

          const receipts = await receiptRepo.find({
            where: { tenant_id: 'tenant-1' },
          });
          expect(receipts).toHaveLength(1);
          expect(receipts[0]).toMatchObject({
            tenant_id: 'tenant-1',
            idempotency_key: record.idempotencyKey,
            source_device_id: 'pos-terminal-1',
            flow_type: 'fulfillment',
            source_sequence: '1',
            result_status: 'ACCEPTED',
            result_code: 'APPLIED',
          });
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'acknowledges duplicate reconnect replay safely without duplicate side-effects',
    async () => {
      await withIsolatedSchema(
        'outbox_replay_duplicate',
        async ({ dataSource, queryRunner }) => {
          await new BohInventoryLedgerFoundation1766000000000().up(queryRunner);
          await new AddDeterministicSyncSequencing1780000000000().up(
            queryRunner,
          );

          const receiptRepo = dataSource.getRepository(InventorySyncReceipt);
          const outboxRepo = dataSource.getRepository(InventorySyncOutbox);
          const service = createService(dataSource, receiptRepo, outboxRepo);

          const record = buildFulfillmentRecord(1);

          // First delivery: should be ACCEPTED
          const firstResult = await service.syncBatch('tenant-1', [record]);
          expect(firstResult.processed).toBe(1);
          expect(firstResult.duplicates).toBe(0);

          // Second delivery (reconnect replay with identical payload): must be acknowledged as DUPLICATE
          const replayResult = await service.syncBatch('tenant-1', [record]);
          expect(replayResult).toMatchObject({
            received: 1,
            processed: 0,
            duplicates: 1,
            results: [
              expect.objectContaining({
                idempotencyKey: record.idempotencyKey,
                status: 'DUPLICATE',
                code: 'DUPLICATE_REPLAY',
                retryable: false,
              }),
            ],
          });

          // Exactly one receipt persists; no duplicate effects
          await expect(
            receiptRepo.countBy({ tenant_id: 'tenant-1' }),
          ).resolves.toBe(1);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'acknowledges duplicate sequence replay with matching payload hash',
    async () => {
      await withIsolatedSchema(
        'outbox_seq_duplicate',
        async ({ dataSource, queryRunner }) => {
          await new BohInventoryLedgerFoundation1766000000000().up(queryRunner);
          await new AddDeterministicSyncSequencing1780000000000().up(
            queryRunner,
          );

          const receiptRepo = dataSource.getRepository(InventorySyncReceipt);
          const outboxRepo = dataSource.getRepository(InventorySyncOutbox);
          const service = createService(dataSource, receiptRepo, outboxRepo);

          const record = buildFulfillmentRecord(1);
          await service.syncBatch('tenant-1', [record]);

          // Same device + flow + sequence with a different key but same payload hash
          const seqReplayRecord = buildFulfillmentRecord(1, {
            idempotencyKey: 'outbox:tenant-1:alternate-key-seq-1',
          });

          const replayResult = await service.syncBatch('tenant-1', [
            seqReplayRecord,
          ]);
          expect(replayResult).toMatchObject({
            received: 1,
            processed: 0,
            duplicates: 1,
            results: [
              expect.objectContaining({
                idempotencyKey: 'outbox:tenant-1:alternate-key-seq-1',
                status: 'DUPLICATE',
                code: 'DUPLICATE_SEQUENCE_REPLAY',
                retryable: false,
              }),
            ],
          });
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'detects payload tampering on reconnect replay and returns CRITICAL_PAYLOAD_MISMATCH',
    async () => {
      await withIsolatedSchema(
        'outbox_tamper_detect',
        async ({ dataSource, queryRunner }) => {
          await new BohInventoryLedgerFoundation1766000000000().up(queryRunner);
          await new AddDeterministicSyncSequencing1780000000000().up(
            queryRunner,
          );

          const receiptRepo = dataSource.getRepository(InventorySyncReceipt);
          const outboxRepo = dataSource.getRepository(InventorySyncOutbox);
          const service = createService(dataSource, receiptRepo, outboxRepo);

          const record = buildFulfillmentRecord(1);
          await service.syncBatch('tenant-1', [record]);

          // Tampered replay: same idempotency key but modified fulfillment channel
          const tamperedRecord = buildFulfillmentRecord(1, {
            fulfillment: {
              ...record.fulfillment,
              channel: 'KDS_ONLY',
            },
          });

          const tamperedResult = await service.syncBatch('tenant-1', [
            tamperedRecord,
          ]);
          expect(tamperedResult).toMatchObject({
            received: 1,
            processed: 0,
            duplicates: 0,
            results: [
              expect.objectContaining({
                idempotencyKey: record.idempotencyKey,
                status: 'IDEMPOTENCY_MISMATCH',
                code: 'CRITICAL_PAYLOAD_MISMATCH',
                retryable: false,
              }),
            ],
          });
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'stages out-of-order records, handles duplicate staged replays safely, and drains in order on reconnect',
    async () => {
      await withIsolatedSchema(
        'outbox_stage_and_drain',
        async ({ dataSource, queryRunner }) => {
          await new BohInventoryLedgerFoundation1766000000000().up(queryRunner);
          await new AddDeterministicSyncSequencing1780000000000().up(
            queryRunner,
          );

          const receiptRepo = dataSource.getRepository(InventorySyncReceipt);
          const outboxRepo = dataSource.getRepository(InventorySyncOutbox);
          const service = createService(dataSource, receiptRepo, outboxRepo);

          const record3 = buildFulfillmentRecord(3);
          const record2 = buildFulfillmentRecord(2);
          const record1 = buildFulfillmentRecord(1);

          // Send sequence 3 first -> should be staged as STAGED_FUTURE
          const res3 = await service.syncBatch('tenant-1', [record3]);
          expect(res3.results).toEqual([
            expect.objectContaining({
              idempotencyKey: record3.idempotencyKey,
              status: 'STAGED_FUTURE',
              retryable: true,
            }),
          ]);

          // Reconnect replay of sequence 3 -> must be safely acknowledged without crash or unique violation
          const res3Replay = await service.syncBatch('tenant-1', [record3]);
          expect(res3Replay.results).toEqual([
            expect.objectContaining({
              idempotencyKey: record3.idempotencyKey,
              status: 'STAGED_FUTURE',
              retryable: true,
            }),
          ]);

          // Send sequence 2 -> should also be staged
          const res2 = await service.syncBatch('tenant-1', [record2]);
          expect(res2.results).toEqual([
            expect.objectContaining({
              idempotencyKey: record2.idempotencyKey,
              status: 'STAGED_FUTURE',
              retryable: true,
            }),
          ]);

          // Verify both 2 and 3 are staged in DB
          await expect(
            outboxRepo.countBy({ tenant_id: 'tenant-1' }),
          ).resolves.toBe(2);

          // Now sequence 1 arrives -> applies 1 and drains 2 and 3 in sequence!
          const res1 = await service.syncBatch('tenant-1', [record1]);
          expect(res1).toMatchObject({
            received: 1,
            processed: 3, // 1 + drained 2 + drained 3
            duplicates: 0,
          });

          // All 3 receipts exist in order
          const receipts = await receiptRepo.find({
            where: { tenant_id: 'tenant-1' },
            order: { source_sequence: 'ASC' },
          });
          expect(receipts).toHaveLength(3);
          expect(receipts.map((r) => r.source_sequence)).toEqual([
            '1',
            '2',
            '3',
          ]);

          // Outbox staging table is drained
          await expect(
            outboxRepo.countBy({ tenant_id: 'tenant-1' }),
          ).resolves.toBe(0);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'maintains tenant stream isolation and rejects cross-tenant interference under FORCE RLS',
    async () => {
      await withIsolatedSchema(
        'outbox_tenant_isolation',
        async ({ dataSource, queryRunner }) => {
          await new BohInventoryLedgerFoundation1766000000000().up(queryRunner);
          await new AddDeterministicSyncSequencing1780000000000().up(
            queryRunner,
          );

          const receiptRepo = dataSource.getRepository(InventorySyncReceipt);
          const outboxRepo = dataSource.getRepository(InventorySyncOutbox);
          const service = createService(dataSource, receiptRepo, outboxRepo);

          // Tenant A sends sequences 1 and 2
          await service.syncBatch('tenant-A', [
            buildFulfillmentRecord(1),
            buildFulfillmentRecord(2),
          ]);

          // Tenant B sends sequence 1 using the same sourceDeviceId
          const tenantBRecord = buildFulfillmentRecord(1, {
            idempotencyKey: 'outbox:tenant-B:fulfillment-1',
          });
          const tenantBResult = await service.syncBatch('tenant-B', [
            tenantBRecord,
          ]);

          expect(tenantBResult).toMatchObject({
            received: 1,
            processed: 1,
            duplicates: 0,
            results: [
              expect.objectContaining({
                idempotencyKey: 'outbox:tenant-B:fulfillment-1',
                status: 'ACCEPTED',
                code: 'APPLIED',
              }),
            ],
          });

          // Tenant A has 2 receipts, Tenant B has 1 receipt
          await expect(
            receiptRepo.countBy({ tenant_id: 'tenant-A' }),
          ).resolves.toBe(2);
          await expect(
            receiptRepo.countBy({ tenant_id: 'tenant-B' }),
          ).resolves.toBe(1);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
