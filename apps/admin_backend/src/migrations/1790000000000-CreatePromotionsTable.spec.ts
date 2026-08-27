import { QueryRunner } from 'typeorm';
import { CreatePromotionsTable1790000000000 } from './1790000000000-CreatePromotionsTable';

describe('CreatePromotionsTable1790000000000 Migration', () => {
  let migration: CreatePromotionsTable1790000000000;
  let mockQueryRunner: {
    createTable: jest.Mock;
    createIndex: jest.Mock;
    dropTable: jest.Mock;
  };

  beforeEach(() => {
    migration = new CreatePromotionsTable1790000000000();
    mockQueryRunner = {
      createTable: jest.fn().mockResolvedValue(undefined),
      createIndex: jest.fn().mockResolvedValue(undefined),
      dropTable: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('runs up migration creating promotions table and 2 indexes', async () => {
    await migration.up(mockQueryRunner as unknown as QueryRunner);

    expect(mockQueryRunner.createTable).toHaveBeenCalledTimes(1);
    expect(mockQueryRunner.createIndex).toHaveBeenCalledTimes(2);
  });

  it('runs down migration dropping promotions table', async () => {
    await migration.down(mockQueryRunner as unknown as QueryRunner);

    expect(mockQueryRunner.dropTable).toHaveBeenCalledWith('promotions', true);
  });
});
