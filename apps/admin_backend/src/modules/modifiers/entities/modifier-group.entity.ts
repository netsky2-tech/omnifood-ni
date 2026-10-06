import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';

/**
 * Reusable modifier group (extras/modifiers, ODD task T1.1).
 *
 * One row per configurable group (e.g. "Leche", "Endulzante", "Extras").
 * Selection rules are explicit integers with no unbounded sentinel:
 * `min_selected >= 1` means the group is required, `max_selected >= 1`
 * always, and `max_selected >= min_selected` — both invariants are enforced
 * in the database (`chk_modifier_groups_max_gte_min`), so a group that
 * allows many selections stores an explicit `max_selected`. `min_selected = 0`
 * means optional. `allow_quantities` decides whether its options accept
 * quantities ("2x extra shot"). Option prices are a delta over the product's
 * base price; this table never stores absolute prices.
 *
 * Soft-delete via `is_active` instead of row deletion, so historical
 * invoices and the POS mirror keep resolving their references. Attachments
 * to categories (catalog_values) and products live in the join tables.
 */
@Entity('modifier_groups')
@Unique('uq_modifier_groups_tenant_name', ['tenant_id', 'name'])
@Unique('uq_modifier_groups_tenant_id', ['tenant_id', 'id'])
export class ModifierGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenant_id: string;

  // Relation-only mapping: referential integrity is owned exclusively by the
  // migration's composite (tenant_id, id) foreign keys and must never be
  // re-derived by the ORM.
  @ManyToOne(() => Tenant, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ name: 'min_selected', type: 'int', default: 0 })
  min_selected: number;

  @Column({ name: 'max_selected', type: 'int', default: 1 })
  max_selected: number;

  @Column({ name: 'allow_quantities', default: false })
  allow_quantities: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sort_order: number;

  @Column({ name: 'is_active', default: true })
  is_active: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;
}
