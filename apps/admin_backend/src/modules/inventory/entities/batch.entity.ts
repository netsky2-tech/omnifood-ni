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

  // Calendar days, not instants: the column is a PostgreSQL `date`, so the
  // only faithful representation is the ISO day string the database stores.
  // See src/core/database/calendar-day.ts before changing these back to
  // `Date` — that typing produced both a crash and a silent one-day shift.
  @Column({ type: 'date', name: 'received_date' })
  received_date: string;

  @Column({ type: 'date' })
  expiration_date: string;

  @Column('decimal', { precision: 14, scale: 4 })
  remaining_stock: number;

  @Column('decimal', { precision: 14, scale: 4 })
  cost: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
