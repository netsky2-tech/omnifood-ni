import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { ModifierGroup } from './modifier-group.entity';

/**
 * One selectable option inside a reusable modifier group (ODD task T1.1).
 *
 * `price_delta` is the amount ADDED to the product's base price when the
 * option is chosen (the industry-standard delta pricing; same numeric shape
 * as products.sell_price). `is_default` marks the pre-selected option for
 * required groups. The composite tenant FK to modifier_groups makes a
 * cross-tenant child row impossible at the schema level.
 */
@Entity('modifier_options')
@Unique('uq_modifier_options_tenant_id', ['tenant_id', 'id'])
@Index('idx_modifier_options_tenant_group_active', [
  'tenant_id',
  'group_id',
  'is_active',
])
export class ModifierOption {
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

  @Column({ name: 'group_id', type: 'uuid' })
  group_id: string;

  @ManyToOne(() => ModifierGroup, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'group_id' })
  group: ModifierGroup;

  @Column({ type: 'varchar' })
  name: string;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    name: 'price_delta',
    default: 0,
  })
  price_delta: number;

  @Column({ name: 'is_default', default: false })
  is_default: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sort_order: number;

  @Column({ name: 'is_active', default: true })
  is_active: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;
}
