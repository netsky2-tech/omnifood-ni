/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Insumo } from './entities/insumo.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';

@Injectable()
export class ShrinkageService {
  constructor(
    @InjectRepository(Insumo)
    private readonly insumoRepo: Repository<Insumo>,
    @InjectRepository(InventoryMovement)
    private readonly movementRepo: Repository<InventoryMovement>,
    private readonly dataSource: DataSource,
  ) {}

  async recordShrinkage(
    insumoId: string,
    quantity: number,
    reason: string,
  ): Promise<Insumo> {
    return this.dataSource.transaction(async (manager) => {
      const insumo = await manager.findOne(Insumo, {
        where: { id: insumoId } as any,
      });
      if (!insumo) throw new NotFoundException(`Insumo ${insumoId} not found`);

      const previousStock = Number(insumo.stock);
      const newStock = previousStock - quantity;
      insumo.stock = newStock;
      const updatedInsumo = await manager.save(insumo);

      const movement = manager.create(InventoryMovement, {
        tenant_id: insumo.tenant_id,
        insumoId: insumo.id,
        type: 'SHRINKAGE' as any,
        quantity: -quantity,
        previousStock: previousStock,
        newStock: newStock,
        reason: reason,
      });
      await manager.save(movement);

      return updatedInsumo;
    });
  }
}
