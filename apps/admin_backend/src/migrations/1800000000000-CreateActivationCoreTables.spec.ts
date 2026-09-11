import { QueryRunner } from 'typeorm';
import { CreateActivationCoreTables1800000000000 } from './1800000000000-CreateActivationCoreTables';

describe('CreateActivationCoreTables1800000000000 Migration', () => {
  let migration: CreateActivationCoreTables1800000000000;
  let mockQueryRunner: {
    createTable: jest.Mock;
    createUniqueConstraint: jest.Mock;
    createIndex: jest.Mock;
    query: jest.Mock;
    dropTable: jest.Mock;
  };

  beforeEach(() => {
    migration = new CreateActivationCoreTables1800000000000();
    mockQueryRunner = {
      createTable: jest.fn().mockResolvedValue(undefined),
      createUniqueConstraint: jest.fn().mockResolvedValue(undefined),
      createIndex: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue(undefined),
      dropTable: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('runs up migration creating attempts, check results and follow ups tables', async () => {
    await migration.up(mockQueryRunner as unknown as QueryRunner);

    // Creates 3 tables
    expect(mockQueryRunner.createTable).toHaveBeenCalledTimes(3);
    // Enables RLS and creates partial index for single active attempt
    expect(mockQueryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_activation_attempts_single_active',
      ),
    );
    expect(mockQueryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'ALTER TABLE onboarding_activation_attempts ENABLE ROW LEVEL SECURITY;',
      ),
    );
    expect(mockQueryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'ALTER TABLE onboarding_activation_check_results ENABLE ROW LEVEL SECURITY;',
      ),
    );
    expect(mockQueryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'ALTER TABLE onboarding_activation_follow_ups ENABLE ROW LEVEL SECURITY;',
      ),
    );
  });

  it('runs down migration dropping tables in reverse order', async () => {
    await migration.down(mockQueryRunner as unknown as QueryRunner);

    expect(mockQueryRunner.dropTable).toHaveBeenCalledTimes(3);
    expect(mockQueryRunner.dropTable).toHaveBeenNthCalledWith(
      1,
      'onboarding_activation_follow_ups',
      true,
    );
    expect(mockQueryRunner.dropTable).toHaveBeenNthCalledWith(
      2,
      'onboarding_activation_check_results',
      true,
    );
    expect(mockQueryRunner.dropTable).toHaveBeenNthCalledWith(
      3,
      'onboarding_activation_attempts',
      true,
    );
  });
});
