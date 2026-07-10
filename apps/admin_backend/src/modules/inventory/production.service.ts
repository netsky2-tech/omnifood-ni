import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Batch } from './entities/batch.entity';
import { Insumo } from './entities/insumo.entity';
import {
  InventoryMovement,
  MovementType,
} from './entities/inventory-movement.entity';
import { BomExplosionService } from './bom-explosion.service';
import {
  BatchCandidate,
  BatchConsumptionTrace,
  BatchCostingService,
} from './batch-costing.service';
import { RecipeService } from './recipe.service';
import {
  PRODUCTION_CLOSE_OUTCOME,
  ProductionOrderDocumentDto,
} from './dto/production-order-document.dto';
import { InventorySyncReceipt } from './entities/inventory-sync-receipt.entity';
import { ProductionBatchHistory } from './entities/production-batch-history.entity';

const SCALE_4 = 4;
const PRODUCTION_FLOW_TYPE = 'production';
const PRODUCTION_CLOSE_DOCUMENT_TYPE = 'PRODUCTION_CLOSE';
const PRODUCTION_KARDEX_SEQUENCE_STRIDE = 1000n;
const round4 = (value: number): number => Number(value.toFixed(SCALE_4));

const buildProductionKardexSourceSequence = (
  documentSourceSequence: number,
  movementOrdinal: number,
): string =>
  // The production document keeps the replay stream sequence; child Kardex
  // rows use a negative namespace so they cannot collide with ordinary POS
  // movement sequences while preserving source-document traceability.
  (-(
    BigInt(documentSourceSequence) * PRODUCTION_KARDEX_SEQUENCE_STRIDE +
    BigInt(movementOrdinal)
  )).toString();

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
};

export const calculateProductionClosePayloadHash = (
  document: ProductionOrderDocumentDto,
): string => {
  const canonicalReplayPayload = {
    actualQuantity: document.actualQuantity,
    failureReason: document.failureReason ?? null,
    id: document.id,
    idempotencyKey: document.idempotencyKey,
    movementReferences: document.movementReferences,
    operationDate: document.operationDate,
    outcome: document.outcome,
    plannedQuantity: document.plannedQuantity,
    producedBatchNumber: document.producedBatchNumber,
    producedExpirationDate: document.producedExpirationDate,
    producedInsumoId: document.producedInsumoId,
    recipeVersionId: document.recipeVersionId,
    sourceSequence: document.sourceSequence,
    terminalId: document.terminalId,
    varianceReason: document.varianceReason ?? null,
  };

  return createHash('sha256')
    .update(stableStringify(canonicalReplayPayload))
    .digest('hex');
};

export interface ReplayProductionCloseInput {
  tenantId: string;
  document: ProductionOrderDocumentDto;
}

export interface ReplayProductionCloseResult {
  documentId: string;
  skippedExisting: boolean;
}

@Injectable()
export class ProductionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly recipeService: RecipeService,
    private readonly bomExplosionService: BomExplosionService,
    private readonly batchCostingService: BatchCostingService,
    @InjectRepository(Batch)
    private readonly batchRepo: Repository<Batch>,
  ) {}

  async replayProductionClose(
    input: ReplayProductionCloseInput,
  ): Promise<ReplayProductionCloseResult> {
    const documentId = input.document.id.trim();
    if (documentId.length === 0) {
      throw new BadRequestException(
        'Production close must reference a production document id',
      );
    }
    const serverPayloadHash = calculateProductionClosePayloadHash(
      input.document,
    );

    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
        input.tenantId,
      ]);

      const receiptRepo = manager.getRepository(InventorySyncReceipt);
      const existingReceipt = await receiptRepo.findOneBy({
        tenant_id: input.tenantId,
        source_device_id: input.document.terminalId,
        flow_type: PRODUCTION_FLOW_TYPE,
        source_sequence: input.document.sourceSequence.toString(),
      });

      if (existingReceipt) {
        // Same source replay key + server hash means the offline POS document was already replayed; a different hash is a conflicting replay.
        if (existingReceipt.payload_hash !== serverPayloadHash) {
          throw new ConflictException(
            'Idempotency key already exists with a different payload hash',
          );
        }

        return { documentId, skippedExisting: true };
      }

      const valuation = await this.postProductionClose(
        input,
        documentId,
        manager,
      );
      await this.saveProductionBatchHistory(
        input,
        documentId,
        valuation,
        serverPayloadHash,
        manager,
      );
      await manager.save(
        InventorySyncReceipt,
        manager.create(InventorySyncReceipt, {
          tenant_id: input.tenantId,
          idempotency_key: input.document.idempotencyKey,
          source_device_id: input.document.terminalId,
          flow_type: PRODUCTION_FLOW_TYPE,
          source_sequence: input.document.sourceSequence.toString(),
          payload_hash: serverPayloadHash,
          result_status: 'ACCEPTED',
          result_code: 'PRODUCTION_CLOSE_REPLAYED',
        }),
      );

      return { documentId, skippedExisting: false };
    });
  }

  async processOrder(input: {
    tenantId: string;
    recipeVersionId: string;
    orderQuantity: number;
    producedInsumoId: string;
    producedBatchNumber: string;
    producedExpirationDate: Date;
    operationDate: Date;
  }): Promise<{
    valuationTraceability: Record<string, BatchConsumptionTrace[]>;
  }> {
    const snapshot = await this.recipeService.getSnapshot(
      input.recipeVersionId,
      input.tenantId,
    );

    const exploded = this.bomExplosionService.explode({
      snapshotComponents: snapshot.components,
      orderQuantity: input.orderQuantity,
    });

    const valuationTraceability: Record<string, BatchConsumptionTrace[]> = {};
    let totalConsumedValueNio = 0;

    await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      for (const [insumoId, requiredQuantity] of exploded.entries()) {
        const candidates = await this.batchRepo.find({
          where: { tenant_id: input.tenantId, insumo_id: insumoId },
          order: { batch_number: 'ASC' },
        });

        const trace = this.batchCostingService.buildValuationTrace({
          requiredQuantity,
          operationDate: input.operationDate,
          candidates: candidates.map<BatchCandidate>((batch) => ({
            batchId: batch.id,
            insumoId,
            remainingStock: Number(batch.remaining_stock),
            unitCostNio: Number(batch.cost),
            expirationDate: batch.expiration_date,
          })),
        });

        valuationTraceability[insumoId] = trace;

        const consumedTotal = round4(
          trace.reduce((sum, item) => sum + item.consumedQuantity, 0),
        );
        const consumedValueNio = round4(
          trace.reduce((sum, item) => sum + item.totalCostNio, 0),
        );
        totalConsumedValueNio = round4(
          totalConsumedValueNio + consumedValueNio,
        );

        if (consumedTotal <= 0) {
          continue;
        }

        const insumo = await manager
          .createQueryBuilder(Insumo, 'insumo')
          .setLock('pessimistic_write')
          .where('insumo.id = :insumoId', { insumoId })
          .andWhere('insumo.tenant_id = :tenantId', {
            tenantId: input.tenantId,
          })
          .getOne();

        if (!insumo) {
          continue;
        }

        const previousStock = Number(insumo.stock);
        const newStock = round4(previousStock - consumedTotal);
        const averageCostAfterNio = round4(Number(insumo.averageCost));

        insumo.stock = newStock;
        insumo.existenciaActual = newStock;
        await manager.save(Insumo, insumo);

        const averageUnitCost =
          trace.length === 0
            ? Number(insumo.averageCost)
            : round4(
                trace.reduce((sum, item) => sum + item.totalCostNio, 0) /
                  consumedTotal,
              );

        await manager.save(
          InventoryMovement,
          manager.create(InventoryMovement, {
            tenant_id: input.tenantId,
            insumoId,
            type: MovementType.PRODUCTION,
            quantity: round4(-consumedTotal),
            previousStock,
            newStock,
            averageCostAfterNio,
            unitCostNio: averageUnitCost,
            totalCostNio: round4(consumedTotal * averageUnitCost),
            reason: `PRODUCTION_CONSUME:${input.recipeVersionId}`,
          }),
        );
      }

      const producedInsumo = await manager
        .createQueryBuilder(Insumo, 'insumo')
        .setLock('pessimistic_write')
        .where('insumo.id = :insumoId', { insumoId: input.producedInsumoId })
        .andWhere('insumo.tenant_id = :tenantId', { tenantId: input.tenantId })
        .getOne();

      if (producedInsumo) {
        const previousStock = Number(producedInsumo.stock);
        const newStock = round4(previousStock + input.orderQuantity);
        const averageCostAfterNio = round4(Number(producedInsumo.averageCost));
        producedInsumo.stock = newStock;
        producedInsumo.existenciaActual = newStock;
        await manager.save(Insumo, producedInsumo);

        const producedUnitCostNio =
          input.orderQuantity <= 0
            ? round4(Number(producedInsumo.averageCost))
            : round4(totalConsumedValueNio / input.orderQuantity);

        await manager.save(
          InventoryMovement,
          manager.create(InventoryMovement, {
            tenant_id: input.tenantId,
            insumoId: input.producedInsumoId,
            type: MovementType.PRODUCTION,
            quantity: round4(input.orderQuantity),
            previousStock,
            newStock,
            averageCostAfterNio,
            unitCostNio: producedUnitCostNio,
            totalCostNio: round4(input.orderQuantity * producedUnitCostNio),
            reason: `PRODUCTION_RECEIPT:${input.recipeVersionId}`,
            sourceDocumentType: 'PRODUCTION',
          }),
        );

        const existingBatch = await manager.findOne(Batch, {
          where: {
            tenant_id: input.tenantId,
            insumo_id: input.producedInsumoId,
            batch_number: input.producedBatchNumber,
          },
        });

        if (existingBatch) {
          existingBatch.remaining_stock = round4(
            Number(existingBatch.remaining_stock) + input.orderQuantity,
          );
          existingBatch.expiration_date = input.producedExpirationDate;
          await manager.save(Batch, existingBatch);
        } else {
          await manager.save(
            Batch,
            manager.create(Batch, {
              tenant_id: input.tenantId,
              insumo_id: input.producedInsumoId,
              batch_number: input.producedBatchNumber,
              expiration_date: input.producedExpirationDate,
              remaining_stock: round4(input.orderQuantity),
              cost: producedUnitCostNio,
            }),
          );
        }
      }
    });

    return { valuationTraceability };
  }

  private async postProductionClose(
    input: ReplayProductionCloseInput,
    documentId: string,
    manager: EntityManager,
  ): Promise<{
    valuationTraceability: Record<string, BatchConsumptionTrace[]>;
    totalConsumedValueNio: number;
    producedUnitCostNio: number;
  }> {
    const snapshot = await this.recipeService.getSnapshot(
      input.document.recipeVersionId,
      input.tenantId,
    );
    const exploded = this.bomExplosionService.explode({
      snapshotComponents: snapshot.components,
      orderQuantity: input.document.plannedQuantity,
    });
    const valuationTraceability: Record<string, BatchConsumptionTrace[]> = {};
    let totalConsumedValueNio = 0;
    const batchRepo = manager.getRepository(Batch);
    let kardexMovementOrdinal = 1;

    for (const [insumoId, requiredQuantity] of exploded.entries()) {
      const candidates = await batchRepo.find({
        where: { tenant_id: input.tenantId, insumo_id: insumoId },
        order: { batch_number: 'ASC' },
      });
      const trace = this.batchCostingService.buildValuationTrace({
        requiredQuantity,
        operationDate: new Date(input.document.operationDate),
        candidates: candidates.map<BatchCandidate>((batch) => ({
          batchId: batch.id,
          insumoId,
          remainingStock: Number(batch.remaining_stock),
          unitCostNio: Number(batch.cost),
          expirationDate: batch.expiration_date,
        })),
      });
      valuationTraceability[insumoId] = trace;
      const consumedTotal = round4(
        trace.reduce((sum, item) => sum + item.consumedQuantity, 0),
      );
      const consumedValueNio = round4(
        trace.reduce((sum, item) => sum + item.totalCostNio, 0),
      );
      totalConsumedValueNio = round4(totalConsumedValueNio + consumedValueNio);
      if (consumedTotal > 0) {
        await this.applyProductionMovement({
          manager,
          tenantId: input.tenantId,
          document: input.document,
          documentId,
          movementSourceSequence: buildProductionKardexSourceSequence(
            input.document.sourceSequence,
            kardexMovementOrdinal,
          ),
          insumoId,
          quantity: -consumedTotal,
          unitCostNio: round4(consumedValueNio / consumedTotal),
        });
        kardexMovementOrdinal += 1;
      }
    }

    const producedUnitCostNio =
      input.document.actualQuantity <= 0
        ? 0
        : round4(totalConsumedValueNio / input.document.actualQuantity);

    // Failed/interrupted production keeps component OUT history but never creates finished output.
    if (input.document.outcome === PRODUCTION_CLOSE_OUTCOME.COMPLETED) {
      await this.applyProductionMovement({
        manager,
        tenantId: input.tenantId,
        document: input.document,
        documentId,
        movementSourceSequence: buildProductionKardexSourceSequence(
          input.document.sourceSequence,
          kardexMovementOrdinal,
        ),
        insumoId: input.document.producedInsumoId,
        quantity: input.document.actualQuantity,
        unitCostNio: producedUnitCostNio,
      });
      await this.upsertProducedBatch(input, producedUnitCostNio, manager);
    }

    return {
      valuationTraceability,
      totalConsumedValueNio,
      producedUnitCostNio,
    };
  }

  private async applyProductionMovement(input: {
    manager: EntityManager;
    tenantId: string;
    document: ProductionOrderDocumentDto;
    documentId: string;
    movementSourceSequence: string;
    insumoId: string;
    quantity: number;
    unitCostNio: number;
  }): Promise<void> {
    const insumo = await input.manager
      .createQueryBuilder(Insumo, 'insumo')
      .setLock('pessimistic_write')
      .where('insumo.id = :insumoId', { insumoId: input.insumoId })
      .andWhere('insumo.tenant_id = :tenantId', { tenantId: input.tenantId })
      .getOne();
    if (!insumo) return;

    const previousStock = round4(Number(insumo.stock));
    const newStock = round4(previousStock + input.quantity);
    const averageCostAfterNio = round4(Number(insumo.averageCost ?? 0));
    insumo.stock = newStock;
    insumo.existenciaActual = newStock;
    await input.manager.save(Insumo, insumo);
    // Kardex is append-only: corrections must add compensating rows, not mutate these movements.
    await input.manager.save(
      InventoryMovement,
      input.manager.create(InventoryMovement, {
        tenant_id: input.tenantId,
        insumoId: input.insumoId,
        type: MovementType.PRODUCTION,
        quantity: round4(input.quantity),
        previousStock,
        newStock,
        averageCostAfterNio,
        unitCostNio: input.unitCostNio,
        totalCostNio: round4(Math.abs(input.quantity) * input.unitCostNio),
        idempotencyKey: input.document.idempotencyKey,
        sourceDeviceId: input.document.terminalId,
        sourceSequence: input.movementSourceSequence,
        sourceDocumentType: PRODUCTION_CLOSE_DOCUMENT_TYPE,
        sourceDocumentId: input.documentId,
        timestamp: new Date(input.document.operationDate),
      }),
    );
  }

  private async upsertProducedBatch(
    input: ReplayProductionCloseInput,
    producedUnitCostNio: number,
    manager: EntityManager,
  ): Promise<void> {
    const existingBatch = await manager.findOne(Batch, {
      where: {
        tenant_id: input.tenantId,
        insumo_id: input.document.producedInsumoId,
        batch_number: input.document.producedBatchNumber,
      },
    });
    if (existingBatch) {
      existingBatch.remaining_stock = round4(
        Number(existingBatch.remaining_stock) + input.document.actualQuantity,
      );
      existingBatch.expiration_date = new Date(
        input.document.producedExpirationDate,
      );
      await manager.save(Batch, existingBatch);
      return;
    }
    await manager.save(
      Batch,
      manager.create(Batch, {
        tenant_id: input.tenantId,
        insumo_id: input.document.producedInsumoId,
        batch_number: input.document.producedBatchNumber,
        expiration_date: new Date(input.document.producedExpirationDate),
        received_date: new Date(input.document.operationDate),
        remaining_stock: round4(input.document.actualQuantity),
        cost: producedUnitCostNio,
      }),
    );
  }

  private async saveProductionBatchHistory(
    input: ReplayProductionCloseInput,
    documentId: string,
    valuation: { totalConsumedValueNio: number; producedUnitCostNio: number },
    serverPayloadHash: string,
    manager: EntityManager,
  ): Promise<void> {
    // This history freezes the batch audit cost even though produced stock joins the general CPP pool.
    await manager.save(
      ProductionBatchHistory,
      manager.create(ProductionBatchHistory, {
        tenant_id: input.tenantId,
        production_document_id: documentId,
        recipe_version_id: input.document.recipeVersionId,
        produced_insumo_id: input.document.producedInsumoId,
        produced_batch_number: input.document.producedBatchNumber,
        produced_expiration_date: new Date(
          input.document.producedExpirationDate,
        ),
        planned_quantity: input.document.plannedQuantity,
        actual_quantity: input.document.actualQuantity,
        outcome: input.document.outcome,
        failure_reason: input.document.failureReason ?? null,
        terminal_id: input.document.terminalId,
        source_sequence: input.document.sourceSequence.toString(),
        idempotency_key: input.document.idempotencyKey,
        payload_hash: serverPayloadHash,
        // Client cost fields are diagnostic only; persisted audit truth is derived from server-side batch valuation.
        total_consumed_cost_nio: valuation.totalConsumedValueNio,
        produced_unit_cost_nio: valuation.producedUnitCostNio,
        movement_references: input.document.movementReferences,
        operation_date: new Date(input.document.operationDate),
      }),
    );
  }
}
