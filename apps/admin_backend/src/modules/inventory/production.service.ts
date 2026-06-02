import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Batch } from './entities/batch.entity';
import { Insumo } from './entities/insumo.entity';
import {
  InventoryMovement,
  MovementType,
} from './entities/inventory-movement.entity';
import { BomExplosionService } from './bom-explosion.service';
import {
  BatchCandidate,
  BatchConsumptionTrace,
  BatchCostingService,
} from './batch-costing.service';
import { RecipeService } from './recipe.service';

const SCALE_4 = 4;
const round4 = (value: number): number => Number(value.toFixed(SCALE_4));

@Injectable()
export class ProductionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly recipeService: RecipeService,
    private readonly bomExplosionService: BomExplosionService,
    private readonly batchCostingService: BatchCostingService,
    @InjectRepository(Batch)
    private readonly batchRepo: Repository<Batch>,
  ) {}

  async processOrder(input: {
    tenantId: string;
    recipeVersionId: string;
    orderQuantity: number;
    producedInsumoId: string;
    producedBatchNumber: string;
    producedExpirationDate: Date;
    operationDate: Date;
  }): Promise<{
    valuationTraceability: Record<string, BatchConsumptionTrace[]>;
  }> {
    const snapshot = await this.recipeService.getSnapshot(
      input.recipeVersionId,
      input.tenantId,
    );

    const exploded = this.bomExplosionService.explode({
      snapshotComponents: snapshot.components,
      orderQuantity: input.orderQuantity,
    });

    const valuationTraceability: Record<string, BatchConsumptionTrace[]> = {};
    let totalConsumedValueNio = 0;

    await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      for (const [insumoId, requiredQuantity] of exploded.entries()) {
        const candidates = await this.batchRepo.find({
          where: { tenant_id: input.tenantId, insumo_id: insumoId },
          order: { batch_number: 'ASC' },
        });

        const trace = this.batchCostingService.buildValuationTrace({
          requiredQuantity,
          operationDate: input.operationDate,
          candidates: candidates.map<BatchCandidate>((batch) => ({
            batchId: batch.id,
            insumoId,
            remainingStock: Number(batch.remaining_stock),
            unitCostNio: Number(batch.cost),
            expirationDate: batch.expiration_date,
          })),
        });

        valuationTraceability[insumoId] = trace;

        const consumedTotal = round4(
          trace.reduce((sum, item) => sum + item.consumedQuantity, 0),
        );
        const consumedValueNio = round4(
          trace.reduce((sum, item) => sum + item.totalCostNio, 0),
        );
        totalConsumedValueNio = round4(
          totalConsumedValueNio + consumedValueNio,
        );

        if (consumedTotal <= 0) {
          continue;
        }

        const insumo = await manager
          .createQueryBuilder(Insumo, 'insumo')
          .setLock('pessimistic_write')
          .where('insumo.id = :insumoId', { insumoId })
          .andWhere('insumo.tenant_id = :tenantId', {
            tenantId: input.tenantId,
          })
          .getOne();

        if (!insumo) {
          continue;
        }

        const previousStock = Number(insumo.stock);
        const newStock = round4(previousStock - consumedTotal);

        insumo.stock = newStock;
        insumo.existenciaActual = newStock;
        await manager.save(Insumo, insumo);

        const averageUnitCost =
          trace.length === 0
            ? Number(insumo.averageCost)
            : round4(
                trace.reduce((sum, item) => sum + item.totalCostNio, 0) /
                  consumedTotal,
              );

        await manager.save(
          InventoryMovement,
          manager.create(InventoryMovement, {
            tenant_id: input.tenantId,
            insumoId,
            type: MovementType.PRODUCTION,
            quantity: round4(-consumedTotal),
            previousStock,
            newStock,
            unitCostNio: averageUnitCost,
            totalCostNio: round4(consumedTotal * averageUnitCost),
            reason: `PRODUCTION_CONSUME:${input.recipeVersionId}`,
          }),
        );
      }

      const producedInsumo = await manager
        .createQueryBuilder(Insumo, 'insumo')
        .setLock('pessimistic_write')
        .where('insumo.id = :insumoId', { insumoId: input.producedInsumoId })
        .andWhere('insumo.tenant_id = :tenantId', { tenantId: input.tenantId })
        .getOne();

      if (producedInsumo) {
        const previousStock = Number(producedInsumo.stock);
        const newStock = round4(previousStock + input.orderQuantity);
        producedInsumo.stock = newStock;
        producedInsumo.existenciaActual = newStock;
        await manager.save(Insumo, producedInsumo);

        const producedUnitCostNio =
          input.orderQuantity <= 0
            ? round4(Number(producedInsumo.averageCost))
            : round4(totalConsumedValueNio / input.orderQuantity);

        await manager.save(
          InventoryMovement,
          manager.create(InventoryMovement, {
            tenant_id: input.tenantId,
            insumoId: input.producedInsumoId,
            type: MovementType.PRODUCTION,
            quantity: round4(input.orderQuantity),
            previousStock,
            newStock,
            unitCostNio: producedUnitCostNio,
            totalCostNio: round4(input.orderQuantity * producedUnitCostNio),
            reason: `PRODUCTION_RECEIPT:${input.recipeVersionId}`,
            sourceDocumentType: 'PRODUCTION',
          }),
        );

        const existingBatch = await manager.findOne(Batch, {
          where: {
            tenant_id: input.tenantId,
            insumo_id: input.producedInsumoId,
            batch_number: input.producedBatchNumber,
          },
        });

        if (existingBatch) {
          existingBatch.remaining_stock = round4(
            Number(existingBatch.remaining_stock) + input.orderQuantity,
          );
          existingBatch.expiration_date = input.producedExpirationDate;
          await manager.save(Batch, existingBatch);
        } else {
          await manager.save(
            Batch,
            manager.create(Batch, {
              tenant_id: input.tenantId,
              insumo_id: input.producedInsumoId,
              batch_number: input.producedBatchNumber,
              expiration_date: input.producedExpirationDate,
              remaining_stock: round4(input.orderQuantity),
              cost: producedUnitCostNio,
            }),
          );
        }
      }
    });

    return { valuationTraceability };
  }
}
