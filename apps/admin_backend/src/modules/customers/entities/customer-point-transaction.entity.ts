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
import { Customer } from './customer.entity';

export enum PointTransactionType {
  EARN = 'earn',
  REDEEM = 'redeem',
  ADJUST = 'adjust',
}

@Entity('customer_point_transactions')
@Index('idx_point_transactions_tenant_customer', ['tenant_id', 'customer_id'])
@Index('idx_point_transactions_tenant_invoice', ['tenant_id', 'invoice_id'])
@Index('idx_point_transactions_created_at', ['tenant_id', 'created_at'])
export class CustomerPointTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'uuid' })
  customer_id: string;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ type: 'varchar', nullable: true })
  invoice_id?: string | null;

  @Column({
    type: 'enum',
    enum: PointTransactionType,
    default: PointTransactionType.EARN,
  })
  type: PointTransactionType;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0.0,
    transformer: {
      to: (value: number) => value,
      from: (value: string | number) =>
        typeof value === 'string' ? parseFloat(value) : value,
    },
  })
  points: number;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0.0,
    transformer: {
      to: (value: number) => value,
      from: (value: string | number) =>
        typeof value === 'string' ? parseFloat(value) : value,
    },
  })
  balance_after: number;

  @Column({
    type: 'numeric',
    precision: 8,
    scale: 4,
    default: 0.1,
    transformer: {
      to: (value: number) => value,
      from: (value: string | number) =>
        typeof value === 'string' ? parseFloat(value) : value,
    },
  })
  conversion_rate: number;

  @Column({ type: 'varchar', nullable: true })
  reason?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
