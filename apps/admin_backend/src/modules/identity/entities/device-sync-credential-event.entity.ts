import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { DeviceSyncCredential } from './device-sync-credential.entity';

export enum DeviceSyncCredentialEventType {
  PROVISIONED = 'PROVISIONED',
  CONFIRMED = 'CONFIRMED',
  TOKEN_ISSUED = 'TOKEN_ISSUED',
  RETIRED = 'RETIRED',
  REVOKED = 'REVOKED',
}

@Entity({ name: 'device_sync_credential_events' })
export class DeviceSyncCredentialEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  @Index('idx_device_sync_cred_events_tenant')
  tenantId!: string;

  @Column({ name: 'credential_id', type: 'uuid' })
  @Index('idx_device_sync_cred_events_credential')
  credentialId!: string;

  @ManyToOne(() => DeviceSyncCredential, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'credential_id' })
  credential!: DeviceSyncCredential;

  @Column({ name: 'event_type', type: 'varchar', length: 64 })
  eventType!: string;

  @Column({ name: 'metadata', type: 'jsonb', default: () => `'{}'` })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({
    name: 'occurred_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  occurredAt!: Date;
}
