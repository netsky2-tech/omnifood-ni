import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Insumo } from './entities/insumo.entity';
import {
  InventoryMovement,
  MovementType,
} from './entities/inventory-movement.entity';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto';
import { LowStockEvent } from '../notifications/listeners/low-stock.listener';
import { CostCalculatorService } from './cost-calculator.service';

const SCALE_4 = 4;

const round4 = (value: number): number => Number(value.toFixed(SCALE_4));

type SyncedInventoryMovement = CreateInventoryMovementDto & {
  unitCostNio?: number;
};

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
    tenantId: string,
  ): Promise<Insumo> {
    const insumo = await this.insumoRepo.findOne({
      where: { id: insumoId, tenant_id: tenantId },
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

  async syncMovements(
    movements: CreateInventoryMovementDto[],
    tenantId: string,
  ): Promise<void> {
    const sorted = this.sortMovements(
      movements.map((m) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      })) as Array<SyncedInventoryMovement & { timestamp: Date }>,
    );

    await this.dataSource.transaction(async (manager) => {
      const insumoRepo = manager.getRepository(Insumo);
      const movementRepo = manager.getRepository(InventoryMovement);

      for (const mov of sorted) {
        const insumo = await insumoRepo.findOne({
          where: { id: mov.insumoId, tenant_id: tenantId },
        });
        if (!insumo) continue;

        // Conflict Resolution: Recalculate stock based on backend state
        // instead of trusting client's absolute newStock
        const previousStock = round4(Number(insumo.stock));
        const previousAverageCostNio = round4(Number(insumo.averageCost ?? 0));
        const normalizedQuantity = round4(Number(mov.quantity));
        const stockDelta = this.resolveStockDelta(mov.type, normalizedQuantity);
        const newStock = round4(previousStock + stockDelta);
        const unitCostNio = this.resolveUnitCostNio(
          mov,
          previousAverageCostNio,
          stockDelta,
        );
        const averageCostAfterNio = this.calculateAverageCostAfterMovement(
          previousStock,
          previousAverageCostNio,
          stockDelta,
          unitCostNio,
        );

        insumo.stock = newStock;
        insumo.existenciaActual = newStock;
        insumo.averageCost = averageCostAfterNio;
        await insumoRepo.save(insumo);

        const movement = movementRepo.create({
          ...mov,
          previousStock,
          newStock,
          averageCostAfterNio,
          unitCostNio,
          totalCostNio: round4(Math.abs(normalizedQuantity) * unitCostNio),
          timestamp: mov.timestamp,
        });
        await movementRepo.save(movement);
      }
    });
  }

  private resolveStockDelta(type: MovementType, quantity: number): number {
    switch (type) {
      case MovementType.SALE:
      case MovementType.SHRINKAGE:
        return -Math.abs(quantity);
      case MovementType.PURCHASE:
      case MovementType.PRODUCTION:
      case MovementType.REVERSAL:
        return Math.abs(quantity);
      case MovementType.ADJUSTMENT:
        return quantity;
    }
  }

  private resolveUnitCostNio(
    movement: SyncedInventoryMovement,
    previousAverageCostNio: number,
    stockDelta: number,
  ): number {
    if (typeof movement.unitCostNio === 'number') {
      return round4(movement.unitCostNio);
    }

    if (stockDelta > 0) {
      throw new BadRequestException(
        'Synced inbound movements must include unitCostNio to freeze a valid cost snapshot',
      );
    }

    return previousAverageCostNio;
  }

  private calculateAverageCostAfterMovement(
    previousStock: number,
    previousAverageCostNio: number,
    stockDelta: number,
    unitCostNio: number,
  ): number {
    if (stockDelta <= 0) {
      return previousAverageCostNio;
    }

    return round4(
      this.costCalculator.calculateAverageCost(
        previousStock,
        previousAverageCostNio,
        stockDelta,
        unitCostNio,
      ),
    );
  }

  sortMovements<T extends { timestamp: Date }>(movements: T[]): T[] {
    return [...movements].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );
  }
}
