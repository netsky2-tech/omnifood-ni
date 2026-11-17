import { MigrationInterface, QueryRunner } from 'typeorm';
import { resolveTenantRlsPredicate } from '../core/database/tenant-rls-policy';
import {
  CAPABILITY_REGISTRY,
  NUCLEUS_CAPABILITY_KEYS,
  PLAN_CAPABILITY_MATRIX,
  type PlanCapabilityMap,
} from '../modules/entitlements/capability-registry';

/**
 * ENT-01 of issue #984: entitlements por plan — catalog, tenant tables and
 * their tenant isolation.
 *
 * Creates four tables:
 *   - `plan_capability` — GLOBAL read-only catalog (no tenant_id, no RLS),
 *     classified `global` in scripts/schema-rls-coverage-manifest.txt like
 *     `uom_catalog`. Seeded here, idempotently, from the code registry
 *     `capability-registry.ts`, which is derived EXACTLY from the frozen
 *     catalog `docs/plans/entitlements/catalogo_capacidades_v1.md` §3/§4.
 *     One row per (plan_code, capability_key) — no implicit defaults.
 *   - `tenant_subscription` — the tenant's commercial contract.
 *   - `tenant_entitlement_override` — audited exceptions (actor, motivo,
 *     expiración mandatory, catalog §6.3).
 *   - `tenant_entitlement_change_history` — append-only audit of plan and
 *     override changes (no UPDATE/DELETE policy; class `direct:SI`).
 *
 * RLS on the three tenant tables: ENABLE + FORCE, one policy per command
 * named `{table}_tenant_{command}` covering S/I/U/D exactly, predicate
 * resolved per table through the shared type-aware resolver
 * `resolveTenantRlsPredicate` (a uuid tenant_id column gets the uuid-cast
 * setting form, index-friendly). All three tenant_id columns are uuid NOT
 * NULL with an FK to tenants(id).
 *
 * up() is idempotent: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
 * deterministic policy names with catalog-guarded CREATE, and the seed uses
 * ON CONFLICT (plan_code, capability_key) DO NOTHING. down() reverses only
 * this migration: it drops exactly the twelve policies it created, removes
 * FORCE, and drops the four tables it created.
 *
 * The seed never invents keys: `PLAN_CAPABILITY_MATRIX` covers every
 * registered key of `CAPABILITY_REGISTRY`, and a drift guard re-checks here
 * that the registry and the plan matrix agree before any row is written.
 */

const TENANT_TABLES = [
  'tenant_subscription',
  'tenant_entitlement_override',
  'tenant_entitlement_change_history',
] as const;

const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

/**
 * The seed row for one (plan, capability), shaped exactly as catalog §4:
 * flags carry {"included": bool}, limits carry {"included": number|null}.
 */
function seedValueFor(
  plan: PlanCapabilityMap,
  capabilityKey: string,
): Record<string, unknown> {
  if (plan.includedLimits[capabilityKey] !== undefined) {
    return { included: plan.includedLimits[capabilityKey] };
  }
  if (plan.includedFlags[capabilityKey] !== undefined) {
    return { included: plan.includedFlags[capabilityKey] };
  }
  // Nucleus keys are always included; the unlimited POS-user quota is null.
  return { included: capabilityKey === 'core.pos_users' ? null : true };
}

export class CreateEntitlementsTables1810400000000 implements MigrationInterface {
  name = 'CreateEntitlementsTables1810400000000';

  private policyName(table: string, command: string): string {
    return `${table}_tenant_${command}`;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fail closed before writing anything if the code registry and the plan
    // matrix have drifted apart: every registered key must have a value for
    // every plan, and every matrix key must be registered.
    const registeredKeys = new Set(CAPABILITY_REGISTRY.map((c) => c.key));
    for (const plan of PLAN_CAPABILITY_MATRIX) {
      const matrixKeys = new Set([
        ...Object.keys(plan.includedFlags),
        ...Object.keys(plan.includedLimits),
        ...NUCLEUS_CAPABILITY_KEYS,
      ]);
      for (const key of matrixKeys) {
        if (!registeredKeys.has(key)) {
          throw new Error(
            `ENTITLEMENT_MATRIX_DRIFT: plan ${plan.planCode} references unregistered capability "${key}"`,
          );
        }
      }
      if (matrixKeys.size !== registeredKeys.size) {
        throw new Error(
          `ENTITLEMENT_MATRIX_DRIFT: plan ${plan.planCode} covers ${matrixKeys.size} of ${registeredKeys.size} registered keys`,
        );
      }
    }

    // Global catalog: no tenant_id, no RLS (classified `global`).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS plan_capability (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        plan_code varchar NOT NULL,
        capability_key varchar NOT NULL,
        value_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_plan_capability_plan_key
          UNIQUE (plan_code, capability_key)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_plan_capability_plan
         ON plan_capability (plan_code)`,
    );

    // The tenant's commercial contract.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tenant_subscription (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        plan_code varchar NOT NULL,
        status varchar NOT NULL DEFAULT 'active',
        starts_at timestamptz NOT NULL DEFAULT now(),
        ends_at timestamptz,
        contract_price numeric(12, 2),
        currency varchar(3) NOT NULL DEFAULT 'USD',
        support_tier varchar NOT NULL DEFAULT 'standard',
        add_ons jsonb NOT NULL DEFAULT '[]'::jsonb,
        notes text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_tenant_subscription_status
          CHECK (status IN ('active', 'suspended', 'expired')),
        CONSTRAINT chk_tenant_subscription_support_tier
          CHECK (support_tier IN ('standard', 'priority')),
        CONSTRAINT chk_tenant_subscription_currency
          CHECK (currency ~ '^[A-Z]{3}$'),
        CONSTRAINT fk_tenant_subscription_tenant
          FOREIGN KEY (tenant_id) REFERENCES tenants (id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_tenant_subscription_tenant
         ON tenant_subscription (tenant_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_tenant_subscription_tenant_status
         ON tenant_subscription (tenant_id, status)`,
    );

    // Audited exceptions: actor, reason and expiry are mandatory (§6.3).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tenant_entitlement_override (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        capability_key varchar NOT NULL,
        value_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        actor varchar NOT NULL,
        reason text NOT NULL,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_tenant_entitlement_override_tenant
          FOREIGN KEY (tenant_id) REFERENCES tenants (id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_tenant_entitlement_override_tenant
         ON tenant_entitlement_override (tenant_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_tenant_entitlement_override_tenant_key
         ON tenant_entitlement_override (tenant_id, capability_key)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_tenant_entitlement_override_tenant_expires
         ON tenant_entitlement_override (tenant_id, expires_at)`,
    );

    // Append-only audit of plan and override changes (direct:SI).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tenant_entitlement_change_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        change_type varchar NOT NULL,
        subscription_id uuid,
        override_id uuid,
        capability_key varchar,
        previous_value_json jsonb,
        new_value_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        actor varchar NOT NULL,
        reason text NOT NULL,
        occurred_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_tenant_entitlement_change_history_type
          CHECK (change_type IN ('plan', 'override')),
        CONSTRAINT chk_tenant_entitlement_change_history_ref
          CHECK (
            (change_type = 'plan' AND subscription_id IS NOT NULL)
            OR
            (change_type = 'override' AND override_id IS NOT NULL
               AND capability_key IS NOT NULL)
          ),
        CONSTRAINT fk_tenant_entitlement_change_history_tenant
          FOREIGN KEY (tenant_id) REFERENCES tenants (id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_tenant_entitlement_change_history_tenant
         ON tenant_entitlement_change_history (tenant_id, occurred_at)`,
    );

    // Seed the frozen plan → capability mapping, idempotently (catalog §4).
    for (const plan of PLAN_CAPABILITY_MATRIX) {
      for (const capability of CAPABILITY_REGISTRY) {
        await queryRunner.query(
          `INSERT INTO plan_capability (plan_code, capability_key, value_json)
           VALUES ($1, $2, $3::jsonb)
           ON CONFLICT (plan_code, capability_key) DO NOTHING`,
          [
            plan.planCode,
            capability.key,
            JSON.stringify(seedValueFor(plan, capability.key)),
          ],
        );
      }
    }

    // RLS: ENABLE + FORCE + one policy per command on every tenant table.
    for (const table of TENANT_TABLES) {
      const tableId = quoteIdentifier(table);

      await queryRunner.query(
        `ALTER TABLE ${tableId} ENABLE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE ${tableId} FORCE ROW LEVEL SECURITY`,
      );

      const tenantPredicate = await resolveTenantRlsPredicate(
        queryRunner,
        table,
      );

      const policies = [
        {
          command: 'select',
          expression: `FOR SELECT
      USING (${tenantPredicate})`,
        },
        {
          command: 'insert',
          expression: `FOR INSERT
      WITH CHECK (${tenantPredicate})`,
        },
        {
          command: 'update',
          expression: `FOR UPDATE
      USING (${tenantPredicate})
      WITH CHECK (${tenantPredicate})`,
        },
        {
          command: 'delete',
          expression: `FOR DELETE
      USING (${tenantPredicate})`,
        },
      ];

      for (const policy of policies) {
        await queryRunner.query(
          `DROP POLICY IF EXISTS ${quoteIdentifier(this.policyName(table, policy.command))} ON ${tableId}`,
        );
        // PostgreSQL has no `CREATE POLICY IF NOT EXISTS`, so guard on the catalog.
        await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = current_schema()
          AND tablename = '${table}'
          AND policyname = '${this.policyName(table, policy.command)}'
      ) THEN
        CREATE POLICY ${quoteIdentifier(this.policyName(table, policy.command))} ON ${tableId}
      ${policy.expression};
      END IF;
      END $$;`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of TENANT_TABLES) {
      const tableId = quoteIdentifier(table);

      for (const command of ['select', 'insert', 'update', 'delete']) {
        await queryRunner.query(
          `DROP POLICY IF EXISTS ${quoteIdentifier(this.policyName(table, command))} ON ${tableId}`,
        );
      }
      await queryRunner.query(
        `ALTER TABLE ${tableId} NO FORCE ROW LEVEL SECURITY`,
      );
    }

    // This migration created all four tables, so down() drops exactly them.
    await queryRunner.query(
      `DROP TABLE IF EXISTS tenant_entitlement_change_history`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS tenant_entitlement_override`);
    await queryRunner.query(`DROP TABLE IF EXISTS tenant_subscription`);
    await queryRunner.query(`DROP TABLE IF EXISTS plan_capability`);
  }
}
