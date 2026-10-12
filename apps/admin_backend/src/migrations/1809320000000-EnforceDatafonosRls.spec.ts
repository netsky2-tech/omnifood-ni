import { QueryResult, type QueryRunner } from 'typeorm';
import {
  PREVIOUS_TENANT_RLS_PREDICATE,
  TENANT_RLS_PREDICATE,
} from '../core/database/tenant-rls-policy';
import { EnforceDatafonosRls1809320000000 } from './1809320000000-EnforceDatafonosRls';

/**
 * The migration resolves the predicate through the shared type-aware
 * resolver, which reads the tenant_id column's type from information_schema
 * (the table name arrives as the first bound parameter). The stub answers
 * with the declared data_type per table; a table without an entry defaults
 * to `uuid` — the type `datafonos_equipos` carries today (born uuid in
 * 1759000000005-CreateBootstrapSalesTables). The predicate FORMS themselves
 * are not re-spelled here: they are imported from the policy helper, the
 * single source of that vocabulary.
 */
describe('EnforceDatafonosRls1809320000000', () => {
  const TABLES = ['datafonos_equipos'] as const;

  const migration = new EnforceDatafonosRls1809320000000();

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
    it('enables row level security on the target table', async () => {
      const { sql } = await collectSql('up');

      for (const table of TABLES) {
        expect(sql).toContain(
          `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
        );
      }
    });

    it('forces row level security on the target table', async () => {
      const { sql } = await collectSql('up');

      for (const table of TABLES) {
        expect(sql).toContain(
          `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`,
        );
      }
    });

    it('touches exactly the target table and no others', async () => {
      const { sql } = await collectSql('up');

      const alters = sql.match(/ALTER TABLE "[a-z_]+"/g) ?? [];
      expect([...new Set(alters)].sort()).toEqual([
        'ALTER TABLE "datafonos_equipos"',
      ]);
    });
  });

  describe('tenant isolation policies', () => {
    it('creates one policy per command using the project naming convention (4 policies total)', async () => {
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
      // 1 table x 4 commands = exactly 4 policies, no extras.
      expect(createCount).toBe(4);
    });

    it('resolves the predicate exactly once, for the target table', async () => {
      const { resolvedTables } = await collectSql('up');

      // One resolution per target table — never skipped, never shared with
      // any other table's column.
      expect(resolvedTables).toEqual(['datafonos_equipos']);
    });

    it('carries the resolved uuid-form predicate in every USING/WITH CHECK half (the column is uuid today)', async () => {
      const { sql } = await collectSql('up');

      // Per table: select 1 + insert 1 + update 2 + delete 1 = 5 halves, all
      // carrying the single-source uuid predicate.
      expect(sql.split(TENANT_RLS_PREDICATE).length - 1).toBe(5);
      expect(sql).not.toContain(PREVIOUS_TENANT_RLS_PREDICATE);
      expect(sql).not.toContain('tenant_id::text');
    });

    it('resolves the predicate against the column as it is: a table still on varchar keeps the text form', async () => {
      // Triangulation for the type-aware resolution: pretend the table still
      // sits at the varchar end of a rebind. The migration must emit the
      // text form for THAT table, never assume the column is uuid.
      const { sql } = await collectSql('up', {
        datafonos_equipos: 'character varying',
      });

      // All 5 halves use the text form; the uuid form must not appear.
      expect(sql.split(PREVIOUS_TENANT_RLS_PREDICATE).length - 1).toBe(5);
      expect(sql.split(TENANT_RLS_PREDICATE).length - 1).toBe(0);
    });

    it('places USING and WITH CHECK per command semantics on the target table', async () => {
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
