import { QueryResult, type QueryRunner } from 'typeorm';
import { AddDeterministicSyncSequencing1780000000000 } from './1780000000000-AddDeterministicSyncSequencing';

describe('AddDeterministicSyncSequencing1780000000000', () => {
  const migration = new AddDeterministicSyncSequencing1780000000000();

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
      expect(sql).toContain(
        "tenant_id = current_setting('app.tenant_id', true)",
      );
    }
  });

  it('does not drop append-only sync metadata on rollback', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.down(queryRunner);

    expect(queries.join('\n')).not.toContain('DROP COLUMN');
    expect(queries.join('\n')).toContain('SELECT 1');
  });
});
