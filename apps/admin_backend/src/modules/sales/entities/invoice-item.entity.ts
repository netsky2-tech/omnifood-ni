import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Invoice } from './invoice.entity';

@Entity('invoice_items')
export class InvoiceItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'invoice_id' })
  invoiceId: string;

  @ManyToOne(() => Invoice, (invoice) => invoice.items)
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  @Column({ name: 'product_id' })
  productId: string;

  @Column({ name: 'product_name' })
  productName: string;

  @Column('decimal', { precision: 12, scale: 4 })
  quantity: number;

  @Column('decimal', { precision: 12, scale: 2, name: 'unit_price' })
  unitPrice: number;

  @Column('decimal', { precision: 12, scale: 4, name: 'original_tax_rate' })
  originalTaxRate: number;

  @Column('decimal', { precision: 12, scale: 4, name: 'applied_tax_rate' })
  appliedTaxRate: number;

  @Column('decimal', { precision: 12, scale: 2, name: 'tax_amount' })
  taxAmount: number;

  @Column('decimal', { precision: 12, scale: 2 })
  total: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  discount: number;
}
