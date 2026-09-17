import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { BIGINT_STRING } from './bigint-string.transformer';

// Append-only verification outcome facts guarded by the migration triggers.
// `assertion_id` is deliberately not unique: duplicate verification of an
// unconsumed assertion is harmless, and consumption uniqueness belongs to the
// consumer table. No assertion body, PIN, or verifier material is stored.
@Entity({ name: 'human_auth_verification_events' })
@Index('idx_human_auth_verification_events_assertion', [
  'tenantId',
  'assertionId',
])
export class HumanAuthVerificationEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;
  @Column({ name: 'tenant_id', type: 'varchar', length: 128 })
  tenantId!: string;
  @Column({ name: 'terminal_id', type: 'varchar', length: 128 })
  terminalId!: string;
  @Column({ name: 'assertion_id', type: 'uuid' })
  assertionId!: string;
  @Column({ name: 'credential_id', type: 'uuid' })
  credentialId!: string;
  @Column({ name: 'credential_version', type: 'integer' })
  credentialVersion!: number;
  @Column({
    name: 'epoch_sequence',
    type: 'bigint',
    transformer: BIGINT_STRING,
  })
  epochSequence!: string;
  @Column({ name: 'epoch_digest', type: 'varchar', length: 71 })
  epochDigest!: string;
  @Column({ name: 'authorizer_user_id', type: 'uuid' })
  authorizerUserId!: string;
  @Column({ name: 'operator_user_id', type: 'uuid', nullable: true })
  operatorUserId!: string | null;
  @Column({ name: 'operation_type', type: 'varchar', length: 64 })
  operationType!: string;
  @Column({ name: 'operation_schema', type: 'varchar', length: 128 })
  operationSchema!: string;
  @Column({ name: 'operation_digest', type: 'varchar', length: 71 })
  operationDigest!: string;
  @Column({
    name: 'local_audit_id',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  localAuditId!: string | null;
  @Column({
    name: 'local_sequence',
    type: 'bigint',
    nullable: true,
    transformer: BIGINT_STRING,
  })
  localSequence!: string | null;
  @Column({ name: 'trust_level', type: 'varchar', length: 64 })
  trustLevel!: string;
  @Column({ name: 'decision', type: 'varchar', length: 32 })
  decision!: string;
  @Column({ name: 'reason_code', type: 'varchar', length: 64, nullable: true })
  reasonCode!: string | null;
  @Column({
    name: 'correlation_id',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  correlationId!: string | null;
  @Column({
    name: 'occurred_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  occurredAt!: Date;
}
