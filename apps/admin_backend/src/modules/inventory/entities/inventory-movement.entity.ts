import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';

export enum MovementType {
  SALE = 'SALE',
  PURCHASE = 'PURCHASE',
  SHRINKAGE = 'SHRINKAGE',
  ADJUSTMENT = 'ADJUSTMENT',
  REVERSAL = 'REVERSAL',
}

@Entity('inventory_movements')
export class InventoryMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  insumoId: string;

  @Column({
    type: 'enum',
    enum: MovementType,
  })
  type: MovementType;

  @Column('decimal', { precision: 12, scale: 4 })
  quantity: number;

  @Column('decimal', { precision: 12, scale: 4 })
  previousStock: number;

  @Column('decimal', { precision: 12, scale: 4 })
  newStock: number;

  @Column({ nullable: true })
  reason: string;

  @Column({ nullable: true })
  user_id: string;

  @CreateDateColumn()
  timestamp: Date;
}
