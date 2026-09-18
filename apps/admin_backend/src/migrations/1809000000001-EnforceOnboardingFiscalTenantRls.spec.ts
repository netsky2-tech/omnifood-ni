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

// Text comparison against the transaction-local tenant setting: these
// tenant_id columns are varchar(128), so no uuid cast is allowed. A missing
// setting resolves to NULL and an empty setting never equals a real tenant_id,
// so both cases deny access instead of granting it.
const TENANT_PREDICATE = "tenant_id = current_setting('app.tenant_id', true)";

describe('EnforceOnboardingFiscalTenantRls1809000000001', () => {
  const migration = new EnforceOnboardingFiscalTenantRls1809000000001();

  const collectSql = async (
    direction: 'up' | 'down' = 'up',
  ): Promise<string> => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string): Promise<QueryResult> => {
        queries.push(sql);
        return Promise.resolve(new QueryResult());
      }),
    } as unknown as QueryRunner;
    await migration[direction](queryRunner);
    return queries.join('\n');
  };

  describe('row level security enforcement', () => {
    it('enables row level security on all five onboarding/fiscal tables', async () => {
      const sql = await collectSql('up');

      for (const table of TABLES) {
        expect(sql).toContain(
          `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
        );
      }
    });

    it('forces row level security on all five onboarding/fiscal tables', async () => {
      const sql = await collectSql('up');

      for (const table of TABLES) {
        expect(sql).toContain(
          `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`,
        );
      }
    });
  });

  describe('tenant isolation policies', () => {
    it('creates one policy per command for every table using the project naming convention', async () => {
      const sql = await collectSql('up');

      for (const table of TABLES) {
        for (const command of COMMANDS) {
          const policyName = `${table}_tenant_${command}`;
          expect(sql).toContain(`DROP POLICY IF EXISTS "${policyName}"`);
          expect(sql).toContain(`CREATE POLICY "${policyName}" ON "${table}"`);
          expect(sql).toContain(`FOR ${command.toUpperCase()}`);
        }
      }
    });

    it('uses the varchar-safe text predicate and never casts to uuid', async () => {
      const sql = await collectSql('up');

      expect(sql).toContain(TENANT_PREDICATE);
      expect(sql).not.toContain('::uuid');
    });

    it('issues the predicate exactly once per policy expression (25 total)', async () => {
      const sql = await collectSql('up');

      // 5 tables x (select 1 + insert 1 + update 2 + delete 1) = 25
      expect(sql.split(TENANT_PREDICATE).length - 1).toBe(25);
    });

    it('places USING and WITH CHECK per command semantics', async () => {
      const sql = await collectSql('up');

      for (const table of TABLES) {
        expect(sql).toContain(
          `CREATE POLICY "${table}_tenant_select" ON "${table}"\n      FOR SELECT\n      USING (${TENANT_PREDICATE})`,
        );
        expect(sql).toContain(
          `CREATE POLICY "${table}_tenant_insert" ON "${table}"\n      FOR INSERT\n      WITH CHECK (${TENANT_PREDICATE})`,
        );
        expect(sql).toContain(
          `CREATE POLICY "${table}_tenant_update" ON "${table}"\n      FOR UPDATE\n      USING (${TENANT_PREDICATE})\n      WITH CHECK (${TENANT_PREDICATE})`,
        );
        expect(sql).toContain(
          `CREATE POLICY "${table}_tenant_delete" ON "${table}"\n      FOR DELETE\n      USING (${TENANT_PREDICATE})`,
        );
      }
    });
  });

  describe('idempotency', () => {
    it('drops each policy before creating it so up() is safe to re-run', async () => {
      const sql = await collectSql('up');

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
      const sql = await collectSql('down');

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
      const sql = await collectSql('down');

      expect(sql).not.toContain('DISABLE ROW LEVEL SECURITY');
    });

    it('never drops tables, truncates, or deletes rows', async () => {
      const sql = await collectSql('down');

      expect(sql).not.toMatch(/DROP TABLE/i);
      expect(sql).not.toMatch(/TRUNCATE/i);
      expect(sql).not.toMatch(/\bDELETE\b/i);
    });
  });
});
