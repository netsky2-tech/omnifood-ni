import { QueryResult, type QueryRunner } from 'typeorm';
import { CreateProductionBatchHistory1781000000000 } from './1781000000000-CreateProductionBatchHistory';

describe('CreateProductionBatchHistory1781000000000', () => {
  const migration = new CreateProductionBatchHistory1781000000000();

  // The migration resolves the tenant predicate through the shared
  // type-aware resolver, which reads the tenant_id column type from
  // information_schema. The stub answers with the declared data_type; a raw
  // rows array mirrors what PostgresQueryRunner.query returns at runtime.
  const createQueryRunner = (
    tenantIdDataType: string = 'character varying',
  ) => {
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

  it('creates immutable production batch history with audit columns and uniqueness', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS production_batch_history',
    );
    expect(sql).toContain('production_document_id varchar NOT NULL');
    expect(sql).toContain('produced_unit_cost_nio numeric(14,4) NOT NULL');
    expect(sql).toContain('movement_references text[] NOT NULL DEFAULT');
    expect(sql).toContain('uq_production_batch_history_document');
    expect(sql).toContain('(tenant_id, production_document_id)');
    expect(sql).toContain('(tenant_id, terminal_id, source_sequence)');
    expect(sql).toContain('idx_production_batch_history_tenant_operation');
    expect(sql).toContain(
      'ALTER TABLE production_batch_history ENABLE ROW LEVEL SECURITY',
    );
    expect(sql).toContain(
      'ALTER TABLE production_batch_history FORCE ROW LEVEL SECURITY',
    );
    expect(sql).toContain(
      'CREATE POLICY production_batch_history_tenant_isolation',
    );
    expect(sql).toContain(
      'CREATE POLICY production_batch_history_tenant_update',
    );
    expect(sql).toContain(
      'CREATE POLICY production_batch_history_tenant_delete',
    );
    expect(sql).toContain(
      'CREATE TRIGGER trg_production_batch_history_immutable',
    );
    expect(sql).toContain(
      'production_batch_history is immutable: UPDATE/DELETE are forbidden',
    );
  });

  it('preserves immutable production history on rollback', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.down(queryRunner);

    const sql = queries.join('\n');

    expect(sql).not.toContain('DROP TABLE');
    expect(sql).not.toContain('DROP TRIGGER');
    expect(sql).not.toContain('DROP FUNCTION');
    expect(sql).not.toContain('DROP POLICY');
    expect(sql).toContain(
      'ALTER TABLE production_batch_history FORCE ROW LEVEL SECURITY',
    );
    expect(sql).toContain(
      'CREATE POLICY production_batch_history_tenant_isolation',
    );
    expect(sql).toContain(
      'CREATE POLICY production_batch_history_tenant_update',
    );
    expect(sql).toContain(
      'CREATE POLICY production_batch_history_tenant_delete',
    );
    expect(sql).toContain(
      'CREATE TRIGGER trg_production_batch_history_immutable',
    );
  });

  it('emits the setting-cast predicate when tenant_id is already uuid (partial-ledger re-run)', async () => {
    // A partial-ledger re-run happens after later slices converted the
    // column to uuid; the recreated policies must use the setting-cast form
    // instead of the hardcoded bare compare.
    const { queryRunner, queries } = createQueryRunner('uuid');

    await migration.up(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain(
      "tenant_id = current_setting('app.tenant_id', true)::uuid",
    );
    expect(sql).not.toContain(
      "tenant_id::text = current_setting('app.tenant_id', true)",
    );
  });
});
