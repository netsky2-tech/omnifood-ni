import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

// The enablement CHECK constraint, requiring OWNER acceptance evidence when
// `enabled` is true, lives in the migration.
@Entity({ name: 'human_auth_rollout_cohorts' })
@Unique('uq_human_auth_rollout_cohorts_build_pair', [
  'tenantId',
  'posBuild',
  'backendBuild',
])
@Index('idx_human_auth_rollout_cohorts_tenant_enabled', ['tenantId', 'enabled'])
export class HumanAuthRolloutCohort {
  @PrimaryGeneratedColumn('uuid')
  id!: string;
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;
  @Column({ name: 'pos_build', type: 'varchar', length: 128 })
  posBuild!: string;
  @Column({ name: 'backend_build', type: 'varchar', length: 128 })
  backendBuild!: string;
  @Column({ name: 'policy_schema', type: 'varchar', length: 128 })
  policySchema!: string;
  @Column({ name: 'assertion_schema', type: 'varchar', length: 128 })
  assertionSchema!: string;
  @Column({ name: 'enabled', type: 'boolean', default: false })
  enabled!: boolean;
  @Column({ name: 'owner_acceptance_actor_id', type: 'uuid', nullable: true })
  ownerAcceptanceActorId!: string | null;
  @Column({
    name: 'owner_acceptance_ref',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  ownerAcceptanceRef!: string | null;
  @Column({ name: 'owner_acceptance_at', type: 'timestamptz', nullable: true })
  ownerAcceptanceAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
