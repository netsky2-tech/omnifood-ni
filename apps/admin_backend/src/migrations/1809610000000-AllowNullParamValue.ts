import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SOHO P3 fiscal setup clear path: `sys_parametros_config.param_value` must
 * allow NULL.
 *
 * Why: clearing a configurable parameter (DGI authorization code/dates,
 * OPERATION_MODE, CHECKOUT_FX_MODE, MAX_DISCOUNT_AMOUNT, MAX_DISCOUNT_PERCENT)
 * is DESIGNED as append-only supersession — the append-only trigger
 * `trg_sys_parametros_config_immutable` forbids UPDATE and DELETE (issue
 * #377), so clearing inserts a NEW row whose `param_value` is a null
 * TOMBSTONE, and the active view `v_sys_parametros_config_active` resolves
 * that tombstone as the governing (absent) version. The original DDL
 * (`1784000000000-CreateSystemParametersConfig`) declared
 * `param_value jsonb NOT NULL`, which forbids exactly the tombstone the
 * service (`FiscalSetupService.upsertOrClearParameter`) and the view were
 * designed around: every clear attempt died with
 * "null value in column param_value ... violates not-null constraint".
 *
 * This migration makes the intended design legal. It changes ONLY the
 * constraint: no row is read, rewritten or deleted, and the trigger, the
 * RLS policy and the view are untouched.
 */
export class AllowNullParamValue1809610000000 implements MigrationInterface {
  name = 'AllowNullParamValue1809610000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        -- Guard the table's existence so a partial-ledger re-run (where the
        -- table has not been created yet, or was rebound by
        -- 1809090000000-RebindSystemParametersConfigTenantColumn) never
        -- crashes on a missing relation.
        IF to_regclass('sys_parametros_config') IS NULL THEN
          RETURN;
        END IF;
        -- Idempotent: DROP NOT NULL twice is an error in PostgreSQL, so only
        -- issue it while the constraint is actually present.
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'sys_parametros_config'
            AND column_name = 'param_value'
            AND is_nullable = 'NO'
        ) THEN
          ALTER TABLE sys_parametros_config
            ALTER COLUMN param_value DROP NOT NULL;
        END IF;
      END;
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // HONEST rollback: NOT NULL cannot be blindly restored. Null tombstone
    // rows are the append-only clearing mechanism (never garbage to clean
    // up), and the append-only trigger forbids deleting them, so "restore
    // the constraint" is only legal while NOT A SINGLE tombstone row exists.
    // When tombstones exist, the trigger would also block any rewrite of
    // them before SET NOT NULL — so this down() refuses loudly instead of
    // dropping the trigger and destroying configuration history.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('sys_parametros_config') IS NULL THEN
          RETURN;
        END IF;
        IF EXISTS (
          SELECT 1 FROM sys_parametros_config WHERE param_value IS NULL
        ) THEN
          RAISE EXCEPTION 'AllowNullParamValue1809610000000 down(): sys_parametros_config still holds null tombstone rows (the append-only clearing mechanism); restoring NOT NULL would make every future clear fail — supersede the tombstones with real values first';
        END IF;
        ALTER TABLE sys_parametros_config
          ALTER COLUMN param_value SET NOT NULL;
      END;
      $$;
    `);
  }
}
