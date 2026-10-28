import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  InventoryDivergence,
  InventoryDivergenceCause,
  InventoryDivergenceStatus,
} from '../entities/inventory-divergence.entity';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';

/**
 * The DIVERGENCE ledger: the differences between what a sale consumed and what
 * the inventory could back.
 *
 * WHY IT EXISTS (FD-01, openspec/changes/fiscal-no-se-congela-por-inventario):
 * the cloud used to reject a sale whose outflow the batches could not cover,
 * and that rejection blocked the fiscal stream — every later sale stopped
 * landing in the cloud and the terminal's fiscal sequence froze. The owner
 * ruled that the invoice is ALWAYS applied and that what does not add up is
 * declared, visible and reconcilable.
 *
 * So the difference that used to be a rejection is a row here: the sale that
 * caused it, the insumo, the units nothing backed, and the money.
 *
 * THE WRITE happens inside the SAME transaction as the invoice and the
 * movement: if that transaction fails, there is neither an invoice nor a
 * divergence (the whole record is retried, which is correct). There is no
 * window in which one applies and the other does not.
 */
export interface RecordDivergenceInput {
  tenantId: string;
  invoiceId: string;
  invoiceNumber: string;
  insumoId: string;
  /** Units that nothing backed. Always positive. */
  quantity: number;
  /** The CPP at the moment of the sale (the declared approximation). */
  unitCostNio: number;
  cause: InventoryDivergenceCause;
  sourceDeviceId?: string | null;
  sourceSequence?: string | null;
  detail?: Record<string, unknown> | null;
}

export interface ParityGapRow {
  insumoId: string;
  insumoName: string;
  /** The aggregate stock the tenant declared. */
  declaredStock: number;
  /** The sum of the lot balances. */
  lotStock: number;
  /** declaredStock - lotStock. Positive: stock without a lot behind it. */
  gap: number;
}

@Injectable()
export class InventoryDivergenceService {
  private readonly logger = new Logger(InventoryDivergenceService.name);

  constructor(
    @InjectRepository(InventoryDivergence)
    private readonly divergenceRepository: Repository<InventoryDivergence>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Declares ONE divergence, inside the caller's transaction.
   *
   * The write is idempotent per (tenant, sale, insumo, cause): a record that
   * is retried after a transaction rollback declares the same difference once,
   * not twice.
   */
  async record(
    manager: EntityManager,
    input: RecordDivergenceInput,
  ): Promise<InventoryDivergence | null> {
    const quantity = Number(input.quantity.toFixed(4));
    if (!(quantity > 0)) {
      return null;
    }

    const unitCostNio = Number((input.unitCostNio ?? 0).toFixed(4));
    const amountNio = Number((quantity * unitCostNio).toFixed(4));

    const repository = manager.getRepository(InventoryDivergence);
    const existing = await repository.findOne({
      where: {
        tenant_id: input.tenantId,
        invoice_id: input.invoiceId,
        insumo_id: input.insumoId,
        cause: input.cause,
      },
    });
    if (existing) {
      return existing;
    }

    const saved = await repository.save(
      repository.create({
        tenant_id: input.tenantId,
        invoice_id: input.invoiceId,
        invoice_number: input.invoiceNumber,
        insumo_id: input.insumoId,
        quantity,
        unit_cost_nio: unitCostNio,
        amount_nio: amountNio,
        cause: input.cause,
        status: 'OPEN' as InventoryDivergenceStatus,
        source_device_id: input.sourceDeviceId ?? null,
        source_sequence: input.sourceSequence ?? null,
        detail: input.detail ?? null,
      }),
    );

    this.logger.warn(
      `[INVENTORY-DIVERGENCE] tenant=${input.tenantId} invoice=${input.invoiceNumber} ` +
        `insumo=${input.insumoId} quantity=${quantity} amount=${amountNio} ` +
        `cause=${input.cause}`,
    );

    return saved;
  }

  /**
   * The tenant's work list: the divergences, newest first.
   */
  async list(
    tenantId: string,
    options: {
      status?: InventoryDivergenceStatus;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ total: number; items: InventoryDivergence[] }> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const offset = Math.max(options.offset ?? 0, 0);

    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const repository = manager.getRepository(InventoryDivergence);
        const where = options.status
          ? { tenant_id: tenantId, status: options.status }
          : { tenant_id: tenantId };

        const [items, total] = await repository.findAndCount({
          where,
          order: { created_at: 'DESC' },
          take: limit,
          skip: offset,
        });

        return { total, items };
      },
    );
  }

  /**
   * Closes the OPEN divergences of an insumo when a regularization is applied
   * (the reconciliation is an accounting act with evidence, not a click).
   */
  async reconcileForInsumo(
    manager: EntityManager,
    tenantId: string,
    insumoId: string,
    reconciliationRef: string,
    note?: string | null,
  ): Promise<number> {
    const repository = manager.getRepository(InventoryDivergence);
    const open = await repository.find({
      where: { tenant_id: tenantId, insumo_id: insumoId, status: 'OPEN' },
    });
    if (open.length === 0) {
      return 0;
    }

    for (const divergence of open) {
      divergence.status = 'RECONCILED';
      divergence.reconciled_at = new Date();
      divergence.reconciliation_ref = reconciliationRef;
      divergence.resolution_note = note ?? null;
      await repository.save(divergence);
    }

    return open.length;
  }

  /**
   * The ORIGIN of the differences: the insumos whose aggregate stock does not
   * add up to their lot balances.
   *
   * Without this the owner sees "100 units with no lot behind them" and no
   * idea which insumo produced them. With it, the tenant has the work list.
   *
   * An insumo with NO lots is never a gap: its aggregate IS the only truth
   * (that is the rule `drawBatchOutflow` already follows).
   */
  async findParityGaps(tenantId: string): Promise<ParityGapRow[]> {
    return runInTenantTransaction<ParityGapRow[]>(
      this.dataSource,
      tenantId,
      async (manager) => {
        const rows = await manager.query<
          Array<{
            insumo_id: string;
            insumo_name: string;
            declared_stock: string | number;
            lot_stock: string | number;
          }>
        >(
          `
        SELECT
          i.id            AS insumo_id,
          i.name          AS insumo_name,
          i.stock         AS declared_stock,
          COALESCE(SUM(b.remaining_stock), 0) AS lot_stock
        FROM insumos i
        JOIN batches b ON b.insumo_id = i.id AND b.tenant_id = i.tenant_id
        WHERE i.tenant_id = $1
        GROUP BY i.id, i.name, i.stock
        HAVING ABS(i.stock - SUM(b.remaining_stock)) > 0.0001
        ORDER BY ABS(i.stock - SUM(b.remaining_stock)) DESC
        LIMIT 200
        `,
          [tenantId],
        );

        return rows.map((row) => ({
          insumoId: String(row.insumo_id),
          insumoName: String(row.insumo_name),
          declaredStock: Number(row.declared_stock),
          lotStock: Number(row.lot_stock),
          gap: Number(
            (Number(row.declared_stock) - Number(row.lot_stock)).toFixed(4),
          ),
        }));
      },
    );
  }
}
