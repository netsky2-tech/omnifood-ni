import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { InventoryMovement } from './inventory-movement.entity';
import { Batch } from './batch.entity';

/**
 * R3 — the batch a Kardex outflow actually consumed, and how much.
 *
 * Append-only. One row per (movement, batch) pair. Written by
 * `drawBatchOutflow` when it is given a `movementId`, and read by
 * `restoreBatchInflow` to reverse a sale cancellation onto the SAME batches.
 * See the migration 1810010000000 for why a positive movement cannot invent a
 * lot instead.
 */
@Entity('batch_outflow_traces')
export class BatchOutflowTrace {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  // `inventory_kardex.id` is a bigint, so it hydrates as a string.
  @Column('bigint')
  movement_id: string;

  @ManyToOne(() => InventoryMovement)
  @JoinColumn({ name: 'movement_id' })
  movement: InventoryMovement;

  @Column()
  batch_id: string;

  @ManyToOne(() => Batch)
  @JoinColumn({ name: 'batch_id' })
  batch: Batch;

  @Column('decimal', { precision: 14, scale: 4 })
  quantity: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
