import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('inventory_remediation_receipts')
@Index('uq_inventory_remediation_receipts_idempotency', ['tenant_id', 'idempotency_key'], {
  unique: true,
})
@Index('uq_inventory_remediation_receipts_source_command', ['tenant_id', 'source_invoice_id', 'command_type'], {
  unique: true,
})
@Index('idx_inventory_remediation_receipts_tenant_created', ['tenant_id', 'created_at'])
@Index('idx_inventory_remediation_receipts_source_receipt', ['tenant_id', 'source_inventory_receipt_id'])
@Index('idx_inventory_remediation_receipts_recipe_version', ['tenant_id', 'recipe_version_id'])
export class InventoryRemediationReceipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128 })
  tenant_id: string;

  @Column({ type: 'varchar', length: 255 })
  idempotency_key: string;

  @Column({ type: 'varchar', length: 64, default: 'SALE_INVENTORY_REMEDIATION' })
  command_type: string;

  @Column({ type: 'varchar', length: 64 })
  request_hash: string;

  @Column({ type: 'uuid' })
  source_invoice_id: string;

  @Column({ type: 'uuid' })
  source_inventory_receipt_id: string;

  @Column({ type: 'uuid' })
  recipe_version_id: string;

  @Column({ type: 'varchar', length: 128 })
  actor_user_id: string;

  @Column({ type: 'varchar', length: 64 })
  actor_role: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'varchar', length: 32, default: 'APPLIED' })
  status: string;

  @Column({ type: 'jsonb', default: {} })
  result: Record<string, any>;

  @Column({ type: 'uuid' })
  audit_event_id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  completed_at: Date;
}
