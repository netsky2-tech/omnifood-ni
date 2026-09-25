import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
} from 'typeorm';

export class CreateOnboardingTelemetryEvents1801000000000
  implements MigrationInterface
{
  name = 'CreateOnboardingTelemetryEvents1801000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'onboarding_telemetry_events',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'tenant_id',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'event_name',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'session_id',
            type: 'varchar',
            length: '128',
            isNullable: true,
          },
          {
            name: 'step_id',
            type: 'varchar',
            length: '64',
            isNullable: true,
          },
          {
            name: 'duration_ms',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'counts_json',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'properties_sanitized_json',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'error_sanitized_code',
            type: 'varchar',
            length: '128',
            isNullable: true,
          },
          {
            name: 'occurred_at',
            type: 'timestamptz',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'onboarding_telemetry_events',
      new TableIndex({
        name: 'idx_onboarding_telemetry_tenant_id',
        columnNames: ['tenant_id'],
      }),
    );

    await queryRunner.createIndex(
      'onboarding_telemetry_events',
      new TableIndex({
        name: 'idx_onboarding_telemetry_tenant_event',
        columnNames: ['tenant_id', 'event_name'],
      }),
    );

    await queryRunner.createIndex(
      'onboarding_telemetry_events',
      new TableIndex({
        name: 'idx_onboarding_telemetry_occurred_at',
        columnNames: ['occurred_at'],
      }),
    );

    await queryRunner.query(
      `ALTER TABLE onboarding_telemetry_events ENABLE ROW LEVEL SECURITY;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('onboarding_telemetry_events', true);
  }
}
