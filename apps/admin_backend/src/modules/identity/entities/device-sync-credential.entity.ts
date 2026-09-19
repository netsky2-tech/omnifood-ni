import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { ActivationAttempt } from '../../onboarding/entities/activation-attempt.entity';

export enum DeviceSyncCredentialStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  RETIRED = 'RETIRED',
  REVOKED = 'REVOKED',
}

export const DEVICE_SYNC_V1_SCOPES = ['sync:push', 'sync:pull'] as const;
export type DeviceSyncScope = (typeof DEVICE_SYNC_V1_SCOPES)[number];

@Entity({ name: 'device_sync_credentials' })
@Unique('uq_device_sync_credentials_attempt_version', [
  'activationAttemptId',
  'version',
])
export class DeviceSyncCredential {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  @Index('idx_device_sync_credentials_tenant')
  tenantId!: string;

  @Column({ name: 'activation_attempt_id', type: 'uuid' })
  @Index('idx_device_sync_credentials_attempt')
  activationAttemptId!: string;

  @ManyToOne(() => ActivationAttempt, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'activation_attempt_id' })
  activationAttempt!: ActivationAttempt;

  @Column({ name: 'renewal_secret_hash', type: 'varchar', length: 255 })
  renewalSecretHash!: string;

  @Column({
    name: 'scopes',
    type: 'jsonb',
    default: () => `'["sync:push", "sync:pull"]'`,
  })
  scopes!: string[];

  @Column({ name: 'version', type: 'int', default: 1 })
  version!: number;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 64,
    default: DeviceSyncCredentialStatus.PENDING,
  })
  @Index('idx_device_sync_credentials_status')
  status!: DeviceSyncCredentialStatus;

  @Column({
    name: 'expires_at',
    type: 'timestamptz',
    nullable: false,
  })
  expiresAt!: Date;

  @Column({
    name: 'issued_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  issuedAt!: Date;

  @Column({
    name: 'rotated_at',
    type: 'timestamptz',
    nullable: true,
  })
  rotatedAt!: Date | null;

  @Column({
    name: 'revoked_at',
    type: 'timestamptz',
    nullable: true,
  })
  revokedAt!: Date | null;

  @Column({
    name: 'revocation_reason',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  revocationReason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
