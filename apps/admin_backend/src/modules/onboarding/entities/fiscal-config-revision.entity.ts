import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';

@Entity('fiscal_config_revisions')
@Unique('uq_fiscal_config_revisions_tenant_revision', ['tenant_id', 'revision'])
@Index('idx_fiscal_config_revisions_tenant', ['tenant_id'])
export class FiscalConfigRevision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 128 })
  tenant_id: string;

  @Column({ type: 'int' })
  revision: number;

  @Column({ type: 'varchar', length: 64 })
  fingerprint: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at: Date;
}
