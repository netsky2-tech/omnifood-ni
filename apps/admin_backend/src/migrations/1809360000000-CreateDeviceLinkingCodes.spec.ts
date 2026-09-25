import { QueryResult, type QueryRunner } from 'typeorm';
import { CreateDeviceLinkingCodes1809360000000 } from './1809360000000-CreateDeviceLinkingCodes';

/**
 * Unit contract for the pre-auth device linking codes migration (issue #556
 * stage 3): table shape, tenant FK, indexes, FORCE RLS with the four
 * per-command policies, and the narrow reviewed claim branch (founder
 * approval 2026-09-24) present ONLY in the SELECT USING and the UPDATE
 * USING/WITH CHECK halves. INSERT and DELETE keep the pure tenant predicate.
 */
describe('CreateDeviceLinkingCodes1809360000000', () => {
  const migration = new CreateDeviceLinkingCodes1809360000000();

  // The migration resolves the tenant predicate through the shared
  // type-aware resolver, which reads the table's tenant_id column type from
  // information_schema. The stub answers with the declared data_type; a raw
  // rows array mirrors what PostgresQueryRunner.query returns at runtime.
  const createQueryRunner = (tenantIdDataType = 'uuid') => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string): Promise<QueryResult> => {
        queries.push(sql);
        if (sql.includes('information_schema.columns')) {
          return Promise.resolve([
            { data_type: tenantIdDataType },
          ]) as unknown as Promise<QueryResult>;
        }
        return Promise.resolve(new QueryResult());
      }),
    } as unknown as QueryRunner;

    return { queryRunner, queries };
  };

  const collectSql = async (
    direction: 'up' | 'down' = 'up',
    tenantIdDataType = 'uuid',
  ): Promise<string> => {
    const { queryRunner, queries } = createQueryRunner(tenantIdDataType);
    await migration[direction](queryRunner);
    return queries.join('\n');
  };

  it('creates device_linking_codes with the founder column set and tenant FK', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'CREATE TABLE IF NOT EXISTS device_linking_codes',
      'id uuid PRIMARY KEY DEFAULT gen_random_uuid()',
      'tenant_id uuid NOT NULL',
      'REFERENCES tenants(id)',
      'code_hash varchar(255) NOT NULL',
      "status varchar(64) NOT NULL DEFAULT 'ACTIVE'",
      'device_id varchar(128) NULL',
      'created_by_user_id varchar(128) NOT NULL',
      'expires_at timestamptz NOT NULL',
      'claimed_at timestamptz NULL',
      'created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP',
      'updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP',
      'idx_device_linking_codes_tenant_status',
      'ON device_linking_codes (tenant_id, status)',
      'idx_device_linking_codes_expires_at',
      'ON device_linking_codes (expires_at)',
    ]) {
      expect(sql).toContain(fragment);
    }

    // No plaintext code column may ever exist: the hash is the only
    // verification material, exactly like device renewal secrets.
    expect(sql).not.toMatch(/code\s+varchar(?!_)/);
  });

  it('enables and forces RLS with four per-command tenant policies', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'ALTER TABLE device_linking_codes ENABLE ROW LEVEL SECURITY',
      'ALTER TABLE device_linking_codes FORCE ROW LEVEL SECURITY',
      'CREATE POLICY device_linking_codes_tenant_select ON device_linking_codes',
      'CREATE POLICY device_linking_codes_tenant_insert ON device_linking_codes',
      'CREATE POLICY device_linking_codes_tenant_update ON device_linking_codes',
      'CREATE POLICY device_linking_codes_tenant_delete ON device_linking_codes',
      "current_setting('app.tenant_id', true)::uuid",
    ]) {
      expect(sql).toContain(fragment);
    }

    // Five predicate occurrences: SELECT USING, INSERT WITH CHECK,
    // UPDATE USING + WITH CHECK, DELETE USING.
    expect(
      sql.match(/current_setting\('app\.tenant_id', true\)::uuid/g),
    ).toHaveLength(5);
  });

  it('carries the claim branch ONLY on the SELECT USING and UPDATE halves', async () => {
    const sql = await collectSql('up');

    const branch = "current_setting('app.linking_claim', true) = 'on'";
    // Exactly three branch occurrences: SELECT USING, UPDATE USING,
    // UPDATE WITH CHECK.
    expect(sql.match(/app\.linking_claim/g)).toHaveLength(3);

    // Extract each policy body from its own CREATE POLICY statement (up to
    // the next one): guard text between policies names policies, never
    // carries the branch.
    const extractPolicy = (policyName: string): string => {
      const start = sql.indexOf(`CREATE POLICY ${policyName} ON`);
      expect(start).toBeGreaterThanOrEqual(0);
      const rest = sql.slice(start);
      const next = rest.indexOf('CREATE POLICY', 1);
      return next === -1 ? rest : rest.slice(0, next);
    };

    expect(extractPolicy('device_linking_codes_tenant_select')).toContain(
      branch,
    );
    expect(extractPolicy('device_linking_codes_tenant_insert')).not.toContain(
      'app.linking_claim',
    );
    expect(
      extractPolicy('device_linking_codes_tenant_update').match(
        /app\.linking_claim/g,
      ),
    ).toHaveLength(2);
    expect(extractPolicy('device_linking_codes_tenant_delete')).not.toContain(
      'app.linking_claim',
    );
  });

  it('resolves the predicate through the type-aware resolver (uuid cast on uuid columns)', async () => {
    const sql = await collectSql('up', 'uuid');
    expect(sql).toContain("current_setting('app.tenant_id', true)::uuid");

    const varcharSql = await collectSql('up', 'character varying');
    expect(varcharSql).toContain(
      "tenant_id::text = current_setting('app.tenant_id', true)",
    );
  });

  it('is idempotent for the partial-ledger re-run', async () => {
    const { queryRunner } = createQueryRunner('uuid');
    await migration.up(queryRunner);
    await expect(migration.up(queryRunner)).resolves.toBeUndefined();
  });

  it('down migration drops the table cleanly', async () => {
    const sql = await collectSql('down');
    expect(sql).toContain('DROP TABLE IF EXISTS device_linking_codes');
  });
});
