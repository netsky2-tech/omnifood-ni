import { QueryResult, type QueryRunner } from 'typeorm';
import {
  PREVIOUS_TENANT_RLS_PREDICATE,
  TENANT_RLS_PREDICATE,
} from '../core/database/tenant-rls-policy';
import { EnforceChangeLogForensicRls1809310000000 } from './1809310000000-EnforceChangeLogForensicRls';

/**
 * The migration resolves the predicate through the shared type-aware
 * resolver, which reads the tenant_id column's type from information_schema
 * (the table name arrives as the first bound parameter). The stub answers
 * with the declared data_type per table; a table without an entry defaults
 * to `uuid` — the type both target tables carry today (change_log was born
 * uuid in 1794000000000-CreateChangeLogTable; forensic_alerts was rebound to
 * uuid by 1809130000000-RebindDeviceAndAlertTenantColumns). The predicate
 * FORMS themselves are not re-spelled here: they are imported from the
 * policy helper, the single source of that vocabulary.
 */
describe('EnforceChangeLogForensicRls1809310000000', () => {
  const TABLES = ['change_log', 'forensic_alerts'] as const;

  const migration = new EnforceChangeLogForensicRls1809310000000();

  const collectSql = async (
    direction: 'up' | 'down' = 'up',
    tenantIdDataTypes: Record<string, string> = {},
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
              { data_type: tenantIdDataTypes[table] ?? 'uuid' },
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
    it('enables row level security on both tables', async () => {
      const { sql } = await collectSql('up');

      for (const table of TABLES) {
        expect(sql).toContain(
          `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
        );
      }
    });

    it('forces row level security on both tables', async () => {
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
        'ALTER TABLE "change_log"',
        'ALTER TABLE "forensic_alerts"',
      ]);
    });
  });

  describe('tenant isolation policies', () => {
    it('creates one policy per command per table using the project naming convention (8 policies total)', async () => {
      const { sql } = await collectSql('up');

      let createCount = 0;
      for (const table of TABLES) {
        for (const command of ['select', 'insert', 'update', 'delete']) {
          const policyName = `${table}_tenant_${command}`;
          expect(sql).toContain(`CREATE POLICY "${policyName}" ON "${table}"`);
          expect(sql).toContain(`FOR ${command.toUpperCase()}`);
          createCount +=
            sql.split(`CREATE POLICY "${policyName}" ON "${table}"`).length -
            1;
        }
      }
      // 2 tables x 4 commands = exactly 8 policies, no extras.
      expect(createCount).toBe(8);
    });

    it('resolves the predicate exactly once per table, in table order', async () => {
      const { resolvedTables } = await collectSql('up');

      // One resolution per target table — never skipped, never one shared
      // predicate across tables: each tenant_id column can sit at a
      // different point of its own rebind history.
      expect(resolvedTables).toEqual(['change_log', 'forensic_alerts']);
    });

    it('carries the resolved uuid-form predicate in every USING/WITH CHECK half (both columns are uuid today)', async () => {
      const { sql } = await collectSql('up');

      // Per table: select 1 + insert 1 + update 2 + delete 1 = 5 halves;
      // 2 tables = 10 halves, all carrying the single-source uuid predicate.
      expect(sql.split(TENANT_RLS_PREDICATE).length - 1).toBe(10);
      expect(sql).not.toContain(PREVIOUS_TENANT_RLS_PREDICATE);
      expect(sql).not.toContain('tenant_id::text');
    });

    it('resolves the predicate against each column as it is: a table still on varchar keeps the text form', async () => {
      // Triangulation for the type-aware resolution: pretend one table still
      // sits at the varchar end of its rebind. The migration must emit the
      // text form for THAT table only, never assume both columns are uuid.
      const { sql } = await collectSql('up', {
        change_log: 'character varying',
      });

      // change_log's 5 halves use the text form; forensic_alerts' 5 keep
      // the uuid form.
      expect(sql.split(PREVIOUS_TENANT_RLS_PREDICATE).length - 1).toBe(5);
      expect(sql.split(TENANT_RLS_PREDICATE).length - 1).toBe(5);
    });

    it('places USING and WITH CHECK per command semantics on each table', async () => {
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
        for (const command of ['select', 'insert', 'update', 'delete']) {
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
        expect(sql).toContain(`tablename = '${table}'`);
        for (const command of ['select', 'insert', 'update', 'delete']) {
          expect(sql).toContain(`policyname = '${table}_tenant_${command}'`);
        }
      }
    });
  });

  describe('down migration safety', () => {
    it('drops exactly the policies it created', async () => {
      const { sql } = await collectSql('down');

      for (const table of TABLES) {
        for (const command of ['select', 'insert', 'update', 'delete']) {
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
