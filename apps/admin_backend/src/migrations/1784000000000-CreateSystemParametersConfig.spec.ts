import { QueryResult, type QueryRunner } from 'typeorm';
import { CreateSystemParametersConfig1784000000000 } from './1784000000000-CreateSystemParametersConfig';

describe('CreateSystemParametersConfig1784000000000', () => {
  const migration = new CreateSystemParametersConfig1784000000000();

  const createQueryRunner = () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string): Promise<QueryResult> => {
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

    expect(sql).toContain('ALTER TABLE sys_parametros_config ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE sys_parametros_config FORCE ROW LEVEL SECURITY');
    expect(sql).toContain('sys_parametros_config_tenant_isolation');
    expect(sql).toContain("current_setting('app.tenant_id', true)");
    expect(sql).toContain('v_sys_parametros_config_active');
    expect(sql).toContain('security_invoker = true');
  });

  it('drops views, policies, triggers and table on rollback', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.down(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain('DROP VIEW IF EXISTS v_sys_parametros_config_active');
    expect(sql).toContain('DROP POLICY IF EXISTS sys_parametros_config_tenant_isolation');
    expect(sql).toContain('DROP TRIGGER IF EXISTS trg_sys_parametros_config_immutable');
    expect(sql).toContain('DROP FUNCTION IF EXISTS reject_sys_parametros_config_mutation()');
    expect(sql).toContain('DROP TABLE IF EXISTS sys_parametros_config');
  });
});
