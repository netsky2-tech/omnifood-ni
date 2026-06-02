import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('inventory_sync_receipts')
export class InventorySyncReceipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenant_id: string;

  @Column()
  idempotency_key: string;

  @Column()
  source_device_id: string;

  @Column('bigint')
  source_sequence: string;

  @Column()
  payload_hash: string;

  @CreateDateColumn()
  created_at: Date;
}
