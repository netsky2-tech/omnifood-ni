import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSecurityProfilesAndIdentityColumns1760000000000 implements MigrationInterface {
  name = 'CreateSecurityProfilesAndIdentityColumns1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS security_profiles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL UNIQUE,
        pin_hash varchar NULL,
        totp_secret_seed varchar NULL,
        is_totp_enabled boolean NOT NULL DEFAULT false,
        is_pin_enabled boolean NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT fk_security_profiles_user FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    await queryRunner.query(
      'ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS metodo_autorizacion varchar NULL',
    );
    await queryRunner.query(
      'ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS usuario_autorizador_id uuid NULL',
    );
    await queryRunner.query(
      'ALTER TABLE cashier_sessions ADD COLUMN IF NOT EXISTS tipo_modelo varchar NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE cashier_sessions DROP COLUMN IF EXISTS tipo_modelo',
    );
    await queryRunner.query(
      'ALTER TABLE audit_logs DROP COLUMN IF EXISTS usuario_autorizador_id',
    );
    await queryRunner.query(
      'ALTER TABLE audit_logs DROP COLUMN IF EXISTS metodo_autorizacion',
    );
    await queryRunner.query('DROP TABLE IF EXISTS security_profiles');
  }
}
