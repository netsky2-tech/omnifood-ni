import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { BohInventoryLedgerFoundation1766000000000 } from './1766000000000-BohInventoryLedgerFoundation';
import { EnforceInventoryKardexImmutability1773000000000 } from './1773000000000-EnforceInventoryKardexImmutability';
import { SplitKardexSequenceNamespaceByFlow1809910000000 } from './1809910000000-SplitKardexSequenceNamespaceByFlow';

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for DB-backed migration tests`);
  }

  return value;
}

function readPostgresPort(): number {
  const value = process.env.DB_PORT?.trim() ?? '5432';
  const port = Number(value);

  if (!Number.isInteger(port)) {
    throw new Error(
      'DB_PORT must be a valid integer for DB-backed migration tests',
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

async function withIsolatedSchema(
  schemaPrefix: string,
  assertion: (queryRunner: QueryRunner) => Promise<void>,
): Promise<void> {
  const dataSource = new DataSource({
    type: 'postgres',
    ...postgresConnection,
  });

  const schema = `${schemaPrefix}_${randomUUID().replace(/-/g, '')}`;
  const queryRunner = dataSource.createQueryRunner();
  let isInitialized = false;

  try {
    await dataSource.initialize();
    isInitialized = true;
    await queryRunner.connect();
    await queryRunner.query(`CREATE SCHEMA "${schema}"`);
    await queryRunner.query(`SET search_path TO "${schema}"`);
    await queryRunner.query(`SET statement_timeout TO '15000ms'`);

    await assertion(queryRunner);
  } finally {
    try {
      await queryRunner.query('SET search_path TO public');
      await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } catch {
      // no-op: cleanup is best effort when bootstrap fails
    }

    try {
      await queryRunner.release();
    } catch {
      // no-op: query runner may not be connected on bootstrap errors
    }

    if (isInitialized) {
      await dataSource.destroy();
    }
  }
}

/**
 * Inserts one kardex row for `terminal-1` claiming device sequence 1.
 *
 * `sourceDocumentType` decides the flow the sequence belongs to: the sales flow
 * (SALE / SALE_CANCEL / CREDIT_NOTE) or the inventory flow (everything else).
 */
async function insertDeviceSequenceRow(
  queryRunner: QueryRunner,
  input: { sourceDocumentType: string; sourceDocumentId: string },
): Promise<void> {
  await queryRunner.query(
    `
      INSERT INTO inventory_kardex (
        tenant_id,
        insumo_id,
        movement_type,
        quantity,
        unit_cost_nio,
        total_cost_nio,
        stock_before,
        stock_after,
        source_document_type,
        source_document_id,
        source_device_id,
        source_sequence
      ) VALUES (
        'tenant-a',
        '00000000-0000-0000-0000-000000000001',
        'ADJUSTMENT',
        0.0000,
        10.0000,
        0.0000,
        0.0000,
        0.0000,
        $1,
        $2,
        'terminal-1',
        1
      )
    `,
    [input.sourceDocumentType, input.sourceDocumentId],
  );
}

describe('SplitKardexSequenceNamespaceByFlow1809910000000 (db)', () => {
  const TEST_TIMEOUT_MS = 30000;

  const buildSchema = async (queryRunner: QueryRunner): Promise<void> => {
    await new BohInventoryLedgerFoundation1766000000000().up(queryRunner);
    await new EnforceInventoryKardexImmutability1773000000000().up(queryRunner);
    await new SplitKardexSequenceNamespaceByFlow1809910000000().up(queryRunner);
  };

  it(
    'refuses the rollback instead of failing with a duplicate key once two flows share a device sequence',
    async () => {
      const migration = new SplitKardexSequenceNamespaceByFlow1809910000000();

      await withIsolatedSchema(
        'kardex_sequence_namespace_conflict',
        async (queryRunner) => {
          await buildSchema(queryRunner);

          // The wide key is what makes the change work, and it is also what the
          // narrow key cannot represent: one device sequence used by two flows.
          await insertDeviceSequenceRow(queryRunner, {
            sourceDocumentType: 'SALE',
            sourceDocumentId: 'invoice-1',
          });
          await insertDeviceSequenceRow(queryRunner, {
            sourceDocumentType: 'ADJUSTMENT',
            sourceDocumentId: 'count-session-1',
          });

          await expect(migration.down(queryRunner)).rejects.toThrow(
            'Cannot restore the pre-flow kardex sequence key',
          );
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'keeps the wide key in force when it refuses the rollback, so the ledger is left untouched',
    async () => {
      const migration = new SplitKardexSequenceNamespaceByFlow1809910000000();

      await withIsolatedSchema(
        'kardex_sequence_namespace_refused',
        async (queryRunner) => {
          await buildSchema(queryRunner);

          await insertDeviceSequenceRow(queryRunner, {
            sourceDocumentType: 'SALE',
            sourceDocumentId: 'invoice-1',
          });
          await insertDeviceSequenceRow(queryRunner, {
            sourceDocumentType: 'ADJUSTMENT',
            sourceDocumentId: 'count-session-1',
          });

          await expect(migration.down(queryRunner)).rejects.toThrow();

          // The refusal happens before the index is dropped, so an index is
          // still in force: a duplicate INSIDE one flow is still rejected
          // (SALE and SALE_CANCEL are both the sales flow). Without any index
          // this insert would succeed.
          await expect(
            insertDeviceSequenceRow(queryRunner, {
              sourceDocumentType: 'SALE_CANCEL',
              sourceDocumentId: 'invoice-2',
            }),
          ).rejects.toThrow(/duplicate key/);

          // And the pair that only the WIDE key allows still coexists: a narrow
          // key could not hold both rows, so the surviving index is the wide one.
          const rowsResult: unknown = await queryRunner.query(`
            SELECT source_document_type
            FROM inventory_kardex
            ORDER BY source_document_type
          `);

          expect(rowsResult).toEqual([
            { source_document_type: 'ADJUSTMENT' },
            { source_document_type: 'SALE' },
          ]);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'restores the pre-flow key when the data still satisfies it',
    async () => {
      const migration = new SplitKardexSequenceNamespaceByFlow1809910000000();

      await withIsolatedSchema(
        'kardex_sequence_namespace_clean',
        async (queryRunner) => {
          await buildSchema(queryRunner);

          await insertDeviceSequenceRow(queryRunner, {
            sourceDocumentType: 'SALE',
            sourceDocumentId: 'invoice-1',
          });

          await expect(migration.down(queryRunner)).resolves.toBeUndefined();

          // The narrow key is back, so a second flow can no longer reuse the
          // same device sequence: that is the old contract being enforced again.
          await expect(
            insertDeviceSequenceRow(queryRunner, {
              sourceDocumentType: 'ADJUSTMENT',
              sourceDocumentId: 'count-session-1',
            }),
          ).rejects.toThrow(/duplicate key/);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
