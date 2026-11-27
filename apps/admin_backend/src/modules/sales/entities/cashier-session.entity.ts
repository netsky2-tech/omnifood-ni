import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('cashier_sessions')
export class CashierSession {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @Index('idx_cashier_sessions_tenant_id')
  @Column({ type: 'uuid' })
  tenant_id: string;

  @Column({ type: 'varchar' })
  user_id: string;

  @Column({ type: 'varchar' })
  terminal_id: string;

  @Column({ type: 'timestamptz' })
  opened_at: Date;

  @Column({ type: 'varchar', default: '' })
  tipo_modelo: string;

  @Column({ type: 'timestamptz', nullable: true })
  closed_at: Date | null;

  @Column({ type: 'numeric', precision: 14, scale: 4, default: 0 })
  opening_balance_nio: number;

  @Column({ type: 'numeric', precision: 14, scale: 4, default: 0 })
  opening_balance_usd: number;

  @Column({ type: 'numeric', precision: 14, scale: 4, nullable: true })
  closing_counted_nio: number | null;

  @Column({ type: 'numeric', precision: 14, scale: 4, nullable: true })
  closing_counted_usd: number | null;

  @Column({ type: 'numeric', precision: 14, scale: 4, default: 0 })
  expected_nio: number;

  @Column({ type: 'numeric', precision: 14, scale: 4, default: 0 })
  expected_usd: number;

  @Column({ type: 'numeric', precision: 14, scale: 4, nullable: true })
  difference_nio: number | null;

  @Column({ type: 'numeric', precision: 14, scale: 4, nullable: true })
  difference_usd: number | null;

  @Column({ type: 'integer', nullable: true })
  z_report_sequence: number | null;

  @Column({ type: 'boolean', default: false })
  is_closed: boolean;

  @Column({ type: 'varchar', nullable: true })
  supervisor_id: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', default: 'SYNCED' })
  sync_status: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
