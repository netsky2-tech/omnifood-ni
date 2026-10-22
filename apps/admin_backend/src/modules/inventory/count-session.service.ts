import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { bindTenantContext } from '../../core/database/tenant-transaction';
import { drawBatchOutflow } from './batch-allocation';
import { toCalendarDay } from '../../core/database/calendar-day';
import { CountSessionDocumentDto } from './dto/count-session-document.dto';
import {
  ForensicAlertService,
  shouldCreateHighValueInventoryAlert,
} from './forensic-alert.service';
import { Insumo } from './entities/insumo.entity';
import { Batch } from './entities/batch.entity';
import { CountSession } from './entities/count-session.entity';
import { CountSessionEntry } from './entities/count-session-entry.entity';
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
  constructor(
    private readonly dataSource: DataSource,
    private readonly forensicAlertService: ForensicAlertService,
  ) {}

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
      // RLS binding (L1-11): app.tenant_id must be set on THIS transaction
      // before any query touches an RLS-protected table, so the existing-
      // movement lookup, the stock update and the adjustment insert all run
      // inside the tenant's row-security context.
      await bindTenantContext(manager, input.tenantId);

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

      // R19 (S13): the session itself persists on the SAME write path, in the
      // SAME transaction (any failure above or below rolls the document back
      // with the ledger) and under the SAME idempotency — this code is only
      // reached when no movement with `sourceDocumentId = sessionId` exists,
      // so a POS retry returns at the guard and can never duplicate the
      // session, its entries, or the adjustment. The document must survive
      // even when the variance is zero: the act of counting is evidence
      // (R-05/R-06) regardless of the accounting effect it produced.
      await this.persistSessionDocument(
        manager,
        input.tenantId,
        input.document,
      );

      return {
        sessionId,
        movementsCreated,
        skippedExisting: false,
      };
    });
  }

  /**
   * R19 (S12): persist the count document itself — header plus one row per
   * counted entry. The line identity (`insumoName`, `uom`,
   * `theoreticalQuantity`) is FROZEN from the document exactly as the signed
   * sheet printed it; re-reading the insumo catalog here would break the
   * reprint-identical-years-later guarantee the moment the insumo is renamed.
   */
  private async persistSessionDocument(
    manager: EntityManager,
    tenantId: string,
    document: CountSessionDocumentDto,
  ): Promise<void> {
    await manager.save(
      manager.create(CountSession, {
        id: document.id,
        tenant_id: tenantId,
        warehouse_id: document.warehouseId,
        warehouse_name: document.warehouseName,
        status: document.status,
        notes: document.notes ?? null,
        cutoff_at: new Date(document.cutoffAt),
        posted_at: document.postedAt ? new Date(document.postedAt) : null,
        movement_references: document.movementReferences ?? null,
      }),
    );

    const entries = document.lines.flatMap((line, lineIndex) =>
      line.entries.map((entry, entryIndex) =>
        manager.create(CountSessionEntry, {
          tenant_id: tenantId,
          session_id: document.id,
          insumo_id: line.insumoId,
          // FROZEN (S12): the sheet's identity, never the catalog's.
          insumo_name: line.insumoName,
          uom: line.uom,
          theoretical_quantity: line.theoreticalQuantity,
          line_id: line.id,
          line_index: lineIndex,
          entry_index: entryIndex,
          counted_quantity: entry.countedQuantity,
          // A-01: the lot the observation was made in.
          batch_id: entry.batchId ?? null,
          batch_number: entry.batchNumber ?? null,
          counted_at: entry.countedAt ? new Date(entry.countedAt) : null,
          actor_label: entry.actorLabel ?? null,
          notes: entry.notes ?? null,
          is_disputed: entry.disputed ?? false,
          is_approved: line.approvedEntryIndex === entryIndex,
        }),
      ),
    );
    if (entries.length > 0) {
      await manager.save(CountSessionEntry, entries);
    }
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

      if (variance < 0) {
        // R13: a NEGATIVE variance is an outflow and must leave the batch
        // balances too. A POSITIVE variance is stock appearing with no known
        // lot, and `batches.expiration_date` is NOT NULL, so no batch can be
        // invented: that case is open and documented, never approximated here.
        await drawBatchOutflow({
          manager,
          tenantId,
          insumoId: line.insumoId,
          quantity: Math.abs(variance),
          operationDay: toCalendarDay(document.postedAt ?? document.cutoffAt),
        });
      } else {
        // A-01: a POSITIVE variance is stock that APPEARS, and it has to
        // enter the lot it was seen in. Without a lot it would enter the
        // aggregate alone and the next sale would find the aggregate and
        // the lots disagreeing (the divergence FD-01 declares).
        //
        // So for a lot-managed insumo the operator MUST say in which lot the
        // surplus is: the count is not posted until they do. That is the
        // "no se crea algo sin lote" rule, enforced where the fact enters
        // the books.
        const batchId = approvedEntry.batchId ?? null;
        if (!batchId) {
          const hasLots = await manager
            .getRepository(Batch)
            .exists({ where: { tenant_id: tenantId, insumo_id: line.insumoId } });
          if (hasLots) {
            throw new BadRequestException(
              `El conteo de '${line.insumoName}' encontró más existencia de la ` +
                `que el sistema tenía, pero no dijo EN QUÉ LOTE está ese ` +
                `sobrante. Un lote sin fecha de vencimiento real no se puede ` +
                `inventar: la diferencia tiene que entrar por el lote que se ` +
                `contó.`,
            );
          }
        } else {
          const batchRepo = manager.getRepository(Batch);
          const batch = await batchRepo.findOne({
            where: { id: batchId, tenant_id: tenantId, insumo_id: line.insumoId },
          });
          if (!batch) {
            throw new BadRequestException(
              `El conteo de '${line.insumoName}' apunta a un lote que no ` +
                `existe o no es de ese insumo: ${batchId}`,
            );
          }
          batch.remaining_stock = round4(
            Number(batch.remaining_stock) + variance,
          );
          await batchRepo.save(batch);
        }
      }

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

      // R7 (H7): a high-value count adjustment must raise the same forensic
      // alert the shrinkage paths raise. `AJUSTE_CONTEO` is already in the
      // qualifying set; this path simply never called the check.
      await this.createHighValueCountAlertIfNeeded({
        tenantId,
        insumoId: line.insumoId,
        insumoName: insumo.name,
        quantity: variance,
        totalCostNio: round4(Math.abs(variance) * previousAverageCostNio),
        originDocumentRef: sessionId,
        manager,
      });
    }

    return movementsCreated;
  }

  private async createHighValueCountAlertIfNeeded(input: {
    tenantId: string;
    insumoId: string;
    insumoName: string;
    quantity: number;
    totalCostNio: number;
    originDocumentRef: string;
    manager: EntityManager;
  }): Promise<void> {
    if (
      !shouldCreateHighValueInventoryAlert({
        valuationNio: input.totalCostNio,
        movementType: MovementType.ADJUSTMENT,
        sourceDocumentType: COUNT_ADJUSTMENT_DOCUMENT_TYPE,
      })
    ) {
      return;
    }

    await this.forensicAlertService.create(
      {
        tenantId: input.tenantId,
        alertType: 'HIGH_VALUE_COUNT_ADJUSTMENT',
        severity: 'HIGH',
        actorRole: 'ADMIN',
        message: `High-value count adjustment detected for ${input.insumoName}`,
        metadata: {
          movementType: MovementType.ADJUSTMENT,
          sourceDocumentType: COUNT_ADJUSTMENT_DOCUMENT_TYPE,
          insumoId: input.insumoId,
          insumoName: input.insumoName,
          amount: input.quantity,
          valuationNio: input.totalCostNio,
          actorRole: 'OPERATOR',
          originDocumentRef: input.originDocumentRef,
          operatorNotice:
            'Adjustment recorded. Admin has been notified for forensic review.',
        },
      },
      input.manager,
    );
  }
}
