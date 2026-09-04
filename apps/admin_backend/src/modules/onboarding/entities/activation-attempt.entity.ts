import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ActivationAttemptStatus {
  CREATED = 'CREATED',
  IN_PROGRESS = 'IN_PROGRESS',
  PASS = 'PASS',
  PASS_WITH_WARNING = 'PASS_WITH_WARNING',
  FAIL = 'FAIL',
}

@Entity({ name: 'onboarding_activation_attempts' })
export class ActivationAttempt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 128 })
  @Index('idx_onboarding_activation_attempts_tenant')
  tenantId!: string;

  @Column({ name: 'onboarding_session_id', type: 'uuid' })
  @Index('idx_onboarding_activation_attempts_session')
  onboardingSessionId!: string;

  @Column({ name: 'candidate_terminal_id', type: 'varchar', length: 128 })
  candidateTerminalId!: string;

  @Column({
    name: 'trusted_terminal_id',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  trustedTerminalId!: string | null;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 64,
    default: ActivationAttemptStatus.CREATED,
  })
  status!: ActivationAttemptStatus;

  @Column({ name: 'started_by_user_id', type: 'varchar', length: 128 })
  startedByUserId!: string;

  @Column({
    name: 'started_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  startedAt!: Date;

  @Column({
    name: 'completed_at',
    type: 'timestamptz',
    nullable: true,
  })
  completedAt!: Date | null;

  @Column({
    name: 'server_time_anchor_at',
    type: 'timestamptz',
  })
  serverTimeAnchorAt!: Date;

  @Column({ name: 'required_fiscal_revision', type: 'int' })
  requiredFiscalRevision!: number;

  @Column({
    name: 'required_fiscal_fingerprint',
    type: 'varchar',
    length: 64,
  })
  requiredFiscalFingerprint!: string;

  @Column({ name: 'verification_product_id', type: 'varchar', length: 128 })
  verificationProductId!: string;

  @Column({
    name: 'verification_product_revision',
    type: 'int',
    default: 1,
  })
  verificationProductRevision!: number;

  @Column({
    name: 'verification_product_fingerprint',
    type: 'varchar',
    length: 64,
  })
  verificationProductFingerprint!: string;

  @Column({
    name: 'verification_ticket_id',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  verificationTicketId!: string | null;

  @Column({
    name: 'pos_build',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  posBuild!: string | null;

  @Column({
    name: 'warnings_count',
    type: 'int',
    default: 0,
  })
  warningsCount!: number;

  @Column({
    name: 'failure_code',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  failureCode!: string | null;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 256,
    nullable: true,
  })
  idempotencyKey!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
