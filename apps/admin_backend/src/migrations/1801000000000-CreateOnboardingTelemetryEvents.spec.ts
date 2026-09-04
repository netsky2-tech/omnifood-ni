import { QueryRunner } from 'typeorm';
import { CreateOnboardingTelemetryEvents1801000000000 } from './1801000000000-CreateOnboardingTelemetryEvents';

describe('CreateOnboardingTelemetryEvents1801000000000 Migration', () => {
  let migration: CreateOnboardingTelemetryEvents1801000000000;
  let mockQueryRunner: {
    createTable: jest.Mock;
    createIndex: jest.Mock;
    query: jest.Mock;
    dropTable: jest.Mock;
  };

  beforeEach(() => {
    migration = new CreateOnboardingTelemetryEvents1801000000000();
    mockQueryRunner = {
      createTable: jest.fn().mockResolvedValue(undefined),
      createIndex: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue(undefined),
      dropTable: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('runs up migration creating onboarding_telemetry_events table, indexes, and enabling RLS', async () => {
    await migration.up(mockQueryRunner as unknown as QueryRunner);

    expect(mockQueryRunner.createTable).toHaveBeenCalledTimes(1);
    expect(mockQueryRunner.createTable).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'onboarding_telemetry_events',
      }),
      true,
    );

    // Creates 3 indexes: tenant_id, tenant_event, occurred_at
    expect(mockQueryRunner.createIndex).toHaveBeenCalledTimes(3);

    // Enables RLS
    expect(mockQueryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'ALTER TABLE onboarding_telemetry_events ENABLE ROW LEVEL SECURITY;',
      ),
    );
  });

  it('runs down migration dropping onboarding_telemetry_events table', async () => {
    await migration.down(mockQueryRunner as unknown as QueryRunner);

    expect(mockQueryRunner.dropTable).toHaveBeenCalledWith(
      'onboarding_telemetry_events',
      true,
    );
  });
});
