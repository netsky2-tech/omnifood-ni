import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';

/**
 * One audited exception over a capability or limit (catalog §2, §6.3).
 *
 * `actor`, `reason` (motivo) and `expires_at` are mandatory — catalog §6
 * requires all three for an override to be valid. An expired override stops
 * applying without its row being deleted: the record stays for audit and
 * `expires_at <= now()` is part of resolution (ENT-02).
 *
 * `capability_key` must be a registered key of `capability-registry.ts`; the
 * registry itself decides whether the key is gateable at all.
 */
@Entity('tenant_entitlement_override')
export class TenantEntitlementOverride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'varchar' })
  capability_key: string;

  /** The override's value (e.g. {"included": true} or a quota number). */
  @Column({ type: 'jsonb' })
  value_json: Record<string, unknown>;

  /** Who authorized the exception (mandatory, catalog §6.3). */
  @Column({ type: 'varchar' })
  actor: string;

  /** Why (mandatory, catalog §6.3). */
  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'timestamptz' })
  expires_at: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
