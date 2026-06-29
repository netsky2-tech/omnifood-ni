import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  InventoryMovement,
  MovementType,
} from './entities/inventory-movement.entity';

@Injectable()
export class InventoryAdjustmentService {
  constructor(private readonly dataSource: DataSource) {}

  async applyCompensatingAdjustment(input: {
    tenantId: string;
    originalMovementId: string;
    actorUserId?: string;
    reason: string;
  }): Promise<InventoryMovement> {
    return this.dataSource.transaction(async (manager) => {
      const original = await manager.findOneByOrFail(InventoryMovement, {
        id: input.originalMovementId,
        tenant_id: input.tenantId,
      });

      const compensating = manager.create(InventoryMovement, {
        tenant_id: original.tenant_id,
        insumoId: original.insumoId,
        type: MovementType.ADJUSTMENT,
        quantity: -Number(original.quantity),
        previousStock: Number(original.newStock),
        newStock: Number(original.previousStock),
        averageCostAfterNio: original.averageCostAfterNio ?? null,
        unitCostNio: original.unitCostNio,
        totalCostNio:
          original.totalCostNio !== null && original.totalCostNio !== undefined
            ? -Number(original.totalCostNio)
            : null,
        reason: input.reason,
        compensationForKardexId: original.id,
        user_id: input.actorUserId,
      });

      return manager.save(InventoryMovement, compensating);
    });
  }
}
