import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum CashShiftStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

@Entity('cash_shift_sessions')
@Index(['tenant_id', 'terminal_id'])
@Index(['tenant_id', 'status'])
export class CashShiftSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  tenant_id: string;

  @Column({ type: 'varchar', length: 100 })
  terminal_id: string;

  @Column({ type: 'varchar', length: 100 })
  cashier_id: string;

  @Column({ type: 'varchar', length: 150 })
  cashier_name: string;

  @CreateDateColumn({ type: 'timestamptz' })
  opened_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  closed_at: Date | null;

  @Column({
    type: 'enum',
    enum: CashShiftStatus,
    default: CashShiftStatus.OPEN,
  })
  status: CashShiftStatus;

  @Column('decimal', { precision: 12, scale: 4, default: 0 })
  initial_float_nio: number;

  @Column('decimal', { precision: 12, scale: 4, default: 0 })
  initial_float_usd: number;

  @Column('decimal', { precision: 12, scale: 4, nullable: true })
  final_counted_nio: number | null;

  @Column('decimal', { precision: 12, scale: 4, nullable: true })
  final_counted_usd: number | null;

  @Column('decimal', { precision: 12, scale: 4, default: 0 })
  expected_cash_nio: number;

  @Column('decimal', { precision: 12, scale: 4, default: 0 })
  expected_cash_usd: number;

  @Column('decimal', { precision: 12, scale: 4, nullable: true })
  difference_nio: number | null;

  @Column('decimal', { precision: 12, scale: 4, nullable: true })
  difference_usd: number | null;

  @Column({ type: 'int', nullable: true })
  z_report_sequence: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  supervisor_id: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
