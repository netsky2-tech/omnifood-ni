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

export enum ProductType {
  SIMPLE = 'SIMPLE',
  COMPOUND = 'COMPOUND',
  PREPARED = 'PREPARED',
  VARIANT_PARENT = 'VARIANT_PARENT',
}

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ nullable: true })
  warehouse_id: string;

  @Column({ default: false })
  is_perishable: boolean;

  @Column()
  name: string;

  @Column()
  uom: string;

  @Column({
    type: 'enum',
    enum: ProductType,
    default: ProductType.SIMPLE,
  })
  product_type: ProductType;

  @Column({ nullable: true })
  category_code: string;

  @Column('decimal', { precision: 12, scale: 4, default: 0 })
  stock: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  averageCost: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  sellPrice: number;

  @Column({ default: true })
  is_active: boolean;

  /** Business migration default (not a legal requirement — see Product.taxRate docs). */
  @Column('decimal', { precision: 5, scale: 4, default: 0.15 })
  tax_rate: number;

  @Column({ default: false })
  is_tax_exempt: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
