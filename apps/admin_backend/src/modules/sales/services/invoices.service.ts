import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { Payment } from '../entities/payment.entity';
import { SyncInvoiceDto, CreateInvoiceItemDto } from '../dto/sync-invoice.dto';
import {
  InventoryMovement,
  MovementType,
} from '../../inventory/entities/inventory-movement.entity';
import { InventorySyncReceipt } from '../../inventory/entities/inventory-sync-receipt.entity';
import { InventorySyncOutbox } from '../../inventory/entities/inventory-sync-outbox.entity';
import { SyncBatchRecordDto } from '../dto/sync-batch.dto';
import { RecipeService } from '../../inventory/recipe.service';
import { BomExplosionService } from '../../inventory/bom-explosion.service';
import {
  Insumo,
  NEGATIVE_STOCK_POLICY,
  type NegativeStockPolicy,
} from '../../inventory/entities/insumo.entity';

const SCALE_4 = 4;

const round4 = (value: number): number => Number(value.toFixed(SCALE_4));

const SYNC_RESULT_STATUS = {
  ACCEPTED: 'ACCEPTED',
  DUPLICATE: 'DUPLICATE',
  STAGED_FUTURE: 'STAGED_FUTURE',
  REJECTED: 'REJECTED',
  BLOCKED_BY_PRIOR_FAILURE: 'BLOCKED_BY_PRIOR_FAILURE',
  IDEMPOTENCY_MISMATCH: 'IDEMPOTENCY_MISMATCH',
} as const;

type SyncResultStatus =
  (typeof SYNC_RESULT_STATUS)[keyof typeof SYNC_RESULT_STATUS];

export interface SyncBatchResultItem {
  idempotencyKey: string;
  terminalId: string;
  flowType: string;
  sourceSequence: number;
  status: SyncResultStatus;
  retryable: boolean;
  code?: string;
  message?: string;
}

export interface SyncBatchResult {
  received: number;
  processed: number;
  duplicates: number;
  results?: SyncBatchResultItem[];
}

interface SyncStreamKey {
  tenantId: string;
  sourceDeviceId: string;
  flowType: string;
}

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, nestedValue]) => nestedValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(
        ([key, nestedValue]) =>
          `${JSON.stringify(key)}:${stableStringify(nestedValue)}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

export const calculateSyncPayloadHash = (record: SyncBatchRecordDto): string =>
  createHash('sha256')
    .update(
      stableStringify({
        documentType: record.documentType,
        flowType: record.flowType,
        invoice: record.invoice,
        movements: record.movements,
        recipeVersionId: record.recipeVersionId,
      }),
    )
    .digest('hex');

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(InvoiceItem)
    private readonly itemRepository: Repository<InvoiceItem>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(InventoryMovement)
    private readonly movementRepository: Repository<InventoryMovement>,
    @InjectRepository(InventorySyncReceipt)
    private readonly receiptRepository: Repository<InventorySyncReceipt>,
    @InjectRepository(InventorySyncOutbox)
    private readonly outboxRepository: Repository<InventorySyncOutbox>,
    private readonly recipeService: RecipeService,
    private readonly bomExplosionService: BomExplosionService,
  ) {}

  async syncInvoices(
    tenantId: string,
    dtos: SyncInvoiceDto[],
    manager?: EntityManager,
  ): Promise<void> {
    for (const dto of dtos) {
      await this.validateInvoiceRecipeVersions(tenantId, dto);
      // Tenant isolation for items: the POS controls the item `id`
      // (client UUID) and the upsert conflict target is `['id']`. Before
      // persisting, reject any item id that already belongs to another
      // tenant so a colliding id cannot overwrite cross-tenant data.
      await this.assertItemTenantOwnership(tenantId, dto.items ?? [], manager);
      await this.invoiceRepoFor(manager).upsert(
        { ...dto, tenant_id: tenantId, created_at: new Date(dto.createdAt) },
        ['id'],
      );
      if (dto.items?.length) {
        await this.itemRepoFor(manager).upsert(
          dto.items.map((item) => ({
            ...item,
            invoiceId: dto.id,
            tenant_id: tenantId,
          })),
          ['id'],
        );
      }
      if (dto.payments?.length) {
        await this.paymentRepoFor(manager).upsert(
          dto.payments.map((payment) => ({ ...payment, invoiceId: dto.id })),
          ['id'],
        );
      }
    }
  }

  async findAll(tenantId: string): Promise<Invoice[]> {
    return this.invoiceRepository.find({
      where: { tenant_id: tenantId },
      relations: ['items', 'items.modifiers', 'payments'],
      order: { created_at: 'DESC' },
    });
  }

  async findOne(tenantId: string, id: string): Promise<Invoice | null> {
    return this.invoiceRepository.findOne({
      where: { id, tenant_id: tenantId },
      relations: ['items', 'items.modifiers', 'payments'],
    });
  }

  async syncBatch(
    tenantId: string,
    records: SyncBatchRecordDto[],
  ): Promise<SyncBatchResult> {
    if (!records.some((record) => record.flowType)) {
      return this.syncLegacyBatch(tenantId, records);
    }

    const ordered = [...records].sort(
      (a, b) => a.sourceSequence - b.sourceSequence,
    );
    let processed = 0;
    let duplicates = 0;
    const results: SyncBatchResultItem[] = [];
    const blockedStreams = new Set<string>();

    for (const record of ordered) {
      const flowType = record.flowType ?? 'inventory';
      const streamKey = this.buildStreamKey({
        tenantId,
        sourceDeviceId: record.sourceDeviceId,
        flowType,
      });
      const payloadHash = calculateSyncPayloadHash(record);
      const existingByKey = await this.receiptRepository.findOne({
        where: { tenant_id: tenantId, idempotency_key: record.idempotencyKey },
      });
      if (existingByKey) {
        if (existingByKey.payload_hash !== payloadHash) {
          results.push(
            this.buildResult(record, SYNC_RESULT_STATUS.IDEMPOTENCY_MISMATCH, {
              code: 'CRITICAL_PAYLOAD_MISMATCH',
              message:
                'Idempotency key was reused with a different payload hash.',
              retryable: false,
            }),
          );
          continue;
        }
        duplicates += 1;
        results.push(
          this.buildResult(record, SYNC_RESULT_STATUS.DUPLICATE, {
            code: 'DUPLICATE_REPLAY',
            retryable: false,
          }),
        );
        continue;
      }
      const existingBySequence = await this.receiptRepository.findOne({
        where: {
          tenant_id: tenantId,
          source_device_id: record.sourceDeviceId,
          flow_type: flowType,
          source_sequence: String(record.sourceSequence),
        },
      });
      if (existingBySequence) {
        if (existingBySequence.payload_hash !== payloadHash) {
          results.push(
            this.buildResult(record, SYNC_RESULT_STATUS.IDEMPOTENCY_MISMATCH, {
              code: 'CRITICAL_SEQUENCE_PAYLOAD_MISMATCH',
              retryable: false,
            }),
          );
          continue;
        }
        duplicates += 1;
        results.push(
          this.buildResult(record, SYNC_RESULT_STATUS.DUPLICATE, {
            code: 'DUPLICATE_SEQUENCE_REPLAY',
            retryable: false,
          }),
        );
        continue;
      }

      if (blockedStreams.has(streamKey)) {
        results.push(
          this.buildResult(
            record,
            SYNC_RESULT_STATUS.BLOCKED_BY_PRIOR_FAILURE,
            {
              code: `WAITING_FOR_SEQUENCE_${record.sourceSequence - 1}`,
              retryable: true,
            },
          ),
        );
        continue;
      }

      const expectedSequence = await this.resolveExpectedSequence(
        tenantId,
        record.sourceDeviceId,
        flowType,
      );

      if (record.sourceSequence > expectedSequence) {
        const stagedConflict = await this.stageFutureRecord(
          tenantId,
          record,
          payloadHash,
        );
        if (stagedConflict) {
          results.push(stagedConflict);
          continue;
        }
        results.push(
          this.buildResult(record, SYNC_RESULT_STATUS.STAGED_FUTURE, {
            code: `WAITING_FOR_SEQUENCE_${expectedSequence}`,
            retryable: true,
          }),
        );
        continue;
      }

      if (record.sourceSequence < expectedSequence) {
        results.push(
          this.buildResult(record, SYNC_RESULT_STATUS.REJECTED, {
            code: `SEQUENCE_BEHIND_EXPECTED_${expectedSequence}`,
            retryable: true,
          }),
        );
        continue;
      }

      const applied = await this.applyExpectedRecord(
        tenantId,
        record,
        payloadHash,
      );
      results.push(applied.result);
      if (!applied.accepted) {
        blockedStreams.add(streamKey);
        continue;
      }
      processed += 1;
      const drained = await this.drainStagedFutureRecords(
        tenantId,
        record.sourceDeviceId,
        flowType,
        record.sourceSequence + 1,
      );
      processed += drained.filter(
        (item) => item.status === SYNC_RESULT_STATUS.ACCEPTED,
      ).length;
      results.push(...drained);
    }
    return { received: records.length, processed, duplicates, results };
  }

  private async syncLegacyBatch(
    tenantId: string,
    records: SyncBatchRecordDto[],
  ): Promise<SyncBatchResult> {
    const ordered = [...records].sort(
      (a, b) => a.sourceSequence - b.sourceSequence,
    );
    let processed = 0;
    let duplicates = 0;
    for (const record of ordered) {
      const existingByKey = await this.receiptRepository.findOne({
        where: { tenant_id: tenantId, idempotency_key: record.idempotencyKey },
      });
      if (existingByKey) {
        duplicates += 1;
        continue;
      }
      const existingBySequence = await this.receiptRepository.findOne({
        where: {
          tenant_id: tenantId,
          source_device_id: record.sourceDeviceId,
          source_sequence: String(record.sourceSequence),
        },
      });
      if (existingBySequence) {
        duplicates += 1;
        continue;
      }

      await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
        if (record.invoice) {
          await this.validateInvoiceRecipeVersions(
            tenantId,
            record.invoice,
            record.recipeVersionId,
          );
          await this.syncInvoices(tenantId, [record.invoice], manager);
        }
        await this.appendInventoryDeltas(tenantId, record, manager);
        await manager.save(
          this.receiptRepository.create({
            tenant_id: tenantId,
            idempotency_key: record.idempotencyKey,
            source_device_id: record.sourceDeviceId,
            flow_type: record.flowType ?? 'inventory',
            source_sequence: String(record.sourceSequence),
            payload_hash: calculateSyncPayloadHash(record),
            result_status: SYNC_RESULT_STATUS.ACCEPTED,
            result_code: 'APPLIED',
          }),
        );
      });
      processed += 1;
    }
    return { received: records.length, processed, duplicates };
  }

  private buildResult(
    record: SyncBatchRecordDto,
    status: SyncResultStatus,
    options: { retryable: boolean; code?: string; message?: string },
  ): SyncBatchResultItem {
    return {
      idempotencyKey: record.idempotencyKey,
      terminalId: record.sourceDeviceId,
      flowType: record.flowType ?? 'inventory',
      sourceSequence: record.sourceSequence,
      status,
      retryable: options.retryable,
      code: options.code,
      message: options.message,
    };
  }

  private buildStreamKey(key: SyncStreamKey): string {
    return `${key.tenantId}:${key.sourceDeviceId}:${key.flowType}`;
  }

  private async resolveExpectedSequence(
    tenantId: string,
    sourceDeviceId: string,
    flowType: string,
  ): Promise<number> {
    const lastReceipt = await this.receiptRepository.findOne({
      where: {
        tenant_id: tenantId,
        source_device_id: sourceDeviceId,
        flow_type: flowType,
        result_status: SYNC_RESULT_STATUS.ACCEPTED,
      },
      order: { source_sequence: 'DESC' },
    });
    return Number(lastReceipt?.source_sequence ?? 0) + 1;
  }

  private async stageFutureRecord(
    tenantId: string,
    record: SyncBatchRecordDto,
    payloadHash: string,
  ): Promise<SyncBatchResultItem | null> {
    const existing = await this.outboxRepository.findOne({
      where: { tenant_id: tenantId, idempotency_key: record.idempotencyKey },
    });
    if (existing) {
      return this.resolveStagedConflictResult(
        record,
        existing.payload_hash,
        payloadHash,
        'CRITICAL_STAGED_PAYLOAD_MISMATCH',
      );
    }

    const existingBySequence = await this.findStagedStreamSequence(
      tenantId,
      record,
    );
    if (existingBySequence) {
      return this.resolveStagedConflictResult(
        record,
        existingBySequence.payload_hash,
        payloadHash,
        'CRITICAL_STAGED_SEQUENCE_PAYLOAD_MISMATCH',
      );
    }

    try {
      await this.outboxRepository.save(
        this.outboxRepository.create({
          tenant_id: tenantId,
          idempotency_key: record.idempotencyKey,
          source_device_id: record.sourceDeviceId,
          flow_type: record.flowType ?? 'inventory',
          source_sequence: String(record.sourceSequence),
          document_type: record.documentType,
          payload_hash: payloadHash,
          payload: record as unknown as Record<string, unknown>,
          status: SYNC_RESULT_STATUS.STAGED_FUTURE,
          result_code: `WAITING_FOR_SEQUENCE_${record.sourceSequence - 1}`,
        }),
      );
      return null;
    } catch (error: unknown) {
      if (!this.isUniqueViolation(error)) throw error;
      const racedExisting = await this.outboxRepository.findOne({
        where: { tenant_id: tenantId, idempotency_key: record.idempotencyKey },
      });
      if (racedExisting) {
        return this.resolveStagedConflictResult(
          record,
          racedExisting.payload_hash,
          payloadHash,
          'CRITICAL_STAGED_PAYLOAD_MISMATCH',
        );
      }
      const racedSequence = await this.findStagedStreamSequence(
        tenantId,
        record,
      );
      if (racedSequence) {
        return this.resolveStagedConflictResult(
          record,
          racedSequence.payload_hash,
          payloadHash,
          'CRITICAL_STAGED_SEQUENCE_PAYLOAD_MISMATCH',
        );
      }
      throw error;
    }
  }

  private async findStagedStreamSequence(
    tenantId: string,
    record: SyncBatchRecordDto,
  ): Promise<InventorySyncOutbox | null> {
    return this.outboxRepository.findOne({
      where: {
        tenant_id: tenantId,
        source_device_id: record.sourceDeviceId,
        flow_type: record.flowType ?? 'inventory',
        source_sequence: String(record.sourceSequence),
        status: SYNC_RESULT_STATUS.STAGED_FUTURE,
      },
    });
  }

  private resolveStagedConflictResult(
    record: SyncBatchRecordDto,
    existingPayloadHash: string,
    payloadHash: string,
    mismatchCode: string,
  ): SyncBatchResultItem | null {
    if (existingPayloadHash === payloadHash) return null;
    return this.buildResult(record, SYNC_RESULT_STATUS.IDEMPOTENCY_MISMATCH, {
      code: mismatchCode,
      message: 'Staged future record conflicts with a different payload hash.',
      retryable: false,
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === '23505'
    );
  }

  private async applyExpectedRecord(
    tenantId: string,
    record: SyncBatchRecordDto,
    payloadHash: string,
  ): Promise<{ accepted: boolean; result: SyncBatchResultItem }> {
    try {
      await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
        if (record.invoice) {
          await this.validateInvoiceRecipeVersions(
            tenantId,
            record.invoice,
            record.recipeVersionId,
          );
          await this.syncInvoices(tenantId, [record.invoice], manager);
        }
        await this.appendInventoryDeltas(tenantId, record, manager);
        await manager.save(
          this.receiptRepository.create({
            tenant_id: tenantId,
            idempotency_key: record.idempotencyKey,
            source_device_id: record.sourceDeviceId,
            flow_type: record.flowType ?? 'inventory',
            source_sequence: String(record.sourceSequence),
            payload_hash: payloadHash,
            result_status: SYNC_RESULT_STATUS.ACCEPTED,
            result_code: 'APPLIED',
          }),
        );
      });
      return {
        accepted: true,
        result: this.buildResult(record, SYNC_RESULT_STATUS.ACCEPTED, {
          code: 'APPLIED',
          retryable: false,
        }),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Sync failed';
      return {
        accepted: false,
        result: this.buildResult(record, SYNC_RESULT_STATUS.REJECTED, {
          code: 'BUSINESS_RULE_VALIDATION',
          retryable: true,
          message,
        }),
      };
    }
  }

  private async drainStagedFutureRecords(
    tenantId: string,
    sourceDeviceId: string,
    flowType: string,
    nextSequence: number,
  ): Promise<SyncBatchResultItem[]> {
    const drained: SyncBatchResultItem[] = [];
    let expectedSequence = nextSequence;
    while (true) {
      const staged = await this.outboxRepository.findOne({
        where: {
          tenant_id: tenantId,
          source_device_id: sourceDeviceId,
          flow_type: flowType,
          source_sequence: String(expectedSequence),
          status: SYNC_RESULT_STATUS.STAGED_FUTURE,
        },
      });
      if (!staged) return drained;
      const record = staged.payload as unknown as SyncBatchRecordDto;
      const applied = await this.applyExpectedRecord(
        tenantId,
        record,
        staged.payload_hash,
      );
      drained.push(applied.result);
      if (!applied.accepted) return drained;
      await this.outboxRepository.delete({ id: staged.id });
      expectedSequence += 1;
    }
  }

  private async appendFohMovements(
    tenantId: string,
    record: SyncBatchRecordDto,
    manager: EntityManager,
  ): Promise<void> {
    const movementType =
      record.documentType === 'SALE_CANCEL'
        ? MovementType.SALE_CANCEL
        : MovementType.SALE;
    const invoice = record.invoice;
    if (!invoice?.items?.length) return;

    for (const item of invoice.items) {
      const exploded = await this.resolveExplodedMovements(
        tenantId,
        item.productId,
        Math.abs(Number(item.quantity)),
        item.recipeVersionId ?? record.recipeVersionId,
      );
      for (const [insumoId, explodedQuantity] of exploded.entries()) {
        const insumo = await manager
          .createQueryBuilder(Insumo, 'insumo')
          .setLock('pessimistic_write')
          .where('insumo.id = :insumoId', { insumoId })
          .andWhere('insumo.tenant_id = :tenantId', { tenantId })
          .getOne();
        if (!insumo) {
          this.logger.warn(
            `Skipping FOH movement due to unresolved insumo ${insumoId} (policy: reject/log+skip)`,
          );
          continue;
        }

        const normalizedQuantity =
          movementType === MovementType.SALE_CANCEL
            ? Math.abs(explodedQuantity)
            : -Math.abs(explodedQuantity);
        const previousStock = Number(insumo.stock);
        const newStock = Number(
          (previousStock + normalizedQuantity).toFixed(4),
        );
        this.assertNegativeStockPolicy(
          insumo.negativeStockPolicy,
          newStock,
          insumoId,
          movementType,
        );
        const unitCostNio = Number((insumo.averageCost ?? 0).toFixed(4));
        const averageCostAfterNio = Number(
          (insumo.averageCost ?? 0).toFixed(4),
        );
        insumo.stock = newStock;
        insumo.existenciaActual = newStock;
        await manager.save(Insumo, insumo);

        const compensationForKardexId =
          movementType === MovementType.SALE_CANCEL
            ? await this.resolveCompensatedMovementId(
                manager,
                tenantId,
                insumoId,
                invoice.id,
              )
            : null;

        await manager.save(
          this.movementRepository.create({
            tenant_id: tenantId,
            insumoId,
            type: movementType,
            quantity: normalizedQuantity,
            previousStock,
            newStock,
            averageCostAfterNio,
            unitCostNio,
            totalCostNio: Number(
              (Math.abs(normalizedQuantity) * unitCostNio).toFixed(4),
            ),
            idempotencyKey: `${record.idempotencyKey}:${item.id}:${insumoId}`,
            sourceDeviceId: record.sourceDeviceId,
            sourceSequence: String(record.sourceSequence),
            reason: `invoice:${invoice.id}`,
            sourceDocumentType: movementType,
            compensationForKardexId,
            user_id: invoice.userId,
          }),
        );
      }
    }
  }

  private async appendInventoryDeltas(
    tenantId: string,
    record: SyncBatchRecordDto,
    manager: EntityManager,
  ): Promise<void> {
    if (
      record.documentType === 'SALE' ||
      record.documentType === 'SALE_CANCEL'
    ) {
      await this.appendFohMovements(tenantId, record, manager);
      return;
    }
    if (!record.movements?.length) return;

    for (const movement of record.movements) {
      const insumo = await manager
        .createQueryBuilder(Insumo, 'insumo')
        .setLock('pessimistic_write')
        .where('insumo.id = :insumoId', { insumoId: movement.insumoId })
        .andWhere('insumo.tenant_id = :tenantId', { tenantId })
        .getOne();
      if (!insumo) {
        this.logger.warn(
          `Skipping delta movement due to unresolved insumo ${movement.insumoId} (policy: reject/log+skip)`,
        );
        continue;
      }

      const previousStock = Number(insumo.stock);
      const delta = Number(movement.quantity);
      const newStock = round4(previousStock + delta);
      this.assertNegativeStockPolicy(
        insumo.negativeStockPolicy,
        newStock,
        movement.insumoId,
        record.documentType as MovementType,
      );
      const previousAverageCostNio = round4(Number(insumo.averageCost ?? 0));
      const unitCostNio = this.resolveDeltaUnitCostNio(
        movement.unitCostNio,
        previousAverageCostNio,
        delta,
      );
      const averageCostAfterNio = this.calculateAverageCostAfterDelta(
        previousStock,
        previousAverageCostNio,
        delta,
        unitCostNio,
      );
      insumo.stock = newStock;
      insumo.existenciaActual = newStock;
      insumo.averageCost = averageCostAfterNio;
      await manager.save(Insumo, insumo);

      await manager.save(
        this.movementRepository.create({
          tenant_id: tenantId,
          insumoId: movement.insumoId,
          type: record.documentType as MovementType,
          quantity: delta,
          previousStock,
          newStock,
          averageCostAfterNio,
          unitCostNio,
          totalCostNio: Number((Math.abs(delta) * unitCostNio).toFixed(4)),
          idempotencyKey: `${record.idempotencyKey}:${movement.insumoId}`,
          sourceDeviceId: record.sourceDeviceId,
          sourceSequence: String(record.sourceSequence),
          reason: record.invoice?.id ?? record.idempotencyKey,
          sourceDocumentType: record.documentType,
          user_id: record.invoice?.userId,
        }),
      );
    }
  }

  private async resolveCompensatedMovementId(
    manager: EntityManager,
    tenantId: string,
    insumoId: string,
    invoiceId: string,
  ): Promise<string | null> {
    const original = await manager.findOne(InventoryMovement, {
      where: {
        tenant_id: tenantId,
        insumoId,
        type: MovementType.SALE,
        reason: `invoice:${invoiceId}`,
      },
      order: { id: 'DESC' },
    });
    return original?.id ?? null;
  }

  private resolveDeltaUnitCostNio(
    unitCostNio: number | undefined,
    previousAverageCostNio: number,
    delta: number,
  ): number {
    if (typeof unitCostNio === 'number') {
      return round4(unitCostNio);
    }

    if (delta > 0) {
      throw new BadRequestException(
        'Inbound synced inventory deltas must include unitCostNio to freeze a valid cost snapshot',
      );
    }

    return previousAverageCostNio;
  }

  private calculateAverageCostAfterDelta(
    previousStock: number,
    previousAverageCostNio: number,
    delta: number,
    unitCostNio: number,
  ): number {
    if (delta <= 0) {
      return previousAverageCostNio;
    }

    const resultingStock = previousStock + delta;
    if (resultingStock === 0) {
      return 0;
    }

    return round4(
      (previousStock * previousAverageCostNio + delta * unitCostNio) /
        resultingStock,
    );
  }

  private async resolveExplodedMovements(
    tenantId: string,
    productId: string,
    orderQuantity: number,
    recipeVersionId?: string,
  ): Promise<Map<string, number>> {
    const resolvedRecipeVersionId = await this.resolveRecipeVersionId(
      tenantId,
      productId,
      recipeVersionId,
    );
    if (!resolvedRecipeVersionId) return new Map([[productId, orderQuantity]]);
    const snapshot = await this.recipeService.getSnapshot(
      resolvedRecipeVersionId,
      tenantId,
      productId,
    );
    return this.bomExplosionService.explode({
      snapshotComponents: snapshot.components,
      orderQuantity,
    });
  }

  private async resolveRecipeVersionId(
    tenantId: string,
    productId: string,
    recipeVersionId?: string,
  ): Promise<string | null> {
    if (recipeVersionId) {
      return recipeVersionId;
    }

    const activeRecipe = await this.recipeService.findActiveVersion(
      tenantId,
      productId,
    );
    return activeRecipe?.id ?? null;
  }

  private async validateInvoiceRecipeVersions(
    tenantId: string,
    invoice: SyncInvoiceDto,
    recordRecipeVersionId?: string,
  ): Promise<void> {
    for (const item of invoice.items ?? []) {
      const recipeVersionId = item.recipeVersionId ?? recordRecipeVersionId;
      if (!recipeVersionId) continue;
      await this.recipeService.getSnapshot(
        recipeVersionId,
        tenantId,
        item.productId,
      );
    }
  }

  /// Resolves the Invoice repository bound to [manager] when running
  /// inside a transaction, otherwise falls back to the injected default
  /// repository. Centralizing this keeps persistence calls transactional
  /// in `syncBatch` while the standalone `syncInvoices` path stays
  /// unchanged.
  private invoiceRepoFor(manager?: EntityManager): Repository<Invoice> {
    return manager ? manager.getRepository(Invoice) : this.invoiceRepository;
  }

  private itemRepoFor(manager?: EntityManager): Repository<InvoiceItem> {
    return manager ? manager.getRepository(InvoiceItem) : this.itemRepository;
  }

  private paymentRepoFor(manager?: EntityManager): Repository<Payment> {
    return manager ? manager.getRepository(Payment) : this.paymentRepository;
  }

  /// Rejects item ids that already belong to a different tenant. The POS
  /// controls the item `id` (client UUID) and `syncInvoices` upserts on
  /// `['id']`; without this ownership check a colliding id from another
  /// tenant would overwrite an existing line. The check is performed
  /// inside the provided [manager] so it participates in the same
  /// transaction when called from `syncBatch`.
  private async assertItemTenantOwnership(
    tenantId: string,
    items: CreateInvoiceItemDto[],
    manager?: EntityManager,
  ): Promise<void> {
    if (!items.length) return;
    const itemIds = items.map((item) => item.id);
    const repo = this.itemRepoFor(manager);
    // Look for any existing item with one of these ids whose tenant_id
    // differs from the current tenant — evidence of a collision.
    const conflicting = await repo.find({
      where: { id: In(itemIds) },
    });
    const crossTenant = conflicting.find(
      (existing) => existing.tenant_id !== tenantId,
    );
    if (crossTenant) {
      throw new BadRequestException(
        `Invoice item id ${crossTenant.id} already belongs to another tenant; cross-tenant item overwrite is not allowed.`,
      );
    }
  }

  private assertNegativeStockPolicy(
    policy: NegativeStockPolicy | null | undefined,
    resultingStock: number,
    insumoId: string,
    movementType: MovementType,
  ): void {
    if (resultingStock >= 0) return;
    if (policy === NEGATIVE_STOCK_POLICY.ALLOW_TEMPORARY) return;

    throw new BadRequestException(
      `Negative stock blocked by policy for insumo ${insumoId} on ${movementType}`,
    );
  }
}
