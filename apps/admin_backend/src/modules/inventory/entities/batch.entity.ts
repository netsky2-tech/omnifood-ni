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

@Entity('batches')
export class Batch {
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
  batch_number: string;

  @Column({ type: 'date' })
  expiration_date: Date;

  @Column('decimal', { precision: 12, scale: 4 })
  remaining_stock: number;

  @Column('decimal', { precision: 12, scale: 2 })
  cost: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
