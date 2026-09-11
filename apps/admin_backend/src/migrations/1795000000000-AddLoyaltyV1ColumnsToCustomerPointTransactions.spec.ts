import { QueryRunner } from 'typeorm';
import { AddLoyaltyV1ColumnsToCustomerPointTransactions1795000000000 } from './1795000000000-AddLoyaltyV1ColumnsToCustomerPointTransactions';

describe('AddLoyaltyV1ColumnsToCustomerPointTransactions1795000000000 Migration', () => {
  let migration: AddLoyaltyV1ColumnsToCustomerPointTransactions1795000000000;
  let mockQueryRunner: { query: jest.Mock };

  beforeEach(() => {
    migration =
      new AddLoyaltyV1ColumnsToCustomerPointTransactions1795000000000();
    mockQueryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('runs up migration adding all V1 loyalty columns', async () => {
    await migration.up(mockQueryRunner as unknown as QueryRunner);

    expect(mockQueryRunner.query).toHaveBeenCalledTimes(2);

    const upSql = mockQueryRunner.query.mock.calls[0][0] as string;

    const v1Columns = [
      'loyalty_program_id',
      'ticket_id',
      'reward_id',
      'transaction_type',
      'units',
      'reversal_of_transaction_id',
      'idempotency_key',
      'source_event_id',
      'actor_user_id',
      'branch_id',
      'terminal_id',
      'program_version',
      'reward_version',
      'commercial_snapshot',
      'origin',
      'occurred_at',
      'recorded_at',
      'legacy_imported',
    ];

    for (const col of v1Columns) {
      expect(upSql).toContain(col);
    }
  });

  it('creates index on loyalty_program_id', async () => {
    await migration.up(mockQueryRunner as unknown as QueryRunner);

    const indexSql = mockQueryRunner.query.mock.calls[1][0] as string;
    expect(indexSql).toContain('idx_loyalty_tx_tenant_program');
    expect(indexSql).toContain('loyalty_program_id');
  });

  it('preserves legacy columns (type, points, balance_after, conversion_rate, invoice_id, reason, created_at)', async () => {
    await migration.up(mockQueryRunner as unknown as QueryRunner);

    const upSql = mockQueryRunner.query.mock.calls[0][0] as string;

    expect(upSql).not.toContain('DROP COLUMN');
    expect(upSql).not.toContain('ALTER COLUMN');
  });

  it('runs down migration dropping only V1 columns', async () => {
    await migration.down(mockQueryRunner as unknown as QueryRunner);

    expect(mockQueryRunner.query).toHaveBeenCalledTimes(1);

    const downSql = mockQueryRunner.query.mock.calls[0][0] as string;

    const v1Columns = [
      'loyalty_program_id',
      'ticket_id',
      'reward_id',
      'transaction_type',
      'units',
      'reversal_of_transaction_id',
      'idempotency_key',
      'source_event_id',
      'actor_user_id',
      'branch_id',
      'terminal_id',
      'program_version',
      'reward_version',
      'commercial_snapshot',
      'origin',
      'occurred_at',
      'recorded_at',
      'legacy_imported',
    ];

    for (const col of v1Columns) {
      expect(downSql).toContain(col);
    }

    expect(downSql).toContain('DROP COLUMN');
  });

  it('down migration does not drop legacy columns', async () => {
    await migration.down(mockQueryRunner as unknown as QueryRunner);

    const downSql = mockQueryRunner.query.mock.calls[0][0] as string;

    expect(downSql).not.toContain('DROP COLUMN type');
    expect(downSql).not.toContain('DROP COLUMN points');
    expect(downSql).not.toContain('DROP COLUMN balance_after');
    expect(downSql).not.toContain('DROP COLUMN conversion_rate');
    expect(downSql).not.toContain('DROP COLUMN invoice_id');
    expect(downSql).not.toContain('DROP COLUMN reason');
    expect(downSql).not.toContain('DROP COLUMN created_at');
  });

  it('adds all columns as nullable for backwards compatibility', async () => {
    await migration.up(mockQueryRunner as unknown as QueryRunner);

    const upSql = mockQueryRunner.query.mock.calls[0][0] as string;

    expect(upSql).toContain('ADD COLUMN IF NOT EXISTS');
    expect(upSql).toContain('legacy_imported boolean DEFAULT false');
  });
});
