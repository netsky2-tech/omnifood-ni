/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Insumo } from './entities/insumo.entity';
import {
  InventoryMovement,
  MovementType,
} from './entities/inventory-movement.entity';
import { ForensicAlertService } from './forensic-alert.service';
import {
  MERMA_REASONS,
  normalizeMermaReason,
  requireMermaObservation,
} from './merma-taxonomy';

const SCALE_4 = 4;
const HIGH_VALUE_ADJUSTMENT_THRESHOLD_NIO = 1500;

const round4 = (value: number): number => Number(value.toFixed(SCALE_4));

@Injectable()
export class ShrinkageService {
  constructor(
    @InjectRepository(Insumo)
    private readonly insumoRepo: Repository<Insumo>,
    @InjectRepository(InventoryMovement)
    private readonly movementRepo: Repository<InventoryMovement>,
    private readonly dataSource: DataSource,
    private readonly forensicAlertService: ForensicAlertService,
  ) {}

  async recordShrinkage(
    insumoId: string,
    quantity: number,
    reason: string,
    observation: string,
  ): Promise<Insumo> {
    const canonicalReason = normalizeMermaReason(reason);
    if (canonicalReason == null) {
      throw new BadRequestException(
        `Invalid shrinkage type: ${reason}. Allowed: ${Object.values(MERMA_REASONS).join(', ')}`,
      );
    }
    const requiredObservation = requireMermaObservation(observation);

    const normalizedQuantity = round4(quantity);

    return this.dataSource.transaction(async (manager) => {
      const insumo = await manager.findOne(Insumo, {
        where: { id: insumoId } as any,
      });
      if (!insumo) throw new NotFoundException(`Insumo ${insumoId} not found`);

      const previousStock = Number(insumo.stock);
      const newStock = round4(previousStock - normalizedQuantity);
      const unitCostNio = round4(Number(insumo.averageCost));
      const totalCostNio = round4(normalizedQuantity * unitCostNio);

      insumo.stock = newStock;
      insumo.existenciaActual = newStock;
      const updatedInsumo = await manager.save(insumo);

      const movement = manager.create(InventoryMovement, {
        tenant_id: insumo.tenant_id,
        insumoId: insumo.id,
        type: MovementType.SHRINKAGE,
        quantity: -normalizedQuantity,
        previousStock: previousStock,
        newStock: newStock,
        averageCostAfterNio: unitCostNio,
        unitCostNio,
        totalCostNio,
        reason: canonicalReason,
        observation: requiredObservation,
        sourceDocumentType: 'SHRINKAGE',
      });
      await manager.save(movement);

      if (totalCostNio > HIGH_VALUE_ADJUSTMENT_THRESHOLD_NIO) {
        await this.forensicAlertService.create(
          {
            tenantId: insumo.tenant_id,
            alertType: 'HIGH_VALUE_COUNT_ADJUSTMENT',
            severity: 'HIGH',
            actorRole: 'ADMIN',
            message: `High-value shrinkage detected for ${insumo.name}`,
            metadata: {
              movementType: MovementType.SHRINKAGE,
              insumoId: insumo.id,
              insumoName: insumo.name,
              amount: normalizedQuantity,
              valuationNio: totalCostNio,
              actorRole: 'OPERATOR',
              originDocumentRef: `shrinkage:${movement.id}`,
              operatorNotice:
                'Adjustment recorded. Admin has been notified for forensic review.',
            },
          },
          manager,
        );
      }

      return updatedInsumo;
    });
  }
}
