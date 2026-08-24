import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum CashMovementType {
  CASH_IN = 'CASH_IN',
  CASH_OUT = 'CASH_OUT',
  PETTY_CASH = 'PETTY_CASH',
  SAFE_DROP = 'SAFE_DROP',
}

@Entity('cash_movements')
@Index(['tenant_id', 'shift_id'])
@Index(['tenant_id', 'terminal_id'])
export class CashMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  tenant_id: string;

  @Column({ type: 'varchar', length: 100 })
  shift_id: string;

  @Column({ type: 'varchar', length: 100 })
  terminal_id: string;

  @Column({
    type: 'enum',
    enum: CashMovementType,
  })
  type: CashMovementType;

  @Column('decimal', { precision: 12, scale: 4, default: 0 })
  amount_nio: number;

  @Column('decimal', { precision: 12, scale: 4, default: 0 })
  amount_usd: number;

  @Column({ type: 'varchar', length: 255 })
  reason: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  authorized_by_user_id: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  timestamp: Date;
}
