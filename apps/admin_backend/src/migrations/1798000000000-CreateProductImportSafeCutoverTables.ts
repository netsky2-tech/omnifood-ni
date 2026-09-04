import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableIndex,
  TableUnique,
} from 'typeorm';

export class CreateProductImportSafeCutoverTables1798000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create product_import_sessions
    await queryRunner.createTable(
      new Table({
        name: 'product_import_sessions',
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
            name: 'status',
            type: 'varchar',
            length: '64',
            default: "'CREATED'",
            isNullable: false,
          },
          {
            name: 'parser_contract_version',
            type: 'varchar',
            length: '32',
            default: "'v1.0'",
            isNullable: false,
          },
          {
            name: 'source_hash',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'file_name',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'total_rows',
            type: 'int',
            default: 0,
            isNullable: false,
          },
          {
            name: 'valid_rows',
            type: 'int',
            default: 0,
            isNullable: false,
          },
          {
            name: 'error_rows',
            type: 'int',
            default: 0,
            isNullable: false,
          },
          {
            name: 'committed_rows',
            type: 'int',
            default: 0,
            isNullable: false,
          },
          {
            name: 'skipped_rows',
            type: 'int',
            default: 0,
            isNullable: false,
          },
          {
            name: 'commit_mode',
            type: 'varchar',
            length: '32',
            isNullable: true,
          },
          {
            name: 'duplicate_policy',
            type: 'varchar',
            length: '32',
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
            name: 'committed_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'expires_at',
            type: 'timestamptz',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'product_import_sessions',
      new TableIndex({
        name: 'idx_import_sessions_tenant_status',
        columnNames: ['tenant_id', 'status'],
      }),
    );

    await queryRunner.createIndex(
      'product_import_sessions',
      new TableIndex({
        name: 'idx_import_sessions_tenant_source_hash',
        columnNames: ['tenant_id', 'source_hash'],
      }),
    );

    // 2. Extend staging_importacion_productos
    await queryRunner.addColumn(
      'staging_importacion_productos',
      new TableColumn({
        name: 'row_ordinal',
        type: 'int',
        default: 1,
        isNullable: false,
      }),
    );

    await queryRunner.addColumn(
      'staging_importacion_productos',
      new TableColumn({
        name: 'matched_by',
        type: 'varchar',
        length: '32',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'staging_importacion_productos',
      new TableColumn({
        name: 'target_product_id',
        type: 'varchar',
        length: '128',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'staging_importacion_productos',
      new TableColumn({
        name: 'fields_to_change',
        type: 'jsonb',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'staging_importacion_productos',
      new TableColumn({
        name: 'conflict_reason',
        type: 'text',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'staging_importacion_productos',
      new TableColumn({
        name: 'unsupported_fields',
        type: 'jsonb',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'staging_importacion_productos',
      new TableColumn({
        name: 'unknown_columns',
        type: 'jsonb',
        isNullable: true,
      }),
    );

    await queryRunner.createUniqueConstraint(
      'staging_importacion_productos',
      new TableUnique({
        name: 'uq_staging_importacion_tenant_token_ordinal',
        columnNames: ['tenant_id', 'token_sesion_importacion', 'row_ordinal'],
      }),
    );

    // 3. Create legacy_import_integrity_reports
    await queryRunner.createTable(
      new Table({
        name: 'legacy_import_integrity_reports',
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
            name: 'legacy_import_refs',
            type: 'jsonb',
            default: "'[]'",
            isNullable: false,
          },
          {
            name: 'affected_product_refs',
            type: 'jsonb',
            default: "'[]'",
            isNullable: false,
          },
          {
            name: 'observed_direct_stock_or_cost_writes',
            type: 'jsonb',
            default: "'[]'",
            isNullable: false,
          },
          {
            name: 'kardex_evidence_present',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '64',
            default: "'CLEAN'",
            isNullable: false,
          },
          {
            name: 'reviewed_by',
            type: 'varchar',
            length: '128',
            isNullable: true,
          },
          {
            name: 'remediation_refs',
            type: 'jsonb',
            default: "'[]'",
            isNullable: false,
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
      'legacy_import_integrity_reports',
      new TableIndex({
        name: 'idx_import_integrity_reports_tenant_status',
        columnNames: ['tenant_id', 'status'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('legacy_import_integrity_reports', true);

    await queryRunner.dropUniqueConstraint(
      'staging_importacion_productos',
      'uq_staging_importacion_tenant_token_ordinal',
    );
    await queryRunner.dropColumn('staging_importacion_productos', 'unknown_columns');
    await queryRunner.dropColumn('staging_importacion_productos', 'unsupported_fields');
    await queryRunner.dropColumn('staging_importacion_productos', 'conflict_reason');
    await queryRunner.dropColumn('staging_importacion_productos', 'fields_to_change');
    await queryRunner.dropColumn('staging_importacion_productos', 'target_product_id');
    await queryRunner.dropColumn('staging_importacion_productos', 'matched_by');
    await queryRunner.dropColumn('staging_importacion_productos', 'row_ordinal');

    await queryRunner.dropTable('product_import_sessions', true);
  }
}
