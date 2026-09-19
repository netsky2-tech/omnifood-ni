import { QueryResult, type QueryRunner } from 'typeorm';
import { CreateSystemParametersConfig1784000000000 } from './1784000000000-CreateSystemParametersConfig';

describe('CreateSystemParametersConfig1784000000000', () => {
  const migration = new CreateSystemParametersConfig1784000000000();

  // The migration resolves its policy predicate through the shared
  // type-aware resolver, which reads the sys_parametros_config tenant_id
  // column type from information_schema. The stub answers with the declared
  // data_type; a raw rows array mirrors what PostgresQueryRunner.query
  // returns at runtime. Only policy DDL is collected in `queries`.
  const createQueryRunner = (
    tenantIdDataType: string = 'character varying',
  ): { queryRunner: QueryRunner; queries: string[] } => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string): Promise<QueryResult> => {
        if (sql.includes('information_schema.columns')) {
          return Promise.resolve([
            { data_type: tenantIdDataType },
          ]) as unknown as Promise<QueryResult>;
        }
        queries.push(sql);
        return Promise.resolve(new QueryResult());
      }),
    } as unknown as QueryRunner;

    return { queryRunner, queries };
  };

  it('creates sys_parametros_config table, unique version index, and immutability trigger', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS sys_parametros_config');
    expect(sql).toContain('tenant_id varchar NOT NULL');
    expect(sql).toContain('param_key varchar NOT NULL');
    expect(sql).toContain('param_value jsonb NOT NULL');
    expect(sql).toContain('version integer NOT NULL DEFAULT 1');
    expect(sql).toContain('uq_sys_parametros_config_tenant_key_version');
    expect(sql).toContain('trg_sys_parametros_config_immutable');
    expect(sql).toContain('reject_sys_parametros_config_mutation()');
  });

  it('enforces row level security and creates active view with security_invoker = true', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain(
      'ALTER TABLE sys_parametros_config ENABLE ROW LEVEL SECURITY',
    );
    expect(sql).toContain(
      'ALTER TABLE sys_parametros_config FORCE ROW LEVEL SECURITY',
    );
    expect(sql).toContain('sys_parametros_config_tenant_isolation');
    expect(sql).toContain("current_setting('app.tenant_id', true)");
    expect(sql).toContain('v_sys_parametros_config_active');
    expect(sql).toContain('security_invoker = true');
  });

  it('emits the text-cast tenant predicate while the column is varchar, never the uuid cast', async () => {
    const { queryRunner, queries } = createQueryRunner('character varying');

    await migration.up(queryRunner);

    const sql = queries.join('\n');

    // A uuid-cast predicate on a varchar column fails with
    // "operator does not exist: character varying = uuid", so while the
    // column is varchar the policy must carry the text-cast form in both
    // halves, and no uuid cast may appear anywhere.
    const textPredicate =
      "tenant_id::text = current_setting('app.tenant_id', true)";
    expect(sql).toContain(`USING (${textPredicate})`);
    expect(sql).toContain(`WITH CHECK (${textPredicate})`);
    expect(sql).not.toContain('::uuid');
  });

  it('emits the uuid tenant predicate once the column is uuid, keeping the guarded policy shape', async () => {
    const { queryRunner, queries } = createQueryRunner('uuid');

    await migration.up(queryRunner);

    const sql = queries.join('\n');

    // A bare text comparison on a uuid column fails with
    // "operator does not exist: uuid = text" (the partial-ledger re-run
    // class), so the policy must carry the index-friendly uuid form in both
    // halves, and the text-cast form must be gone.
    const uuidPredicate =
      "tenant_id = current_setting('app.tenant_id', true)::uuid";
    expect(sql).toContain(`USING (${uuidPredicate})`);
    expect(sql).toContain(`WITH CHECK (${uuidPredicate})`);
    expect(sql).not.toContain(
      "tenant_id::text = current_setting('app.tenant_id', true)",
    );

    // The DO $$ catalog guard and DROP POLICY IF EXISTS around the policy
    // are unchanged by the predicate resolution.
    expect(sql).toContain(
      'DROP POLICY IF EXISTS sys_parametros_config_tenant_isolation ON sys_parametros_config',
    );
    expect(sql).toContain(
      'CREATE POLICY sys_parametros_config_tenant_isolation ON sys_parametros_config\n            FOR ALL',
    );
    expect(sql).toContain(
      'SELECT 1 FROM pg_policies\n          WHERE schemaname = current_schema()',
    );
  });

  it('leaves the view, trigger, and indexes byte-identical regardless of the resolved predicate form', async () => {
    const viewFragment =
      'CREATE OR REPLACE VIEW v_sys_parametros_config_active\n      WITH (security_invoker = true)';

    const varcharRun = createQueryRunner('character varying');
    await migration.up(varcharRun.queryRunner);
    const varcharSql = varcharRun.queries.join('\n');

    const uuidRun = createQueryRunner('uuid');
    await migration.up(uuidRun.queryRunner);
    const uuidSql = uuidRun.queries.join('\n');

    for (const sql of [varcharSql, uuidSql]) {
      expect(sql).toContain(viewFragment);
      expect(sql).toContain('trg_sys_parametros_config_immutable');
      expect(sql).toContain('uq_sys_parametros_config_tenant_key_version');
    }
  });

  it('drops views, policies, triggers and table on rollback', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.down(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain('DROP VIEW IF EXISTS v_sys_parametros_config_active');
    expect(sql).toContain(
      'DROP POLICY IF EXISTS sys_parametros_config_tenant_isolation',
    );
    expect(sql).toContain(
      'DROP TRIGGER IF EXISTS trg_sys_parametros_config_immutable',
    );
    expect(sql).toContain(
      'DROP FUNCTION IF EXISTS reject_sys_parametros_config_mutation()',
    );
    expect(sql).toContain('DROP TABLE IF EXISTS sys_parametros_config');
  });
});
