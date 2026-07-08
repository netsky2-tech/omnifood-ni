import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { Insumo } from './insumo.entity';
import { Supplier } from './supplier.entity';

@Entity('inventory_purchase_documents')
@Index('idx_inventory_purchase_documents_tenant_invoice_date', [
  'tenant_id',
  'invoice_date',
])
@Index(
  'uq_inventory_purchase_documents_tenant_supplier_invoice',
  ['tenant_id', 'supplier_id', 'invoice_number'],
  { unique: true },
)
@Index('idx_inventory_purchase_documents_correction_origin', [
  'tenant_id',
  'correction_for_purchase_document_id',
])
@Index(
  'idx_inventory_purchase_documents_one_correction_per_origin',
  ['tenant_id', 'correction_for_purchase_document_id'],
  {
    unique: true,
    where: 'correction_for_purchase_document_id IS NOT NULL',
  },
)
export class PurchaseDocument {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @Column()
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'uuid' })
  insumo_id: string;

  @ManyToOne(() => Insumo)
  @JoinColumn({ name: 'insumo_id' })
  insumo: Insumo;

  @Column({ type: 'uuid' })
  supplier_id: string;

  @ManyToOne(() => Supplier)
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier;

  @Column({ type: 'varchar' })
  invoice_number: string;

  @Column({ type: 'varchar', name: 'document_type', default: 'PURCHASE' })
  document_type: string;

  @Column({ type: 'varchar', nullable: true, name: 'correction_reason' })
  correction_reason: string | null;

  @Column({
    type: 'varchar',
    nullable: true,
    name: 'correction_for_purchase_document_id',
  })
  correction_for_purchase_document_id: string | null;

  @Column({
    type: 'varchar',
    nullable: true,
    name: 'fiscal_authorization_code',
  })
  fiscal_authorization_code: string | null;

  @Column({ type: 'date' })
  invoice_date: Date;

  @Column({ type: 'date' })
  entry_date: Date;

  @Column({ type: 'timestamptz' })
  entry_timestamp: Date;

  @Column('decimal', { precision: 14, scale: 4 })
  quantity: number;

  @Column('decimal', { precision: 14, scale: 4, name: 'unit_cost' })
  unit_cost: number;

  @Column({ type: 'varchar' })
  currency: string;

  @Column('decimal', { precision: 14, scale: 4, name: 'bcn_rate' })
  bcn_rate: number;

  @Column('decimal', { precision: 14, scale: 4, name: 'unit_cost_nio' })
  unit_cost_nio: number;

  @Column('decimal', {
    precision: 14,
    scale: 4,
    name: 'projected_cpp_nio',
  })
  projected_cpp_nio: number;

  @Column({ type: 'varchar', nullable: true, name: 'lot_code' })
  lot_code: string | null;

  @Column({ type: 'date', nullable: true, name: 'received_date' })
  received_date: Date | null;

  @Column({ type: 'date', nullable: true, name: 'expiration_date' })
  expiration_date: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
