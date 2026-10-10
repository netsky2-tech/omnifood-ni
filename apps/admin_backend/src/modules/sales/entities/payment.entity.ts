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

  @Column({ name: 'voucher_code', nullable: true })
  voucherCode?: string;

  @Column({ name: 'card_brand', nullable: true })
  cardBrand?: string;

  @Column({ name: 'card_type', nullable: true })
  cardType?: string;

  @Column({ name: 'bank_pos', nullable: true })
  bankPos?: string;

  @Column({
    name: 'reconciliation_status',
    nullable: true,
    default: 'PENDIENTE',
  })
  reconciliationStatus?: string;

  @Column({ nullable: true })
  last4?: string;

  @Column({ name: 'batch_number', nullable: true })
  batchNumber?: string;

  @Column({ type: 'timestamptz', name: 'reconciled_at', nullable: true })
  reconciledAt?: Date;

  @Column({ name: 'reconciled_by_user_id', nullable: true })
  reconciledByUserId?: string;

  /**
   * The supervisor credential the operator TYPED at override time, stored
   * verbatim and unvalidated. Declared evidence, NOT a foreign key to
   * `users`: null for normal reconciliations. Keeps the operator actor in
   * `reconciled_by_user_id` separate from the typed supervisor string the
   * POS used to abuse that column with.
   *
   * Why there is no migration for this column type (review advisory
   * R3-PAYMENT-TYPE-NO-MIGRATION, issue #829): `type: 'text'` here is not a
   * schema change waiting for one — it is the entity catching up with the
   * column as it was ALREADY created, in
   * `1809600000000-AddOverrideSupervisorRefToInvoicePayments.ts`
   * (`ADD COLUMN IF NOT EXISTS override_supervisor_ref text`). The previous
   * declaration relied on TypeORM's implicit default and disagreed with the
   * database, which is what `scripts/verify-schema-build.sh` caught. Nothing to
   * ALTER: the database was already right.
   *
   * It is deliberately absent from `scripts/schema-column-type-manifest.txt`
   * too: that manifest is a downward-only ratchet, so adding an entry is an
   * approved-baseline decision, not a fix. Aligning entity-to-migration is the
   * path that shrinks the drift instead of growing the baseline.
   */
  @Column({ name: 'override_supervisor_ref', type: 'text', nullable: true })
  overrideSupervisorRef?: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
