import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { MakeAuditLogIdUuid1809190000000 } from './1809190000000-MakeAuditLogIdUuid';

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

/**
 * Builds an audit_logs table inside an isolated scratch schema, in the exact
 * shape `1793000000000-AlterAuditLogIdToUuid` leaves behind — varchar id with
 * the `gen_random_uuid()::varchar` default — plus the append-only trigger
 * `1764000000000-EnforceAuditLogImmutability` creates. Auxiliary columns the
 * migration does not touch are omitted.
 */
async function withAuditLogSchema(
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
    await queryRunner.query(`
      CREATE TABLE audit_logs (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
        tenant_id uuid NOT NULL,
        user_id uuid NOT NULL,
        action varchar NOT NULL,
        sequence_no integer NOT NULL DEFAULT 0,
        "timestamp" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION reject_audit_logs_mutation()
      RETURNS trigger
      AS $$
      BEGIN
        RAISE EXCEPTION 'audit_logs is append-only: UPDATE/DELETE are forbidden';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_audit_logs_immutable
      BEFORE UPDATE OR DELETE ON audit_logs
      FOR EACH ROW
      EXECUTE FUNCTION reject_audit_logs_mutation()
    `);

    await assertion(queryRunner);
  } finally {
    try {
      if (isInitialized) {
        await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      }
      if (queryRunner.isTransactionActive)
        await queryRunner.rollbackTransaction();
    } finally {
      if (isInitialized) await queryRunner.release();
      if (dataSource.isInitialized) await dataSource.destroy();
    }
  }
}

interface ColumnState {
  dataType: string;
  columnDefault: string | null;
}

const readColumn = async (queryRunner: QueryRunner): Promise<ColumnState> => {
  const rows = (await queryRunner.query(
    `SELECT data_type AS "dataType", column_default AS "columnDefault"
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'audit_logs'
        AND column_name = 'id'`,
  )) as ColumnState[];

  return rows[0];
};

describe('MakeAuditLogIdUuid1809190000000 — real PostgreSQL', () => {
  const migration = new MakeAuditLogIdUuid1809190000000();

  it('the column rewrite succeeds with trg_audit_logs_immutable present, and the trigger still rejects UPDATE afterwards', async () => {
    await withAuditLogSchema('al_uuid_trigger', async (queryRunner) => {
      // Rows exist before the conversion: the rewrite must carry them.
      const tenantId = randomUUID();
      const userId = randomUUID();
      for (let i = 0; i < 3; i += 1) {
        await queryRunner.query(
          `INSERT INTO audit_logs (tenant_id, user_id, action) VALUES ($1, $2, 'TEST_ACTION')`,
          [tenantId, userId],
        );
      }

      await migration.up(queryRunner);

      // Every pre-existing row survived the rewrite with its id intact.
      const ids = (await queryRunner.query(
        `SELECT id::text AS id, action FROM audit_logs ORDER BY id`,
      )) as Array<{ id: string; action: string }>;
      expect(ids).toHaveLength(3);
      for (const row of ids) {
        expect(row.id).toMatch(
          /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/,
        );
        expect(row.action).toBe('TEST_ACTION');
      }

      // The trigger was neither dropped nor defeated by the conversion.
      const trigger = (await queryRunner.query(
        `SELECT tgname FROM pg_trigger
          WHERE tgrelid = 'audit_logs'::regclass AND tgname = 'trg_audit_logs_immutable'`,
      )) as Array<{ tgname: string }>;
      expect(trigger).toHaveLength(1);

      // A manual UPDATE is still rejected by the append-only trigger.
      await expect(
        queryRunner.query(`UPDATE audit_logs SET action = 'REWRITTEN'`),
      ).rejects.toThrow(
        /audit_logs is append-only: UPDATE\/DELETE are forbidden/,
      );

      // And so is a DELETE.
      await expect(queryRunner.query(`DELETE FROM audit_logs`)).rejects.toThrow(
        /audit_logs is append-only: UPDATE\/DELETE are forbidden/,
      );
    });
  });

  it('fails closed on a legacy numeric-string id, naming it, and converts nothing', async () => {
    await withAuditLogSchema('al_uuid_guard', async (queryRunner) => {
      await queryRunner.query(
        `INSERT INTO audit_logs (id, tenant_id, user_id, action) VALUES ('1', $1, $2, 'LEGACY_ACTION')`,
        [randomUUID(), randomUUID()],
      );

      await expect(migration.up(queryRunner)).rejects.toThrow(
        /AUDIT_LOG_ID_NOT_A_UUID/,
      );
      await expect(migration.up(queryRunner)).rejects.toThrow(
        /'1' \(1 row\(s\)\)/,
      );
      await expect(migration.up(queryRunner)).rejects.toThrow(/append-only/);

      // The legacy row is untouched and the column is still varchar.
      const rows = (await queryRunner.query(
        `SELECT id::text AS id, action FROM audit_logs`,
      )) as Array<{ id: string; action: string }>;
      expect(rows).toEqual([{ id: '1', action: 'LEGACY_ACTION' }]);
      expect((await readColumn(queryRunner)).dataType).toBe(
        'character varying',
      );
    });
  });

  it('converts an empty varchar column to uuid with a cast-free default, and inserts without an id receive a uuid', async () => {
    await withAuditLogSchema('al_uuid_happy', async (queryRunner) => {
      await migration.up(queryRunner);

      const column = await readColumn(queryRunner);
      expect(column.dataType).toBe('uuid');
      expect(column.columnDefault).toBe('gen_random_uuid()');

      const inserted = (await queryRunner.query(
        `INSERT INTO audit_logs (tenant_id, user_id, action) VALUES ($1, $2, 'TEST_ACTION') RETURNING id::text AS id`,
        [randomUUID(), randomUUID()],
      )) as Array<{ id: string }>;
      expect(inserted[0].id).toMatch(
        /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/,
      );
    });
  });

  it('is idempotent: re-running up() leaves the converged shape untouched', async () => {
    await withAuditLogSchema('al_uuid_idem', async (queryRunner) => {
      await queryRunner.query(
        `INSERT INTO audit_logs (tenant_id, user_id, action) VALUES ($1, $2, 'TEST_ACTION')`,
        [randomUUID(), randomUUID()],
      );

      await migration.up(queryRunner);
      await migration.up(queryRunner);

      const column = await readColumn(queryRunner);
      expect(column.dataType).toBe('uuid');
      expect(column.columnDefault).toBe('gen_random_uuid()');

      const rows = (await queryRunner.query(
        `SELECT count(*)::int AS count FROM audit_logs`,
      )) as Array<{ count: number }>;
      expect(rows[0].count).toBe(1);
    });
  });

  it('down() restores varchar with the ::varchar-cast default the misnamed migration left', async () => {
    await withAuditLogSchema('al_uuid_down', async (queryRunner) => {
      await queryRunner.query(
        `INSERT INTO audit_logs (tenant_id, user_id, action) VALUES ($1, $2, 'TEST_ACTION')`,
        [randomUUID(), randomUUID()],
      );

      await migration.up(queryRunner);
      await migration.down(queryRunner);

      const column = await readColumn(queryRunner);
      expect(column.dataType).toBe('character varying');
      // PostgreSQL normalizes the expression; the ::varchar cast is back.
      expect(column.columnDefault).toBe(
        '(gen_random_uuid())::character varying',
      );

      // The row survived the round trip and its id is still a uuid string.
      const rows = (await queryRunner.query(
        `SELECT id::text AS id FROM audit_logs`,
      )) as Array<{ id: string }>;
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toMatch(
        /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/,
      );
    });
  });
});
