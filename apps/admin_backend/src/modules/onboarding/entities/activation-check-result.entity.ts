import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

export enum ActivationCheckCode {
  TERMINAL_LINKED = 'TERMINAL_LINKED',
  REQUIRED_CONFIG_LOCAL = 'REQUIRED_CONFIG_LOCAL',
  AUTHORIZED_USER_LOCAL = 'AUTHORIZED_USER_LOCAL',
  PRINTER_AVAILABLE = 'PRINTER_AVAILABLE',
  TEST_PRINT = 'TEST_PRINT',
  SQLITE_DURABILITY = 'SQLITE_DURABILITY',
  OFFLINE_SALE_PAID = 'OFFLINE_SALE_PAID',
  SALE_RECEIPT_PATH = 'SALE_RECEIPT_PATH',
  OUTBOX_DURABLE = 'OUTBOX_DURABLE',
  POST_RECONNECT_SYNC = 'POST_RECONNECT_SYNC',
}

export enum ActivationCheckStatus {
  PASS = 'PASS',
  WARNING = 'WARNING',
  FAIL = 'FAIL',
  NOT_RUN = 'NOT_RUN',
}

@Entity({ name: 'onboarding_activation_check_results' })
@Unique('uq_activation_checks_tenant_attempt_code', [
  'tenantId',
  'activationAttemptId',
  'checkCode',
])
export class ActivationCheckResult {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 128 })
  @Index('idx_activation_checks_tenant')
  tenantId!: string;

  @Column({ name: 'activation_attempt_id', type: 'uuid' })
  @Index('idx_activation_checks_attempt')
  activationAttemptId!: string;

  @Column({
    name: 'check_code',
    type: 'varchar',
    length: 64,
  })
  checkCode!: ActivationCheckCode;

  @Column({ name: 'required', type: 'boolean', default: true })
  required!: boolean;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 32,
    default: ActivationCheckStatus.NOT_RUN,
  })
  status!: ActivationCheckStatus;

  @Column({
    name: 'evidence_type',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  evidenceType!: string | null;

  @Column({
    name: 'evidence_ref',
    type: 'varchar',
    length: 256,
    nullable: true,
  })
  evidenceRef!: string | null;

  @Column({
    name: 'occurred_at',
    type: 'timestamptz',
    nullable: true,
  })
  occurredAt!: Date | null;

  @Column({
    name: 'recorded_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  recordedAt!: Date;

  @Column({
    name: 'details_sanitized_json',
    type: 'jsonb',
    nullable: true,
  })
  detailsSanitizedJson!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
