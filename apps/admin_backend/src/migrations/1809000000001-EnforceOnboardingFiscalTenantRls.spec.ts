import { QueryResult, type QueryRunner } from 'typeorm';
import { EnforceOnboardingFiscalTenantRls1809000000001 } from './1809000000001-EnforceOnboardingFiscalTenantRls';

const TABLES = [
  'onboarding_activation_attempts',
  'onboarding_activation_check_results',
  'onboarding_activation_follow_ups',
  'onboarding_telemetry_events',
  'fiscal_config_revisions',
] as const;

const COMMANDS = ['select', 'insert', 'update', 'delete'] as const;

// The two predicate forms the shared type-aware resolver can return: the
// text comparison casts the COLUMN (valid on varchar/text, required while
// these tenant_id columns are varchar), and the uuid form casts the SETTING
// (valid and index-friendly on a uuid column). A missing setting resolves to
// NULL and an empty setting never equals a real tenant_id, so both cases
// deny access instead of granting it.
const TEXT_TENANT_PREDICATE =
  "tenant_id::text = current_setting('app.tenant_id', true)";
const UUID_TENANT_PREDICATE =
  "tenant_id = current_setting('app.tenant_id', true)::uuid";

describe('EnforceOnboardingFiscalTenantRls1809000000001', () => {
  const migration = new EnforceOnboardingFiscalTenantRls1809000000001();

  // The migration resolves one predicate per table through the shared
  // type-aware resolver, which reads each tenant_id column type from
  // information_schema (the table name arrives as the first bound
  // parameter). The stub answers with the declared data_type per table;
  // tables without an entry default to `character varying`. A raw rows
  // array mirrors what PostgresQueryRunner.query returns at runtime.
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
                  tenantIdDataTypeByTable[table] ?? 'character varying',
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
    it('enables row level security on all five onboarding/fiscal tables', async () => {
      const { sql } = await collectSql('up');

      for (const table of TABLES) {
        expect(sql).toContain(
          `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
        );
      }
    });

    it('forces row level security on all five onboarding/fiscal tables', async () => {
      const { sql } = await collectSql('up');

      for (const table of TABLES) {
        expect(sql).toContain(
          `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`,
        );
      }
    });
  });

  describe('tenant isolation policies', () => {
    it('creates one policy per command for every table using the project naming convention', async () => {
      const { sql } = await collectSql('up');

      for (const table of TABLES) {
        for (const command of COMMANDS) {
          const policyName = `${table}_tenant_${command}`;
          expect(sql).toContain(`DROP POLICY IF EXISTS "${policyName}"`);
          expect(sql).toContain(`CREATE POLICY "${policyName}" ON "${table}"`);
          expect(sql).toContain(`FOR ${command.toUpperCase()}`);
        }
      }
    });

    it('emits the text predicate while every tenant_id column is varchar and never casts to uuid', async () => {
      const { sql } = await collectSql('up');

      expect(sql).toContain(TEXT_TENANT_PREDICATE);
      expect(sql).not.toContain('::uuid');
    });

    it('resolves the predicate exactly once per table, one independent resolution per table', async () => {
      const { resolvedTables } = await collectSql('up');

      // The resolver must be consulted once for EACH of the five tables, in
      // the loop's order — never once for the first table and reused for the
      // rest, which is the shared-predicate shape that broke tenant
      // isolation predicates before (Unit 0b guard gap).
      expect(resolvedTables).toEqual([...TABLES]);
    });

    it('carries each table its own resolved form: a uuid table gets the uuid predicate, varchar tables keep the text one', async () => {
      const { sql } = await collectSql('up', {
        onboarding_telemetry_events: 'uuid',
      });

      // The uuid table's four policies carry the uuid-cast form, in the
      // same policy shapes as the varchar run.
      expect(sql).toContain(
        `CREATE POLICY "onboarding_telemetry_events_tenant_select" ON "onboarding_telemetry_events"\n      FOR SELECT\n      USING (${UUID_TENANT_PREDICATE})`,
      );
      expect(sql).toContain(
        `CREATE POLICY "onboarding_telemetry_events_tenant_insert" ON "onboarding_telemetry_events"\n      FOR INSERT\n      WITH CHECK (${UUID_TENANT_PREDICATE})`,
      );
      expect(sql).toContain(
        `CREATE POLICY "onboarding_telemetry_events_tenant_update" ON "onboarding_telemetry_events"\n      FOR UPDATE\n      USING (${UUID_TENANT_PREDICATE})\n      WITH CHECK (${UUID_TENANT_PREDICATE})`,
      );
      expect(sql).toContain(
        `CREATE POLICY "onboarding_telemetry_events_tenant_delete" ON "onboarding_telemetry_events"\n      FOR DELETE\n      USING (${UUID_TENANT_PREDICATE})`,
      );

      // One table at uuid out of five: 5 uuid halves (1 select + 1 insert
      // + 2 update + 1 delete) and 20 text halves on the other tables.
      expect(sql.split(UUID_TENANT_PREDICATE).length - 1).toBe(5);
      expect(sql.split(TEXT_TENANT_PREDICATE).length - 1).toBe(20);

      // A varchar table must still carry the text form next to the uuid
      // table, proving the resolutions are independent, not shared.
      expect(sql).toContain(
        `CREATE POLICY "fiscal_config_revisions_tenant_select" ON "fiscal_config_revisions"\n      FOR SELECT\n      USING (${TEXT_TENANT_PREDICATE})`,
      );
    });

    it('emits the uuid predicate for every policy when every tenant_id column is uuid', async () => {
      const { sql } = await collectSql(
        'up',
        Object.fromEntries(TABLES.map((table) => [table, 'uuid'])),
      );

      // 5 tables x (select 1 + insert 1 + update 2 + delete 1) = 25 uuid
      // halves; a re-run after the slice rebinds the columns must emit this
      // form, and the text-cast form must be gone entirely.
      expect(sql.split(UUID_TENANT_PREDICATE).length - 1).toBe(25);
      expect(sql).not.toContain(TEXT_TENANT_PREDICATE);
      expect(sql).not.toContain('tenant_id::text');
    });

    it('issues the text predicate exactly once per policy expression on varchar columns (25 total)', async () => {
      const { sql } = await collectSql('up');

      // 5 tables x (select 1 + insert 1 + update 2 + delete 1) = 25
      expect(sql.split(TEXT_TENANT_PREDICATE).length - 1).toBe(25);
    });

    it('places USING and WITH CHECK per command semantics', async () => {
      const { sql } = await collectSql('up');

      for (const table of TABLES) {
        expect(sql).toContain(
          `CREATE POLICY "${table}_tenant_select" ON "${table}"\n      FOR SELECT\n      USING (${TEXT_TENANT_PREDICATE})`,
        );
        expect(sql).toContain(
          `CREATE POLICY "${table}_tenant_insert" ON "${table}"\n      FOR INSERT\n      WITH CHECK (${TEXT_TENANT_PREDICATE})`,
        );
        expect(sql).toContain(
          `CREATE POLICY "${table}_tenant_update" ON "${table}"\n      FOR UPDATE\n      USING (${TEXT_TENANT_PREDICATE})\n      WITH CHECK (${TEXT_TENANT_PREDICATE})`,
        );
        expect(sql).toContain(
          `CREATE POLICY "${table}_tenant_delete" ON "${table}"\n      FOR DELETE\n      USING (${TEXT_TENANT_PREDICATE})`,
        );
      }
    });
  });

  describe('idempotency', () => {
    it('drops each policy before creating it so up() is safe to re-run', async () => {
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
  });

  describe('down migration safety', () => {
    it('drops exactly the policies it created, for all five tables', async () => {
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
