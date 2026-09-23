/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Insumo } from './entities/insumo.entity';
import { Supplier } from './entities/supplier.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';
import {
  bindTenantContext,
  resolveTenantContextId,
} from '../../core/database/tenant-transaction';

@Injectable()
export class PurchaseService {
  // Issue #512 slice 1 part A: pooled repository injections are gone. Every
  // read/write inside recordPurchase resolves from the transaction manager
  // after the transaction-local tenant binding.
  constructor(private readonly dataSource: DataSource) {}

  async recordPurchase(
    insumoId: string,
    supplierId: string,
    quantity: number,
    cost: number,
    tenantId: string,
  ): Promise<Insumo> {
    // Fail closed before any SQL (and before a connection is borrowed) when
    // the tenant id is missing or blank.
    const normalizedTenantId = resolveTenantContextId(tenantId);

    return this.dataSource.transaction(async (manager) => {
      // Issue #512 slice 1 part A: binding is the first operation of this
      // transaction; the Insumo read below is the first protected access and
      // must never run on an unbound manager under FORCE RLS.
      await bindTenantContext(manager, normalizedTenantId);

      const insumo = await manager.findOne(Insumo, {
        where: { id: insumoId } as any,
      });
      if (!insumo) throw new NotFoundException(`Insumo ${insumoId} not found`);

      const supplier = await manager.findOne(Supplier, {
        where: { id: supplierId } as any,
      });
      if (!supplier)
        throw new NotFoundException(`Supplier ${supplierId} not found`);

      const currentTotalCost =
        Number(insumo.stock) * Number(insumo.averageCost);
      const consumptionQuantity = quantity * Number(insumo.conversionFactor);
      const newTotalStock = Number(insumo.stock) + consumptionQuantity;

      const newBatchCost = quantity * cost;
      const newAverageCost = (currentTotalCost + newBatchCost) / newTotalStock;

      const previousStock = Number(insumo.stock);
      insumo.stock = newTotalStock;
      insumo.averageCost = Number(newAverageCost.toFixed(8));
      const updatedInsumo = await manager.save(insumo);

      const movement = manager.create(InventoryMovement, {
        tenant_id: insumo.tenant_id,
        insumoId: insumo.id,
        type: 'PURCHASE' as any,
        quantity: consumptionQuantity,
        previousStock: previousStock,
        newStock: newTotalStock,
        averageCostAfterNio: Number(newAverageCost.toFixed(4)),
        unitCostNio: Number(cost.toFixed(4)),
        totalCostNio: Number(newBatchCost.toFixed(4)),
        reason: `Purchase from ${supplier.name}`,
      });
      await manager.save(movement);

      return updatedInsumo;
    });
  }
}
