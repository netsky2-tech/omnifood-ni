import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('tenant_fulfillment_records')
@Index('idx_tenant_fulfillment_tenant_sale', ['tenant_id', 'sale_id'])
@Index('idx_tenant_fulfillment_tenant_created', ['tenant_id', 'created_at'])
export class TenantFulfillmentRecord {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  id: string;

  @Column({ type: 'varchar', length: 64 })
  tenant_id: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  sale_id?: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  topology_snapshot_id?: string;

  @Column({ type: 'integer', nullable: true })
  topology_revision?: number;

  @Column({ type: 'varchar', length: 64 })
  channel: string;

  @Column({ type: 'varchar', length: 64 })
  route_state: string;

  @Column({ type: 'varchar', length: 64, default: 'PENDING' })
  delivery_state: string;

  @Column({ type: 'jsonb', nullable: true })
  lines_payload?: Record<string, unknown> | Array<Record<string, unknown>>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  synced_at?: Date;
}
