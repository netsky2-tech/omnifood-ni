import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProductionOrder } from './production-order.entity';

@Entity('production_order_lines')
export class ProductionOrderLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  production_order_id: string;

  @ManyToOne(() => ProductionOrder)
  @JoinColumn({ name: 'production_order_id' })
  productionOrder: ProductionOrder;

  @Column()
  insumo_id: string;

  @Column('decimal', { precision: 14, scale: 4 })
  quantity: number;

  @Column('decimal', { precision: 14, scale: 4 })
  unit_cost_nio: number;
}
