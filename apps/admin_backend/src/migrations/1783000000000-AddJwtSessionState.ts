import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJwtSessionState1783000000000 implements MigrationInterface {
  name = 'AddJwtSessionState1783000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS security_version integer NOT NULL DEFAULT 1',
    );
    await queryRunner.query(
      'ALTER TABLE users ADD CONSTRAINT chk_users_security_version_positive CHECK (security_version > 0)',
    );
    await queryRunner.query(
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token_family_id uuid NULL',
    );
    await queryRunner.query(
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token_revoked_at timestamptz NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE users DROP COLUMN IF EXISTS refresh_token_revoked_at',
    );
    await queryRunner.query(
      'ALTER TABLE users DROP COLUMN IF EXISTS refresh_token_family_id',
    );
    await queryRunner.query(
      'ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_security_version_positive',
    );
    await queryRunner.query(
      'ALTER TABLE users DROP COLUMN IF EXISTS security_version',
    );
  }
}
