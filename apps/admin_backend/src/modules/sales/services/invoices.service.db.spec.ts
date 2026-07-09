import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner, type Repository } from 'typeorm';
import { BohInventoryLedgerFoundation1766000000000 } from '../../../migrations/1766000000000-BohInventoryLedgerFoundation';
import { AddDeterministicSyncSequencing1780000000000 } from '../../../migrations/1780000000000-AddDeterministicSyncSequencing';
import { InventorySyncOutbox } from '../../inventory/entities/inventory-sync-outbox.entity';
import { InventorySyncReceipt } from '../../inventory/entities/inventory-sync-receipt.entity';
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
      // no-op: cleanup is best effort when bootstrap fails
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
      // no-op: cleanup is best effort when bootstrap fails
    }
  }
}

function createService(
  dataSource: DataSource,
  receiptRepository: Repository<InventorySyncReceipt>,
  outboxRepository: Repository<InventorySyncOutbox>,
): InvoicesService {
  const unusedRepository = {} as never;
  const recipeService = { findActiveVersion: jest.fn() } as never;
  const bomExplosionService = { explodeRecipe: jest.fn() } as never;

  return new InvoicesService(
    dataSource,
    unusedRepository,
    unusedRepository,
    unusedRepository,
    unusedRepository,
    receiptRepository,
    outboxRepository,
    recipeService,
    bomExplosionService,
  );
}

describe('InvoicesService deterministic sync sequencing (db)', () => {
  const TEST_TIMEOUT_MS = 30000;

  it(
    'returns a per-record staged sequence mismatch when the real stream-sequence unique constraint has a different idempotency key',
    async () => {
      await withIsolatedSchema(
        'sync_staged_sequence_conflict',
        async ({ dataSource, queryRunner, schema }) => {
          await new BohInventoryLedgerFoundation1766000000000().up(queryRunner);
          await new AddDeterministicSyncSequencing1780000000000().up(
            queryRunner,
          );

          const receiptRepository =
            dataSource.getRepository(InventorySyncReceipt);
          const outboxRepository =
            dataSource.getRepository(InventorySyncOutbox);
          const service = createService(
            dataSource,
            receiptRepository,
            outboxRepository,
          );

          await outboxRepository.save(
            outboxRepository.create({
              tenant_id: 'tenant-db',
              idempotency_key: 'staged-original-key',
              source_device_id: 'terminal-1',
              flow_type: 'inventory',
              source_sequence: '3',
              document_type: 'PURCHASE',
              payload_hash: 'original-staged-payload-hash',
              payload: { idempotencyKey: 'staged-original-key' },
              status: 'STAGED_FUTURE',
              result_code: 'WAITING_FOR_SEQUENCE_1',
            }),
          );

          const indexes = await queryRunner.query(
            `
            SELECT indexdef
            FROM pg_indexes
            WHERE schemaname = $1
              AND tablename = 'inventory_sync_outbox'
              AND indexname = 'uq_inventory_sync_outbox_stream_sequence'
          `,
            [schema],
          );
          expect(indexes).toHaveLength(1);
          expect(String(indexes[0].indexdef)).toContain('UNIQUE INDEX');

          const result = await service.syncBatch('tenant-db', [
            {
              idempotencyKey: 'staged-conflicting-key',
              sourceDeviceId: 'terminal-1',
              sourceSequence: 3,
              flowType: 'inventory',
              documentType: 'PURCHASE',
              movements: [
                { insumoId: randomUUID(), quantity: 1, unitCostNio: 7 },
              ],
            },
          ]);

          expect(result).toMatchObject({
            received: 1,
            processed: 0,
            duplicates: 0,
            results: [
              {
                idempotencyKey: 'staged-conflicting-key',
                terminalId: 'terminal-1',
                flowType: 'inventory',
                sourceSequence: 3,
                status: 'IDEMPOTENCY_MISMATCH',
                retryable: false,
                code: 'CRITICAL_STAGED_SEQUENCE_PAYLOAD_MISMATCH',
              },
            ],
          });
          await expect(outboxRepository.count()).resolves.toBe(1);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
