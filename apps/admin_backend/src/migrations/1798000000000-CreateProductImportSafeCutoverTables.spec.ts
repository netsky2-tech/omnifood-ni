import { QueryRunner } from 'typeorm';
import { CreateProductImportSafeCutoverTables1798000000000 } from './1798000000000-CreateProductImportSafeCutoverTables';

describe('CreateProductImportSafeCutoverTables1798000000000 Migration', () => {
  let migration: CreateProductImportSafeCutoverTables1798000000000;
  let mockQueryRunner: {
    createTable: jest.Mock;
    createUniqueConstraint: jest.Mock;
    createIndex: jest.Mock;
    addColumn: jest.Mock;
    dropColumn: jest.Mock;
    dropIndex: jest.Mock;
    dropTable: jest.Mock;
    dropUniqueConstraint: jest.Mock;
  };

  beforeEach(() => {
    migration = new CreateProductImportSafeCutoverTables1798000000000();
    mockQueryRunner = {
      createTable: jest.fn().mockResolvedValue(undefined),
      createUniqueConstraint: jest.fn().mockResolvedValue(undefined),
      createIndex: jest.fn().mockResolvedValue(undefined),
      addColumn: jest.fn().mockResolvedValue(undefined),
      dropColumn: jest.fn().mockResolvedValue(undefined),
      dropIndex: jest.fn().mockResolvedValue(undefined),
      dropTable: jest.fn().mockResolvedValue(undefined),
      dropUniqueConstraint: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('runs up migration creating product import sessions, extending staging table, and creating integrity reports table', async () => {
    await migration.up(mockQueryRunner as unknown as QueryRunner);

    // 2 tables created: product_import_sessions, legacy_import_integrity_reports
    expect(mockQueryRunner.createTable).toHaveBeenCalledTimes(2);

    // 7 columns added to staging_importacion_productos
    expect(mockQueryRunner.addColumn).toHaveBeenCalledTimes(7);

    // Unique constraint on (tenant_id, token_sesion_importacion, row_ordinal)
    expect(mockQueryRunner.createUniqueConstraint).toHaveBeenCalled();
    expect(mockQueryRunner.createIndex).toHaveBeenCalled();
  });

  it('runs down migration dropping columns and tables in reverse order', async () => {
    await migration.down(mockQueryRunner as unknown as QueryRunner);

    expect(mockQueryRunner.dropTable).toHaveBeenCalledTimes(2);
    expect(mockQueryRunner.dropUniqueConstraint).toHaveBeenCalled();
    expect(mockQueryRunner.dropColumn).toHaveBeenCalledTimes(7);
  });
});
