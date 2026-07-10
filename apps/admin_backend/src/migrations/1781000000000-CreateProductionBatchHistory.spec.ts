import { QueryResult, type QueryRunner } from 'typeorm';
import { CreateProductionBatchHistory1781000000000 } from './1781000000000-CreateProductionBatchHistory';

describe('CreateProductionBatchHistory1781000000000', () => {
  const migration = new CreateProductionBatchHistory1781000000000();

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
});
