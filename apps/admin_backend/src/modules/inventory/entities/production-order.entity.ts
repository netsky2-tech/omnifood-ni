import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';

@Entity('production_orders')
export class ProductionOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  recipe_version_id: string;

  @Column('decimal', { precision: 14, scale: 4 })
  planned_quantity: number;

  @Column({ default: 'DRAFT' })
  status: string;

  @CreateDateColumn()
  created_at: Date;
}
