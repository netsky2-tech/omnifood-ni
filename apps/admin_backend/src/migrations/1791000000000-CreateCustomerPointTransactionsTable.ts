import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateCustomerPointTransactionsTable1791000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'customer_point_transactions',
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
            name: 'customer_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'invoice_id',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'type',
            type: 'varchar',
            default: "'earn'",
          },
          {
            name: 'points',
            type: 'numeric',
            precision: 12,
            scale: 2,
            default: '0.00',
          },
          {
            name: 'balance_after',
            type: 'numeric',
            precision: 12,
            scale: 2,
            default: '0.00',
          },
          {
            name: 'conversion_rate',
            type: 'numeric',
            precision: 8,
            scale: 4,
            default: '0.1000',
          },
          {
            name: 'reason',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp with time zone',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'customer_point_transactions',
      new TableIndex({
        name: 'idx_point_transactions_tenant_customer',
        columnNames: ['tenant_id', 'customer_id'],
      }),
    );

    await queryRunner.createIndex(
      'customer_point_transactions',
      new TableIndex({
        name: 'idx_point_transactions_tenant_invoice',
        columnNames: ['tenant_id', 'invoice_id'],
      }),
    );

    await queryRunner.createIndex(
      'customer_point_transactions',
      new TableIndex({
        name: 'idx_point_transactions_created_at',
        columnNames: ['tenant_id', 'created_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('customer_point_transactions', true);
  }
}
