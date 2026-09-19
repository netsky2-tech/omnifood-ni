import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { BIGINT_STRING } from './bigint-string.transformer';

@Entity({ name: 'human_auth_policy_epochs' })
@Unique('uq_human_auth_policy_epochs_sequence', [
  'tenantId',
  'terminalId',
  'sequence',
])
@Unique('uq_human_auth_policy_epochs_digest', [
  'tenantId',
  'terminalId',
  'digest',
])
@Index('idx_human_auth_policy_epochs_tenant', ['tenantId'])
// The migration declares this index with `sequence DESC`; TypeORM decorators
// cannot express column ordering, so the DESC ordering stays migration-owned.
@Index('idx_human_auth_policy_epochs_terminal_sequence', [
  'tenantId',
  'terminalId',
  'sequence',
])
export class HumanAuthPolicyEpoch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;
  @Column({ name: 'terminal_id', type: 'varchar', length: 128 })
  terminalId!: string;
  @Column({ name: 'schema', type: 'varchar', length: 128 })
  schema!: string;
  @Column({ name: 'sequence', type: 'bigint', transformer: BIGINT_STRING })
  sequence!: string;
  @Column({
    name: 'previous_sequence',
    type: 'bigint',
    transformer: BIGINT_STRING,
  })
  previousSequence!: string;
  @Column({ name: 'previous_digest', type: 'varchar', length: 71 })
  previousDigest!: string;
  @Column({ name: 'publisher_backend_build', type: 'varchar', length: 128 })
  publisherBackendBuild!: string;
  @Column({ name: 'target_pos_build', type: 'varchar', length: 128 })
  targetPosBuild!: string;
  @Column({ name: 'minimum_assertion_schema', type: 'varchar', length: 128 })
  minimumAssertionSchema!: string;
  @Column({ name: 'cohort_decision', type: 'varchar', length: 32 })
  cohortDecision!: string;
  @Column({ name: 'digest', type: 'varchar', length: 71 })
  digest!: string;
  @Column({ name: 'payload', type: 'jsonb' })
  payload!: Record<string, unknown>;
  @Column({
    name: 'published_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  publishedAt!: Date;
}
