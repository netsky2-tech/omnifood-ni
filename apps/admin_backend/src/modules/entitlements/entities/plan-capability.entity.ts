import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Global plan → capability catalog (ENT-01 of issue #984).
 *
 * PLATFORM-GLOBAL read-only reference table: NO tenant_id, no RLS — every
 * tenant reads the same frozen mapping, exactly like `uom_catalog` and the
 * `industry_templates` family. It is classified `global` in
 * scripts/schema-rls-coverage-manifest.txt.
 *
 * Rows are seeded by 1810400000000-CreateEntitlementsTables from
 * `capability-registry.ts` (the code registry derived from the frozen
 * catalog `docs/plans/entitlements/catalogo_capacidades_v1.md` §3/§4):
 * one row per (plan_code, capability_key) with NO implicit defaults.
 *
 * `value_json` shape (by capability type):
 *   - flag:  {"included": true | false}
 *   - limit: {"included": <number | null>}   (null = unlimited)
 */
@Entity('plan_capability')
export class PlanCapability {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** `ESENCIAL` | `OPERACION` | `PRO` (ENTERPRISE is quoted manually, outside this catalog). */
  @Column({ type: 'varchar' })
  plan_code: string;

  /** Frozen capability key; see `capability-registry.ts`. */
  @Column({ type: 'varchar' })
  capability_key: string;

  @Column({ type: 'jsonb' })
  value_json: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
