import { QueryResult, type QueryRunner } from 'typeorm';
import { EnforceParentOwnedRls1809330000000 } from './1809330000000-EnforceParentOwnedRls';

/**
 * Unit contract for the slice 9 migration (issue #512 T3 slice 9): the five
 * `parent-owned` child tables get ENABLE + FORCE RLS plus one policy per
 * command whose predicate WALKS THE PARENT FK — these tables have no
 * tenant_id column of their own, so the predicate cannot be the shared
 * `resolveTenantRlsPredicate` form used by every `direct` slice.
 *
 * The manifest entries STAY `parent-owned`: the coverage gate's only check
 * for the class is that the table has no tenant_id column
 * (src/core/database/tenant-rls-coverage.ts), and policies are additive and
 * gate-silent. These tests pin the migration's own vocabulary:
 *
 * - Exactly the five manifest tables, exactly four command policies each,
 *   named `{table}_tenant_{command}` per project convention.
 * - Every USING / WITH CHECK half embeds the per-table parent predicate —
 *   5 halves per table (select 1 + insert 1 + update 2 + delete 1) = 25 in
 *   total — and each predicate reads the PARENT's tenant_id with the
 *   uuid-cast setting form. The gate fails any forced-RLS policy expression
 *   without `app.tenant_id`, so a predicate forgotten on one half is CI-red.
 * - `invoice_item_modifiers` is the only TWO-HOP predicate (child -> parent
 *   invoice_items -> grandparent invoices); the other four are one-hop.
 * - No tenant-column resolution happens at all: the child tables have no
 *   tenant_id column, so the migration must never query
 *   information_schema.columns for one.
 * - Idempotency (DROP IF EXISTS + pg_policies catalog guard) and a down()
 *   that drops exactly the 20 policies and removes FORCE while keeping
 *   ENABLE, in exact reverse order.
 */

const TABLES = [
  'invoice_item_modifiers',
  'invoice_payments',
  'production_order_lines',
  'security_profiles',
  'shrinkage_details',
] as const;

const UUID_TENANT_SETTING = "current_setting('app.tenant_id', true)::uuid";

describe('EnforceParentOwnedRls1809330000000', () => {
  const migration = new EnforceParentOwnedRls1809330000000();

  const collectSql = async (
    direction: 'up' | 'down' = 'up',
  ): Promise<{ sql: string; informationSchemaLookups: string[] }> => {
    const queries: string[] = [];
    const informationSchemaLookups: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string): Promise<QueryResult> => {
        if (sql.includes('information_schema')) {
          informationSchemaLookups.push(sql);
        }
        queries.push(sql);
        return Promise.resolve(new QueryResult());
      }),
    } as unknown as QueryRunner;
    await migration[direction](queryRunner);
    return { sql: queries.join('\n'), informationSchemaLookups };
  };

  describe('row level security enforcement', () => {
    it('enables row level security on all five parent-owned tables', async () => {
      const { sql } = await collectSql('up');

      for (const table of TABLES) {
        expect(sql).toContain(
          `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
        );
      }
    });

    it('forces row level security on all five parent-owned tables', async () => {
      const { sql } = await collectSql('up');

      for (const table of TABLES) {
        expect(sql).toContain(
          `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`,
        );
      }
    });

    it('touches exactly the five manifest tables and no others', async () => {
      const { sql } = await collectSql('up');

      const alters = sql.match(/ALTER TABLE "[a-z_]+"/g) ?? [];
      expect([...new Set(alters)].sort()).toEqual(
        TABLES.map((table) => `ALTER TABLE "${table}"`).sort(),
      );
    });

    it('never resolves a tenant_id column: parent-owned tables have none', async () => {
      const { informationSchemaLookups } = await collectSql('up');

      // The direct-table slices resolve the predicate through
      // information_schema; these tables have no tenant_id column, so any
      // lookup here would be resolving a column that cannot exist.
      expect(informationSchemaLookups).toEqual([]);
    });
  });

  describe('tenant isolation policies', () => {
    it('creates one policy per command on every table using the project naming convention (20 policies total)', async () => {
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
      // 5 tables x 4 commands = exactly 20 policies, no extras.
      expect(createCount).toBe(20);
    });

    it('embeds the per-table parent predicate in every policy half (25 halves across 5 tables)', async () => {
      const { sql } = await collectSql('up');

      // Per table: select 1 + insert 1 + update 2 + delete 1 = 5 halves.
      // The parent predicates are exported constants, so each table's own
      // string must appear exactly 5 times and never on another table's
      // policy.
      for (const predicate of Object.values(
        EnforceParentOwnedRls1809330000000.PREDICATES,
      )) {
        expect(sql.split(predicate).length - 1).toBe(5);
      }
    });

    it('builds every predicate on the PARENT tenant_id with the uuid-cast setting form, never on a child column', async () => {
      const { sql } = await collectSql('up');

      // The gate's forced-RLS policy check demands app.tenant_id inside each
      // defined expression; here it must arrive via the parent walk.
      for (const predicate of Object.values(
        EnforceParentOwnedRls1809330000000.PREDICATES,
      )) {
        expect(predicate).toContain('EXISTS');
        expect(predicate).toContain(
          `tenant_id = ${UUID_TENANT_SETTING}`,
        );
        expect(predicate).toContain('app.tenant_id');
      }
      // The child tables carry no tenant_id column: a predicate comparing a
      // bare `tenant_id` (without a parent table qualifier) would be
      // referencing a non-existent column and fail at CREATE POLICY time.
      for (const predicate of Object.values(
        EnforceParentOwnedRls1809330000000.PREDICATES,
      )) {
        // Every tenant_id reference inside the predicate must be qualified by
        // its parent table (or the setting literal): the child tables carry
        // no tenant_id column, so an unqualified reference would point at a
        // non-existent column and fail at CREATE POLICY time.
        expect(predicate).not.toMatch(/(^|[^a-zA-Z0-9_.])tenant_id/);
      }
    });

    it('uses the two-hop grandparent predicate only for invoice_item_modifiers', async () => {
      const { sql } = await collectSql('up');

      // The two-hop shape: child -> invoice_items -> invoices.
      const twoHop =
        EnforceParentOwnedRls1809330000000.PREDICATES[
          'invoice_item_modifiers'
        ];
      expect(twoHop).toContain('FROM invoice_items');
      expect(twoHop).toContain('JOIN invoices i ON i.id = ii.invoice_id');
      expect(twoHop).toContain(
        'ii.id = invoice_item_modifiers.invoice_item_id',
      );
      expect(twoHop).toContain(
        `i.tenant_id = ${UUID_TENANT_SETTING}`,
      );

      // The other four predicates must be one-hop: a single parent table, no
      // JOIN, the FK compared directly to the child's foreign key column.
      for (const table of [
        'invoice_payments',
        'production_order_lines',
        'security_profiles',
        'shrinkage_details',
      ] as const) {
        const predicate = EnforceParentOwnedRls1809330000000.PREDICATES[table];
        expect(predicate).toContain('EXISTS');
        expect(predicate).not.toContain('JOIN');
      }
    });

    it('walks the correct parent table for each one-hop child', async () => {
      const { PREDICATES } = EnforceParentOwnedRls1809330000000;

      expect(PREDICATES.invoice_payments).toContain('FROM invoices');
      expect(PREDICATES.invoice_payments).toContain(
        'invoices.id = invoice_payments.invoice_id',
      );
      expect(PREDICATES.production_order_lines).toContain(
        'FROM production_orders',
      );
      expect(PREDICATES.production_order_lines).toContain(
        'production_orders.id = production_order_lines.production_order_id',
      );
      expect(PREDICATES.security_profiles).toContain('FROM users');
      expect(PREDICATES.security_profiles).toContain(
        'users.id = security_profiles.user_id',
      );
      expect(PREDICATES.shrinkage_details).toContain('FROM shrinkages');
      expect(PREDICATES.shrinkage_details).toContain(
        'shrinkages.id = shrinkage_details.shrinkage_id',
      );
    });

    it('places USING and WITH CHECK per command semantics on every table', async () => {
      const { sql } = await collectSql('up');

      for (const table of TABLES) {
        const predicate = EnforceParentOwnedRls1809330000000.PREDICATES[table];
        expect(sql).toContain(
          `CREATE POLICY "${table}_tenant_select" ON "${table}"`,
        );
        expect(sql).toMatch(
          new RegExp(
            `CREATE POLICY "${table}_tenant_select" ON "${table}"[\\s\\S]*?FOR SELECT[\\s\\S]*?USING \\(${escapeRegExp(predicate)}\\)`,
          ),
        );
        expect(sql).toMatch(
          new RegExp(
            `CREATE POLICY "${table}_tenant_insert" ON "${table}"[\\s\\S]*?FOR INSERT[\\s\\S]*?WITH CHECK \\(${escapeRegExp(predicate)}\\)`,
          ),
        );
        expect(sql).toMatch(
          new RegExp(
            `CREATE POLICY "${table}_tenant_update" ON "${table}"[\\s\\S]*?FOR UPDATE[\\s\\S]*?USING \\(${escapeRegExp(predicate)}\\)[\\s\\S]*?WITH CHECK \\(${escapeRegExp(predicate)}\\)`,
          ),
        );
        expect(sql).toMatch(
          new RegExp(
            `CREATE POLICY "${table}_tenant_delete" ON "${table}"[\\s\\S]*?FOR DELETE[\\s\\S]*?USING \\(${escapeRegExp(predicate)}\\)`,
          ),
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
    it('drops exactly the twenty policies it created', async () => {
      const { sql } = await collectSql('down');

      let dropCount = 0;
      for (const table of TABLES) {
        for (const command of ['select', 'insert', 'update', 'delete']) {
          const drop = `DROP POLICY IF EXISTS "${table}_tenant_${command}" ON "${table}"`;
          expect(sql).toContain(drop);
          dropCount += sql.split(drop).length - 1;
        }
      }
      expect(dropCount).toBe(20);
    });

    it('removes FORCE while keeping row level security enabled, for every table', async () => {
      const { sql } = await collectSql('down');

      for (const table of TABLES) {
        expect(sql).toContain(
          `ALTER TABLE "${table}" NO FORCE ROW LEVEL SECURITY`,
        );
      }
      expect(sql).not.toContain('DISABLE ROW LEVEL SECURITY');
    });

    it('reverses in exact reverse order: each NO FORCE comes after its table’s policy drops', async () => {
      const { sql } = await collectSql('down');

      let previousEnd = -1;
      for (const table of [...TABLES].reverse()) {
        const firstDrop = sql.indexOf(
          `DROP POLICY IF EXISTS "${table}_tenant_delete" ON "${table}"`,
        );
        const noForce = sql.indexOf(
          `ALTER TABLE "${table}" NO FORCE ROW LEVEL SECURITY`,
        );
        expect(firstDrop).toBeGreaterThan(previousEnd);
        expect(noForce).toBeGreaterThan(firstDrop);
        previousEnd = noForce;
      }
    });

    it('never drops tables, truncates, or deletes rows', async () => {
      const { sql } = await collectSql('down');

      expect(sql).not.toMatch(/DROP TABLE/i);
      expect(sql).not.toMatch(/TRUNCATE/i);
      expect(sql).not.toMatch(/\bDELETE\b/i);
    });
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
