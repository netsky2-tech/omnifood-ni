import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { Customer } from '../../customers/entities/customer.entity';
import { LoyaltyProgram } from './loyalty-program.entity';

@Entity('customer_loyalty_account_projection')
export class CustomerLoyaltyAccountProjection {
  @PrimaryColumn()
  tenant_id: string;

  @PrimaryColumn()
  customer_id: string;

  @PrimaryColumn()
  loyalty_program_id: string;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @ManyToOne(() => LoyaltyProgram)
  @JoinColumn({ name: 'loyalty_program_id' })
  loyalty_program: LoyaltyProgram;

  @Column({ type: 'int', default: 0 })
  balance_units: number;

  @Column({ type: 'uuid', nullable: true })
  last_transaction_id?: string | null;

  @Column({ type: 'int', default: 0 })
  projection_version: number;

  @Column({ type: 'timestamptz' })
  recomputed_at: Date;
}
