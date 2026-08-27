import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateCustomersTable1789000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'customers',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'tenant_id',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'name',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'tax_id',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'phone',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'email',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'address',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'points_balance',
            type: 'numeric',
            precision: 12,
            scale: 2,
            default: '0.00',
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'created_at',
            type: 'timestamp with time zone',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp with time zone',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'customers',
      new TableIndex({
        name: 'idx_customers_tenant_tax_id',
        columnNames: ['tenant_id', 'tax_id'],
      }),
    );

    await queryRunner.createIndex(
      'customers',
      new TableIndex({
        name: 'idx_customers_tenant_phone',
        columnNames: ['tenant_id', 'phone'],
      }),
    );

    await queryRunner.createIndex(
      'customers',
      new TableIndex({
        name: 'idx_customers_tenant_name',
        columnNames: ['tenant_id', 'name'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('customers', true);
  }
}
