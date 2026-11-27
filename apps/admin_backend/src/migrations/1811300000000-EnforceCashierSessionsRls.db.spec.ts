import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { EnforceCashierSessionsRls1811300000000 } from './1811300000000-EnforceCashierSessionsRls';

describe('EnforceCashierSessionsRls1811300000000 (#512 Real PG NOSUPERUSER NOBYPASSRLS)', () => {
  let ds: DataSource;

  beforeAll(async () => {
    ds = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST?.trim() || '127.0.0.1',
      port: Number(process.env.DB_PORT?.trim() || 5432),
      username: process.env.DB_USERNAME?.trim() || 'postgres',
      password: process.env.DB_PASSWORD?.trim() || 'postgres',
      database: process.env.DB_DATABASE?.trim() || 'omnifood',
      synchronize: false,
    });
    await ds.initialize();
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      await ds.destroy();
    }
  });

  it('adds and backfills tenant_id from users and enforces direct:SIUD under NOSUPERUSER NOBYPASSRLS', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const schema = `rls_cs_${suffix}`;
    const role = `rls_cs_role_${suffix}`;
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const userA = randomUUID();
    const userB = randomUUID();
    const qr = ds.createQueryRunner();
    await qr.connect();

    try {
      await qr.query(`CREATE SCHEMA "${schema}"`);
      await qr.query(`SET search_path TO "${schema}"`);
      await qr.query(`CREATE ROLE "${role}" NOSUPERUSER NOBYPASSRLS NOLOGIN`);
      await qr.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);

      await qr.query(`
        CREATE TABLE users (
          id uuid PRIMARY KEY,
          tenant_id uuid NOT NULL
        )
      `);
      await qr.query(
        `INSERT INTO users (id, tenant_id) VALUES ($1, $2), ($3, $4)`,
        [userA, tenantA, userB, tenantB],
      );

      await qr.query(`
        CREATE TABLE cashier_sessions (
          id varchar PRIMARY KEY,
          user_id varchar NOT NULL,
          terminal_id varchar NOT NULL,
          opened_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      // Pre-existing rows without tenant_id to verify backfill.
      await qr.query(
        `INSERT INTO cashier_sessions (id, user_id, terminal_id) VALUES ('cs-a', $1, 'TERM-A'), ('cs-b', $2, 'TERM-B')`,
        [userA, userB],
      );

      const migration = new EnforceCashierSessionsRls1811300000000();
      await migration.up(qr);
      // Idempotent double-run (scenario-2 replay).
      await migration.up(qr);

      await qr.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON cashier_sessions TO "${role}"`,
      );

      // Verify exact policy command set (SIUD).
      const policies = (await qr.query(
        `SELECT cmd FROM pg_policies WHERE schemaname = $1 AND tablename = 'cashier_sessions' ORDER BY cmd`,
        [schema],
      )) as Array<{ cmd: string }>;
      expect(policies.map((p) => p.cmd)).toEqual([
        'DELETE',
        'INSERT',
        'SELECT',
        'UPDATE',
      ]);

      // 1) Unbound connection sees 0 rows.
      const unboundQr = ds.createQueryRunner();
      await unboundQr.connect();
      try {
        await unboundQr.query(`SET search_path TO "${schema}"`);
        await unboundQr.query(`SET ROLE "${role}"`);
        const unbound = (await unboundQr.query(
          `SELECT id FROM cashier_sessions`,
        )) as Array<{ id: string }>;
        expect(unbound).toHaveLength(0);
      } finally {
        await unboundQr.query(`RESET ROLE`).catch(() => undefined);
        await unboundQr.release();
      }

      // 2) Bound as Tenant A under NOSUPERUSER NOBYPASSRLS.
      await qr.query(`SET ROLE "${role}"`);
      await qr.query(`SELECT set_config('app.tenant_id', $1, false)`, [
        tenantA,
      ]);

      const aRows = (await qr.query(
        `SELECT id, tenant_id FROM cashier_sessions`,
      )) as Array<{ id: string; tenant_id: string }>;
      expect(aRows).toEqual([{ id: 'cs-a', tenant_id: tenantA }]);

      // 3) Tenant A local CRUD succeeds.
      await qr.query(
        `INSERT INTO cashier_sessions (id, tenant_id, user_id, terminal_id) VALUES ('cs-a-2', $1, $2, 'TERM-A')`,
        [tenantA, userA],
      );
      await qr.query(
        `UPDATE cashier_sessions SET terminal_id = 'TERM-A2' WHERE id = 'cs-a-2'`,
      );
      await qr.query(`DELETE FROM cashier_sessions WHERE id = 'cs-a-2'`);

      // 4) Foreign insert fails closed.
      await expect(
        qr.query(
          `INSERT INTO cashier_sessions (id, tenant_id, user_id, terminal_id) VALUES ('cs-forged', $1, $2, 'TERM-B')`,
          [tenantB, userB],
        ),
      ).rejects.toThrow(/row-level security/i);

      // 5) Cross-tenant UPDATE and DELETE affect 0 rows.
      const crossUpdate = (await qr.query(
        `UPDATE cashier_sessions SET terminal_id = 'HACKED' WHERE id = 'cs-b' RETURNING id`,
      )) as [Array<{ id: string }>, number];
      expect(crossUpdate[1]).toBe(0);

      const crossDelete = (await qr.query(
        `DELETE FROM cashier_sessions WHERE id = 'cs-b' RETURNING id`,
      )) as [Array<{ id: string }>, number];
      expect(crossDelete[1]).toBe(0);

      await qr.query(`RESET ROLE`);
      await migration.down(qr);
    } finally {
      await qr.query(`RESET ROLE`).catch(() => undefined);
      await qr.query(`RESET app.tenant_id`).catch(() => undefined);
      await qr.query(`SET search_path TO public`).catch(() => undefined);
      await qr
        .query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
        .catch(() => undefined);
      await qr.query(`DROP ROLE IF EXISTS "${role}"`).catch(() => undefined);
      await qr.release();
    }
  });
});
