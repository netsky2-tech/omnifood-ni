import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChangeLogTable1794000000000 implements MigrationInterface {
  name = 'CreateChangeLogTable1794000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS change_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id),
        user_id UUID NOT NULL,
        action VARCHAR(64) NOT NULL,
        target_type VARCHAR(64) NOT NULL,
        target_id UUID NOT NULL,
        changes JSONB,
        user_email VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IDX_change_log_tenant_target ON change_log (tenant_id, target_type, target_id);
      CREATE INDEX IDX_change_log_tenant_created ON change_log (tenant_id, created_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS change_log`);
  }
}
