import { QueryResult, type QueryRunner } from 'typeorm';
import {
  PREVIOUS_TENANT_RLS_PREDICATE,
  TENANT_RLS_PREDICATE,
} from '../core/database/tenant-rls-policy';
import { EnforceOnboardingSessionRls1809220000000 } from './1809220000000-EnforceOnboardingSessionRls';

const TABLES = ['onboarding_sessions', 'onboarding_idempotency_records'] as const;

const COMMANDS = ['select', 'insert', 'update', 'delete'] as const;

/**
 * The migration resolves one predicate per table through the shared
 * type-aware resolver, which reads each tenant_id column's type from
 * information_schema (the table name arrives as the first bound parameter).
 * The stub answers with the declared data_type per table; tables without an
 * entry default to `uuid`, the type migrations 1768000000000 + 1809080000000
 * leave behind on both target tables. The predicate FORMS themselves are not
 * re-spelled here: they are imported from the policy helper, the single
 * source of that vocabulary.
 */
describe('EnforceOnboardingSessionRls1809220000000', () => {
  const migration = new EnforceOnboardingSessionRls1809220000000();

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
                data_type:
                  tenantIdDataTypeByTable[table] ?? 'uuid',
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
    it('enables row level security on both onboarding session tables', async () => {
      const { sql } = await collectSql('up');

      for (const table of TABLES) {
        expect(sql).toContain(
          `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
        );
      }
    });

    it('forces row level security on both onboarding session tables', async () => {
      const { sql } = await collectSql('up');

      for (const table of TABLES) {
        expect(sql).toContain(
          `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`,
        );
      }
    });

    it('touches exactly the two target tables and no others', async () => {
      const { sql } = await collectSql('up');

      const alters = sql.match(/ALTER TABLE "[a-z_]+"/g) ?? [];
      expect([...new Set(alters)].sort()).toEqual([
        'ALTER TABLE "onboarding_idempotency_records"',
        'ALTER TABLE "onboarding_sessions"',
      ]);
    });
  });

  describe('tenant isolation policies', () => {
    it('creates one policy per command for every table using the project naming convention', async () => {
      const { sql } = await collectSql('up');

      for (const table of TABLES) {
        for (const command of COMMANDS) {
          const policyName = `${table}_tenant_${command}`;
          expect(sql).toContain(`CREATE POLICY "${policyName}" ON "${table}"`);
          expect(sql).toContain(`FOR ${command.toUpperCase()}`);
        }
      }
    });

    it('resolves the predicate exactly once per table, one independent resolution per table', async () => {
      const { resolvedTables } = await collectSql('up');

      // The resolver must be consulted once for EACH of the two tables, in
      // the loop's order — never once for the first table and reused for
      // the rest, which is the shared-predicate shape that broke tenant
      // isolation predicates before (Unit 0b guard gap).
      expect(resolvedTables).toEqual([...TABLES]);
    });

    it('carries the resolved uuid-form predicate in every USING/WITH CHECK half (both columns are uuid post-rebind)', async () => {
      const { sql } = await collectSql('up');

      // 2 tables x (select 1 + insert 1 + update 2 + delete 1) = 10 halves,
      // all carrying the single-source uuid predicate.
      expect(sql.split(TENANT_RLS_PREDICATE).length - 1).toBe(10);
      expect(sql).not.toContain(PREVIOUS_TENANT_RLS_PREDICATE);
      expect(sql).not.toContain('tenant_id::text');
    });

    it('resolves each table independently: a table still on varchar keeps the text form while the uuid table gets the uuid form', async () => {
      const { sql } = await collectSql('up', {
        onboarding_idempotency_records: 'character varying',
      });

      // idempotency_records on varchar: 5 text halves (select + insert +
      // update's USING and WITH CHECK + delete); onboarding_sessions on
      // uuid: 5 uuid halves — same shape, independent resolution.
      expect(sql.split(PREVIOUS_TENANT_RLS_PREDICATE).length - 1).toBe(5);
      expect(sql.split(TENANT_RLS_PREDICATE).length - 1).toBe(5);
    });

    it('places USING and WITH CHECK per command semantics', async () => {
      const { sql } = await collectSql('up');

      for (const table of TABLES) {
        expect(sql).toContain(
          `CREATE POLICY "${table}_tenant_select" ON "${table}"\n      FOR SELECT\n      USING (${TENANT_RLS_PREDICATE})`,
        );
        expect(sql).toContain(
          `CREATE POLICY "${table}_tenant_insert" ON "${table}"\n      FOR INSERT\n      WITH CHECK (${TENANT_RLS_PREDICATE})`,
        );
        expect(sql).toContain(
          `CREATE POLICY "${table}_tenant_update" ON "${table}"\n      FOR UPDATE\n      USING (${TENANT_RLS_PREDICATE})\n      WITH CHECK (${TENANT_RLS_PREDICATE})`,
        );
        expect(sql).toContain(
          `CREATE POLICY "${table}_tenant_delete" ON "${table}"\n      FOR DELETE\n      USING (${TENANT_RLS_PREDICATE})`,
        );
      }
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
    it('drops exactly the policies it created, for both tables', async () => {
      const { sql } = await collectSql('down');

      for (const table of TABLES) {
        for (const command of COMMANDS) {
          expect(sql).toContain(
            `DROP POLICY IF EXISTS "${table}_tenant_${command}" ON "${table}"`,
          );
        }
        expect(sql).toContain(
          `ALTER TABLE "${table}" NO FORCE ROW LEVEL SECURITY`,
        );
      }
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
