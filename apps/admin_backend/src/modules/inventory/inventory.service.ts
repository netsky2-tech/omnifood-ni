import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Insumo } from './entities/insumo.entity';
import { InventoryMovement, MovementType } from './entities/inventory-movement.entity';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto';
import { LowStockEvent } from '../notifications/listeners/low-stock.listener';
import { CostCalculatorService } from './cost-calculator.service';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Insumo)
    private readonly insumoRepo: Repository<Insumo>,
    @InjectRepository(InventoryMovement)
    private readonly movementRepo: Repository<InventoryMovement>,
    private readonly eventEmitter: EventEmitter2,
    private readonly dataSource: DataSource,
    private readonly costCalculator: CostCalculatorService,
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

    const convertedQuantity = quantity * Number(insumo.conversionFactor);
    const newAverageCost = this.costCalculator.calculateAverageCost(
      insumo.stock,
      insumo.averageCost,
      convertedQuantity,
      cost / Number(insumo.conversionFactor), // Adjust cost to stock unit
    );

    insumo.stock = Number(insumo.stock) + convertedQuantity;
    insumo.averageCost = newAverageCost;

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

  async syncMovements(movements: CreateInventoryMovementDto[]): Promise<void> {
    const sorted = await this.sortMovements(
      movements.map((m) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      })),
    );

    await this.dataSource.transaction(async (manager) => {
      const insumoRepo = manager.getRepository(Insumo);
      const movementRepo = manager.getRepository(InventoryMovement);

      for (const mov of sorted) {
        const insumo = await insumoRepo.findOne({
          where: { id: mov.insumoId },
        });
        if (!insumo) continue;

        // Conflict Resolution: Recalculate stock based on backend state
        // instead of trusting client's absolute newStock
        const previousStock = Number(insumo.stock);
        let newStock = previousStock;

        if (
          mov.type === MovementType.SALE ||
          mov.type === MovementType.SHRINKAGE
        ) {
          newStock = previousStock - Number(mov.quantity);
        } else if (
          mov.type === MovementType.PURCHASE ||
          mov.type === MovementType.REVERSAL ||
          mov.type === MovementType.ADJUSTMENT
        ) {
          // Adjustments could be positive or negative, but usually quantity is signed
          // For now we'll treat it as additive if it's an adjustment
          newStock = previousStock + Number(mov.quantity);
        }

        insumo.stock = newStock;
        await insumoRepo.save(insumo);

        const movement = movementRepo.create({
          ...mov,
          previousStock,
          newStock,
          timestamp: mov.timestamp,
        });
        await movementRepo.save(movement);
      }
    });
  }

  async sortMovements<T extends { timestamp: Date }>(
    movements: T[],
  ): Promise<T[]> {
    return [...movements].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );
  }
}
