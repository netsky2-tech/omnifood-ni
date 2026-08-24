import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  InventoryValuationItemDto,
  InventoryValuationReportDto,
  KardexFilterQueryDto,
  KardexReportDto,
  KardexReportItemDto,
} from '../dto/inventory-reports.dto';

const round4 = (value: number): number =>
  Number((Math.round((value + Number.EPSILON) * 10000) / 10000).toFixed(4));

@Injectable()
export class InventoryReportsService {
  constructor(
    @InjectRepository(Insumo)
    private readonly insumoRepo: Repository<Insumo>,
    @InjectRepository(InventoryMovement)
    private readonly movementRepo: Repository<InventoryMovement>,
  ) {}

  async getValuationReport(tenantId: string): Promise<InventoryValuationReportDto> {
    const insumos = await this.insumoRepo.find({
      where: { tenant_id: tenantId, is_active: true },
      order: { name: 'ASC' },
    });

    let totalValuationNio = 0;
    let itemsWithStockCount = 0;
    let itemsLowStockCount = 0;
    let itemsNegativeStockCount = 0;

    const items: InventoryValuationItemDto[] = insumos.map((insumo) => {
      const stock = round4(Number(insumo.stock ?? 0));
      const averageCostNio = round4(Number(insumo.averageCost ?? 0));
      const totalValuation = round4(stock * averageCostNio);
      const stockMin = insumo.minStock != null ? round4(Number(insumo.minStock)) : undefined;
      const stockMax = insumo.maxStock != null ? round4(Number(insumo.maxStock)) : undefined;
      const parLevel = insumo.parLevel != null ? round4(Number(insumo.parLevel)) : undefined;

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

    const qb = this.movementRepo
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
    const insumos = await this.insumoRepo.find({
      where: { tenant_id: tenantId },
    });
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
      const agg = insumoAggregates.get(insumoId)!;
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

    return {
      fromDate: from.toISOString(),
      toDate: to.toISOString(),
      totalCogsNio: Math.max(0, round4(totalCogsNio)),
      salesCogsNio: Math.max(0, round4(salesCogsNio)),
      shrinkageCogsNio: Math.max(0, round4(shrinkageCogsNio)),
      generatedAt: new Date().toISOString(),
      items,
    };
  }

  async getKardexReport(
    tenantId: string,
    query: KardexFilterQueryDto,
  ): Promise<KardexReportDto> {
    const qb = this.movementRepo
      .createQueryBuilder('mov')
      .where('mov.tenant_id = :tenantId', { tenantId });

    if (query.from) {
      qb.andWhere('mov.timestamp >= :from', { from: new Date(query.from) });
    }
    if (query.to) {
      qb.andWhere('mov.timestamp <= :to', { to: new Date(query.to) });
    }
    if (query.insumoId) {
      qb.andWhere('mov.insumoId = :insumoId', { insumoId: query.insumoId });
    }
    if (query.type) {
      qb.andWhere('mov.type = :type', { type: query.type });
    }

    qb.orderBy('mov.timestamp', 'DESC');

    const limit = query.limit ? Math.min(Math.max(1, query.limit), 1000) : 200;
    const offset = query.offset ? Math.max(0, query.offset) : 0;

    qb.take(limit).skip(offset);

    const [movements, totalCount] = await qb.getManyAndCount();

    const insumos = await this.insumoRepo.find({
      where: { tenant_id: tenantId },
    });
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
          mov.totalCostNio != null ? round4(Number(mov.totalCostNio)) : undefined,
        averageCostAfterNio:
          mov.averageCostAfterNio != null
            ? round4(Number(mov.averageCostAfterNio))
            : undefined,
        reason: mov.reason,
        sourceDocumentType: mov.sourceDocumentType,
        sourceDocumentId: mov.sourceDocumentId,
        createdAt: mov.timestamp ? mov.timestamp.toISOString() : new Date().toISOString(),
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
    const insumos = await this.insumoRepo.find({
      where: { tenant_id: tenantId, is_active: true },
      order: { name: 'ASC' },
    });

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
