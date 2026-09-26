import { QueryResult, type QueryRunner } from 'typeorm';
import {
  PREVIOUS_TENANT_RLS_PREDICATE,
  TENANT_RLS_PREDICATE,
} from '../core/database/tenant-rls-policy';
import { EnforceUsersRls1809370000000 } from './1809370000000-EnforceUsersRls';

const TABLES = ['users'] as const;

const COMMANDS = ['select', 'insert', 'update', 'delete'] as const;

/**
 * The migration resolves the predicate through the shared type-aware
 * resolver, which reads the tenant_id column's type from information_schema
 * (the table name arrives as the first bound parameter). The stub answers
 * with the declared data_type per table; tables without an entry default to
 * `uuid`, the type 1759000000001-CreateBootstrapIdentityTables gives
 * users.tenant_id from birth (uuid NOT NULL, fk_users_tenant). The
 * predicate FORMS themselves are not re-spelled here: they are imported
 * from the policy helper, the single source of that vocabulary.
 */
describe('EnforceUsersRls1809370000000', () => {
  const migration = new EnforceUsersRls1809370000000();

  const collectSql = async (
    direction: 'up' | 'down' = 'up',
    tenantIdDataTypeByTable: Record<string, string> = {},
  ): Promise<{ sql: string; resolvedTables: string[] }> => {
    const queries: string[] = [];
    const resolvedTables: string[] = [];
    const queryRunner = {
      query: jest.fn(
        (sql: string, params?: unknown[]): Promise<QueryResult> => {
          if (sql.includes('information_schema.columns')) {
            const firstParam: unknown = params?.[0];
            const table = typeof firstParam === 'string' ? firstParam : '';
            resolvedTables.push(table);
            return Promise.resolve([
              {
                data_type: tenantIdDataTypeByTable[table] ?? 'uuid',
              },
            ]) as unknown as Promise<QueryResult>;
          }
          queries.push(sql);
          return Promise.resolve(new QueryResult());
        },
      ),
    } as unknown as QueryRunner;
    await migration[direction](queryRunner);
    return { sql: queries.join('\n'), resolvedTables };
  };

  describe('row level security enforcement', () => {
    it('enables row level security on users', async () => {
      const { sql } = await collectSql('up');

      expect(sql).toContain('ALTER TABLE "users" ENABLE ROW LEVEL SECURITY');
    });

    it('forces row level security on users', async () => {
      const { sql } = await collectSql('up');

      expect(sql).toContain('ALTER TABLE "users" FORCE ROW LEVEL SECURITY');
    });

    it('touches exactly the users table and no others', async () => {
      const { sql } = await collectSql('up');

      const alters = sql.match(/ALTER TABLE "[a-z_]+"/g) ?? [];
      expect([...new Set(alters)]).toEqual(['ALTER TABLE "users"']);
    });
  });

  describe('tenant isolation policies', () => {
    it('creates one policy per command using the project naming convention (4 policies total)', async () => {
      const { sql } = await collectSql('up');

      let createCount = 0;
      for (const table of TABLES) {
        for (const command of COMMANDS) {
          const policyName = `${table}_tenant_${command}`;
          expect(sql).toContain(`CREATE POLICY "${policyName}" ON "${table}"`);
          expect(sql).toContain(`FOR ${command.toUpperCase()}`);
          createCount +=
            sql.split(`CREATE POLICY "${policyName}" ON "${table}"`).length - 1;
        }
      }
      // 1 table x 4 commands = exactly 4 policies, no extras.
      expect(createCount).toBe(4);
    });

    it('resolves the predicate exactly once per table', async () => {
      const { resolvedTables } = await collectSql('up');

      expect(resolvedTables).toEqual([...TABLES]);
    });

    it('carries the resolved uuid-form predicate in every USING/WITH CHECK half', async () => {
      const { sql } = await collectSql('up');

      // 1 table x (select 1 + insert 1 + update 2 + delete 1) = 5 halves,
      // all carrying the single-source uuid predicate.
      expect(sql.split(TENANT_RLS_PREDICATE).length - 1).toBe(5);
      expect(sql).not.toContain(PREVIOUS_TENANT_RLS_PREDICATE);
      expect(sql).not.toContain('tenant_id::text');
    });

    it('resolves the predicate from the column type AS IT IS: a varchar column keeps the text form', async () => {
      const { sql } = await collectSql('up', {
        // Triangulation: pretend users.tenant_id still sits at the varchar
        // end of the rebind; the emitted predicate must stay valid for the
        // column as it is, not as the migration assumes it will be.
        users: 'character varying',
      });

      expect(sql.split(PREVIOUS_TENANT_RLS_PREDICATE).length - 1).toBe(5);
      expect(sql.split(TENANT_RLS_PREDICATE).length - 1).toBe(0);
    });

    it('places USING and WITH CHECK per command semantics', async () => {
      const { sql } = await collectSql('up');

      expect(sql).toContain(
        `CREATE POLICY "users_tenant_select" ON "users"\n      FOR SELECT\n      USING (${TENANT_RLS_PREDICATE})`,
      );
      expect(sql).toContain(
        `CREATE POLICY "users_tenant_insert" ON "users"\n      FOR INSERT\n      WITH CHECK (${TENANT_RLS_PREDICATE})`,
      );
      expect(sql).toContain(
        `CREATE POLICY "users_tenant_update" ON "users"\n      FOR UPDATE\n      USING (${TENANT_RLS_PREDICATE})\n      WITH CHECK (${TENANT_RLS_PREDICATE})`,
      );
      expect(sql).toContain(
        `CREATE POLICY "users_tenant_delete" ON "users"\n      FOR DELETE\n      USING (${TENANT_RLS_PREDICATE})`,
      );
    });
  });

  describe('idempotency', () => {
    it('drops each policy before creating it so up() is safe to re-run under a partial ledger', async () => {
      const { sql } = await collectSql('up');

      for (const table of TABLES) {
        for (const command of COMMANDS) {
          const policyName = `${table}_tenant_${command}`;
          const dropAt = sql.indexOf(
            `DROP POLICY IF EXISTS "${policyName}" ON "${table}"`,
          );
          const createAt = sql.indexOf(`CREATE POLICY "${policyName}"`);
          expect(dropAt).toBeGreaterThanOrEqual(0);
          expect(createAt).toBeGreaterThan(dropAt);
        }
      }
    });

    it('guards each CREATE POLICY on the catalog so a re-run cannot duplicate policies', async () => {
      const { sql } = await collectSql('up');

      for (const table of TABLES) {
        for (const command of COMMANDS) {
          expect(sql).toContain(`tablename = '${table}'`);
          expect(sql).toContain(`policyname = '${table}_tenant_${command}'`);
        }
      }
    });
  });

  describe('down migration safety', () => {
    it('drops exactly the policies it created', async () => {
      const { sql } = await collectSql('down');

      for (const command of COMMANDS) {
        expect(sql).toContain(
          `DROP POLICY IF EXISTS "users_tenant_${command}" ON "users"`,
        );
      }
      expect(sql).toContain('ALTER TABLE "users" NO FORCE ROW LEVEL SECURITY');
    });

    it('keeps row level security enabled and never disables it', async () => {
      const { sql } = await collectSql('down');

      expect(sql).not.toContain('DISABLE ROW LEVEL SECURITY');
    });

    it('never drops tables, truncates, or deletes rows', async () => {
      const { sql } = await collectSql('down');

      expect(sql).not.toMatch(/DROP TABLE/i);
      expect(sql).not.toMatch(/TRUNCATE/i);
      expect(sql).not.toMatch(/\bDELETE\b/i);
    });
  });
});
