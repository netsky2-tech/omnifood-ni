import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreatePromotionsTable1790000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'promotions',
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
            name: 'type',
            type: 'varchar',
            default: "'buyXGetYFree'",
          },
          {
            name: 'target_product_id',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'target_category_id',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'buy_quantity',
            type: 'int',
            default: 0,
          },
          {
            name: 'get_quantity',
            type: 'int',
            default: 0,
          },
          {
            name: 'discount_value',
            type: 'numeric',
            precision: 12,
            scale: 2,
            default: '0.00',
          },
          {
            name: 'min_order_amount',
            type: 'numeric',
            precision: 12,
            scale: 2,
            default: '0.00',
          },
          {
            name: 'days_of_week',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'start_time',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'end_time',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'start_date',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'end_date',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'priority',
            type: 'int',
            default: 0,
          },
          {
            name: 'is_stackable',
            type: 'boolean',
            default: true,
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
      'promotions',
      new TableIndex({
        name: 'idx_promotions_tenant_active',
        columnNames: ['tenant_id', 'is_active'],
      }),
    );

    await queryRunner.createIndex(
      'promotions',
      new TableIndex({
        name: 'idx_promotions_tenant_priority',
        columnNames: ['tenant_id', 'priority'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('promotions', true);
  }
}
