import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCatalogValues1768000000000 implements MigrationInterface {
  name = 'CreateCatalogValues1768000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS catalog_values (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar NOT NULL,
        catalog_type varchar NOT NULL,
        code varchar NOT NULL,
        label varchar NOT NULL,
        description varchar,
        is_active boolean NOT NULL DEFAULT true,
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_values_tenant_type_code
      ON catalog_values (tenant_id, catalog_type, code)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_catalog_values_tenant_type_active
      ON catalog_values (tenant_id, catalog_type, is_active)
    `);

    await queryRunner.query(`
      ALTER TABLE catalog_values ENABLE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      ALTER TABLE catalog_values FORCE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      CREATE POLICY catalog_values_tenant_select ON catalog_values
      FOR SELECT
      USING (tenant_id = current_setting('app.tenant_id', true))
    `);

    await queryRunner.query(`
      CREATE POLICY catalog_values_tenant_insert ON catalog_values
      FOR INSERT
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true))
    `);

    await queryRunner.query(`
      CREATE POLICY catalog_values_tenant_update ON catalog_values
      FOR UPDATE
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true))
    `);

    await queryRunner.query(`
      CREATE POLICY catalog_values_tenant_delete ON catalog_values
      FOR DELETE
      USING (tenant_id = current_setting('app.tenant_id', true))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP POLICY IF EXISTS catalog_values_tenant_delete ON catalog_values',
    );
    await queryRunner.query(
      'DROP POLICY IF EXISTS catalog_values_tenant_update ON catalog_values',
    );
    await queryRunner.query(
      'DROP POLICY IF EXISTS catalog_values_tenant_insert ON catalog_values',
    );
    await queryRunner.query(
      'DROP POLICY IF EXISTS catalog_values_tenant_select ON catalog_values',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_catalog_values_tenant_type_active',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS uq_catalog_values_tenant_type_code',
    );
    await queryRunner.query('DROP TABLE IF EXISTS catalog_values');
  }
}
