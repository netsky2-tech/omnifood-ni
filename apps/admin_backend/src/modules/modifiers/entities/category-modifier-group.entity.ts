import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { CatalogValue } from '../../catalog/entities/catalog-value.entity';
import { ModifierGroup } from './modifier-group.entity';

/**
 * Attaches a reusable modifier group to a product CATEGORY (ODD task T1.1).
 *
 * The category identity is the EXISTING `catalog_values` table filtered to
 * `catalog_type = 'SALES_PRODUCT_CATEGORY'` — no product_categories table.
 * The attachment is by FK to catalog_values.id; the sync contract (later
 * task) exposes the resolved `code` to the POS. Groups attached here are
 * inherited by every product in the category; per-product exceptions live in
 * product_modifier_groups.
 */
@Entity('category_modifier_groups')
@Index(
  'uq_category_modifier_groups_value_group',
  ['catalog_value_id', 'group_id'],
  {
    unique: true,
  },
)
export class CategoryModifierGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenant_id: string;

  // Relation-only mappings: referential integrity is owned exclusively by the
  // migration's composite (tenant_id, id) foreign keys and must never be
  // re-derived by the ORM.
  @ManyToOne(() => Tenant, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'catalog_value_id', type: 'uuid' })
  catalog_value_id: string;

  @ManyToOne(() => CatalogValue, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'catalog_value_id' })
  catalog_value: CatalogValue;

  @Column({ name: 'group_id', type: 'uuid' })
  group_id: string;

  @ManyToOne(() => ModifierGroup, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'group_id' })
  group: ModifierGroup;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sort_order: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;
}
