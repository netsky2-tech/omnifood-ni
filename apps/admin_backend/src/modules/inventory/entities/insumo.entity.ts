import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { UomConversion } from './uom-conversion.entity';

export const NEGATIVE_STOCK_POLICY = {
  ALLOW_TEMPORARY: 'ALLOW_TEMPORARY',
  RESTRICT: 'RESTRICT',
} as const;

export type NegativeStockPolicy =
  (typeof NEGATIVE_STOCK_POLICY)[keyof typeof NEGATIVE_STOCK_POLICY];

@Entity('insumos')
export class Insumo {
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

  @OneToMany(() => UomConversion, (conv) => conv.insumo)
  conversions: UomConversion[];

  @Column()
  name: string;

  @Column()
  purchaseUom: string;

  @Column()
  consumptionUom: string;

  @Column('decimal', { precision: 12, scale: 4, default: 1 })
  conversionFactor: number;

  @Column('decimal', { precision: 14, scale: 4, default: 0 })
  stock: number;

  @Column('decimal', {
    precision: 14,
    scale: 4,
    default: 0,
    name: 'existencia_actual',
  })
  existenciaActual: number;

  @Column('decimal', {
    precision: 14,
    scale: 4,
    default: 0,
    name: 'costo_promedio_nio',
  })
  averageCost: number;

  @Column('decimal', { precision: 14, scale: 4, nullable: true })
  parLevel: number;

  @Column('decimal', {
    precision: 14,
    scale: 4,
    nullable: true,
    name: 'min_stock',
  })
  minStock: number;

  @Column('decimal', {
    precision: 14,
    scale: 4,
    nullable: true,
    name: 'max_stock',
  })
  maxStock: number;

  @Column({ default: true })
  is_active: boolean;

  @Column({
    type: 'varchar',
    name: 'negative_stock_policy',
    default: NEGATIVE_STOCK_POLICY.RESTRICT,
  })
  negativeStockPolicy: NegativeStockPolicy;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
