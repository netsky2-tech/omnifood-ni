import { type MigrationInterface, type QueryRunner } from 'typeorm';
import { findPlan } from '../modules/entitlements/capability-registry';

/**
 * ENT-08 of issue #984 (ODD S16/S17): backfill of the tenants that existed
 * before entitlements did.
 *
 * Owner decision (2026-11-19): every tenant without a row in
 * `tenant_subscription` resolves to `sin_plan` — nucleus only, floor of one
 * terminal and two owners — so deploying entitlements without this backfill
 * would remove purchases, recipes, promotions and margins from customers who
 * use them today. The production customer used every feature, so every
 * existing tenant gets the plan that grants full access: PRO, with the
 * support tier that plan itself declares in `capability-registry.ts`.
 *
 * Each inserted subscription carries its `tenant_entitlement_change_history`
 * row in the SAME statement (one CTE-style DO-block iteration): a plan trail
 * row without its contract is impossible anyway — the history table's CHECK
 * requires `subscription_id` NOT NULL for `change_type = 'plan'` — and the
 * ENT-06 rule stands: without trace there is no backfill.
 *
 * Why a per-tenant `set_config` loop instead of one set-based INSERT:
 * `tenant_subscription` and `tenant_entitlement_change_history` are FORCE RLS
 * (migration 1810400000000), and the migration runs as the schema-owner role
 * that FORCE applies to. Without the binding, `current_setting('app.tenant_id')`
 * is NULL and every INSERT fails its WITH CHECK — or, worse, the NOT EXISTS
 * guard sees zero rows and would double-insert on a bound session. Binding
 * per tenant reuses the exact policy path production writes go through, and
 * the DB spec proves both `up` and `down` under a NOBYPASSRLS role.
 *
 * The binding is transaction-local (`set_config(..., true)`) and lives only
 * inside each DO-block statement; migrations run in their own dedicated
 * session (the TypeORM CLI process), so no application session ever inherits
 * the binding after the migration ends.
 *
 * Idempotency (ODD S16): the guard re-checks `NOT EXISTS` per tenant with
 * the binding already set, so re-running the migration on a database that
 * already has the subscriptions is a no-op.
 *
 * The down/up asymmetry (ODD S17), on purpose: `down` deletes ONLY the
 * subscriptions this migration created — the ones marked
 * `notes = 'backfill:#984'` — and NEVER touches the trail rows. The history
 * is append-only by trigger (migration 1810600000000: UPDATE, DELETE and
 * TRUNCATE all raise `restrict_violation`), and deleting the trail would
 * contradict the ENT-06 guarantee that every commercial act leaves a
 * permanent record. The orphaned history rows are the record of what the
 * backfill did, which is exactly what an audit would ask for after a
 * rollback.
 */
export class BackfillFounderSubscriptions1810700000000 implements MigrationInterface {
  name = 'BackfillFounderSubscriptions1810700000000';

  /** Marker so `down` deletes only what this migration created (ODD S17). */
  private static readonly MARKER = 'backfill:#984';
  private static readonly ACTOR = 'migration:#984-backfill';
  private static readonly REASON =
    'Backfill del despliegue de entitlements (#984): todo tenant existente ' +
    'sin suscripción recibe PRO porque el cliente en producción usaba todas ' +
    'las funciones de la app y del panel; sin esta fila quedaría en ' +
    'sin_plan (solo núcleo) y perdería compras, recetas, promociones y márgenes.';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fail closed on drift: if the registry ever stops knowing PRO, or
    // changes its support tier, this migration must not guess.
    const proPlan = findPlan('PRO');
    if (!proPlan) {
      throw new Error(
        'BACKFILL_PLAN_DRIFT: "PRO" is not in the plan matrix (capability-registry.ts); refusing to backfill with an invented plan',
      );
    }
    const planCode = proPlan.planCode;
    const supportTier = proPlan.supportTier;
    if (planCode.includes("'") || supportTier.includes("'")) {
      throw new Error('BACKFILL_PLAN_DRIFT: plan values must be plain codes');
    }

    await queryRunner.query(`
      DO $$
      DECLARE
        tenant_row RECORD;
        new_subscription_id uuid;
        contract jsonb;
      BEGIN
        FOR tenant_row IN SELECT id FROM tenants LOOP
          PERFORM set_config('app.tenant_id', tenant_row.id::text, true);

          -- Idempotent guard, evaluated WITH the tenant bound (ODD S16).
          IF NOT EXISTS (
            SELECT 1 FROM tenant_subscription WHERE tenant_id = tenant_row.id
          ) THEN
            INSERT INTO tenant_subscription
              (tenant_id, plan_code, status, starts_at, ends_at, add_ons,
               support_tier, notes)
            VALUES
              (tenant_row.id, '${planCode}', 'active', now(), NULL, '[]'::jsonb,
               '${supportTier}', '${BackfillFounderSubscriptions1810700000000.MARKER}')
            RETURNING id INTO new_subscription_id;

            SELECT jsonb_build_object(
                     'plan_code',    plan_code,
                     'status',       status,
                     'starts_at',    to_jsonb(starts_at),
                     'ends_at',      to_jsonb(ends_at),
                     'add_ons',      add_ons,
                     'support_tier', support_tier
                   )
              INTO contract
              FROM tenant_subscription
             WHERE id = new_subscription_id;

            INSERT INTO tenant_entitlement_change_history
              (tenant_id, change_type, subscription_id, capability_key,
               previous_value_json, new_value_json, actor, reason)
            VALUES
              (tenant_row.id, 'plan', new_subscription_id, NULL, NULL,
               contract, '${BackfillFounderSubscriptions1810700000000.ACTOR}',
               '${BackfillFounderSubscriptions1810700000000.REASON}');
          END IF;
        END LOOP;
      END;
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        tenant_row RECORD;
      BEGIN
        FOR tenant_row IN SELECT id FROM tenants LOOP
          PERFORM set_config('app.tenant_id', tenant_row.id::text, true);

          -- Only the rows this migration created. A subscription a support
          -- operator wrote through the CLI carries different (or no) notes
          -- and MUST survive a rollback of this migration.
          DELETE FROM tenant_subscription
           WHERE tenant_id = tenant_row.id
             AND notes = '${BackfillFounderSubscriptions1810700000000.MARKER}';

          -- Deliberately NO delete on tenant_entitlement_change_history:
          -- the trail is append-only by trigger (1810600000000) and stays
          -- after the subscriptions are gone (ODD S17).
        END LOOP;
      END;
      $$;
    `);
  }
}
