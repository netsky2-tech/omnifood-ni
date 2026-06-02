import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Shrinkage } from './shrinkage.entity';

@Entity('shrinkage_details')
export class ShrinkageDetail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  shrinkage_id: string;

  @ManyToOne(() => Shrinkage)
  @JoinColumn({ name: 'shrinkage_id' })
  shrinkage: Shrinkage;

  @Column()
  insumo_id: string;

  @Column('decimal', { precision: 14, scale: 4 })
  quantity: number;

  @Column('decimal', { precision: 14, scale: 4 })
  unit_cost_nio: number;
}
