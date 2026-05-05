import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { InvoiceItem } from './invoice-item.entity';

@Entity('invoice_item_modifiers')
export class InvoiceItemModifier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'invoice_item_id' })
  invoiceItemId: string;

  @ManyToOne(() => InvoiceItem, (item) => item.modifiers)
  @JoinColumn({ name: 'invoice_item_id' })
  item: InvoiceItem;

  @Column()
  name: string;

  @Column('decimal', { precision: 12, scale: 2, name: 'extra_price' })
  extraPrice: number;
}
