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

  @Column({ type: 'timestamptz' })
  created_at: Date;

  @Column({ name: 'user_id', type: 'uuid' })
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

  @Column({ name: 'customer_name', type: 'varchar', nullable: true })
  customerName?: string | null;

  @Column({ name: 'customer_tax_id', type: 'varchar', nullable: true })
  customerTaxId?: string | null;

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

  @Column({ name: 'origin_invoice_id', nullable: true })
  @Index()
  originInvoiceId: string;

  @Column({ name: 'refund_reason_code', nullable: true })
  refundReasonCode: string;

  @Column({ name: 'refund_reason_policy', nullable: true })
  refundReasonPolicy: string;

  @Column({ name: 'authorized_by_user_id', nullable: true })
  authorizedByUserId: string;

  @Column({ name: 'authorized_by_role', nullable: true })
  authorizedByRole: string;

  @Column('decimal', {
    precision: 10,
    scale: 4,
    name: 'bcn_official_rate',
    default: 36.6241,
  })
  bcnOfficialRate: number;

  @Column('decimal', {
    precision: 10,
    scale: 4,
    name: 'commercial_rate',
    default: 36.5,
  })
  commercialRate: number;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    name: 'total_usd',
    default: 0.0,
  })
  totalUsd: number;

  @Column({
    name: 'inventory_policy_version',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  inventoryPolicyVersion?: string | null;

  @Column({
    name: 'inventory_outcome',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  inventoryOutcome?: string | null;

  @Column({ name: 'inventory_outcome_reason', type: 'jsonb', nullable: true })
  inventoryOutcomeReason?: Record<string, any> | string | null;

  // #551 U3: cashier session UUID emitted by the POS sync payload
  // (`shiftId`). Nullable: the fact never existed server-side for legacy
  // invoices (D-9, no backfill).
  @Column({ name: 'shift_id', type: 'uuid', nullable: true })
  shiftId?: string | null;

  // #551 U3: local calendar date (ISO YYYY-MM-DD) fixed at issuance on the
  // POS. Nullable for the same D-9 reason.
  @Column({ name: 'local_issue_date', type: 'date', nullable: true })
  localIssueDate?: string | null;

  // Batch 7 Slice 1: POS-captured tips (PRD §21, AD-10). Nullable with no
  // default: NULL means "unknown / legacy pre-remediation" — historical
  // invoices are never backfilled to 0 (DGI: fiscal rows are never
  // rewritten).
  @Column({
    name: 'tip_amount_nio',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  tipAmountNio?: number | null;

  @Column({
    name: 'tip_amount_usd',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  tipAmountUsd?: number | null;

  @Column({
    name: 'tip_percentage',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  tipPercentage?: number | null;

  @Column({
    name: 'tip_eligible_base_nio',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  tipEligibleBaseNio?: number | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
