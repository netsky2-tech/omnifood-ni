import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';

/**
 * Append-only audit trail of plan changes AND override changes (ENT-01 of
 * issue #984, ODD: "Historial de cambios de plan y overrides").
 *
 * One table for both change kinds, discriminated by `change_type`, so every
 * commercial exception over the frozen catalog has exactly one auditable
 * home: who did it (actor), why (reason), what changed (the jsonb payloads).
 * No UPDATE and no DELETE policy exists on this table (manifest class
 * `direct:SI`): rows are written once and never mutated.
 */
@Entity('tenant_entitlement_change_history')
export class TenantEntitlementChangeHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  /** `plan` (a subscription changed plan/status) or `override`. */
  @Column({ type: 'varchar' })
  change_type: string;

  /** Set when `change_type = 'plan'`: the subscription that changed. */
  @Column({ type: 'uuid', nullable: true })
  subscription_id: string | null;

  /** Set when `change_type = 'override'`: the override that changed. */
  @Column({ type: 'uuid', nullable: true })
  override_id: string | null;

  /** The overridden key; NULL for plan changes. */
  @Column({ type: 'varchar', nullable: true })
  capability_key: string | null;

  /** Previous plan_code or previous override value; NULL on first write. */
  @Column({ type: 'jsonb', nullable: true })
  previous_value_json: Record<string, unknown> | null;

  /** New plan_code/status or the override value that now applies. */
  @Column({ type: 'jsonb' })
  new_value_json: Record<string, unknown>;

  /** Who made the change (mandatory, catalog §6.3). */
  @Column({ type: 'varchar' })
  actor: string;

  /** Why the change was made (mandatory, catalog §6.3). */
  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  occurred_at: Date;
}
