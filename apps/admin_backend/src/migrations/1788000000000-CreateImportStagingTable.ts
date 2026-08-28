import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateImportStagingTable1788000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'staging_importacion_productos',
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
            name: 'token_sesion_importacion',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'raw_nombre',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'raw_sku',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'raw_precio_venta',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'raw_costo_insumo',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'raw_categoria',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'raw_porcentaje_iva',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'raw_uom',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'raw_stock_inicial',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'parsed_nombre',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'parsed_sku',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'parsed_precio_venta',
            type: 'decimal',
            precision: 12,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'parsed_costo_insumo',
            type: 'decimal',
            precision: 12,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'parsed_categoria',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'parsed_porcentaje_iva',
            type: 'decimal',
            precision: 5,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'parsed_uom',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'parsed_stock_inicial',
            type: 'decimal',
            precision: 12,
            scale: 4,
            isNullable: true,
          },
          {
            name: 'estado_fila',
            type: 'varchar',
            default: "'PENDIENTE'",
          },
          {
            name: 'mensaje_error_detalle',
            type: 'text',
            isNullable: true,
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
      'staging_importacion_productos',
      new TableIndex({
        name: 'idx_staging_importacion_tenant_token',
        columnNames: ['tenant_id', 'token_sesion_importacion'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('staging_importacion_productos', true);
  }
}
