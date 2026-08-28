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

  @Column({ type: 'varchar', nullable: true })
  target_category_id?: string | null;

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
      from: (value: string | number) => (typeof value === 'string' ? parseFloat(value) : value),
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
      from: (value: string | number) => (typeof value === 'string' ? parseFloat(value) : value),
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

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
