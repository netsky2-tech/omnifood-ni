import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { CreateTenantTopologyRevisions1794000000000 } from './1794000000000-CreateTenantTopologyRevisions';
import { RepairTenantTopologyRevisions1808000000000 } from './1808000000000-RepairTenantTopologyRevisions';

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

interface IsolatedDatabaseContext {
  queryRunner: QueryRunner;
  schema: string;
  tenantRole: string;
}

async function withIsolatedSchema(
  schemaPrefix: string,
  assertion: (context: IsolatedDatabaseContext) => Promise<void>,
): Promise<void> {
  const dataSource = new DataSource({
    type: 'postgres',
    ...postgresConnection,
  });

  const suffix = randomUUID().replace(/-/g, '');
  const schema = `${schemaPrefix}_${suffix}`;
  const tenantRole = `${schemaPrefix}_role_${suffix}`;
  const queryRunner = dataSource.createQueryRunner();
  let isInitialized = false;

  try {
    await dataSource.initialize();
    isInitialized = true;
    await queryRunner.connect();
    await queryRunner.query(`CREATE SCHEMA "${schema}"`);
    await queryRunner.query(`CREATE ROLE "${tenantRole}" NOLOGIN`);
    await queryRunner.query(`SET search_path TO "${schema}", public`);
    await queryRunner.query(`SET statement_timeout TO '15000ms'`);

    await assertion({ queryRunner, schema, tenantRole });
  } finally {
    try {
      await queryRunner.query('RESET ROLE');
      await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } catch {
      // best-effort cleanup
    }
    try {
      await queryRunner.query(`DROP ROLE IF EXISTS "${tenantRole}"`);
    } catch {
      // best-effort cleanup
    }

    if (queryRunner.isReleased === false) {
      await queryRunner.release();
    }
    if (isInitialized && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

describe('RepairTenantTopologyRevisions1808000000000 (db)', () => {
  const repairMigration = new RepairTenantTopologyRevisions1808000000000();

  it('executes cleanly on empty schema, enforces RLS and immutability, and is idempotent on repeat run', async () => {
    await withIsolatedSchema(
      'mig_1808_empty',
      async ({ queryRunner, schema, tenantRole }) => {
        // 1. Initial run on empty schema
        await repairMigration.up(queryRunner);

        // Verify table exists
        const tableCheck = await queryRunner.query(
          `SELECT tablename FROM pg_tables WHERE schemaname = $1 AND tablename = 'tenant_topology_revisions'`,
          [schema],
        );
        expect(tableCheck).toHaveLength(1);

        // Grant permissions to tenantRole
        await queryRunner.query(`
        GRANT USAGE ON SCHEMA "${schema}" TO "${tenantRole}";
        GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_topology_revisions TO "${tenantRole}";
      `);

        // 2. Insert row under tenant-a using tenant session
        await queryRunner.query(`SET ROLE "${tenantRole}"`);
        await queryRunner.query(
          `SELECT set_config('app.tenant_id', 'tenant-a', false)`,
        );

        const revId = randomUUID();
        await queryRunner.query(
          `INSERT INTO tenant_topology_revisions (id, tenant_id, contract_version, revision, topology, hash)
         VALUES ($1, 'tenant-a', 1, 1, '{"devices": []}'::jsonb, 'hash-a-1')`,
          [revId],
        );

        // 3. RLS isolation: tenant-b cannot see tenant-a's revision
        await queryRunner.query(
          `SELECT set_config('app.tenant_id', 'tenant-b', false)`,
        );
        const tenantBRows = await queryRunner.query(
          `SELECT * FROM tenant_topology_revisions`,
        );
        expect(tenantBRows).toHaveLength(0);

        // Reset role back to postgres
        await queryRunner.query('RESET ROLE');

        // 4. Immutability verification: UPDATE and DELETE must fail via trigger
        await expect(
          queryRunner.query(
            `UPDATE tenant_topology_revisions SET hash = 'tampered' WHERE id = $1`,
            [revId],
          ),
        ).rejects.toThrow('tenant_topology_revisions is immutable');

        await expect(
          queryRunner.query(
            `DELETE FROM tenant_topology_revisions WHERE id = $1`,
            [revId],
          ),
        ).rejects.toThrow('tenant_topology_revisions is immutable');

        // 5. Idempotency run: running repairMigration.up() again must succeed without error
        await expect(repairMigration.up(queryRunner)).resolves.not.toThrow();

        // Verify existing row is untouched
        const adminRows = await queryRunner.query(
          `SELECT tenant_id, revision, hash FROM tenant_topology_revisions WHERE id = $1`,
          [revId],
        );
        expect(adminRows).toHaveLength(1);
        expect(adminRows[0]).toEqual({
          tenant_id: 'tenant-a',
          revision: 1,
          hash: 'hash-a-1',
        });

        // 6. Down migration safety: fails when revisions exist
        await expect(repairMigration.down(queryRunner)).rejects.toThrow(
          'down migration forbidden: tenant topology revisions exist',
        );
      },
    );
  });

  it('runs safely on a schema where historical CreateTenantTopologyRevisions was already applied', async () => {
    await withIsolatedSchema(
      'mig_1808_historical',
      async ({ queryRunner, schema }) => {
        // Historical migration runs first
        const historical = new CreateTenantTopologyRevisions1794000000000();
        await historical.up(queryRunner);

        // Insert pre-existing historical revision
        await queryRunner.query(
          `INSERT INTO tenant_topology_revisions (tenant_id, contract_version, revision, topology, hash)
         VALUES ('historical-tenant', 1, 1, '{"mode": "food_park"}'::jsonb, 'hist-hash')`,
        );

        // Now run our repair migration on top
        await expect(repairMigration.up(queryRunner)).resolves.not.toThrow();

        // Verify table and data remain intact
        const rows = await queryRunner.query(
          `SELECT tenant_id, revision, hash FROM tenant_topology_revisions WHERE tenant_id = 'historical-tenant'`,
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].hash).toBe('hist-hash');

        // Verify RLS is now forced and policies exist
        const rlsCheck = await queryRunner.query(
          `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'tenant_topology_revisions' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $1)`,
          [schema],
        );
        expect(rlsCheck[0]).toEqual({
          relrowsecurity: true,
          relforcerowsecurity: true,
        });

        const policies = await queryRunner.query(
          `SELECT policyname FROM pg_policies WHERE schemaname = $1 AND tablename = 'tenant_topology_revisions' ORDER BY policyname`,
          [schema],
        );
        const policyNames = policies.map(
          (p: { policyname: string }) => p.policyname,
        );
        expect(policyNames).toContain(
          'tenant_topology_revisions_tenant_insert',
        );
        expect(policyNames).toContain(
          'tenant_topology_revisions_tenant_select',
        );
      },
    );
  });
});
