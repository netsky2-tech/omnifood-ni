import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableUnique,
} from 'typeorm';

export class CreateFiscalConfigRevisions1799000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'fiscal_config_revisions',
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
            name: 'revision',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'fingerprint',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'payload',
            type: 'jsonb',
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

    await queryRunner.createUniqueConstraint(
      'fiscal_config_revisions',
      new TableUnique({
        name: 'uq_fiscal_config_revisions_tenant_revision',
        columnNames: ['tenant_id', 'revision'],
      }),
    );

    await queryRunner.createIndex(
      'fiscal_config_revisions',
      new TableIndex({
        name: 'idx_fiscal_config_revisions_tenant',
        columnNames: ['tenant_id'],
      }),
    );

    await queryRunner.query(
      `ALTER TABLE fiscal_config_revisions ENABLE ROW LEVEL SECURITY;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('fiscal_config_revisions', true);
  }
}
