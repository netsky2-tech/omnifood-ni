import { MigrationInterface, QueryRunner } from 'typeorm';

export class IdentityRemediationHardening1761000000000 implements MigrationInterface {
  name = 'IdentityRemediationHardening1761000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE users ALTER COLUMN pin_hash DROP NOT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "UPDATE users SET pin_hash = '' WHERE pin_hash IS NULL",
    );
    await queryRunner.query(
      'ALTER TABLE users ALTER COLUMN pin_hash SET NOT NULL',
    );
  }
}
