import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum LegacyMigrationDecision {
  KEEP_PUBLISHED = 'KEEP_PUBLISHED',
  MOVE_TO_DRAFT = 'MOVE_TO_DRAFT',
  UNKNOWN_PROVENANCE = 'UNKNOWN_PROVENANCE',
  // ONB1.4 Import Cutover decisions
  CLEAN = 'CLEAN',
  REVIEW_REQUIRED = 'REVIEW_REQUIRED',
  EXPIRED_REJECTED = 'EXPIRED_REJECTED',
  IMPORT_COMMITTED = 'IMPORT_COMMITTED',
}

@Entity('legacy_onboarding_migration_receipts')
@Index('idx_legacy_receipts_tenant_type', ['tenant_id', 'receipt_type'])
export class LegacyOnboardingMigrationReceipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128 })
  tenant_id: string;

  @Column({
    type: 'varchar',
    length: 64,
    default: 'LEGACY_TEMPLATE_RECIPE_SCAN',
  })
  receipt_type: string;

  @Column({ type: 'varchar', length: 64 })
  target_entity_type: string;

  @Column({ type: 'varchar', length: 128 })
  target_entity_id: string;

  @Column({ type: 'varchar', length: 64 })
  decision: LegacyMigrationDecision;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'jsonb', nullable: true })
  evidence_json: Record<string, any> | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  executed_by: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
