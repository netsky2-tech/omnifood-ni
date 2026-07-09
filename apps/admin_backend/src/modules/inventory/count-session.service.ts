import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { CountSessionDocumentDto } from './dto/count-session-document.dto';
import { Insumo } from './entities/insumo.entity';
import {
  InventoryMovement,
  MovementType,
} from './entities/inventory-movement.entity';

const SCALE_4 = 4;
const COUNT_ADJUSTMENT_DOCUMENT_TYPE = 'AJUSTE_CONTEO';

const round4 = (value: number): number => Number(value.toFixed(SCALE_4));

export interface ReplayCountSessionInput {
  tenantId: string;
  document: CountSessionDocumentDto;
}

export interface ReplayCountSessionResult {
  sessionId: string;
  movementsCreated: number;
  skippedExisting: boolean;
}

@Injectable()
export class CountSessionService {
  constructor(private readonly dataSource: DataSource) {}

  async replayCountSession(
    input: ReplayCountSessionInput,
  ): Promise<ReplayCountSessionResult> {
    const sessionId = input.document.id.trim();
    if (sessionId.length === 0) {
      throw new BadRequestException(
        'Count adjustments must reference a count-session document id',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const existing = await manager
        .getRepository(InventoryMovement)
        .findOneBy({
          tenant_id: input.tenantId,
          sourceDocumentType: COUNT_ADJUSTMENT_DOCUMENT_TYPE,
          sourceDocumentId: sessionId,
        });

      if (existing) {
        return {
          sessionId,
          movementsCreated: 0,
          skippedExisting: true,
        };
      }

      const movementsCreated = await this.createVarianceMovements(
        manager,
        input.tenantId,
        input.document,
        sessionId,
      );

      return {
        sessionId,
        movementsCreated,
        skippedExisting: false,
      };
    });
  }

  private async createVarianceMovements(
    manager: EntityManager,
    tenantId: string,
    document: CountSessionDocumentDto,
    sessionId: string,
  ): Promise<number> {
    const insumoRepo = manager.getRepository(Insumo);
    const movementRepo = manager.getRepository(InventoryMovement);
    let movementsCreated = 0;

    for (const line of document.lines) {
      const approvedEntry =
        line.approvedEntryIndex === undefined
          ? undefined
          : line.entries[line.approvedEntryIndex];

      if (!approvedEntry) {
        continue;
      }

      const variance = round4(
        approvedEntry.countedQuantity - line.theoreticalQuantity,
      );
      if (variance === 0) {
        continue;
      }

      const insumo = await insumoRepo.findOne({
        where: { id: line.insumoId, tenant_id: tenantId },
      });
      if (!insumo) {
        throw new NotFoundException(`Insumo ${line.insumoId} not found`);
      }

      const previousStock = round4(Number(insumo.stock));
      const previousAverageCostNio = round4(Number(insumo.averageCost ?? 0));
      const newStock = round4(previousStock + variance);

      insumo.stock = newStock;
      insumo.existenciaActual = newStock;
      insumo.averageCost = previousAverageCostNio;
      await insumoRepo.save(insumo);

      const movement = movementRepo.create({
        tenant_id: tenantId,
        insumoId: line.insumoId,
        type: MovementType.ADJUSTMENT,
        quantity: variance,
        previousStock,
        newStock,
        averageCostAfterNio: previousAverageCostNio,
        unitCostNio: previousAverageCostNio,
        totalCostNio: round4(Math.abs(variance) * previousAverageCostNio),
        sourceDocumentType: COUNT_ADJUSTMENT_DOCUMENT_TYPE,
        sourceDocumentId: sessionId,
        timestamp: new Date(document.postedAt ?? document.cutoffAt),
      });
      await movementRepo.save(movement);
      movementsCreated += 1;
    }

    return movementsCreated;
  }
}
