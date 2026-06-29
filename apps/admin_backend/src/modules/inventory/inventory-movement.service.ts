import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Insumo } from './entities/insumo.entity';
import {
  InventoryMovement,
  MovementType,
} from './entities/inventory-movement.entity';

const SCALE_4 = 4;

const round4 = (value: number): number => Number(value.toFixed(SCALE_4));

export interface PostPurchaseMovementInput {
  tenantId: string;
  insumoId: string;
  quantity: number;
  unitCostNio: number;
  reason?: string;
}

@Injectable()
export class InventoryMovementService {
  constructor(private readonly dataSource: DataSource) {}

  async postPurchaseMovement(
    input: PostPurchaseMovementInput,
  ): Promise<Insumo> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const insumo = await manager
        .createQueryBuilder(Insumo, 'insumo')
        .setLock('pessimistic_write')
        .where('insumo.id = :insumoId', { insumoId: input.insumoId })
        .andWhere('insumo.tenant_id = :tenantId', { tenantId: input.tenantId })
        .getOne();

      if (!insumo) {
        throw new NotFoundException(`Insumo ${input.insumoId} not found`);
      }

      const previousStock = Number(insumo.stock);
      const previousCppNio = Number(insumo.averageCost);
      const quantity = round4(input.quantity);
      const unitCostNio = round4(input.unitCostNio);

      const previousTotalCostNio = previousStock * previousCppNio;
      const purchaseTotalCostNio = quantity * unitCostNio;
      const resultingStock = round4(previousStock + quantity);
      const resultingCppNio =
        resultingStock === 0
          ? 0
          : round4(
              (previousTotalCostNio + purchaseTotalCostNio) / resultingStock,
            );

      insumo.stock = resultingStock;
      insumo.existenciaActual = resultingStock;
      insumo.averageCost = resultingCppNio;
      const savedInsumo = await manager.save(Insumo, insumo);

      const movement = manager.create(InventoryMovement, {
        tenant_id: input.tenantId,
        insumoId: insumo.id,
        type: MovementType.PURCHASE,
        quantity,
        previousStock,
        newStock: resultingStock,
        averageCostAfterNio: resultingCppNio,
        unitCostNio,
        totalCostNio: round4(purchaseTotalCostNio),
        reason: input.reason,
      });

      await manager.save(InventoryMovement, movement);

      return savedInsumo;
    });
  }
}
