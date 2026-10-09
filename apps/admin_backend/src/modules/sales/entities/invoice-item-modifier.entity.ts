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

  // SOHO P3 (modifier quantity): how many units of this option the line
  // includes. NOT NULL with DEFAULT 1 — the factual default, not an
  // invented one: the cloud only ever accepted name and extra_price, so
  // every pre-migration row came from a single-unit modifier, which is
  // exactly what the POS's local default writes
  // (invoice_item_modifier_entity.dart:30).
  @Column('int', { default: 1 })
  quantity: number;
}
