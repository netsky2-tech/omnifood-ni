import { MigrationInterface, QueryRunner } from 'typeorm';

// Design §11.2 decision 14: attemptResetGeneration has no storage anywhere in the repository,
// yet §6 requires the backend to increment it on administrative reset. This migration provisions
// the durable per-user generation column before the epoch projection can be faithful. It is a
// pure additive column change: no entity is edited in this slice.
export class AddHumanAuthorizationAttemptResetGeneration1809030000000 implements MigrationInterface {
  name = 'AddHumanAuthorizationAttemptResetGeneration1809030000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS attempt_reset_generation bigint NOT NULL DEFAULT 0;
    `);

    // Postgres has no ADD CONSTRAINT IF NOT EXISTS, so the idempotent form is drop-if-exists
    // followed by add. Dropping and re-adding the named constraint never touches column data.
    await queryRunner.query(`
      ALTER TABLE users
        DROP CONSTRAINT IF EXISTS ck_users_attempt_reset_generation_non_negative;
      ALTER TABLE users
        ADD CONSTRAINT ck_users_attempt_reset_generation_non_negative
        CHECK (attempt_reset_generation >= 0);
    `);
  }

  public down(queryRunner: QueryRunner): Promise<void> {
    // The slice contract forbids destructive rollback: attempt_reset_generation is durable
    // per-user state whose values must survive any revert. down() therefore removes nothing;
    // up() is idempotent, so re-applying after a revert is safe.
    void queryRunner;
    return Promise.resolve();
  }
}
