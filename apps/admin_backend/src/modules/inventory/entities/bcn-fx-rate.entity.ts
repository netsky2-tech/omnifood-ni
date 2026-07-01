import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('inventory_bcn_fx_rates')
@Index('uq_inventory_bcn_fx_rates_effective_date', ['effective_date'], {
  unique: true,
})
export class BcnFxRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  effective_date: string;

  @Column('decimal', { precision: 14, scale: 4, name: 'rate_nio' })
  rate_nio: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
