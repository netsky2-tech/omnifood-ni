import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('inventory_sync_receipts')
@Index(
  'uq_inventory_sync_receipts_stream_sequence',
  ['tenant_id', 'source_device_id', 'flow_type', 'source_sequence'],
  { unique: true },
)
@Index(
  'uq_inventory_sync_receipts_idempotency_key',
  ['tenant_id', 'idempotency_key', 'flow_type'],
  { unique: true },
)
export class InventorySyncReceipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenant_id: string;

  @Column()
  idempotency_key: string;

  @Column()
  source_device_id: string;

  @Column({ default: 'inventory' })
  flow_type: string;

  @Column('bigint')
  source_sequence: string;

  @Column()
  payload_hash: string;

  @Column({ default: 'ACCEPTED' })
  result_status: string;

  @Column({ nullable: true })
  result_code: string | null;

  @Column({ name: 'inventory_policy_version', nullable: true })
  inventoryPolicyVersion?: string | null;

  @Column({ name: 'inventory_outcome', nullable: true })
  inventoryOutcome?: string | null;

  @Column({ name: 'inventory_outcome_reason', type: 'jsonb', nullable: true })
  inventoryOutcomeReason?: Record<string, any> | null;

  @Column({ name: 'acknowledged_correlation_ids', type: 'jsonb', nullable: true })
  acknowledgedCorrelationIds?: string[] | null;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt?: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
