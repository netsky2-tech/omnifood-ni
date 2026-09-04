import { MigrationInterface, QueryRunner, Table, TableIndex, TableUnique } from 'typeorm';

export class CreateOnboardingCoreTables1796000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'onboarding_sessions',
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
            name: 'lifecycle_state',
            type: 'varchar',
            length: '64',
            default: "'PROVISIONED'",
            isNullable: false,
          },
          {
            name: 'onboarding_started_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'sale_ready_first_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'activation_started_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'activated_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'first_successful_sale_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'first_customer_sale_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'last_activity_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'current_activation_attempt_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'measurement_eligible',
            type: 'boolean',
            default: true,
            isNullable: false,
          },
          {
            name: 'legacy_baseline',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'optimistic_version',
            type: 'int',
            default: 1,
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createUniqueConstraint(
      'onboarding_sessions',
      new TableUnique({
        name: 'uq_onboarding_sessions_tenant_id',
        columnNames: ['tenant_id'],
      }),
    );

    await queryRunner.createIndex(
      'onboarding_sessions',
      new TableIndex({
        name: 'idx_onboarding_sessions_tenant_id',
        columnNames: ['tenant_id'],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'onboarding_idempotency_records',
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
            name: 'idempotency_key',
            type: 'varchar',
            length: '256',
            isNullable: false,
          },
          {
            name: 'command_type',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'payload_hash',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '64',
            default: "'IN_PROGRESS'",
            isNullable: false,
          },
          {
            name: 'lease_owner',
            type: 'varchar',
            length: '128',
            isNullable: true,
          },
          {
            name: 'lease_acquired_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'lease_expires_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'attempt_count',
            type: 'int',
            default: 1,
            isNullable: false,
          },
          {
            name: 'result_ref',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'last_error_code',
            type: 'varchar',
            length: '128',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'completed_at',
            type: 'timestamptz',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createUniqueConstraint(
      'onboarding_idempotency_records',
      new TableUnique({
        name: 'uq_onboarding_idempotency_tenant_key',
        columnNames: ['tenant_id', 'idempotency_key'],
      }),
    );

    await queryRunner.createIndex(
      'onboarding_idempotency_records',
      new TableIndex({
        name: 'idx_onboarding_idempotency_tenant_id',
        columnNames: ['tenant_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('onboarding_idempotency_records', true);
    await queryRunner.dropTable('onboarding_sessions', true);
  }
}
