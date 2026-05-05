import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { InvoiceItem } from './invoice-item.entity';
import { Payment } from './payment.entity';

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'invoice_number' })
  @Index()
  number: string;

  @Column({ type: 'timestamp' })
  created_at: Date;

  @Column({ name: 'user_id' })
  userId: string;

  @Column('decimal', { precision: 12, scale: 2 })
  subtotal: number;

  @Column('decimal', { precision: 12, scale: 2, name: 'total_tax' })
  totalTax: number;

  @Column('decimal', { precision: 12, scale: 2 })
  total: number;

  @Column({ default: false, name: 'is_canceled' })
  isCanceled: boolean;

  @Column({ nullable: true, name: 'void_reason' })
  voidReason: string;

  @Column({ name: 'payment_status', default: 'pending' })
  paymentStatus: string;

  @Column({ nullable: true, name: 'customer_id' })
  customerId: string;

  @Column({ default: false, name: 'global_tax_override' })
  globalTaxOverride: boolean;

  @OneToMany(() => InvoiceItem, (item) => item.invoice, { cascade: true })
  items: InvoiceItem[];

  @OneToMany(() => Payment, (payment) => payment.invoice, { cascade: true })
  payments: Payment[];

  @Column({ default: 'regular' })
  type: string;

  @Column({ name: 'related_invoice_id', nullable: true })
  @Index()
  relatedInvoiceId: string;

  @UpdateDateColumn()
  updated_at: Date;
}
