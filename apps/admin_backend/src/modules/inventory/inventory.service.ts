import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Insumo } from './entities/insumo.entity';
import { LowStockEvent } from '../notifications/listeners/low-stock.listener';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Insumo)
    private readonly insumoRepo: Repository<Insumo>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async recordPurchase(
    insumoId: string,
    quantity: number,
    cost: number,
  ): Promise<Insumo> {
    const insumo = await this.insumoRepo.findOne({
      where: { id: insumoId },
    });
    if (!insumo) {
      throw new NotFoundException(`Insumo with ID ${insumoId} not found`);
    }

    const currentTotalCost = Number(insumo.stock) * Number(insumo.averageCost);
    const convertedQuantity = quantity * Number(insumo.conversionFactor);
    const newBatchCost = quantity * cost; // cost is per purchase unit
    const newStock = Number(insumo.stock) + convertedQuantity;
    const newAverageCost = (currentTotalCost + newBatchCost) / newStock;

    insumo.stock = newStock;
    insumo.averageCost = Number(newAverageCost.toFixed(8)); // Increased precision

    const updatedInsumo = await this.insumoRepo.save(insumo);

    if (
      updatedInsumo.parLevel &&
      updatedInsumo.stock < updatedInsumo.parLevel
    ) {
      this.eventEmitter.emit(
        'inventory.low_stock',
        new LowStockEvent(
          updatedInsumo.name,
          updatedInsumo.stock,
          updatedInsumo.parLevel,
          updatedInsumo.tenant_id,
        ),
      );
    }

    return updatedInsumo;
  }
}
