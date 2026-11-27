import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { EnforceAuditLogsAndIntegrityAlertsRls1811200000000 } from './1811200000000-EnforceAuditLogsAndIntegrityAlertsRls';

describe('EnforceAuditLogsAndIntegrityAlertsRls1811200000000 (#512 Real PG NOSUPERUSER NOBYPASSRLS)', () => {
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

  it('enforces direct:SI on audit_logs and direct:SIU on audit_integrity_alerts under a NOSUPERUSER NOBYPASSRLS role', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const schema = `rls_audit_${suffix}`;
    const role = `rls_audit_role_${suffix}`;
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const qr = ds.createQueryRunner();
    await qr.connect();

    try {
      await qr.query(`CREATE SCHEMA "${schema}"`);
      await qr.query(`SET search_path TO "${schema}"`);
      await qr.query(`CREATE ROLE "${role}" NOSUPERUSER NOBYPASSRLS NOLOGIN`);
      await qr.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);

      await qr.query(`
        CREATE TABLE audit_logs (
          id uuid PRIMARY KEY,
          tenant_id uuid NOT NULL,
          action text NOT NULL
        )
      `);
      await qr.query(`
        CREATE TABLE audit_integrity_alerts (
          id uuid PRIMARY KEY,
          tenant_id uuid NOT NULL,
          signature text NOT NULL,
          last_seen_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      const migration = new EnforceAuditLogsAndIntegrityAlertsRls1811200000000();
      // Idempotent double-run (scenario-2 replay contract).
      await migration.up(qr);
      await migration.up(qr);

      await qr.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON audit_logs, audit_integrity_alerts TO "${role}"`,
      );

      // Seed rows for Tenant A and Tenant B under bound context.
      const logA = randomUUID();
      const logB = randomUUID();
      const alertA = randomUUID();
      const alertB = randomUUID();

      await qr.query(`SELECT set_config('app.tenant_id', $1, false)`, [tenantA]);
      await qr.query(
        `INSERT INTO audit_logs (id, tenant_id, action) VALUES ($1, $2, 'LOGIN')`,
        [logA, tenantA],
      );
      await qr.query(
        `INSERT INTO audit_integrity_alerts (id, tenant_id, signature) VALUES ($1, $2, 'sig-a')`,
        [alertA, tenantA],
      );

      await qr.query(`SELECT set_config('app.tenant_id', $1, false)`, [tenantB]);
      await qr.query(
        `INSERT INTO audit_logs (id, tenant_id, action) VALUES ($1, $2, 'LOGIN')`,
        [logB, tenantB],
      );
      await qr.query(
        `INSERT INTO audit_integrity_alerts (id, tenant_id, signature) VALUES ($1, $2, 'sig-b')`,
        [alertB, tenantB],
      );

      // Verify exact policy command sets in pg_policies.
      const policies = (await qr.query(
        `SELECT tablename, cmd FROM pg_policies WHERE schemaname = $1 ORDER BY tablename, cmd`,
        [schema],
      )) as Array<{ tablename: string; cmd: string }>;
      expect(policies).toEqual([
        { tablename: 'audit_integrity_alerts', cmd: 'INSERT' },
        { tablename: 'audit_integrity_alerts', cmd: 'SELECT' },
        { tablename: 'audit_integrity_alerts', cmd: 'UPDATE' },
        { tablename: 'audit_logs', cmd: 'INSERT' },
        { tablename: 'audit_logs', cmd: 'SELECT' },
      ]);

      // Switch to table-non-owner NOSUPERUSER NOBYPASSRLS role.
      await qr.query(`SET ROLE "${role}"`);

      // 1) Truly unbound connection (fresh session, no app.tenant_id set) sees zero rows on both tables.
      const unboundQr = ds.createQueryRunner();
      await unboundQr.connect();
      try {
        await unboundQr.query(`SET search_path TO "${schema}"`);
        await unboundQr.query(`SET ROLE "${role}"`);
        const unboundLogs = (await unboundQr.query(
          `SELECT id FROM audit_logs`,
        )) as Array<{ id: string }>;
        const unboundAlerts = (await unboundQr.query(
          `SELECT id FROM audit_integrity_alerts`,
        )) as Array<{ id: string }>;
        expect(unboundLogs).toHaveLength(0);
        expect(unboundAlerts).toHaveLength(0);
      } finally {
        await unboundQr.query(`RESET ROLE`).catch(() => undefined);
        await unboundQr.release();
      }

      // 2) Bound to Tenant A: sees only Tenant A rows.
      await qr.query(`SELECT set_config('app.tenant_id', $1, false)`, [tenantA]);
      const aLogs = (await qr.query(`SELECT id FROM audit_logs`)) as Array<{
        id: string;
      }>;
      const aAlerts = (await qr.query(
        `SELECT id FROM audit_integrity_alerts`,
      )) as Array<{ id: string }>;
      expect(aLogs.map((r) => r.id)).toEqual([logA]);
      expect(aAlerts.map((r) => r.id)).toEqual([alertA]);

      // 3) Tenant A can insert own audit_log and update own alert.
      await qr.query(
        `INSERT INTO audit_logs (id, tenant_id, action) VALUES ($1, $2, 'SYNC')`,
        [randomUUID(), tenantA],
      );
      await qr.query(
        `UPDATE audit_integrity_alerts SET signature = 'sig-a-2' WHERE id = $1`,
        [alertA],
      );

      // 4) Foreign inserts fail closed with RLS violation (42501).
      await expect(
        qr.query(
          `INSERT INTO audit_logs (id, tenant_id, action) VALUES ($1, $2, 'FORGED')`,
          [randomUUID(), tenantB],
        ),
      ).rejects.toThrow(/row-level security/i);
      await expect(
        qr.query(
          `INSERT INTO audit_integrity_alerts (id, tenant_id, signature) VALUES ($1, $2, 'forged')`,
          [randomUUID(), tenantB],
        ),
      ).rejects.toThrow(/row-level security/i);

      // 5) Cross-tenant UPDATE affects 0 rows; DELETE on both tables affects 0 rows (no DELETE policy).
      const crossUpdate = (await qr.query(
        `UPDATE audit_integrity_alerts SET signature = 'pwned' WHERE id = $1 RETURNING id`,
        [alertB],
      )) as [Array<{ id: string }>, number];
      expect(crossUpdate[0]).toHaveLength(0);
      expect(crossUpdate[1]).toBe(0);

      const deleteLogAttempt = (await qr.query(
        `DELETE FROM audit_logs WHERE id = $1 RETURNING id`,
        [logA],
      )) as [Array<{ id: string }>, number];
      expect(deleteLogAttempt[0]).toHaveLength(0);
      expect(deleteLogAttempt[1]).toBe(0);

      const deleteAlertAttempt = (await qr.query(
        `DELETE FROM audit_integrity_alerts WHERE id = $1 RETURNING id`,
        [alertA],
      )) as [Array<{ id: string }>, number];
      expect(deleteAlertAttempt[0]).toHaveLength(0);
      expect(deleteAlertAttempt[1]).toBe(0);

      await qr.query(`RESET ROLE`);
      await migration.down(qr);
    } finally {
      await qr.query(`RESET ROLE`).catch(() => undefined);
      await qr.query(`RESET app.tenant_id`).catch(() => undefined);
      await qr.query(`SET search_path TO public`).catch(() => undefined);
      await qr.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
      await qr.query(`DROP ROLE IF EXISTS "${role}"`).catch(() => undefined);
      await qr.release();
    }
  });
});
