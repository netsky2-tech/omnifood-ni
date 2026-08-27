import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomPermissionsToSecurityProfiles1786000000000 implements MigrationInterface {
  name = 'AddCustomPermissionsToSecurityProfiles1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE security_profiles
        ADD COLUMN IF NOT EXISTS custom_permissions text[] NOT NULL DEFAULT '{}';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE security_profiles
        DROP COLUMN IF EXISTS custom_permissions;
    `);
  }
}
