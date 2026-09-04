import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableIndex,
  TableUnique,
} from 'typeorm';

export class CreateTemplateSafeCutoverTables1797000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create onboarding_template_applications
    await queryRunner.createTable(
      new Table({
        name: 'onboarding_template_applications',
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
            isNullable: true,
          },
          {
            name: 'template_code',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'template_version',
            type: 'int',
            default: 1,
            isNullable: false,
          },
          {
            name: 'selection_hash',
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
            name: 'status',
            type: 'varchar',
            length: '64',
            default: "'PLANNED'",
            isNullable: false,
          },
          {
            name: 'applied_by_user_id',
            type: 'varchar',
            length: '128',
            isNullable: true,
          },
          {
            name: 'applied_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'summary_json',
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
      'onboarding_template_applications',
      new TableUnique({
        name: 'uq_onboarding_template_applications_tenant_idemp',
        columnNames: ['tenant_id', 'idempotency_key'],
      }),
    );

    await queryRunner.createIndex(
      'onboarding_template_applications',
      new TableIndex({
        name: 'idx_onboarding_template_applications_tenant_code',
        columnNames: ['tenant_id', 'template_code'],
      }),
    );

    // 2. Create onboarding_template_seed_links
    await queryRunner.createTable(
      new Table({
        name: 'onboarding_template_seed_links',
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
            name: 'template_code',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'source_item_id',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'source_item_type',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'target_entity_type',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'target_entity_id',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'first_applied_version',
            type: 'int',
            default: 1,
            isNullable: false,
          },
          {
            name: 'last_seen_version',
            type: 'int',
            default: 1,
            isNullable: false,
          },
          {
            name: 'last_applied_version',
            type: 'int',
            default: 1,
            isNullable: false,
          },
          {
            name: 'last_source_fingerprint',
            type: 'varchar',
            length: '128',
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
      'onboarding_template_seed_links',
      new TableUnique({
        name: 'uq_template_seed_links_provenance',
        columnNames: [
          'tenant_id',
          'template_code',
          'source_item_id',
          'target_entity_type',
        ],
      }),
    );

    await queryRunner.createIndex(
      'onboarding_template_seed_links',
      new TableIndex({
        name: 'idx_template_seed_links_tenant_code',
        columnNames: ['tenant_id', 'template_code'],
      }),
    );

    // 3. Create legacy_onboarding_migration_receipts
    await queryRunner.createTable(
      new Table({
        name: 'legacy_onboarding_migration_receipts',
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
            name: 'receipt_type',
            type: 'varchar',
            length: '64',
            default: "'LEGACY_TEMPLATE_RECIPE_SCAN'",
            isNullable: false,
          },
          {
            name: 'target_entity_type',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'target_entity_id',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'decision',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'reason',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'evidence_json',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'executed_by',
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
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'legacy_onboarding_migration_receipts',
      new TableIndex({
        name: 'idx_legacy_receipts_tenant_type',
        columnNames: ['tenant_id', 'receipt_type'],
      }),
    );

    // 4. Extend recipe_versions
    await queryRunner.addColumn(
      'recipe_versions',
      new TableColumn({
        name: 'origin',
        type: 'varchar',
        length: '64',
        default: "'MANUAL'",
        isNullable: false,
      }),
    );

    await queryRunner.addColumn(
      'recipe_versions',
      new TableColumn({
        name: 'publication_state',
        type: 'varchar',
        length: '64',
        default: "'PUBLISHED'",
        isNullable: false,
      }),
    );

    await queryRunner.addColumn(
      'recipe_versions',
      new TableColumn({
        name: 'suggestion_state',
        type: 'varchar',
        length: '64',
        default: "'CONFIRMED'",
        isNullable: false,
      }),
    );

    await queryRunner.createIndex(
      'recipe_versions',
      new TableIndex({
        name: 'idx_recipe_versions_active_published',
        columnNames: [
          'tenant_id',
          'product_id',
          'is_active',
          'publication_state',
        ],
      }),
    );

    // 5. Extend industry_templates
    await queryRunner.addColumn(
      'industry_templates',
      new TableColumn({
        name: 'version',
        type: 'int',
        default: 1,
        isNullable: false,
      }),
    );

    await queryRunner.addColumn(
      'industry_templates',
      new TableColumn({
        name: 'source_fingerprint',
        type: 'varchar',
        length: '128',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop columns from industry_templates
    await queryRunner.dropColumn('industry_templates', 'source_fingerprint');
    await queryRunner.dropColumn('industry_templates', 'version');

    // 2. Drop index and columns from recipe_versions
    await queryRunner.dropIndex(
      'recipe_versions',
      'idx_recipe_versions_active_published',
    );
    await queryRunner.dropColumn('recipe_versions', 'suggestion_state');
    await queryRunner.dropColumn('recipe_versions', 'publication_state');
    await queryRunner.dropColumn('recipe_versions', 'origin');

    // 3. Drop tables in reverse order
    await queryRunner.dropTable('legacy_onboarding_migration_receipts', true);
    await queryRunner.dropTable('onboarding_template_seed_links', true);
    await queryRunner.dropTable('onboarding_template_applications', true);
  }
}
