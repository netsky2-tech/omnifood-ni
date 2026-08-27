import { QueryRunner } from 'typeorm';
import { CreateImportStagingTable1788000000000 } from './1788000000000-CreateImportStagingTable';

describe('CreateImportStagingTable1788000000000 Migration', () => {
  let migration: CreateImportStagingTable1788000000000;
  let mockQueryRunner: {
    createTable: jest.Mock;
    createIndex: jest.Mock;
    dropTable: jest.Mock;
  };

  beforeEach(() => {
    migration = new CreateImportStagingTable1788000000000();
    mockQueryRunner = {
      createTable: jest.fn().mockResolvedValue(undefined),
      createIndex: jest.fn().mockResolvedValue(undefined),
      dropTable: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('runs up migration creating staging table and index', async () => {
    await migration.up(mockQueryRunner as unknown as QueryRunner);

    expect(mockQueryRunner.createTable).toHaveBeenCalledTimes(1);
    expect(mockQueryRunner.createIndex).toHaveBeenCalledTimes(1);
  });

  it('runs down migration dropping staging table', async () => {
    await migration.down(mockQueryRunner as unknown as QueryRunner);

    expect(mockQueryRunner.dropTable).toHaveBeenCalledWith(
      'staging_importacion_productos',
      true,
    );
  });
});
