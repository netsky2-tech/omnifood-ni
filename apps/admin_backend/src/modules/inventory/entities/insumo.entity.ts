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

  @Column('decimal', { precision: 12, scale: 4, default: 0 })
  stock: number;

  @Column('decimal', { precision: 18, scale: 8, default: 0 })
  averageCost: number;

  @Column('decimal', { precision: 12, scale: 4, nullable: true })
  parLevel: number;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
