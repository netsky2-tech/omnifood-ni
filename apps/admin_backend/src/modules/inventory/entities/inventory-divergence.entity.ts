import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { Insumo } from './insumo.entity';

/**
 * A DIVERGENCE: a sale whose inventory could not be fully backed by the
 * stock the tenant declared, nor by the lots behind it.
 *
 * WHY THIS TABLE EXISTS (openspec/changes/fiscal-no-se-congela-por-inventario):
 * the cloud used to REJECT a sale whose outflow the batches could not cover.
 * That rejection was not a rejection of a line — it blocked the whole fiscal
 * stream (`blockedStreams`), so every later sale stopped landing in the cloud
 * and the terminal's fiscal sequence froze. The owner ruled: the invoice is
 * ALWAYS applied; what does not add up is DECLARED, never buried.
 *
 * So the difference that used to be a rejection is now a row: the sale that
 * caused it, the insumo, the units that nothing backed, and the money. It is
 * the tenant's work list, and it closes with a regularization (an accounting
 * act with evidence), not with a click.
 *
 * The quantity is the units the inventory could NOT back:
 * - with lots:    the units the lots did not cover;
 * - without lots: the units the declared stock did not cover.
 *
 * The valuation of those units is the CPP (the last purchase cost on the
 * kardex) as a DECLARED approximation — the same one §5 of
 * `docs/inventario_marco_normativo.md` declares — and the row carries the
 * flag, so the missing identification is visible instead of dissolved into an
 * average (R-01, R-04).
 */
export type InventoryDivergenceCause =
  /** The lots did not cover the outflow (the declared stock did). */
  | 'LOT_COVERAGE_INSUFFICIENT'
  /** The sale exceeded the stock the tenant declared (a RESTRICT breach). */
  | 'DECLARED_STOCK_INSUFFICIENT';

export type InventoryDivergenceStatus = 'OPEN' | 'RECONCILED';

@Entity('inventory_divergences')
@Index('idx_inventory_divergences_tenant_status', ['tenant_id', 'status'])
@Index('idx_inventory_divergences_tenant_invoice', ['tenant_id', 'invoice_id'])
export class InventoryDivergence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  /** The sale that caused the divergence. A divergence without its sale is
   * not auditable, so this is NOT nullable. */
  @Column({ type: 'uuid' })
  invoice_id: string;

  @ManyToOne(() => Insumo)
  @JoinColumn({ name: 'insumo_id' })
  insumo: Insumo;

  @Column({ type: 'uuid' })
  insumo_id: string;

  /** The fiscal number of the sale, so the tenant can read it without
   * hunting the invoice. */
  @Column({ type: 'varchar', length: 64 })
  invoice_number: string;

  /** Units that nothing backed. */
  @Column({ type: 'decimal', precision: 14, scale: 4 })
  quantity: number;

  /** The CPP at the moment of the sale (the declared approximation). */
  @Column({ type: 'decimal', precision: 14, scale: 4 })
  unit_cost_nio: number;

  @Column({ type: 'decimal', precision: 14, scale: 4 })
  amount_nio: number;

  @Column({ type: 'varchar', length: 48 })
  cause: InventoryDivergenceCause;

  @Column({ type: 'varchar', length: 16, default: 'OPEN' })
  status: InventoryDivergenceStatus;

  @Column({ type: 'varchar', length: 128, nullable: true })
  source_device_id: string | null;

  /** The source sequence of the sale, as a string (bigint). */
  @Column({ type: 'bigint', nullable: true })
  source_sequence: string | null;

  /** The numbers behind the verdict: required, declared stock, lot coverage. */
  @Column({ type: 'jsonb', nullable: true })
  detail: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  reconciled_at: Date | null;

  /** The regularization that closed the divergence. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  reconciliation_ref: string | null;

  @Column({ type: 'text', nullable: true })
  resolution_note: string | null;
}
