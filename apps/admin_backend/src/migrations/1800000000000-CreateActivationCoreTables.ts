import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableUnique,
} from 'typeorm';

export class CreateActivationCoreTables1800000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. onboarding_activation_attempts
    await queryRunner.createTable(
      new Table({
        name: 'onboarding_activation_attempts',
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
            name: 'onboarding_session_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'candidate_terminal_id',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'trusted_terminal_id',
            type: 'varchar',
            length: '128',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '64',
            default: "'CREATED'",
            isNullable: false,
          },
          {
            name: 'started_by_user_id',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'started_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'completed_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'server_time_anchor_at',
            type: 'timestamptz',
            isNullable: false,
          },
          {
            name: 'required_fiscal_revision',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'required_fiscal_fingerprint',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'verification_product_id',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'verification_product_revision',
            type: 'int',
            default: 1,
            isNullable: false,
          },
          {
            name: 'verification_product_fingerprint',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'verification_ticket_id',
            type: 'varchar',
            length: '128',
            isNullable: true,
          },
          {
            name: 'pos_build',
            type: 'varchar',
            length: '128',
            isNullable: true,
          },
          {
            name: 'warnings_count',
            type: 'int',
            default: 0,
            isNullable: false,
          },
          {
            name: 'failure_code',
            type: 'varchar',
            length: '128',
            isNullable: true,
          },
          {
            name: 'idempotency_key',
            type: 'varchar',
            length: '256',
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
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'onboarding_activation_attempts',
      new TableIndex({
        name: 'idx_onboarding_activation_attempts_tenant',
        columnNames: ['tenant_id'],
      }),
    );

    await queryRunner.createIndex(
      'onboarding_activation_attempts',
      new TableIndex({
        name: 'idx_onboarding_activation_attempts_session',
        columnNames: ['onboarding_session_id'],
      }),
    );

    // Partial unique index: single active attempt per tenant and session
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_activation_attempts_single_active
      ON onboarding_activation_attempts (tenant_id, onboarding_session_id)
      WHERE status IN ('CREATED', 'IN_PROGRESS');
    `);

    await queryRunner.query(
      `ALTER TABLE onboarding_activation_attempts ENABLE ROW LEVEL SECURITY;`,
    );

    // 2. onboarding_activation_check_results
    await queryRunner.createTable(
      new Table({
        name: 'onboarding_activation_check_results',
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
            name: 'activation_attempt_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'check_code',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'required',
            type: 'boolean',
            default: true,
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '32',
            default: "'NOT_RUN'",
            isNullable: false,
          },
          {
            name: 'evidence_type',
            type: 'varchar',
            length: '64',
            isNullable: true,
          },
          {
            name: 'evidence_ref',
            type: 'varchar',
            length: '256',
            isNullable: true,
          },
          {
            name: 'occurred_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'recorded_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'details_sanitized_json',
            type: 'jsonb',
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
        ],
      }),
      true,
    );

    await queryRunner.createUniqueConstraint(
      'onboarding_activation_check_results',
      new TableUnique({
        name: 'uq_activation_checks_tenant_attempt_code',
        columnNames: ['tenant_id', 'activation_attempt_id', 'check_code'],
      }),
    );

    await queryRunner.createIndex(
      'onboarding_activation_check_results',
      new TableIndex({
        name: 'idx_activation_checks_tenant',
        columnNames: ['tenant_id'],
      }),
    );

    await queryRunner.createIndex(
      'onboarding_activation_check_results',
      new TableIndex({
        name: 'idx_activation_checks_attempt',
        columnNames: ['activation_attempt_id'],
      }),
    );

    await queryRunner.query(
      `ALTER TABLE onboarding_activation_check_results ENABLE ROW LEVEL SECURITY;`,
    );

    // 3. onboarding_activation_follow_ups
    await queryRunner.createTable(
      new Table({
        name: 'onboarding_activation_follow_ups',
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
            name: 'activation_attempt_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'warning_code',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '32',
            default: "'OPEN'",
            isNullable: false,
          },
          {
            name: 'opened_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'opened_by',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'closure_evidence_ref',
            type: 'varchar',
            length: '256',
            isNullable: true,
          },
          {
            name: 'closed_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'closed_by',
            type: 'varchar',
            length: '128',
            isNullable: true,
          },
          {
            name: 'closure_note',
            type: 'text',
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
        ],
      }),
      true,
    );

    await queryRunner.createUniqueConstraint(
      'onboarding_activation_follow_ups',
      new TableUnique({
        name: 'uq_activation_follow_ups_tenant_attempt_warning',
        columnNames: ['tenant_id', 'activation_attempt_id', 'warning_code'],
      }),
    );

    await queryRunner.createIndex(
      'onboarding_activation_follow_ups',
      new TableIndex({
        name: 'idx_activation_follow_ups_tenant',
        columnNames: ['tenant_id'],
      }),
    );

    await queryRunner.query(
      `ALTER TABLE onboarding_activation_follow_ups ENABLE ROW LEVEL SECURITY;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('onboarding_activation_follow_ups', true);
    await queryRunner.dropTable('onboarding_activation_check_results', true);
    await queryRunner.dropTable('onboarding_activation_attempts', true);
  }
}
