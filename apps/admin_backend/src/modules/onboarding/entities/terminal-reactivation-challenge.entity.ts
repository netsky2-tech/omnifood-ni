import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ReactivationChallengeStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  COMPLETED = 'COMPLETED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export enum ReactivationReason {
  REINSTALL = 'reinstall',
  REPLACED = 'replaced',
}

export enum ReactivationApprovalMethod {
  DASHBOARD = 'DASHBOARD',
  RECOVERY_CODE = 'RECOVERY_CODE',
}

@Entity({ name: 'terminal_reactivation_challenges' })
@Index('idx_terminal_reactivation_challenges_tenant_status_expires', [
  'tenantId',
  'status',
  'expiresAt',
])
@Index('idx_terminal_reactivation_challenges_fingerprint_status', [
  'fingerprintHash',
  'status',
])
export class TerminalReactivationChallenge {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'terminal_id', type: 'varchar', length: 128 })
  terminalId!: string;

  @Column({
    name: 'fingerprint_hash',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  fingerprintHash!: string | null;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 32,
    default: ReactivationChallengeStatus.PENDING,
  })
  status!: ReactivationChallengeStatus;

  @Column({
    name: 'reason',
    type: 'varchar',
    length: 32,
    default: ReactivationReason.REINSTALL,
  })
  reason!: ReactivationReason;

  @Column({
    name: 'approval_method',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  approvalMethod!: ReactivationApprovalMethod | null;

  @Column({ name: 'approved_by_user_id', type: 'uuid', nullable: true })
  approvedByUserId!: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'previous_credential_id', type: 'uuid', nullable: true })
  previousCredentialId!: string | null;

  @Column({ name: 'previous_credential_version', type: 'int', nullable: true })
  previousCredentialVersion!: number | null;

  @Column({ name: 'new_credential_id', type: 'uuid', nullable: true })
  newCredentialId!: string | null;

  @Column({ name: 'new_credential_version', type: 'int', nullable: true })
  newCredentialVersion!: number | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
