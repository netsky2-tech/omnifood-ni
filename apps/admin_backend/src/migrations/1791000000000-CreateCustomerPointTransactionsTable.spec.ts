import { QueryRunner } from 'typeorm';
import { CreateCustomerPointTransactionsTable1791000000000 } from './1791000000000-CreateCustomerPointTransactionsTable';

describe('CreateCustomerPointTransactionsTable1791000000000 Migration', () => {
  let migration: CreateCustomerPointTransactionsTable1791000000000;
  let mockQueryRunner: {
    createTable: jest.Mock;
    createIndex: jest.Mock;
    dropTable: jest.Mock;
  };

  beforeEach(() => {
    migration = new CreateCustomerPointTransactionsTable1791000000000();
    mockQueryRunner = {
      createTable: jest.fn().mockResolvedValue(undefined),
      createIndex: jest.fn().mockResolvedValue(undefined),
      dropTable: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('runs up migration creating customer_point_transactions table and 3 indexes', async () => {
    await migration.up(mockQueryRunner as unknown as QueryRunner);

    expect(mockQueryRunner.createTable).toHaveBeenCalledTimes(1);
    expect(mockQueryRunner.createIndex).toHaveBeenCalledTimes(3);
  });

  it('runs down migration dropping customer_point_transactions table', async () => {
    await migration.down(mockQueryRunner as unknown as QueryRunner);

    expect(mockQueryRunner.dropTable).toHaveBeenCalledWith(
      'customer_point_transactions',
      true,
    );
  });
});
