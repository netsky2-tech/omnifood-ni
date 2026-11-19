import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Issue #984, ENT-06 debt: makes the entitlement audit trail append-only **in
 * the database**.
 *
 * The runbook claimed `tenant_entitlement_change_history` was read-only "by
 * database policy". It was not: the ENT-01 migration creates S/I/U/D policies
 * for the application role, so a support session with SQL access could rewrite
 * or delete the trail. The trail is the only proof of who granted a commercial
 * exception and why, and it is what an audit (DGI or commercial) would ask for,
 * so trusting a procedure was not enough.
 *
 * Why a trigger and not just dropping the UPDATE/DELETE policies: without a
 * policy the mutation would silently affect zero rows, and a silent no-op is
 * worse than a loud failure — an operator would believe the change happened.
 * The trigger raises `restrict_violation` for UPDATE, DELETE and TRUNCATE, so
 * every attempt is both refused and visible.
 *
 * INSERT stays allowed: append-only is not read-only.
 *
 * Idempotent by construction (`CREATE OR REPLACE FUNCTION` plus
 * `DROP TRIGGER IF EXISTS`), so re-running it on a database that already has
 * the guard is a no-op.
 */
export class HardenEntitlementChangeHistory1810600000000 implements MigrationInterface {
  name = 'HardenEntitlementChangeHistory1810600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION reject_entitlement_change_history_mutation()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION
          'tenant_entitlement_change_history is append-only: % is not allowed',
          TG_OP
          USING ERRCODE = 'restrict_violation';
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Row-level: an UPDATE or DELETE of an existing entry.
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS tenant_entitlement_change_history_append_only
        ON tenant_entitlement_change_history;
      CREATE TRIGGER tenant_entitlement_change_history_append_only
        BEFORE UPDATE OR DELETE ON tenant_entitlement_change_history
        FOR EACH ROW
        EXECUTE FUNCTION reject_entitlement_change_history_mutation();
    `);

    // Statement-level: TRUNCATE never visits rows, so it needs its own guard.
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS tenant_entitlement_change_history_no_truncate
        ON tenant_entitlement_change_history;
      CREATE TRIGGER tenant_entitlement_change_history_no_truncate
        BEFORE TRUNCATE ON tenant_entitlement_change_history
        FOR EACH STATEMENT
        EXECUTE FUNCTION reject_entitlement_change_history_mutation();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS tenant_entitlement_change_history_no_truncate
        ON tenant_entitlement_change_history;
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS tenant_entitlement_change_history_append_only
        ON tenant_entitlement_change_history;
    `);
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS reject_entitlement_change_history_mutation();
    `);
  }
}
