import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('tenant_capability_event')
@Index('uq_tenant_capability_event_revision', ['tenant_id', 'revision'], {
  unique: true,
})
export class TenantCapabilityEvent {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() tenant_id: string;
  @Column() actor_user_id: string;
  @Column() previous_version: string;
  @Column() new_version: string;
  @Column({ type: 'integer' }) contract_version: number;
  @Column() reason: string;
  @Column({ type: 'integer' }) revision: number;
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
}
