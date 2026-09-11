import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';

export enum LegacyImportIntegrityStatus {
  CLEAN = 'CLEAN',
  REVIEW_REQUIRED = 'REVIEW_REQUIRED',
  REMEDIATED = 'REMEDIATED',
  ACCEPTED_AS_IS = 'ACCEPTED_AS_IS',
}

@Entity('legacy_import_integrity_reports')
@Index('idx_import_integrity_reports_tenant_status', ['tenant_id', 'status'])
export class LegacyImportIntegrityReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  legacy_import_refs: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  affected_product_refs: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  observed_direct_stock_or_cost_writes: Array<{
    productId: string;
    productName: string;
    productStock: number;
    kardexStock: number;
    discrepancy: number;
    directCostObserved: number | null;
    sourceImportSession?: string;
  }>;

  @Column({ type: 'boolean', default: false })
  kardex_evidence_present: boolean;

  @Column({
    type: 'varchar',
    default: LegacyImportIntegrityStatus.CLEAN,
  })
  status: LegacyImportIntegrityStatus;

  @Column({ type: 'varchar', nullable: true })
  reviewed_by: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  remediation_refs: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
