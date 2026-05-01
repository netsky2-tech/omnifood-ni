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
import { Insumo } from './insumo.entity';

@Entity('uom_conversions')
export class UomConversion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  insumo_id: string;

  @ManyToOne(() => Insumo, (insumo) => insumo.conversions)
  @JoinColumn({ name: 'insumo_id' })
  insumo: Insumo;

  @Column()
  unit_name: string;

  @Column('decimal', { precision: 12, scale: 4 })
  factor: number;

  @Column({ default: false })
  is_default: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
