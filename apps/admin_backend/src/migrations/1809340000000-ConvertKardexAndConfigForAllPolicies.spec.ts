import { QueryResult, type QueryRunner } from 'typeorm';
import { TENANT_RLS_PREDICATE } from '../core/database/tenant-rls-policy';
import { ConvertKardexAndConfigForAllPolicies1809340000000 } from './1809340000000-ConvertKardexAndConfigForAllPolicies';

/**
 * Unit contract for the slice 10 migration (issue #512 T3): the three FOR ALL
 * tenant policies (founder decision) are split into per-command policies with
 * the SAME tenant predicate.
 *
 * The coverage ratchet (src/core/database/tenant-rls-coverage.ts) only accepts
 * declared command sets per `direct` table from this slice on, so a FOR ALL
 * policy left behind on one of these tables would be an undeclared command.
 * These tests pin the migration's own vocabulary:
 *
 * - Exactly the three manifest tables, dropping exactly the three original
 *   FOR ALL policies their owning migrations created.
 * - Per-command policy sets: kardex_correction SELECT+INSERT,
 *   sys_parametros_config SELECT+INSERT, kardex_recalculate_queue
 *   SELECT+INSERT+UPDATE, named `{table}_tenant_{command}` per the project
 *   convention, and NO FOR ALL policy emitted by up().
 * - Every policy half embeds the type-aware resolved predicate — a uuid
 *   tenant_id column yields the uuid-cast setting form, which the forced-RLS
 *   policy-expression gate and the predicate-form gate both demand.
 * - Per-command semantics: SELECT/UPDATE carry USING, INSERT carries WITH
 *   CHECK, UPDATE carries both.
 * - Idempotency (DROP IF EXISTS + pg_policies catalog guard) and a down()
 *   that drops exactly the 7 per-command policies and recreates the three
 *   original FOR ALL policies (USING + WITH CHECK) in exact reverse order.
 */

const UUID_COLUMN_ROW = [{ data_type: 'uuid', character_maximum_length: null }];

describe('ConvertKardexAndConfigForAllPolicies1809340000000', () => {
  const migration = new ConvertKardexAndConfigForAllPolicies1809340000000();

  const collectSql = async (
    direction: 'up' | 'down' = 'up',
  ): Promise<{ sql: string; informationSchemaLookups: string[] }> => {
    const queries: string[] = [];
    const informationSchemaLookups: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string): Promise<QueryResult | unknown[]> => {
        if (sql.includes('information_schema')) {
          informationSchemaLookups.push(sql);
          return Promise.resolve(UUID_COLUMN_ROW);
        }
        queries.push(sql);
        return Promise.resolve(new QueryResult());
      }),
    } as unknown as QueryRunner;
    await migration[direction](queryRunner);
    return { sql: queries.join('\n'), informationSchemaLookups };
  };

  describe('FOR ALL conversion', () => {
    it('drops exactly the three original FOR ALL policies', async () => {
      const { sql } = await collectSql('up');

      expect(sql).toContain(
        'DROP POLICY IF EXISTS "kardex_correction_tenant_isolation" ON "kardex_correction"',
      );
      expect(sql).toContain(
        'DROP POLICY IF EXISTS "sys_parametros_config_tenant_isolation" ON "sys_parametros_config"',
      );
      expect(sql).toContain(
        'DROP POLICY IF EXISTS "kardex_queue_tenant_isolation" ON "kardex_recalculate_queue"',
      );
    });

    it('never emits a FOR ALL policy from up()', async () => {
      const { sql } = await collectSql('up');

      expect(sql).not.toContain('FOR ALL');
    });

    it('touches exactly the three manifest tables and no others', async () => {
      const { sql } = await collectSql('up');

      const alters =
        sql.match(/DROP POLICY IF EXISTS "[a-z_]+" ON "[a-z_]+"/g) ?? [];
      const tables = [
        ...new Set(alters.map((drop) => drop.split(' ON ')[1])),
      ].sort();
      expect(tables).toEqual(
        [
          '"kardex_correction"',
          '"kardex_recalculate_queue"',
          '"sys_parametros_config"',
        ].sort(),
      );
    });
  });

  describe('per-command tenant policies', () => {
    it('creates one policy per declared command on every table using the project naming convention (7 policies total)', async () => {
      const { sql } = await collectSql('up');

      const expected: Array<[string, string]> = [
        ['kardex_correction', 'select'],
        ['kardex_correction', 'insert'],
        ['sys_parametros_config', 'select'],
        ['sys_parametros_config', 'insert'],
        ['kardex_recalculate_queue', 'select'],
        ['kardex_recalculate_queue', 'insert'],
        ['kardex_recalculate_queue', 'update'],
      ];
      for (const [table, command] of expected) {
        expect(sql).toContain(
          `CREATE POLICY "${table}_tenant_${command}" ON "${table}"`,
        );
      }

      const creates = sql.match(/CREATE POLICY /g) ?? [];
      expect(creates).toHaveLength(7);
    });

    it('places USING and WITH CHECK per command semantics on every table', async () => {
      const { sql } = await collectSql('up');

      expect(sql).toMatch(
        /CREATE POLICY "kardex_correction_tenant_select" ON "kardex_correction"[\s\S]*?FOR SELECT[\s\S]*?USING \(tenant_id = current_setting\('app\.tenant_id', true\)::uuid\)/,
      );
      expect(sql).toMatch(
        /CREATE POLICY "kardex_correction_tenant_insert" ON "kardex_correction"[\s\S]*?FOR INSERT[\s\S]*?WITH CHECK \(tenant_id = current_setting\('app\.tenant_id', true\)::uuid\)/,
      );
      expect(sql).toMatch(
        /CREATE POLICY "sys_parametros_config_tenant_select" ON "sys_parametros_config"[\s\S]*?FOR SELECT[\s\S]*?USING \(tenant_id = current_setting\('app\.tenant_id', true\)::uuid\)/,
      );
      expect(sql).toMatch(
        /CREATE POLICY "sys_parametros_config_tenant_insert" ON "sys_parametros_config"[\s\S]*?FOR INSERT[\s\S]*?WITH CHECK \(tenant_id = current_setting\('app\.tenant_id', true\)::uuid\)/,
      );
      expect(sql).toMatch(
        /CREATE POLICY "kardex_recalculate_queue_tenant_update" ON "kardex_recalculate_queue"[\s\S]*?FOR UPDATE[\s\S]*?USING \(tenant_id = current_setting\('app\.tenant_id', true\)::uuid\)[\s\S]*?WITH CHECK \(tenant_id = current_setting\('app\.tenant_id', true\)::uuid\)/,
      );
    });

    it('embeds the resolved uuid-cast predicate in every policy half (8 halves across 3 tables)', async () => {
      const { sql } = await collectSql('up');

      // Per table: select 1 + insert 1 (+ update 2 for the queue) halves.
      // kardex_correction: 2, sys_parametros_config: 2,
      // kardex_recalculate_queue: 4 -> 8 in total. The uuid-cast setting form
      // is what the resolved predicate yields on a uuid tenant_id column; the
      // gate's forced-RLS policy-expression check demands app.tenant_id inside
      // each defined expression, so a predicate forgotten on one half is
      // CI-red.
      expect(sql.split(TENANT_RLS_PREDICATE).length - 1).toBe(8);
    });

    it('resolves the predicate through the type-aware seam exactly once per table', async () => {
      const { informationSchemaLookups } = await collectSql('up');

      // One resolveTenantRlsPredicate call per table: a second lookup could
      // observe a different column state than the policies were built with.
      expect(informationSchemaLookups).toHaveLength(3);
      for (const lookup of informationSchemaLookups) {
        expect(lookup).toContain('information_schema.columns');
        expect(lookup).toContain('current_schema()');
      }
    });
  });

  describe('idempotency', () => {
    it('drops each policy before creating it so up() is safe to re-run under a partial ledger', async () => {
      const { sql } = await collectSql('up');

      for (const [table, command] of [
        ['kardex_correction', 'select'],
        ['kardex_correction', 'insert'],
        ['sys_parametros_config', 'select'],
        ['sys_parametros_config', 'insert'],
        ['kardex_recalculate_queue', 'select'],
        ['kardex_recalculate_queue', 'insert'],
        ['kardex_recalculate_queue', 'update'],
      ] as const) {
        const policyName = `${table}_tenant_${command}`;
        const dropAt = sql.indexOf(
          `DROP POLICY IF EXISTS "${policyName}" ON "${table}"`,
        );
        const createAt = sql.indexOf(`CREATE POLICY "${policyName}"`);
        expect(dropAt).toBeGreaterThanOrEqual(0);
        expect(createAt).toBeGreaterThan(dropAt);
      }
    });

    it('guards each CREATE POLICY on the catalog so a re-run cannot duplicate policies', async () => {
      const { sql } = await collectSql('up');

      for (const table of [
        'kardex_correction',
        'sys_parametros_config',
        'kardex_recalculate_queue',
      ]) {
        expect(sql).toContain(`tablename = '${table}'`);
      }
      for (const policyName of [
        'kardex_correction_tenant_select',
        'kardex_correction_tenant_insert',
        'sys_parametros_config_tenant_select',
        'sys_parametros_config_tenant_insert',
        'kardex_recalculate_queue_tenant_select',
        'kardex_recalculate_queue_tenant_insert',
        'kardex_recalculate_queue_tenant_update',
      ]) {
        expect(sql).toContain(`policyname = '${policyName}'`);
      }
    });
  });

  describe('down migration safety', () => {
    it('drops exactly the seven per-command policies it created', async () => {
      const { sql } = await collectSql('down');

      let dropCount = 0;
      for (const [table, command] of [
        ['kardex_correction', 'select'],
        ['kardex_correction', 'insert'],
        ['sys_parametros_config', 'select'],
        ['sys_parametros_config', 'insert'],
        ['kardex_recalculate_queue', 'select'],
        ['kardex_recalculate_queue', 'insert'],
        ['kardex_recalculate_queue', 'update'],
      ] as const) {
        const drop = `DROP POLICY IF EXISTS "${table}_tenant_${command}" ON "${table}"`;
        expect(sql).toContain(drop);
        dropCount += sql.split(drop).length - 1;
      }
      expect(dropCount).toBe(7);
    });

    it('recreates the three original FOR ALL policies with USING and WITH CHECK', async () => {
      const { sql } = await collectSql('down');

      expect(sql).toContain(
        'CREATE POLICY "kardex_correction_tenant_isolation" ON "kardex_correction"',
      );
      expect(sql).toContain(
        'CREATE POLICY "sys_parametros_config_tenant_isolation" ON "sys_parametros_config"',
      );
      expect(sql).toContain(
        'CREATE POLICY "kardex_queue_tenant_isolation" ON "kardex_recalculate_queue"',
      );

      // The recreated FOR ALL policy must be the exact original shape:
      // FOR ALL with both halves carrying the same resolved predicate.
      const forAllCreates = sql.match(/CREATE POLICY /g) ?? [];
      expect(forAllCreates).toHaveLength(3);
      expect((sql.match(/FOR ALL/g) ?? []).length).toBe(3);
      // 3 policies x 2 halves = 6 predicate occurrences.
      expect(sql.split(TENANT_RLS_PREDICATE).length - 1).toBe(6);
    });

    it('never emits a per-command CREATE POLICY from down()', async () => {
      const { sql } = await collectSql('down');

      // The per-command names appear only in the DROP statements; no
      // per-command policy may be recreated.
      for (const policyName of [
        'kardex_correction_tenant_select',
        'kardex_correction_tenant_insert',
        'sys_parametros_config_tenant_select',
        'sys_parametros_config_tenant_insert',
        'kardex_recalculate_queue_tenant_select',
        'kardex_recalculate_queue_tenant_insert',
        'kardex_recalculate_queue_tenant_update',
      ]) {
        expect(sql).not.toContain(`CREATE POLICY "${policyName}"`);
      }
      expect(sql).not.toContain('FOR SELECT');
      expect(sql).not.toContain('FOR INSERT');
      expect(sql).not.toContain('FOR UPDATE');
    });

    it('reverses in exact reverse order: the queue is restored first, kardex_correction last', async () => {
      const { sql } = await collectSql('down');

      // up() converts correction -> config -> queue, so down() must restore
      // in exactly the opposite order.
      const queueCreate = sql.indexOf(
        'CREATE POLICY "kardex_queue_tenant_isolation"',
      );
      const configCreate = sql.indexOf(
        'CREATE POLICY "sys_parametros_config_tenant_isolation"',
      );
      const correctionCreate = sql.indexOf(
        'CREATE POLICY "kardex_correction_tenant_isolation"',
      );
      expect(queueCreate).toBeGreaterThanOrEqual(0);
      expect(configCreate).toBeGreaterThan(queueCreate);
      expect(correctionCreate).toBeGreaterThan(configCreate);
    });

    it('never drops tables, truncates, or deletes rows', async () => {
      const { sql } = await collectSql('down');

      expect(sql).not.toMatch(/DROP TABLE/i);
      expect(sql).not.toMatch(/TRUNCATE/i);
      expect(sql).not.toMatch(/\bDELETE\b/i);
    });
  });
});
