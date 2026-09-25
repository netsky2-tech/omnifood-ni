import { QueryResult, type QueryRunner } from 'typeorm';
import {
  PREVIOUS_TENANT_RLS_PREDICATE,
  TENANT_RLS_PREDICATE,
} from '../core/database/tenant-rls-policy';
import { EnforcePromotionsRls1809300000000 } from './1809300000000-EnforcePromotionsRls';

/**
 * The migration resolves the predicate through the shared type-aware
 * resolver, which reads the tenant_id column's type from information_schema
 * (the table name arrives as the first bound parameter). The stub answers
 * with the declared data_type per table; a table without an entry defaults
 * to `uuid`, the type migration 1809140000000 leaves behind on the
 * promotions tenant_id column (RebindCatalogLoyaltyLegacyTenantColumns:84 —
 * the table was born varchar in 1790000000000 and was rebound to uuid, so
 * this migration is pure policy work). The predicate FORMS themselves are
 * not re-spelled here: they are imported from the policy helper, the single
 * source of that vocabulary.
 */
describe('EnforcePromotionsRls1809300000000', () => {
  const migration = new EnforcePromotionsRls1809300000000();

  const collectSql = async (
    direction: 'up' | 'down' = 'up',
    tenantIdDataType: string = 'uuid',
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
              { data_type: tenantIdDataType },
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
    it('enables row level security on the promotions table', async () => {
      const { sql } = await collectSql('up');

      expect(sql).toContain(
        `ALTER TABLE "promotions" ENABLE ROW LEVEL SECURITY`,
      );
    });

    it('forces row level security on the promotions table', async () => {
      const { sql } = await collectSql('up');

      expect(sql).toContain(
        `ALTER TABLE "promotions" FORCE ROW LEVEL SECURITY`,
      );
    });

    it('touches exactly the promotions table and no others', async () => {
      const { sql } = await collectSql('up');

      const alters = sql.match(/ALTER TABLE "[a-z_]+"/g) ?? [];
      expect([...new Set(alters)].sort()).toEqual(['ALTER TABLE "promotions"']);
    });
  });

  describe('tenant isolation policies', () => {
    it('creates one policy per command using the project naming convention (4 policies total)', async () => {
      const { sql } = await collectSql('up');

      let createCount = 0;
      for (const command of ['select', 'insert', 'update', 'delete']) {
        const policyName = `promotions_tenant_${command}`;
        expect(sql).toContain(`CREATE POLICY "${policyName}" ON "promotions"`);
        expect(sql).toContain(`FOR ${command.toUpperCase()}`);
        createCount +=
          sql.split(`CREATE POLICY "${policyName}" ON "promotions"`).length - 1;
      }
      // 1 table x 4 commands = exactly 4 policies, no extras.
      expect(createCount).toBe(4);
    });

    it('resolves the predicate exactly once, for the promotions table', async () => {
      const { resolvedTables } = await collectSql('up');

      // The resolver must be consulted exactly once for the single target
      // table — never skipped, never re-used across a table list that no
      // longer exists here.
      expect(resolvedTables).toEqual(['promotions']);
    });

    it('carries the resolved uuid-form predicate in every USING/WITH CHECK half (the column is uuid after the rebind)', async () => {
      const { sql } = await collectSql('up');

      // select 1 + insert 1 + update 2 + delete 1 = 5 halves, all carrying
      // the single-source uuid predicate.
      expect(sql.split(TENANT_RLS_PREDICATE).length - 1).toBe(5);
      expect(sql).not.toContain(PREVIOUS_TENANT_RLS_PREDICATE);
      expect(sql).not.toContain('tenant_id::text');
    });

    it('resolves the predicate against the column as it is: a table still on varchar keeps the text form', async () => {
      // Triangulation for the type-aware resolution: pretend promotions
      // still sits at the varchar end of the rebind. The migration must
      // emit the text form, never assume the column is uuid.
      const { sql } = await collectSql('up', 'character varying');

      expect(sql.split(PREVIOUS_TENANT_RLS_PREDICATE).length - 1).toBe(5);
      expect(sql.split(TENANT_RLS_PREDICATE).length - 1).toBe(0);
    });

    it('places USING and WITH CHECK per command semantics', async () => {
      const { sql } = await collectSql('up');

      expect(sql).toContain(
        `CREATE POLICY "promotions_tenant_select" ON "promotions"\n      FOR SELECT\n      USING (${TENANT_RLS_PREDICATE})`,
      );
      expect(sql).toContain(
        `CREATE POLICY "promotions_tenant_insert" ON "promotions"\n      FOR INSERT\n      WITH CHECK (${TENANT_RLS_PREDICATE})`,
      );
      expect(sql).toContain(
        `CREATE POLICY "promotions_tenant_update" ON "promotions"\n      FOR UPDATE\n      USING (${TENANT_RLS_PREDICATE})\n      WITH CHECK (${TENANT_RLS_PREDICATE})`,
      );
      expect(sql).toContain(
        `CREATE POLICY "promotions_tenant_delete" ON "promotions"\n      FOR DELETE\n      USING (${TENANT_RLS_PREDICATE})`,
      );
    });
  });

  describe('idempotency', () => {
    it('drops each policy before creating it so up() is safe to re-run under a partial ledger', async () => {
      const { sql } = await collectSql('up');

      for (const command of ['select', 'insert', 'update', 'delete']) {
        const policyName = `promotions_tenant_${command}`;
        const dropAt = sql.indexOf(
          `DROP POLICY IF EXISTS "${policyName}" ON "promotions"`,
        );
        const createAt = sql.indexOf(`CREATE POLICY "${policyName}"`);
        expect(dropAt).toBeGreaterThanOrEqual(0);
        expect(createAt).toBeGreaterThan(dropAt);
      }
    });

    it('guards each CREATE POLICY on the catalog so a re-run cannot duplicate policies', async () => {
      const { sql } = await collectSql('up');

      expect(sql).toContain(`tablename = 'promotions'`);
      for (const command of ['select', 'insert', 'update', 'delete']) {
        expect(sql).toContain(`policyname = 'promotions_tenant_${command}'`);
      }
    });
  });

  describe('down migration safety', () => {
    it('drops exactly the policies it created', async () => {
      const { sql } = await collectSql('down');

      for (const command of ['select', 'insert', 'update', 'delete']) {
        expect(sql).toContain(
          `DROP POLICY IF EXISTS "promotions_tenant_${command}" ON "promotions"`,
        );
      }
      expect(sql).toContain(
        `ALTER TABLE "promotions" NO FORCE ROW LEVEL SECURITY`,
      );
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
