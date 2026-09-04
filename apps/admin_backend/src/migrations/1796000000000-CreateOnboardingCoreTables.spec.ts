import { QueryRunner } from 'typeorm';
import { CreateOnboardingCoreTables1796000000000 } from './1796000000000-CreateOnboardingCoreTables';

describe('CreateOnboardingCoreTables1796000000000 Migration', () => {
  let migration: CreateOnboardingCoreTables1796000000000;
  let mockQueryRunner: {
    createTable: jest.Mock;
    createUniqueConstraint: jest.Mock;
    createIndex: jest.Mock;
    dropTable: jest.Mock;
  };

  beforeEach(() => {
    migration = new CreateOnboardingCoreTables1796000000000();
    mockQueryRunner = {
      createTable: jest.fn().mockResolvedValue(undefined),
      createUniqueConstraint: jest.fn().mockResolvedValue(undefined),
      createIndex: jest.fn().mockResolvedValue(undefined),
      dropTable: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('runs up migration creating onboarding_sessions and onboarding_idempotency_records', async () => {
    await migration.up(mockQueryRunner as unknown as QueryRunner);

    expect(mockQueryRunner.createTable).toHaveBeenCalledTimes(2);
    expect(mockQueryRunner.createUniqueConstraint).toHaveBeenCalledTimes(2);
    expect(mockQueryRunner.createIndex).toHaveBeenCalledTimes(2);
  });

  it('runs down migration dropping tables in correct order', async () => {
    await migration.down(mockQueryRunner as unknown as QueryRunner);

    expect(mockQueryRunner.dropTable).toHaveBeenCalledTimes(2);
    expect(mockQueryRunner.dropTable).toHaveBeenNthCalledWith(
      1,
      'onboarding_idempotency_records',
      true,
    );
    expect(mockQueryRunner.dropTable).toHaveBeenNthCalledWith(
      2,
      'onboarding_sessions',
      true,
    );
  });
});
