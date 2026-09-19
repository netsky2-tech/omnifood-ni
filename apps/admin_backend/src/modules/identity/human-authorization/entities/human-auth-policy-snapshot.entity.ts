import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { BIGINT_STRING } from './bigint-string.transformer';

// One immutable terminal-agnostic policy snapshot per (tenant_id, sequence):
// design §11.2 decision 17 keeps terminal_id and target_pos_build out of this
// row on purpose; the per-terminal epoch is materialized on the terminal's
// first pull. Append-only enforcement lives in the migration triggers.
@Entity({ name: 'human_auth_policy_snapshots' })
@Unique('uq_human_auth_policy_snapshots_sequence', ['tenantId', 'sequence'])
@Unique('uq_human_auth_policy_snapshots_digest', ['tenantId', 'digest'])
// The migration declares this index with `sequence DESC`; TypeORM decorators
// cannot express column ordering, so the DESC ordering stays migration-owned.
@Index('idx_human_auth_policy_snapshots_tenant_sequence', [
  'tenantId',
  'sequence',
])
export class HumanAuthPolicySnapshot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;
  @Column({ name: 'sequence', type: 'bigint', transformer: BIGINT_STRING })
  sequence!: string;
  @Column({
    name: 'previous_sequence',
    type: 'bigint',
    transformer: BIGINT_STRING,
  })
  previousSequence!: string;
  @Column({ name: 'schema', type: 'varchar', length: 128 })
  schema!: string;
  @Column({ name: 'previous_digest', type: 'varchar', length: 71 })
  previousDigest!: string;
  @Column({ name: 'publisher_backend_build', type: 'varchar', length: 128 })
  publisherBackendBuild!: string;
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
