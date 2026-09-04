import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TemplateApplicationStatus {
  PLANNED = 'PLANNED',
  APPLIED = 'APPLIED',
  FAILED = 'FAILED',
}

@Entity('onboarding_template_applications')
@Index('uq_onboarding_template_applications_tenant_idemp', ['tenant_id', 'idempotency_key'], {
  unique: true,
})
@Index('idx_onboarding_template_applications_tenant_code', ['tenant_id', 'template_code'])
export class TemplateApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128 })
  tenant_id: string;

  @Column({ type: 'uuid', nullable: true })
  onboarding_session_id: string | null;

  @Column({ type: 'varchar', length: 128 })
  template_code: string;

  @Column({ type: 'int', default: 1 })
  template_version: number;

  @Column({ type: 'varchar', length: 128 })
  selection_hash: string;

  @Column({ type: 'varchar', length: 256 })
  idempotency_key: string;

  @Column({
    type: 'varchar',
    length: 64,
    default: TemplateApplicationStatus.PLANNED,
  })
  status: TemplateApplicationStatus;

  @Column({ type: 'varchar', length: 128, nullable: true })
  applied_by_user_id: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  applied_at: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  summary_json: Record<string, any> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
