import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Invoice } from './invoice.entity';
import { InvoiceItemModifier } from './invoice-item-modifier.entity';

@Entity('invoice_items')
@Index(['tenant_id'])
export class InvoiceItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /// Tenant isolation column. The POS sync payload controls the `id`
  /// (client UUID), so without a `tenant_id` an id collision across
  /// tenants would let one tenant's item row be overwritten by another
  /// through `upsert(... ['id'])`. Persisting and indexing `tenant_id`
  /// plus an ownership check before upsert prevents cross-tenant
  /// overwrite. Mirrors the tenant_id already on `invoices`.
  @Column({ name: 'tenant_id' })
  tenant_id: string;

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

  @Column({ name: 'variant_id', nullable: true })
  variantId: string;

  @Column({ nullable: true })
  notes: string;

  /// Historical recipe version bound at sale time (PRD UC-05). Nullable
  /// because legacy rows and non-prepared products do not carry a binding.
  /// When present, the backend prefers this over the mutable active recipe
  /// for BOM explosion and historical recosting.
  @Column({ name: 'recipe_version_id', nullable: true })
  recipeVersionId: string;

  @OneToMany(() => InvoiceItemModifier, (modifier) => modifier.item, {
    cascade: true,
  })
  modifiers: InvoiceItemModifier[];
}
