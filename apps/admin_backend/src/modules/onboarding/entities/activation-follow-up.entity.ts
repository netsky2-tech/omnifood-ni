import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

export enum ActivationFollowUpStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

@Entity({ name: 'onboarding_activation_follow_ups' })
@Unique('uq_activation_follow_ups_tenant_attempt_warning', [
  'tenantId',
  'activationAttemptId',
  'warningCode',
])
export class ActivationFollowUp {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 128 })
  @Index('idx_activation_follow_ups_tenant')
  tenantId!: string;

  @Column({ name: 'activation_attempt_id', type: 'uuid' })
  activationAttemptId!: string;

  @Column({ name: 'warning_code', type: 'varchar', length: 64 })
  warningCode!: string;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 32,
    default: ActivationFollowUpStatus.OPEN,
  })
  status!: ActivationFollowUpStatus;

  @Column({
    name: 'opened_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  openedAt!: Date;

  @Column({ name: 'opened_by', type: 'varchar', length: 128 })
  openedBy!: string;

  @Column({
    name: 'closure_evidence_ref',
    type: 'varchar',
    length: 256,
    nullable: true,
  })
  closureEvidenceRef!: string | null;

  @Column({
    name: 'closed_at',
    type: 'timestamptz',
    nullable: true,
  })
  closedAt!: Date | null;

  @Column({
    name: 'closed_by',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  closedBy!: string | null;

  @Column({
    name: 'closure_note',
    type: 'text',
    nullable: true,
  })
  closureNote!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
