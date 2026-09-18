import { QueryResult, type QueryRunner } from 'typeorm';
import { AddBatch6bCostingLifecycle1785000000000 } from './1785000000000-AddBatch6bCostingLifecycle';

describe('AddBatch6bCostingLifecycle1785000000000', () => {
  const migration = new AddBatch6bCostingLifecycle1785000000000();

  // The migration resolves one predicate per guarded table through the
  // shared type-aware resolver, which reads each tenant_id column type from
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

  it('adds 5 costing lifecycle columns to inventory_kardex and backfills provisional status', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain(
      'ADD COLUMN IF NOT EXISTS estado_costeo integer NOT NULL DEFAULT 30',
    );
    expect(sql).toContain(
      'ADD COLUMN IF NOT EXISTS intentos_count integer NOT NULL DEFAULT 0',
    );
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS bloqueo_motivo varchar');
    expect(sql).toContain(
      'ADD COLUMN IF NOT EXISTS autorizado_por_usuario_id varchar',
    );
    expect(sql).toContain(
      'ADD COLUMN IF NOT EXISTS fecha_autorizacion timestamptz',
    );
    expect(sql).toContain('SET estado_costeo = 10');
    expect(sql).toContain('WHERE stock_after < 0');
  });

  it('creates kardex_recalculate_queue and kardex_correction tables with RLS and immutability', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS kardex_recalculate_queue',
    );
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS kardex_correction');
    expect(sql).toContain('trg_kardex_correction_immutable');
    expect(sql).toContain('reject_kardex_correction_mutation()');
    expect(sql).toContain(
      'ALTER TABLE kardex_recalculate_queue ENABLE ROW LEVEL SECURITY',
    );
    expect(sql).toContain(
      'ALTER TABLE kardex_correction ENABLE ROW LEVEL SECURITY',
    );
    expect(sql).toContain('kardex_queue_tenant_isolation');
    expect(sql).toContain('kardex_correction_tenant_isolation');
  });

  it('reverts all added objects cleanly on rollback', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.down(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain('DROP TABLE IF EXISTS kardex_correction');
    expect(sql).toContain('DROP TABLE IF EXISTS kardex_recalculate_queue');
    expect(sql).toContain('DROP COLUMN IF EXISTS estado_costeo');
  });

  it('emits the setting-cast predicate for both guarded tables when tenant_id is already uuid (partial-ledger re-run)', async () => {
    // A partial-ledger re-run happens after later slices converted the
    // columns to uuid; each table resolves its own predicate, and the
    // recreated policies must use the setting-cast form.
    const { queryRunner, queries } = createQueryRunner('uuid');

    await migration.up(queryRunner);

    const sql = queries.join('\n');

    for (const tableName of ['kardex_correction', 'kardex_recalculate_queue']) {
      expect(sql).toContain(
        `CREATE POLICY ${tableName === 'kardex_correction' ? 'kardex_correction_tenant_isolation' : 'kardex_queue_tenant_isolation'} ON ${tableName}\n            FOR ALL\n            USING (tenant_id = current_setting('app.tenant_id', true)::uuid)\n            WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);`,
      );
    }
    expect(sql).not.toContain(
      "tenant_id::text = current_setting('app.tenant_id', true)",
    );
  });
});
