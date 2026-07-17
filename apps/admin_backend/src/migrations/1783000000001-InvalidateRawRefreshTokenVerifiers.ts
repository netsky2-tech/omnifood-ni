import { MigrationInterface, QueryRunner } from 'typeorm';

export class InvalidateRawRefreshTokenVerifiers1783000000001 implements MigrationInterface {
  name = 'InvalidateRawRefreshTokenVerifiers1783000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'UPDATE users SET hashed_refresh_token = NULL, refresh_token_family_id = NULL',
    );
  }

  public async down(): Promise<void> {
    // Raw-token verifiers are intentionally unrecoverable.
  }
}
