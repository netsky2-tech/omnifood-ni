import type { DataSource, QueryRunner } from 'typeorm';
import { resolveTenantRlsPredicate } from '../../src/core/database/tenant-rls-policy';

/**
 * RLS test-shape helpers (issue #470).
 *
 * A `synchronize: true` schema connected as the `postgres` superuser proves
 * nothing about row-level security: synchronize never emits `ENABLE`/`FORCE
 * ROW LEVEL SECURITY` or policies, and `rolbypassrls = true` ignores them
 * even if it did. These helpers give a real-DB suite the production shape:
 * the tenant column rebound to the migrated uuid type, FORCED row-level
 * security with the exact predicate `resolveTenantRlsPredicate` emits for
 * the migrations, and an app runtime role that is `NOSUPERUSER NOBYPASSRLS`
 * and does not own the tables.
 */

export type TenantRlsCommand = 'select' | 'insert';

/**
 * Applies FORCED row-level security to `table` using the same predicate
 * resolver the migrations run through, so the suite tests the policy shape
 * production actually has. The caller's connection must own the table (or
 * bypass RLS) to emit the DDL.
 */
export async function applyForcedTenantRls(
  runner: QueryRunner,
  schema: string,
  table: string,
  commands: ReadonlyArray<TenantRlsCommand>,
): Promise<void> {
  const qualified = `"${schema}"."${table}"`;
  await runner.query(`ALTER TABLE ${qualified} ENABLE ROW LEVEL SECURITY`);
  await runner.query(`ALTER TABLE ${qualified} FORCE ROW LEVEL SECURITY`);
  const predicate = await resolveTenantRlsPredicate(runner, table);
  for (const command of commands) {
    await runner.query(
      `CREATE POLICY ${table}_tenant_${command} ON ${qualified} FOR ${command.toUpperCase()} ` +
        (command === 'insert'
          ? `WITH CHECK (${predicate})`
          : `USING (${predicate})`),
    );
  }
}

/**
 * Rebinds `table.tenant_id` to the migrated uuid type unless it already is
 * one, so `resolveTenantRlsPredicate` emits the uuid-cast production
 * predicate (`tenant_id = current_setting('app.tenant_id', true)::uuid`)
 * instead of the pre-#286 text-compare form. Entities declare `tenant_id`
 * as an untyped string column, so a `synchronize: true` schema needs this
 * to match what migration 1768000000000 + 1809140000000 leave behind.
 */
export async function rebindTenantColumnToUuid(
  runner: QueryRunner,
  schema: string,
  table: string,
): Promise<void> {
  const observed = (await runner.query(
    `SELECT data_type FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 AND column_name = 'tenant_id'`,
    [schema, table],
  )) as Array<{ data_type: string }>;
  const dataType = observed[0]?.data_type;
  if (dataType && dataType !== 'uuid') {
    await runner.query(
      `ALTER TABLE "${schema}"."${table}" ALTER COLUMN tenant_id TYPE uuid USING tenant_id::uuid`,
    );
  }
}

export interface RlsTestRoleOptions {
  /** Admin (superuser) connection used only to emit the role and grants. */
  readonly bootstrap: DataSource;
  readonly roleName: string;
  readonly password: string;
  readonly schema: string;
  /** Tables the restricted role may SELECT; nothing more is granted. */
  readonly tables: ReadonlyArray<string>;
}

/**
 * Creates a `NOSUPERUSER NOBYPASSRLS` login role that owns nothing, grants it
 * USAGE on the isolated schema plus SELECT on exactly the named tables, and
 * pins its search_path to that schema. This is the role the application
 * DataSource connects as, so every read in the suite is subject to RLS.
 */
export async function createRlsTestRole({
  bootstrap,
  roleName,
  password,
  schema,
  tables,
}: RlsTestRoleOptions): Promise<void> {
  await bootstrap.query(
    `CREATE ROLE "${roleName}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${password}'`,
  );
  await bootstrap.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${roleName}"`);
  const qualified = tables.map((table) => `"${schema}"."${table}"`).join(',\n');
  await bootstrap.query(`GRANT SELECT ON ${qualified} TO "${roleName}"`);
  await bootstrap.query(
    `ALTER ROLE "${roleName}" SET search_path TO "${schema}", public`,
  );
}

export async function dropRlsTestRole(
  bootstrap: DataSource,
  roleName: string,
): Promise<void> {
  await bootstrap.query(`DROP ROLE IF EXISTS "${roleName}"`);
}
