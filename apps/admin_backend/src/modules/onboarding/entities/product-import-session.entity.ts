import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';

export enum ProductImportSessionStatus {
  CREATED = 'CREATED',
  UPLOADING = 'UPLOADING',
  VALIDATED = 'VALIDATED',
  READY = 'READY',
  COMMITTING = 'COMMITTING',
  COMMITTED = 'COMMITTED',
  PARTIALLY_COMMITTED = 'PARTIALLY_COMMITTED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

@Entity('product_import_sessions')
@Index('idx_import_sessions_tenant_status', ['tenant_id', 'status'])
@Index('idx_import_sessions_tenant_source_hash', ['tenant_id', 'source_hash'])
export class ProductImportSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ type: 'uuid', nullable: true })
  onboarding_session_id: string | null;

  @Column({
    type: 'varchar',
    default: ProductImportSessionStatus.CREATED,
  })
  status: ProductImportSessionStatus;

  @Column({ type: 'varchar', default: 'v1.0' })
  parser_contract_version: string;

  @Column({ type: 'varchar' })
  source_hash: string;

  @Column({ type: 'varchar', nullable: true })
  file_name: string | null;

  @Column({ type: 'int', default: 0 })
  total_rows: number;

  @Column({ type: 'int', default: 0 })
  valid_rows: number;

  @Column({ type: 'int', default: 0 })
  error_rows: number;

  @Column({ type: 'int', default: 0 })
  committed_rows: number;

  @Column({ type: 'int', default: 0 })
  skipped_rows: number;

  @Column({ type: 'varchar', nullable: true })
  commit_mode: string | null;

  @Column({ type: 'varchar', nullable: true })
  duplicate_policy: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  committed_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  expires_at: Date | null;
}
