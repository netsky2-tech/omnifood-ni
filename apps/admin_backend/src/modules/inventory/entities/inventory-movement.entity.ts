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
  SALE_CANCEL = 'SALE_CANCEL',
  PURCHASE = 'PURCHASE',
  SHRINKAGE = 'SHRINKAGE',
  PRODUCTION = 'PRODUCTION',
  ADJUSTMENT = 'ADJUSTMENT',
  REVERSAL = 'REVERSAL',
}

@Entity('inventory_kardex')
export class InventoryMovement {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column()
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'insumo_id' })
  insumoId: string;

  @Column({
    name: 'movement_type',
    type: 'enum',
    enum: MovementType,
  })
  type: MovementType;

  @Column('decimal', { precision: 14, scale: 4 })
  quantity: number;

  @Column('decimal', { precision: 14, scale: 4, name: 'stock_before' })
  previousStock: number;

  @Column('decimal', { precision: 14, scale: 4, name: 'stock_after' })
  newStock: number;

  @Column('decimal', {
    precision: 14,
    scale: 4,
    nullable: true,
    name: 'average_cost_after_nio',
  })
  averageCostAfterNio: number | null;

  @Column('decimal', {
    precision: 14,
    scale: 4,
    nullable: false,
    name: 'unit_cost_nio',
  })
  unitCostNio: number;

  @Column('decimal', {
    precision: 14,
    scale: 4,
    nullable: false,
    name: 'total_cost_nio',
  })
  totalCostNio: number;

  @Column({ nullable: true })
  idempotencyKey: string;

  @Column({ nullable: true, name: 'source_device_id' })
  sourceDeviceId: string;

  @Column({ type: 'bigint', nullable: true, name: 'source_sequence' })
  sourceSequence: string;

  @Column({ nullable: true, name: 'source_document_id', default: '' })
  reason: string;

  @Column({ name: 'source_document_type', default: 'SYSTEM' })
  sourceDocumentType: string;

  @Column({
    type: 'bigint',
    nullable: true,
    name: 'compensation_for_kardex_id',
  })
  compensationForKardexId: string | null;

  @Column({ nullable: true })
  user_id: string;

  @CreateDateColumn({ name: 'occurred_at' })
  timestamp: Date;
}
