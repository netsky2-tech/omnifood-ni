import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AddTenantCapabilityEvent1785000000000 } from './1785000000000-AddTenantCapabilityEvent';

const connection = {
  type: 'postgres' as const,
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? '5432'),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_DATABASE ?? 'omnifood',
};
const insert = (revision: number, version = 'v3-jcs-rfc8785') =>
  `INSERT INTO tenant_capability_event (tenant_id, actor_user_id, previous_version, new_version, contract_version, reason, revision) VALUES ('tenant-a', 'owner-a', '${revision === 1 ? 'v2' : 'v3-jcs-rfc8785'}', '${version}', 1, 'activate', ${revision})`;

describe('AddTenantCapabilityEvent1785000000000 (db)', () => {
  it('commits tenant events before RLS reads, preserves fields and revisions, rejects mutations, and reapplies', async () => {
    const source = new DataSource(connection);
    await source.initialize();
    const runner = source.createQueryRunner();
    const schema = `capability_${randomUUID().replace(/-/g, '')}`;
    const role = `${schema}_role`;
    const migration = new AddTenantCapabilityEvent1785000000000();
    const tenant = async (id: string) => {
      await runner.startTransaction();
      await runner.query(`SET LOCAL ROLE "${role}"`);
      await runner.query("SELECT set_config('app.tenant_id', $1, true)", [id]);
    };
    try {
      await runner.connect();
      await runner.query(`CREATE SCHEMA "${schema}"`);
      await runner.query(`CREATE ROLE "${role}" NOLOGIN`);
      await runner.query(`SET search_path TO "${schema}"`);
      await migration.up(runner);
      await runner.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);
      await runner.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_capability_event TO "${role}"`,
      );
      await tenant('tenant-a');
      await runner.query(insert(1));
      await runner.commitTransaction();
      await tenant('tenant-b');
      expect(
        await runner.query('SELECT revision FROM tenant_capability_event'),
      ).toEqual([]);
      await runner.commitTransaction();
      await tenant('tenant-a');
      await runner.query(insert(2, 'v2'));
      expect(
        await runner.query(
          'SELECT actor_user_id, previous_version, new_version, contract_version, reason, revision, created_at FROM tenant_capability_event ORDER BY revision',
        ),
      ).toEqual([
        expect.objectContaining({
          actor_user_id: 'owner-a',
          previous_version: 'v2',
          new_version: 'v3-jcs-rfc8785',
          contract_version: 1,
          reason: 'activate',
          revision: 1,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          created_at: expect.any(Date),
        }),
        expect.objectContaining({
          previous_version: 'v3-jcs-rfc8785',
          new_version: 'v2',
          revision: 2,
        }),
      ]);
      await runner.commitTransaction();
      await expect(
        runner.query("UPDATE tenant_capability_event SET reason = 'tampered'"),
      ).rejects.toThrow(/append-only/);
      await expect(
        runner.query('DELETE FROM tenant_capability_event'),
      ).rejects.toThrow(/append-only/);
      await migration.down(runner);
      await migration.up(runner);
      expect(
        await runner.query(
          "SELECT to_regclass('tenant_capability_event') AS table_name",
        ),
      ).toEqual([{ table_name: 'tenant_capability_event' }]);
    } finally {
      try {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.query('RESET ROLE');
        await runner.query('SET search_path TO public');
        await runner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await runner.query(`DROP ROLE IF EXISTS "${role}"`);
      } finally {
        await runner.release();
        await source.destroy();
      }
    }
  }, 30000);
});
