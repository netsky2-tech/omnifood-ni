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
 * The commercial contract of one tenant (ENT-01 of issue #984, catalog §2).
 *
 * Carries the plan, its state and validity window, the contractual price and
 * currency, the purchased add-ons and free-form notes. NO automatic billing:
 * charging is explicitly out of scope (catalog §11).
 *
 * `support_tier` is a contract attribute, NOT a capability key: catalog §3
 * ruled that `support.priority` is a service obligation (SLA), not a product
 * feature, so it is never gated — it is recorded and audited here.
 *
 * A tenant WITHOUT a subscription row keeps the nucleus and an explicit
 * `sin_plan` state in the resolved snapshot (catalog §6, ODD S1/S4): the
 * absence of a row is a meaningful state, never "all capabilities".
 */
@Entity('tenant_subscription')
export class TenantSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  /** `ESENCIAL` | `OPERACION` | `PRO` (see `capability-registry.ts`). */
  @Column({ type: 'varchar' })
  plan_code: string;

  /** `active` | `suspended` | `expired` (catalog §6: vencida o suspendida). */
  @Column({ type: 'varchar', default: 'active' })
  status: string;

  @Column({ type: 'timestamptz' })
  starts_at: Date;

  /** Contract end; NULL = no fixed end. */
  @Column({ type: 'timestamptz', nullable: true })
  ends_at: Date | null;

  /** Contractual price as sold; nullable because quotes can be open. */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  contract_price: string | null;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({ type: 'varchar', default: 'standard' })
  support_tier: string;

  /** Purchased add-on codes (`pack.retail`, `terminal.extra`, …, catalog §5). */
  @Column({ type: 'jsonb' })
  add_ons: string[];

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
