import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('inventory_sync_outbox')
@Index(
  'uq_inventory_sync_outbox_stream_sequence',
  ['tenant_id', 'source_device_id', 'flow_type', 'source_sequence'],
  { unique: true },
)
export class InventorySyncOutbox {
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
  document_type: string;

  @Column()
  payload_hash: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ default: 'PENDING' })
  status: string;

  @Column({ nullable: true })
  last_error: string;

  @Column({ nullable: true })
  result_code: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
