import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  Index,
} from 'typeorm';

export enum OnboardingIdempotencyStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  SUCCEEDED = 'SUCCEEDED',
  FAILED_RETRYABLE = 'FAILED_RETRYABLE',
  FAILED_FINAL = 'FAILED_FINAL',
}

@Entity({ name: 'onboarding_idempotency_records' })
@Unique('uq_onboarding_idempotency_tenant_key', ['tenantId', 'idempotencyKey'])
export class OnboardingIdempotencyRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 128 })
  @Index('idx_onboarding_idempotency_tenant_id')
  tenantId!: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 256 })
  idempotencyKey!: string;

  @Column({ name: 'command_type', type: 'varchar', length: 128 })
  commandType!: string;

  @Column({ name: 'payload_hash', type: 'varchar', length: 128 })
  payloadHash!: string;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 64,
    default: OnboardingIdempotencyStatus.IN_PROGRESS,
  })
  status!: OnboardingIdempotencyStatus;

  @Column({ name: 'lease_owner', type: 'varchar', length: 128, nullable: true })
  leaseOwner!: string | null;

  @Column({ name: 'lease_acquired_at', type: 'timestamptz', nullable: true })
  leaseAcquiredAt!: Date | null;

  @Column({ name: 'lease_expires_at', type: 'timestamptz', nullable: true })
  leaseExpiresAt!: Date | null;

  @Column({ name: 'attempt_count', type: 'int', default: 1 })
  attemptCount!: number;

  @Column({ name: 'result_ref', type: 'jsonb', nullable: true })
  resultRef!: any;

  @Column({
    name: 'last_error_code',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  lastErrorCode!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
