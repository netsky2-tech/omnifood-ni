import { QueryRunner } from 'typeorm';
import { CreateCustomersTable1789000000000 } from './1789000000000-CreateCustomersTable';

describe('CreateCustomersTable1789000000000 Migration', () => {
  let migration: CreateCustomersTable1789000000000;
  let mockQueryRunner: {
    createTable: jest.Mock;
    createIndex: jest.Mock;
    dropTable: jest.Mock;
  };

  beforeEach(() => {
    migration = new CreateCustomersTable1789000000000();
    mockQueryRunner = {
      createTable: jest.fn().mockResolvedValue(undefined),
      createIndex: jest.fn().mockResolvedValue(undefined),
      dropTable: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('runs up migration creating customers table and 3 indexes', async () => {
    await migration.up(mockQueryRunner as unknown as QueryRunner);

    expect(mockQueryRunner.createTable).toHaveBeenCalledTimes(1);
    expect(mockQueryRunner.createIndex).toHaveBeenCalledTimes(3);
  });

  it('runs down migration dropping customers table', async () => {
    await migration.down(mockQueryRunner as unknown as QueryRunner);

    expect(mockQueryRunner.dropTable).toHaveBeenCalledWith('customers', true);
  });
});
