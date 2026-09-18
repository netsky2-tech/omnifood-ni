import { QueryResult, type QueryRunner } from 'typeorm';
import { AddDeterministicSyncSequencing1780000000000 } from './1780000000000-AddDeterministicSyncSequencing';

describe('AddDeterministicSyncSequencing1780000000000', () => {
  const migration = new AddDeterministicSyncSequencing1780000000000();

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

  it('adds deterministic stream sequencing fields and flow-scoped uniqueness', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS flow_type varchar');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS result_status varchar');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS result_code varchar');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS payload_hash varchar');
    expect(sql).toContain('uq_inventory_sync_receipts_stream_sequence');
    expect(sql).toContain(
      '(tenant_id, source_device_id, flow_type, source_sequence)',
    );
    expect(sql).toContain('uq_inventory_sync_receipts_idempotency_key');
    expect(sql).toContain('(tenant_id, idempotency_key, flow_type)');
    expect(sql).toContain('uq_inventory_sync_outbox_stream_sequence');
  });

  it('enforces tenant-scoped RLS on sync and ledger tables', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');

    for (const tableName of [
      'inventory_sync_receipts',
      'inventory_sync_outbox',
      'inventory_kardex',
    ]) {
      expect(sql).toContain(
        `ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`,
      );
      expect(sql).toContain(
        `ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`,
      );
      expect(sql).toContain(`sync_ledger_${tableName}_tenant_select`);
      expect(sql).toContain(`sync_ledger_${tableName}_tenant_insert`);
      // The default stub declares tenant_id as varchar, so the resolved form
      // is the column-cast predicate (formerly the hardcoded bare compare;
      // the two dedicated form tests below cover both resolved forms).
      expect(sql).toContain(
        "tenant_id::text = current_setting('app.tenant_id', true)",
      );
    }
  });

  it('emits the setting-cast predicate when tenant_id is already uuid', async () => {
    // A partial-ledger re-run happens after later slices converted these
    // columns to uuid; a bare compare would fail with "operator does not
    // exist: uuid = text". The stubbed uuid type must therefore produce the
    // setting-cast form for every recreated sync-ledger policy.
    const { queryRunner, queries } = createQueryRunner('uuid');

    await migration.up(queryRunner);

    const sql = queries.join('\n');
    const uuidPredicate =
      "tenant_id = current_setting('app.tenant_id', true)::uuid";

    for (const tableName of [
      'inventory_sync_receipts',
      'inventory_sync_outbox',
      'inventory_kardex',
    ]) {
      expect(sql).toContain(
        `CREATE POLICY sync_ledger_${tableName}_tenant_select\n          ON ${tableName}\n          FOR SELECT\n          USING (${uuidPredicate});`,
      );
      expect(sql).toContain(
        `CREATE POLICY sync_ledger_${tableName}_tenant_insert\n          ON ${tableName}\n          FOR INSERT\n          WITH CHECK (${uuidPredicate});`,
      );
    }
    expect(sql).not.toContain('tenant_id::text = current_setting');
  });

  it('emits the column-cast predicate when tenant_id is still varchar', async () => {
    const { queryRunner, queries } = createQueryRunner('character varying');

    await migration.up(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain(
      "USING (tenant_id::text = current_setting('app.tenant_id', true));",
    );
    expect(sql).not.toContain('::uuid');
  });

  it('does not drop append-only sync metadata on rollback', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.down(queryRunner);

    expect(queries.join('\n')).not.toContain('DROP COLUMN');
    expect(queries.join('\n')).toContain('SELECT 1');
  });
});
