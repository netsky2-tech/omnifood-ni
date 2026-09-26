import { QueryResult, type QueryRunner } from 'typeorm';
import { AddCardReconciliationStatusIndex1809460000000 } from './1809460000000-AddCardReconciliationStatusIndex';

describe('AddCardReconciliationStatusIndex1809460000000', () => {
  const migration = new AddCardReconciliationStatusIndex1809460000000();

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

  it('creates the (reconciliation_status, created_at) index for the pending summary (spec §15.3)', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_ip_reconciliation_status',
    );
    expect(sql).toContain(
      'ON invoice_payments (reconciliation_status, created_at)',
    );
    // invoice_payments is parent-owned: no tenant_id column exists, so the
    // spec's (tenant_id, ...) spelling cannot be carried literally.
    expect(sql).not.toContain('tenant_id');
  });

  it('is idempotent when re-applied', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);
    await migration.up(queryRunner);

    expect(queries.join('\n')).toMatch(/IF NOT EXISTS/g);
  });

  it('drops only the index on down (no data mutation)', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.down(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain('DROP INDEX IF EXISTS idx_ip_reconciliation_status');
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).not.toContain('DROP COLUMN');
  });
});
