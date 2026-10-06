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
import { Product } from '../../inventory/entities/product.entity';
import { ModifierGroup } from './modifier-group.entity';

/**
 * Attaches a reusable modifier group to a single PRODUCT (ODD task T1.1).
 *
 * Per-product exceptions to the groups inherited through the category:
 * the dashboard shows the inherited set as inherited and adds or overrides
 * here. The composite tenant FKs make cross-tenant rows impossible at the
 * schema level.
 */
@Entity('product_modifier_groups')
@Index('uq_product_modifier_groups_product_group', ['product_id', 'group_id'], {
  unique: true,
})
@Index('idx_product_modifier_groups_tenant_product', [
  'tenant_id',
  'product_id',
])
export class ProductModifierGroup {
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

  @Column({ name: 'product_id', type: 'uuid' })
  product_id: string;

  @ManyToOne(() => Product, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'product_id' })
  product: Product;

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
