import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { CatalogValue } from '../../catalog/entities/catalog-value.entity';

export enum PromotionType {
  BUY_X_GET_Y_FREE = 'buyXGetYFree',
  PERCENTAGE_DISCOUNT = 'percentageDiscount',
  FIXED_DISCOUNT = 'fixedDiscount',
  COMBO_PACKAGE = 'comboPackage',
}

@Entity('promotions')
@Index('idx_promotions_tenant_active', ['tenant_id', 'is_active'])
@Index('idx_promotions_tenant_priority', ['tenant_id', 'priority'])
export class Promotion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'varchar' })
  name: string;

  @Column({
    type: 'enum',
    enum: PromotionType,
    default: PromotionType.BUY_X_GET_Y_FREE,
  })
  type: PromotionType;

  @Column({ type: 'varchar', nullable: true })
  target_product_id?: string | null;

  // T0.5'a: a uuid FK to catalog_values(tenant_id, id) — the SAME category
  // identity modifier groups attach to (ODD §20). The composite tenant FK is
  // owned by the migration (1809570000000) and only guarantees the row
  // exists in the SAME tenant; catalog_values is shared by four catalog
  // types, so the FK does NOT restrict to product categories — that guard
  // (catalog_type = 'SALES_PRODUCT_CATEGORY') lives in the service layer,
  // not here. NULL keeps its POS-engine meaning: a GLOBAL promotion
  // (promotions_engine.dart:110/:132), which is exactly why the migration
  // deactivates any promotion whose text it could not resolve.
  @Column({ type: 'uuid', nullable: true })
  target_category_id?: string | null;

  // Relation-only mapping: referential integrity is owned exclusively by the
  // migration's composite (tenant_id, id) foreign key and must never be
  // re-derived by the ORM.
  @ManyToOne(() => CatalogValue, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'target_category_id' })
  target_category?: CatalogValue;

  @Column({ type: 'int', default: 0 })
  buy_quantity: number;

  @Column({ type: 'int', default: 0 })
  get_quantity: number;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0.0,
    transformer: {
      to: (value: number) => value,
      from: (value: string | number) =>
        typeof value === 'string' ? parseFloat(value) : value,
    },
  })
  discount_value: number;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0.0,
    transformer: {
      to: (value: number) => value,
      from: (value: string | number) =>
        typeof value === 'string' ? parseFloat(value) : value,
    },
  })
  min_order_amount: number;

  @Column({ type: 'simple-array', nullable: true })
  days_of_week?: string[] | null; // e.g. ["5", "6"]

  @Column({ type: 'varchar', nullable: true })
  start_time?: string | null; // "17:00"

  @Column({ type: 'varchar', nullable: true })
  end_time?: string | null; // "20:00"

  @Column({ type: 'bigint', nullable: true })
  start_date?: number | null;

  @Column({ type: 'bigint', nullable: true })
  end_date?: number | null;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ name: 'is_stackable', default: true })
  is_stackable: boolean;

  @Column({ name: 'is_active', default: true })
  is_active: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;
}
