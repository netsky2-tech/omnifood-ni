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

  @CreateDateColumn()
  created_at: Date;
}
