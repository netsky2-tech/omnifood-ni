import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { ExplicitChangeLogActor1809170000000 } from './1809170000000-ExplicitChangeLogActor';

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
 * Builds a change_log table inside an isolated scratch schema and hands the
 * schema's query runner to the assertion. The table mirrors
 * CreateChangeLogTable1794000000000's shape (without the tenants FK, which is
 * not what this migration changes); `uuidUserId` selects between the
 * migration-built shape (UUID NOT NULL) and the synchronize-provisioned shape
 * (VARCHAR NOT NULL) that issue #412 must converge.
 */
async function withChangeLogSchema(
  schemaPrefix: string,
  uuidUserId: boolean,
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
      CREATE TABLE change_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        user_id ${uuidUserId ? 'UUID NOT NULL' : 'VARCHAR NOT NULL'},
        action VARCHAR(64) NOT NULL,
        target_type VARCHAR(64) NOT NULL,
        target_id UUID NOT NULL,
        changes JSONB,
        user_email VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
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

interface ChangeLogRow {
  user_id: string | null;
  actor_ref: string | null;
  action: string;
}

const insertChangeLog = async (
  queryRunner: QueryRunner,
  values: { tenantId: string; userId: string | null; actorRef: string | null },
): Promise<void> => {
  // On a drifted database actor_ref does not exist yet, so the column is only
  // named when an actor_ref value is actually being written.
  await queryRunner.query(
    `INSERT INTO change_log (tenant_id, user_id${values.actorRef !== null ? ', actor_ref' : ''}, action, target_type, target_id)
     VALUES ($1, $2${values.actorRef !== null ? ', $3' : ''}, 'TEST_ACTION', 'TestTarget', $${values.actorRef !== null ? 4 : 3})`,
    values.actorRef !== null
      ? [values.tenantId, values.userId, values.actorRef, randomUUID()]
      : [values.tenantId, values.userId, randomUUID()],
  );
};

describe('ExplicitChangeLogActor1809170000000 — real PostgreSQL', () => {
  const migration = new ExplicitChangeLogActor1809170000000();

  it('the change_log_actor_exactly_one CHECK rejects both actors set and neither set', async () => {
    await withChangeLogSchema('cl_actor_check', true, async (queryRunner) => {
      await migration.up(queryRunner);

      const tenantId = randomUUID();

      // A row with exactly one actor is accepted.
      await insertChangeLog(queryRunner, {
        tenantId,
        userId: randomUUID(),
        actorRef: null,
      });
      await insertChangeLog(queryRunner, {
        tenantId,
        userId: null,
        actorRef: 'SYSTEM',
      });

      // Both set: rejected by the CHECK.
      await expect(
        insertChangeLog(queryRunner, {
          tenantId,
          userId: randomUUID(),
          actorRef: 'SYSTEM',
        }),
      ).rejects.toThrow(
        /violates check constraint "change_log_actor_exactly_one"/,
      );

      // Neither set: also rejected by the CHECK.
      await expect(
        insertChangeLog(queryRunner, {
          tenantId,
          userId: null,
          actorRef: null,
        }),
      ).rejects.toThrow(
        /violates check constraint "change_log_actor_exactly_one"/,
      );

      const constraint = (await queryRunner.query(
        `SELECT conname FROM pg_constraint WHERE conname = 'change_log_actor_exactly_one'`,
      )) as Array<{ conname: string }>;
      expect(constraint).toHaveLength(1);
    });
  });

  it('converges a drifted database: varchar user_id holding SYSTEM moves to actor_ref with user_id NULL', async () => {
    await withChangeLogSchema('cl_actor_drift', false, async (queryRunner) => {
      const tenantId = randomUUID();
      await insertChangeLog(queryRunner, {
        tenantId,
        userId: 'SYSTEM',
        actorRef: null,
      });

      // Before: the drifted row, impossible to declare with the entity's truth.
      const before = (await queryRunner.query(
        `SELECT user_id::text AS user_id, action FROM change_log`,
      )) as Array<{ user_id: string | null; action: string }>;
      expect(before).toEqual([{ user_id: 'SYSTEM', action: 'TEST_ACTION' }]);

      await migration.up(queryRunner);

      // After: actor identity preserved, user_id NULL, constraint satisfied.
      const after = (await queryRunner.query(
        `SELECT user_id::text AS user_id, actor_ref, action FROM change_log`,
      )) as ChangeLogRow[];
      expect(after).toEqual([
        { user_id: null, actor_ref: 'SYSTEM', action: 'TEST_ACTION' },
      ]);

      // The migrated table enforces exactly-one and accepts both actor shapes.
      await insertChangeLog(queryRunner, {
        tenantId,
        userId: randomUUID(),
        actorRef: null,
      });
      await expect(
        insertChangeLog(queryRunner, {
          tenantId,
          userId: randomUUID(),
          actorRef: 'SYSTEM',
        }),
      ).rejects.toThrow(
        /violates check constraint "change_log_actor_exactly_one"/,
      );

      // Re-application is a no-op on the converged database.
      await migration.up(queryRunner);
      const afterRerun = (await queryRunner.query(
        `SELECT user_id::text AS user_id, actor_ref, action FROM change_log`,
      )) as ChangeLogRow[];
      expect(afterRerun).toHaveLength(2);
      expect(afterRerun[0]).toEqual({
        user_id: null,
        actor_ref: 'SYSTEM',
        action: 'TEST_ACTION',
      });
    });
  });
});
