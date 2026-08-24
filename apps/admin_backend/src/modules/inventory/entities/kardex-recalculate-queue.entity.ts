import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';

export enum KardexQueueStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  BLOCKED = 'BLOCKED',
  FAILED = 'FAILED',
}

@Entity('kardex_recalculate_queue')
@Index('uq_kardex_queue_origin_trigger', ['tenant_id', 'originMovementId', 'triggerMovementId'], { unique: true })
@Index('idx_kardex_queue_tenant_status', ['tenant_id', 'status', 'createdAt'])
export class KardexRecalculateQueue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'insumo_id', type: 'uuid' })
  insumoId: string;

  @Column({ name: 'origin_movement_id', type: 'bigint' })
  originMovementId: string;

  @Column({ name: 'trigger_movement_id', type: 'bigint' })
  triggerMovementId: string;

  @Column({
    type: 'enum',
    enum: KardexQueueStatus,
    default: KardexQueueStatus.PENDING,
  })
  status: KardexQueueStatus;

  @Column({ default: 0 })
  attempts: number;

  @Column({ name: 'claimed_at', type: 'timestamptz', nullable: true })
  claimedAt: Date | null;

  @Column({ name: 'claimed_by', nullable: true })
  claimedBy: string | null;

  @Column({ name: 'last_error', nullable: true })
  lastError: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
