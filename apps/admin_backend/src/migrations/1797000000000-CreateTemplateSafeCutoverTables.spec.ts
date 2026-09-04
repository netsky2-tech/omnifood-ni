import { QueryRunner } from 'typeorm';
import { CreateTemplateSafeCutoverTables1797000000000 } from './1797000000000-CreateTemplateSafeCutoverTables';

describe('CreateTemplateSafeCutoverTables1797000000000 Migration', () => {
  let migration: CreateTemplateSafeCutoverTables1797000000000;
  let mockQueryRunner: {
    createTable: jest.Mock;
    createUniqueConstraint: jest.Mock;
    createIndex: jest.Mock;
    addColumn: jest.Mock;
    dropColumn: jest.Mock;
    dropIndex: jest.Mock;
    dropTable: jest.Mock;
  };

  beforeEach(() => {
    migration = new CreateTemplateSafeCutoverTables1797000000000();
    mockQueryRunner = {
      createTable: jest.fn().mockResolvedValue(undefined),
      createUniqueConstraint: jest.fn().mockResolvedValue(undefined),
      createIndex: jest.fn().mockResolvedValue(undefined),
      addColumn: jest.fn().mockResolvedValue(undefined),
      dropColumn: jest.fn().mockResolvedValue(undefined),
      dropIndex: jest.fn().mockResolvedValue(undefined),
      dropTable: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('runs up migration creating template applications, seed links, migration receipts, and extending recipe_versions and industry_templates', async () => {
    await migration.up(mockQueryRunner as unknown as QueryRunner);

    // 3 tables created: onboarding_template_applications, onboarding_template_seed_links, legacy_onboarding_migration_receipts
    expect(mockQueryRunner.createTable).toHaveBeenCalledTimes(3);

    // Columns added to recipe_versions (origin, publication_state, suggestion_state)
    // and industry_templates (version, source_fingerprint)
    expect(mockQueryRunner.addColumn).toHaveBeenCalled();

    // Unique constraints and indexes
    expect(mockQueryRunner.createUniqueConstraint).toHaveBeenCalled();
    expect(mockQueryRunner.createIndex).toHaveBeenCalled();
  });

  it('runs down migration dropping columns and tables in reverse order', async () => {
    await migration.down(mockQueryRunner as unknown as QueryRunner);

    expect(mockQueryRunner.dropTable).toHaveBeenCalledTimes(3);
    expect(mockQueryRunner.dropTable).toHaveBeenNthCalledWith(
      1,
      'legacy_onboarding_migration_receipts',
      true,
    );
    expect(mockQueryRunner.dropTable).toHaveBeenNthCalledWith(
      2,
      'onboarding_template_seed_links',
      true,
    );
    expect(mockQueryRunner.dropTable).toHaveBeenNthCalledWith(
      3,
      'onboarding_template_applications',
      true,
    );
    expect(mockQueryRunner.dropColumn).toHaveBeenCalled();
  });
});
