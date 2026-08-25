import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Invoice } from './invoice.entity';

@Entity('invoice_payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'invoice_id' })
  invoiceId: string;

  @ManyToOne(() => Invoice, (invoice) => invoice.payments)
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  @Column()
  method: string;

  @Column('decimal', { precision: 12, scale: 2 })
  amount: number;

  @Column({ default: 'NIO' })
  currency: string;

  @Column('decimal', {
    precision: 12,
    scale: 4,
    name: 'exchange_rate',
    default: 1.0,
  })
  exchangeRate: number;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    name: 'amount_nio',
    default: 0.0,
  })
  amountNio: number;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    name: 'change_given',
    default: 0.0,
  })
  changeGiven: number;

  @Column({ name: 'change_currency', default: 'NIO' })
  changeCurrency: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
