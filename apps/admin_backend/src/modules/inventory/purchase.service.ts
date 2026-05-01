/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Insumo } from './entities/insumo.entity';
import { Supplier } from './entities/supplier.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';

@Injectable()
export class PurchaseService {
  constructor(
    @InjectRepository(Insumo)
    private readonly insumoRepo: Repository<Insumo>,
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
    @InjectRepository(InventoryMovement)
    private readonly movementRepo: Repository<InventoryMovement>,
    private readonly dataSource: DataSource,
  ) {}

  async recordPurchase(
    insumoId: string,
    supplierId: string,
    quantity: number,
    cost: number,
  ): Promise<Insumo> {
    return this.dataSource.transaction(async (manager) => {
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
        reason: `Purchase from ${supplier.name}`,
      });
      await manager.save(movement);

      return updatedInsumo;
    });
  }
}
