import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import { Insumo } from '../entities/insumo.entity';
import {
  InventoryMovement,
  MovementType,
} from '../entities/inventory-movement.entity';
import {
  CogsReportDto,
  CogsReportItemDto,
  InventoryAlertItemDto,
  InventoryAlertsSummaryDto,
  InventoryAlertSeverity,
  InventoryCoverageDto,
  InventoryCoverageReasonCode,
  InventoryCoverageStatus,
  InventoryValuationItemDto,
  InventoryValuationReportDto,
  KardexFilterQueryDto,
  KardexReportDto,
  KardexReportItemDto,
} from '../dto/inventory-reports.dto';
import { Invoice } from '../../sales/entities/invoice.entity';
import { isCogsCoverageRelevantSale } from '../../../core/reporting/sales-reporting-semantics';

const round4 = (value: number): number =>
  Number((Math.round((value + Number.EPSILON) * 10000) / 10000).toFixed(4));

// Mirrors invoices.service.ts: SALE movements stamp their source document as
// `invoice:<invoiceId>`, which is how a movement is linked to its sale.
const INVOICE_SOURCE_DOCUMENT_PREFIX = 'invoice:';

// Stable emission order for inventoryCoverage reason codes. Both "no
// inventory impact evidence" codes lead the list: MISSING_INVENTORY_IMPACT
// covers impact that could not be computed (recipe missing / pending), and
// NO_EXPLICIT_INSUMO_MAPPING covers sales whose products have no insumo
// mapping at all (WU11: absence of a mapping is NOT evidence of zero cost).
// The two cost-basis codes are grouped next: MISSING_COST_BASIS (no usable
// cost recorded on the sale's movements) precedes ZERO_COST_BASIS (WU12: a
// cost IS recorded but it is zero — the deeper data gap leads the pair).
const COVERAGE_REASON_CODE_ORDER: InventoryCoverageReasonCode[] = [
  'MISSING_INVENTORY_IMPACT',
  'NO_EXPLICIT_INSUMO_MAPPING',
  'MISSING_COST_BASIS',
  'ZERO_COST_BASIS',
  'UNRESOLVED_SOURCE_DOCUMENT',
  'INCOMPLETE_SYNC',
];

// How the SALE movements of one sale (invoice) evidence its cost.
// - 'costed': at least one movement carries a real non-zero cost for a
//   non-zero quantity — the only state that can cost the sale.
// - 'zero': no movement is costed, but at least one movement records a
//   present-but-zero cost for a non-zero quantity (ZERO_COST_BASIS, WU12).
//   invoices.service.ts stamps totalCostNio = |qty| x unitCostNio and
//   Insumo.averageCost is a decimal column defaulting to 0, so a mapped
//   insumo with no recorded purchase produces totalCostNio = 0. When
//   totalCostNio is absent, a unitCostNio of 0 is the same present-zero
//   signal. The recorded total is trusted over the unit figure (the
//   aggregation path reads totalCostNio first), so totalCostNio = 0 is
//   'zero' even if unitCostNio disagreed — trust and money stay aligned.
// - 'missing': no cost evidence at all (null/absent cost fields), or the
//   only cost-bearing movement has a zero quantity. A zero-quantity movement
//   cannot evidence a cost either — cost is only meaningful per unit moved —
//   so qty = 0 is never 'costed' and contributes no 'zero' signal either.
type SaleCostEvidence = 'costed' | 'zero' | 'missing';

/**
 * Read the reason code the sale-inventory pipeline stored on the invoice.
 * The column is a nullable jsonb (`Invoice.inventoryOutcomeReason`) that has
 * been written as `{ code, lines }`; a bare string is tolerated because the
 * entity type allows it. Returns null when nothing was recorded — absence of
 * a recorded reason is NOT evidence of a mapping gap.
 */
const recordedInventoryReasonCode = (invoice: Invoice): string | null => {
  const raw = invoice.inventoryOutcomeReason;
  if (!raw) return null;
  if (typeof raw === 'string') return raw.trim() || null;
  if (typeof raw === 'object') {
    const code = (raw as Record<string, unknown>).code;
    return typeof code === 'string' && code.trim() !== '' ? code.trim() : null;
  }
  return null;
};

const classifySaleCostEvidence = (
  movements: InventoryMovement[],
): SaleCostEvidence => {
  let zero = false;
  for (const mov of movements) {
    const qty = Math.abs(Number(mov.quantity));
    const totalCostNio =
      mov.totalCostNio != null ? Number(mov.totalCostNio) : null;
    const unitCostNio =
      mov.unitCostNio != null ? Number(mov.unitCostNio) : null;
    if (qty === 0) continue;
    if (
      (totalCostNio != null && totalCostNio !== 0) ||
      (totalCostNio == null && unitCostNio != null && unitCostNio !== 0)
    ) {
      return 'costed';
    }
    if (totalCostNio === 0 || (totalCostNio == null && unitCostNio === 0)) {
      zero = true;
    }
  }
  return zero ? 'zero' : 'missing';
};

@Injectable()
export class InventoryReportsService {
  constructor(
    // Issue #512 slice 1 part A: every read of `insumos` and
    // `inventory_kardex` resolves its repository from the tenant-bound
    // transaction manager, never from pooled global repositories.
    private readonly dataSource: DataSource,
  ) {}

  async getValuationReport(
    tenantId: string,
  ): Promise<InventoryValuationReportDto> {
    const insumos = await runInTenantTransaction(
      this.dataSource,
      tenantId,
      (manager) =>
        manager.getRepository(Insumo).find({
          where: { tenant_id: tenantId, is_active: true },
          order: { name: 'ASC' },
        }),
    );

    let totalValuationNio = 0;
    let itemsWithStockCount = 0;
    let itemsLowStockCount = 0;
    let itemsNegativeStockCount = 0;

    const items: InventoryValuationItemDto[] = insumos.map((insumo) => {
      const stock = round4(Number(insumo.stock ?? 0));
      const averageCostNio = round4(Number(insumo.averageCost ?? 0));
      const totalValuation = round4(stock * averageCostNio);
      const stockMin =
        insumo.minStock != null ? round4(Number(insumo.minStock)) : undefined;
      const stockMax =
        insumo.maxStock != null ? round4(Number(insumo.maxStock)) : undefined;
      const parLevel =
        insumo.parLevel != null ? round4(Number(insumo.parLevel)) : undefined;

      const isNegativeStock = stock < 0;
      const isLowStock = stockMin != null && stock <= stockMin;

      if (stock > 0) {
        itemsWithStockCount++;
        totalValuationNio = round4(totalValuationNio + totalValuation);
      }
      if (isNegativeStock) {
        itemsNegativeStockCount++;
      }
      if (isLowStock) {
        itemsLowStockCount++;
      }

      return {
        id: insumo.id,
        name: insumo.name,
        consumptionUom: insumo.consumptionUom ?? 'unit',
        warehouseId: insumo.warehouse_id,
        isPerishable: insumo.is_perishable ?? false,
        stock,
        averageCostNio,
        totalValuationNio: totalValuation,
        stockMin,
        stockMax,
        parLevel,
        isLowStock,
        isNegativeStock,
      };
    });

    return {
      totalValuationNio: round4(totalValuationNio),
      totalItemsCount: items.length,
      itemsWithStockCount,
      itemsLowStockCount,
      itemsNegativeStockCount,
      generatedAt: new Date().toISOString(),
      items,
    };
  }

  async getCogsReport(
    tenantId: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<CogsReportDto> {
    const from = fromDate
      ? new Date(fromDate)
      : new Date(new Date().setHours(0, 0, 0, 0));
    const to = toDate
      ? new Date(toDate)
      : new Date(new Date().setHours(23, 59, 59, 999));

    const { movements, insumos, salesInvoices } = await runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const movementRepo = manager.getRepository(InventoryMovement);
        const insumoRepo = manager.getRepository(Insumo);

        const qb = movementRepo
          .createQueryBuilder('mov')
          .where('mov.tenant_id = :tenantId', { tenantId })
          .andWhere('mov.type IN (:...types)', {
            types: [
              MovementType.SALE,
              MovementType.SALE_CANCEL,
              MovementType.SHRINKAGE,
              MovementType.CREDIT_NOTE_RESTOCK,
            ],
          })
          .andWhere('mov.timestamp BETWEEN :from AND :to', { from, to });

        const movements = await qb.getMany();
        const insumos = await insumoRepo.find({
          where: { tenant_id: tenantId },
        });

        // Coverage evidence: the per-sale inventory outcome facts live on
        // the invoice, not on the movements. The coverage-relevant row set
        // (WU10/WU11) is defined EXCLUSIVELY by the shared pure predicate
        // isCogsCoverageRelevantSale, applied in memory after load. The SQL
        // keeps only the filters the predicate agrees with (tenant scope,
        // same business window the movements use — movement timestamps are
        // anchored to invoice.createdAt, AG-02 — and non-canceled), and
        // deliberately does NOT re-express the credit-note exclusion in
        // SQL: a second SQL definition of "a sale that must be costed"
        // could drift from the shared predicate. Cost: the query also loads
        // the period's credit-note rows (refunds only, a small minority of
        // invoices), which the predicate then drops before any counting —
        // bounded by O(period invoices), never an unbounded widening.
        const invoiceRepo = manager.getRepository(Invoice);
        const salesInvoices = await invoiceRepo
          .createQueryBuilder('inv')
          .where('inv.tenant_id = :tenantId', { tenantId })
          .andWhere('inv.created_at BETWEEN :from AND :to', { from, to })
          .andWhere('inv.is_canceled = FALSE')
          .getMany();

        return { movements, insumos, salesInvoices };
      },
    );
    const insumoMap = new Map(insumos.map((i) => [i.id, i]));

    let totalCogsNio = 0;
    let salesCogsNio = 0;
    let shrinkageCogsNio = 0;

    const insumoAggregates = new Map<
      string,
      {
        salesQty: number;
        salesCost: number;
        shrinkageQty: number;
        shrinkageCost: number;
      }
    >();

    for (const mov of movements) {
      const insumoId = mov.insumoId;
      if (!insumoAggregates.has(insumoId)) {
        insumoAggregates.set(insumoId, {
          salesQty: 0,
          salesCost: 0,
          shrinkageQty: 0,
          shrinkageCost: 0,
        });
      }
      const agg = insumoAggregates.get(insumoId);
      const qty = Math.abs(Number(mov.quantity));
      const cost = Math.abs(
        Number(mov.totalCostNio ?? qty * (mov.unitCostNio ?? 0)),
      );

      if (mov.type === MovementType.SALE) {
        agg.salesQty = round4(agg.salesQty + qty);
        agg.salesCost = round4(agg.salesCost + cost);
        salesCogsNio = round4(salesCogsNio + cost);
        totalCogsNio = round4(totalCogsNio + cost);
      } else if (
        mov.type === MovementType.SALE_CANCEL ||
        mov.type === MovementType.CREDIT_NOTE_RESTOCK
      ) {
        agg.salesQty = round4(agg.salesQty - qty);
        agg.salesCost = round4(agg.salesCost - cost);
        salesCogsNio = round4(salesCogsNio - cost);
        totalCogsNio = round4(totalCogsNio - cost);
      } else if (mov.type === MovementType.SHRINKAGE) {
        agg.shrinkageQty = round4(agg.shrinkageQty + qty);
        agg.shrinkageCost = round4(agg.shrinkageCost + cost);
        shrinkageCogsNio = round4(shrinkageCogsNio + cost);
        totalCogsNio = round4(totalCogsNio + cost);
      }
    }

    const items: CogsReportItemDto[] = Array.from(
      insumoAggregates.entries(),
    ).map(([insumoId, agg]) => {
      const insumo = insumoMap.get(insumoId);
      const totalQty = round4(agg.salesQty + agg.shrinkageQty);
      const totalCost = round4(agg.salesCost + agg.shrinkageCost);
      const pct =
        totalCogsNio > 0 ? round4((totalCost / totalCogsNio) * 100) : 0;

      return {
        insumoId,
        insumoName: insumo?.name ?? insumoId,
        consumptionUom: insumo?.consumptionUom ?? 'unit',
        salesQuantity: agg.salesQty,
        salesCostNio: agg.salesCost,
        shrinkageQuantity: agg.shrinkageQty,
        shrinkageCostNio: agg.shrinkageCost,
        totalQuantity: totalQty,
        totalCostNio: totalCost,
        costPercentage: pct,
      };
    });

    items.sort((a, b) => b.totalCostNio - a.totalCostNio);

    // --- inventoryCoverage: trust evidence, independent of salesCogsNio ---
    // Coverage is NOT freshness and never copied from sync state: it asks
    // whether the backend can demonstrate an authoritative cost for every
    // relevant sale of the period, using per-sale outcome facts.
    const saleMovementsByInvoiceId = new Map<string, InventoryMovement[]>();
    for (const mov of movements) {
      if (mov.type !== MovementType.SALE) continue;
      if (!mov.sourceDocumentId?.startsWith(INVOICE_SOURCE_DOCUMENT_PREFIX)) {
        continue;
      }
      const invoiceId = mov.sourceDocumentId.slice(
        INVOICE_SOURCE_DOCUMENT_PREFIX.length,
      );
      const bucket = saleMovementsByInvoiceId.get(invoiceId);
      if (bucket) {
        bucket.push(mov);
      } else {
        saleMovementsByInvoiceId.set(invoiceId, [mov]);
      }
    }

    // One definition of "a sale that must be costed" (WU11): the shared
    // row-level predicate, not the SQL layer. Credit notes and canceled
    // documents are dropped here, before any counting.
    const coverageRelevantSales = salesInvoices.filter(
      isCogsCoverageRelevantSale,
    );

    let costedSalesCount = 0;
    let uncostedSalesCount = 0;
    const coverageReasons = new Set<InventoryCoverageReasonCode>();

    for (const invoice of coverageRelevantSales) {
      const outcome = (invoice.inventoryOutcome ?? '').trim();
      if (outcome === 'APPLIED') {
        // APPLIED: the sale recorded inventory impact, so it is costed only
        // when a SALE movement with a real non-zero cost basis exists for
        // it (WU12: a recorded totalCostNio of 0 is NOT a cost basis — it
        // usually means the insumo has no purchase cost yet).
        const saleMovements = saleMovementsByInvoiceId.get(invoice.id) ?? [];
        const evidence = classifySaleCostEvidence(saleMovements);
        if (evidence === 'costed') {
          costedSalesCount++;
        } else {
          uncostedSalesCount++;
          coverageReasons.add(
            evidence === 'zero' ? 'ZERO_COST_BASIS' : 'MISSING_COST_BASIS',
          );
        }
      } else if (outcome === 'APPLIED_NO_INVENTORY_IMPACT') {
        // NO_EXPLICIT_INSUMO_MAPPING (WU11 owner decision): absence of an
        // insumo mapping is NOT evidence of zero cost. The sale stays
        // uncosted under its own reason code until someone maps the
        // product's insumos or an explicit domain declaration exists.
        uncostedSalesCount++;
        // Finding D6: the reason code comes from the fact the sale pipeline
        // recorded on the invoice, not from the outcome string alone.
        // A null/absent reason has TWO reachable origins, and they must not be
        // conflated into a cause:
        //   1. a sale with no line items at all — sale-inventory-outcome.service.ts:330
        //      short-circuits it to this outcome with `reason: null`; there is no
        //      product on the ticket whose insumos anyone could map; and
        //   2. the terminal sync path, where `inventoryOutcome` is optional on the
        //      DTO (sync-invoice.dto.ts:364) and the client may report the outcome
        //      without ever reporting a reason.
        // In both, "map the product's insumos" would be an invented cause, so the
        // generic MISSING_COST_BASIS is used. Trade-off stated plainly: for shape
        // 2 this label is LESS specific than the previous outcome-derived
        // NO_EXPLICIT_INSUMO_MAPPING, which happened to be right for a real
        // mapping gap. Less specific is the correct choice, because guessing the
        // cause from an outcome string is what made the copy wrong for shape 1.
        // The trust decision is unchanged either way — still uncosted.
        coverageReasons.add(
          recordedInventoryReasonCode(invoice) === 'NO_EXPLICIT_INSUMO_MAPPING'
            ? 'NO_EXPLICIT_INSUMO_MAPPING'
            : 'MISSING_COST_BASIS',
        );
      } else if (outcome === 'APPLIED_INVENTORY_PENDING') {
        // MISSING_PUBLISHED_RECIPE: inventory impact could not be computed
        // at sale time, so no authoritative cost exists for this sale.
        uncostedSalesCount++;
        coverageReasons.add('MISSING_INVENTORY_IMPACT');
      } else {
        // Null/empty/unknown outcome: legacy row predating the outcome
        // fact, so no per-sale cost evidence can be resolved.
        uncostedSalesCount++;
        coverageReasons.add('UNRESOLVED_SOURCE_DOCUMENT');
      }
    }

    // INCOMPLETE_SYNC is deliberately not emitted: this service cannot
    // prove a sync condition from the data it reads (invoices + kardex
    // movements). An unprovable reason code is worse than an absent one.

    let coverageStatus: InventoryCoverageStatus;
    if (uncostedSalesCount === 0) {
      // COMPLETE: either nothing to cost (an empty period is not a failure,
      // matching how the report already treats empty periods) or every
      // relevant sale of the period is costed.
      coverageStatus = 'COMPLETE';
    } else if (costedSalesCount > 0) {
      // Cost information exists but part of the period could not be costed.
      coverageStatus = 'PARTIAL';
    } else {
      // Sales exist but no reachable cost evidence at all.
      coverageStatus = 'UNAVAILABLE';
    }

    const inventoryCoverage: InventoryCoverageDto = {
      status: coverageStatus,
      costedSalesCount,
      uncostedSalesCount,
    };
    if (coverageReasons.size > 0) {
      inventoryCoverage.reasonCodes = COVERAGE_REASON_CODE_ORDER.filter(
        (code) => coverageReasons.has(code),
      );
    }

    return {
      fromDate: from.toISOString(),
      toDate: to.toISOString(),
      totalCogsNio: Math.max(0, round4(totalCogsNio)),
      salesCogsNio: Math.max(0, round4(salesCogsNio)),
      shrinkageCogsNio: Math.max(0, round4(shrinkageCogsNio)),
      inventoryCoverage,
      generatedAt: new Date().toISOString(),
      items,
    };
  }

  async getKardexReport(
    tenantId: string,
    query: KardexFilterQueryDto,
  ): Promise<KardexReportDto> {
    const { movements, totalCount, insumos } = await runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const movementRepo = manager.getRepository(InventoryMovement);
        const insumoRepo = manager.getRepository(Insumo);

        const qb = movementRepo
          .createQueryBuilder('mov')
          .where('mov.tenant_id = :tenantId', { tenantId });

        if (query.from) {
          qb.andWhere('mov.timestamp >= :from', { from: new Date(query.from) });
        }
        if (query.to) {
          qb.andWhere('mov.timestamp <= :to', { to: new Date(query.to) });
        }
        if (query.insumoId) {
          qb.andWhere('mov.insumoId = :insumoId', {
            insumoId: query.insumoId,
          });
        }
        if (query.type) {
          qb.andWhere('mov.type = :type', { type: query.type });
        }

        qb.orderBy('mov.timestamp', 'DESC');

        const limit = query.limit
          ? Math.min(Math.max(1, query.limit), 1000)
          : 200;
        const offset = query.offset ? Math.max(0, query.offset) : 0;

        qb.take(limit).skip(offset);

        const [movements, totalCount] = await qb.getManyAndCount();

        const insumos = await insumoRepo.find({
          where: { tenant_id: tenantId },
        });

        return { movements, totalCount, insumos };
      },
    );
    const insumoMap = new Map(insumos.map((i) => [i.id, i]));

    const items: KardexReportItemDto[] = movements.map((mov) => {
      const insumo = insumoMap.get(mov.insumoId);
      return {
        id: mov.id,
        insumoId: mov.insumoId,
        insumoName: insumo?.name ?? mov.insumoId,
        consumptionUom: insumo?.consumptionUom ?? 'unit',
        type: mov.type,
        quantity: round4(Number(mov.quantity)),
        stockBefore: round4(Number(mov.previousStock)),
        stockAfter: round4(Number(mov.newStock)),
        unitCostNio:
          mov.unitCostNio != null ? round4(Number(mov.unitCostNio)) : undefined,
        totalCostNio:
          mov.totalCostNio != null
            ? round4(Number(mov.totalCostNio))
            : undefined,
        averageCostAfterNio:
          mov.averageCostAfterNio != null
            ? round4(Number(mov.averageCostAfterNio))
            : undefined,
        reason: mov.reason,
        sourceDocumentType: mov.sourceDocumentType,
        sourceDocumentId: mov.sourceDocumentId,
        createdAt: mov.timestamp
          ? mov.timestamp.toISOString()
          : new Date().toISOString(),
      };
    });

    return {
      totalCount,
      filters: {
        from: query.from,
        to: query.to,
        insumoId: query.insumoId,
        type: query.type,
        warehouseId: query.warehouseId,
      },
      generatedAt: new Date().toISOString(),
      movements: items,
    };
  }

  async getAlertsSummaryReport(
    tenantId: string,
  ): Promise<InventoryAlertsSummaryDto> {
    const insumos = await runInTenantTransaction(
      this.dataSource,
      tenantId,
      (manager) =>
        manager.getRepository(Insumo).find({
          where: { tenant_id: tenantId, is_active: true },
          order: { name: 'ASC' },
        }),
    );

    let criticalCount = 0;
    let warningCount = 0;
    let negativeCount = 0;
    const alerts: InventoryAlertItemDto[] = [];

    for (const insumo of insumos) {
      const stock = round4(Number(insumo.stock ?? 0));
      const minStock =
        insumo.minStock != null ? round4(Number(insumo.minStock)) : undefined;
      const parLevel =
        insumo.parLevel != null ? round4(Number(insumo.parLevel)) : undefined;

      let severity: InventoryAlertSeverity | null = null;
      let message = '';

      if (stock < 0) {
        severity = 'NEGATIVE_STOCK';
        negativeCount++;
        message = `Stock negativo (${stock} ${insumo.consumptionUom ?? 'unit'}). Requiere retrocálculo o conteo físico.`;
      } else if (stock === 0) {
        severity = 'CRITICAL';
        criticalCount++;
        message = `Stock agotado (0 ${insumo.consumptionUom ?? 'unit'}). Reabastecimiento urgente.`;
      } else if (minStock != null && stock <= minStock) {
        severity = 'WARNING';
        warningCount++;
        message = `Stock bajo (${stock} ${insumo.consumptionUom ?? 'unit'}), por debajo o igual al mínimo (${minStock}).`;
      }

      if (severity) {
        const targetLevel = parLevel ?? (minStock ? minStock * 2 : stock + 10);
        const suggestedReorder = round4(Math.max(0, targetLevel - stock));

        alerts.push({
          insumoId: insumo.id,
          insumoName: insumo.name,
          consumptionUom: insumo.consumptionUom ?? 'unit',
          warehouseId: insumo.warehouse_id,
          isPerishable: insumo.is_perishable ?? false,
          stock,
          minStock,
          parLevel,
          severity,
          message,
          suggestedReorderQuantity: suggestedReorder,
        });
      }
    }

    const severityWeight: Record<InventoryAlertSeverity, number> = {
      NEGATIVE_STOCK: 1,
      CRITICAL: 2,
      WARNING: 3,
    };
    alerts.sort(
      (a, b) => severityWeight[a.severity] - severityWeight[b.severity],
    );

    return {
      totalAlertsCount: alerts.length,
      criticalCount,
      warningCount,
      negativeCount,
      generatedAt: new Date().toISOString(),
      alerts,
    };
  }
}
