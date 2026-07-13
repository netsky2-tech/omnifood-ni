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
const SET_LOCAL_TENANT_SQL = "SELECT set_config('app.tenant_id', $1, true)";
const CREDIT_NOTE_NO_STOCK_POLICIES = new Set([
  'FINANCIAL_ONLY',
  'WASTE_NO_RESTOCK',
]);
const CREDIT_NOTE_RESTOCK_POLICY = 'RESTOCK_ORIGINAL_BOM';
const INVOICE_SOURCE_DOCUMENT_PREFIX = 'invoice:';

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

interface InvoiceItemForPersistence extends Omit<
  CreateInvoiceItemDto,
  'originInvoiceItemId'
> {
  originInvoiceItemId?: string | null;
}

interface InvoiceForPersistence extends Omit<
  SyncInvoiceDto,
  'originInvoiceId' | 'refundReasonCode' | 'refundReasonPolicy' | 'items'
> {
  originInvoiceId?: string | null;
  refundReasonCode?: string | null;
  refundReasonPolicy?: SyncInvoiceDto['refundReasonPolicy'] | null;
  items: InvoiceItemForPersistence[];
}

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
    options: { allowCreditNotes?: boolean } = {},
  ): Promise<void> {
    this.assertDirectCreditNoteBoundary(
      dtos,
      options.allowCreditNotes ?? false,
    );
    if (!manager) {
      await this.dataSource.transaction('SERIALIZABLE', async (txManager) => {
        await this.bindTenantContext(txManager, tenantId);
        await this.syncInvoices(tenantId, dtos, txManager, options);
      });
      return;
    }

    for (const dto of dtos) {
      const persistenceDto = this.normalizeInvoiceProvenanceForPersistence(
        dto,
        options.allowCreditNotes ?? false,
      );
      await this.validateInvoiceRecipeVersions(tenantId, dto);
      const handledDuplicate = await this.skipMatchingCreditNoteReplay(
        tenantId,
        dto,
        manager,
      );
      if (handledDuplicate) continue;
      await this.assertCreditNoteOriginInvoiceIsRegularSale(
        tenantId,
        dto,
        manager,
      );
      await this.assertCreditNoteOriginItemsBelongToOriginInvoice(
        tenantId,
        dto,
        manager,
      );
      // Tenant isolation for items: the POS controls the item `id`
      // (client UUID) and the upsert conflict target is `['id']`. Before
      // persisting, reject any item id that already belongs to another
      // tenant so a colliding id cannot overwrite cross-tenant data.
      await this.assertItemTenantOwnership(tenantId, dto.items ?? [], manager);
      await this.invoiceRepoFor(manager).upsert(
        {
          ...persistenceDto,
          tenant_id: tenantId,
          created_at: new Date(dto.createdAt),
        },
        ['id'],
      );
      if (persistenceDto.items?.length) {
        await this.itemRepoFor(manager).upsert(
          persistenceDto.items.map((item) => ({
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
    return this.withTenantBoundTransaction(tenantId, async (manager) =>
      this.invoiceRepoFor(manager).find({
        where: { tenant_id: tenantId },
        relations: ['items', 'items.modifiers', 'payments'],
        order: { created_at: 'DESC' },
      }),
    );
  }

  async findOne(tenantId: string, id: string): Promise<Invoice | null> {
    return this.withTenantBoundTransaction(tenantId, async (manager) =>
      this.invoiceRepoFor(manager).findOne({
        where: { id, tenant_id: tenantId },
        relations: ['items', 'items.modifiers', 'payments'],
      }),
    );
  }

  async syncBatch(
    tenantId: string,
    records: SyncBatchRecordDto[],
  ): Promise<SyncBatchResult> {
    const creditNoteFlowTypeErrors =
      this.rejectCreditNotesMissingFlowType(records);
    if (creditNoteFlowTypeErrors.length === records.length) {
      return {
        received: records.length,
        processed: 0,
        duplicates: 0,
        results: creditNoteFlowTypeErrors,
      };
    }

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

      if (record.documentType === 'CREDIT_NOTE' && !record.flowType) {
        results.push(
          this.buildResult(record, SYNC_RESULT_STATUS.REJECTED, {
            code: 'CREDIT_NOTE_FLOW_TYPE_REQUIRED',
            retryable: false,
            message:
              'CREDIT_NOTE records require deterministic flowType until backend replay is implemented',
          }),
        );
        blockedStreams.add(streamKey);
        continue;
      }

      const creditNoteBoundaryError =
        this.resolveRecordCreditNoteBoundaryError(record);
      if (creditNoteBoundaryError) {
        results.push(
          this.buildResult(record, SYNC_RESULT_STATUS.REJECTED, {
            code: creditNoteBoundaryError.code,
            retryable: false,
            message: creditNoteBoundaryError.message,
          }),
        );
        blockedStreams.add(streamKey);
        continue;
      }

      const unsupportedCreditNoteError =
        this.resolveUnsupportedCreditNoteStockBehavior(record);
      if (unsupportedCreditNoteError) {
        results.push(
          this.buildResult(record, SYNC_RESULT_STATUS.REJECTED, {
            code: unsupportedCreditNoteError.code,
            retryable: false,
            message: unsupportedCreditNoteError.message,
          }),
        );
        blockedStreams.add(streamKey);
        continue;
      }

      const existingByKey = await this.withTenantBoundTransaction(
        tenantId,
        async (manager) =>
          this.receiptRepoFor(manager).findOne({
            where: {
              tenant_id: tenantId,
              idempotency_key: record.idempotencyKey,
            },
          }),
      );
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
      const existingBySequence = await this.withTenantBoundTransaction(
        tenantId,
        async (manager) =>
          this.receiptRepoFor(manager).findOne({
            where: {
              tenant_id: tenantId,
              source_device_id: record.sourceDeviceId,
              flow_type: flowType,
              source_sequence: String(record.sourceSequence),
            },
          }),
      );
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
    const results: SyncBatchResultItem[] = [];
    for (const record of ordered) {
      const creditNoteBoundaryError =
        this.resolveRecordCreditNoteBoundaryError(record);
      if (creditNoteBoundaryError) {
        results.push(
          this.buildResult(record, SYNC_RESULT_STATUS.REJECTED, {
            code: creditNoteBoundaryError.code,
            retryable: false,
            message: creditNoteBoundaryError.message,
          }),
        );
        continue;
      }

      const unsupportedCreditNoteError =
        this.resolveUnsupportedLegacyCreditNoteRecord(record) ??
        this.resolveUnsupportedCreditNoteStockBehavior(record);
      if (unsupportedCreditNoteError) {
        results.push(
          this.buildResult(record, SYNC_RESULT_STATUS.REJECTED, {
            code: unsupportedCreditNoteError.code,
            retryable: false,
            message: unsupportedCreditNoteError.message,
          }),
        );
        continue;
      }

      const existingByKey = await this.withTenantBoundTransaction(
        tenantId,
        async (manager) =>
          this.receiptRepoFor(manager).findOne({
            where: {
              tenant_id: tenantId,
              idempotency_key: record.idempotencyKey,
            },
          }),
      );
      if (existingByKey) {
        const payloadHash = calculateSyncPayloadHash(record);
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
        continue;
      }
      const existingBySequence = await this.withTenantBoundTransaction(
        tenantId,
        async (manager) =>
          this.receiptRepoFor(manager).findOne({
            where: {
              tenant_id: tenantId,
              source_device_id: record.sourceDeviceId,
              source_sequence: String(record.sourceSequence),
            },
          }),
      );
      if (existingBySequence) {
        const payloadHash = calculateSyncPayloadHash(record);
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
        continue;
      }

      await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
        await this.bindTenantContext(manager, tenantId);
        if (record.invoice) {
          await this.validateInvoiceRecipeVersions(
            tenantId,
            record.invoice,
            record.recipeVersionId,
          );
          await this.syncInvoices(tenantId, [record.invoice], manager, {
            allowCreditNotes: record.documentType === 'CREDIT_NOTE',
          });
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
    return {
      received: records.length,
      processed,
      duplicates,
      ...(results.length ? { results } : {}),
    };
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

  private rejectCreditNotesMissingFlowType(
    records: SyncBatchRecordDto[],
  ): SyncBatchResultItem[] {
    return records
      .filter(
        (record) => record.documentType === 'CREDIT_NOTE' && !record.flowType,
      )
      .map((record) =>
        this.buildResult(record, SYNC_RESULT_STATUS.REJECTED, {
          code: 'CREDIT_NOTE_FLOW_TYPE_REQUIRED',
          retryable: false,
          message:
            'CREDIT_NOTE records require deterministic flowType until backend replay is implemented',
        }),
      );
  }

  private async resolveExpectedSequence(
    tenantId: string,
    sourceDeviceId: string,
    flowType: string,
  ): Promise<number> {
    const lastReceipt = await this.withTenantBoundTransaction(
      tenantId,
      async (manager) =>
        this.receiptRepoFor(manager).findOne({
          where: {
            tenant_id: tenantId,
            source_device_id: sourceDeviceId,
            flow_type: flowType,
            result_status: SYNC_RESULT_STATUS.ACCEPTED,
          },
          order: { source_sequence: 'DESC' },
        }),
    );
    return Number(lastReceipt?.source_sequence ?? 0) + 1;
  }

  private async stageFutureRecord(
    tenantId: string,
    record: SyncBatchRecordDto,
    payloadHash: string,
  ): Promise<SyncBatchResultItem | null> {
    return this.withTenantBoundTransaction(tenantId, async (manager) => {
      const outboxRepository = this.outboxRepoFor(manager);
      const existing = await outboxRepository.findOne({
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
        manager,
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
        await outboxRepository.save(
          outboxRepository.create({
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
        const racedExisting = await outboxRepository.findOne({
          where: {
            tenant_id: tenantId,
            idempotency_key: record.idempotencyKey,
          },
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
          manager,
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
    });
  }

  private async findStagedStreamSequence(
    tenantId: string,
    record: SyncBatchRecordDto,
    manager?: EntityManager,
  ): Promise<InventorySyncOutbox | null> {
    return this.outboxRepoFor(manager).findOne({
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

  private isCrossTenantItemCollisionError(
    error: unknown,
    message: string,
  ): boolean {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;
    const table =
      typeof error === 'object' && error !== null && 'table' in error
        ? (error as { table?: unknown }).table
        : undefined;
    const constraint =
      typeof error === 'object' && error !== null && 'constraint' in error
        ? (error as { constraint?: unknown }).constraint
        : undefined;

    return (
      (code === '23505' && constraint === 'PK_invoice_items_id') ||
      (code === '23505' && message.includes('invoice_items')) ||
      (code === '42501' && table === 'invoice_items') ||
      (code === '42501' && message.includes('invoice_items'))
    );
  }

  private async applyExpectedRecord(
    tenantId: string,
    record: SyncBatchRecordDto,
    payloadHash: string,
  ): Promise<{ accepted: boolean; result: SyncBatchResultItem }> {
    try {
      await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
        await this.bindTenantContext(manager, tenantId);
        this.assertRecordCreditNoteBoundary(record);
        this.assertSupportedCreditNoteStockBehavior(record);
        if (record.invoice) {
          await this.validateInvoiceRecipeVersions(
            tenantId,
            record.invoice,
            record.recipeVersionId,
          );
          await this.syncInvoices(tenantId, [record.invoice], manager, {
            allowCreditNotes: record.documentType === 'CREDIT_NOTE',
          });
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
      if (this.isCrossTenantItemCollisionError(error, message)) {
        return {
          accepted: false,
          result: this.buildResult(record, SYNC_RESULT_STATUS.REJECTED, {
            code: 'CROSS_TENANT_ITEM_ID_COLLISION',
            retryable: false,
            message:
              'Invoice item id already belongs to another tenant; cross-tenant item overwrite is not allowed.',
          }),
        };
      }
      const isCreditNoteBoundaryError =
        error instanceof BadRequestException &&
        message.includes('creditNote invoice type is only valid');
      const isCreditNotePayloadMismatch =
        error instanceof BadRequestException &&
        message.includes(
          'conflicts with an existing credit-note invoice payload',
        );
      const unsupportedCreditNoteError =
        error instanceof BadRequestException
          ? this.resolveCreditNoteUnsupportedErrorFromMessage(message)
          : null;
      const creditNoteOriginError =
        error instanceof BadRequestException
          ? this.resolveCreditNoteOriginErrorFromMessage(message)
          : null;
      return {
        accepted: false,
        result: this.buildResult(record, SYNC_RESULT_STATUS.REJECTED, {
          code:
            unsupportedCreditNoteError?.code ??
            creditNoteOriginError?.code ??
            (isCreditNotePayloadMismatch
              ? 'CREDIT_NOTE_PAYLOAD_MISMATCH'
              : isCreditNoteBoundaryError
                ? 'CREDIT_NOTE_DOCUMENT_TYPE_MISMATCH'
                : 'BUSINESS_RULE_VALIDATION'),
          retryable:
            unsupportedCreditNoteError?.retryable ??
            creditNoteOriginError?.retryable ??
            !(isCreditNoteBoundaryError || isCreditNotePayloadMismatch),
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
      const staged = await this.withTenantBoundTransaction(
        tenantId,
        async (manager) =>
          this.outboxRepoFor(manager).findOne({
            where: {
              tenant_id: tenantId,
              source_device_id: sourceDeviceId,
              flow_type: flowType,
              source_sequence: String(expectedSequence),
              status: SYNC_RESULT_STATUS.STAGED_FUTURE,
            },
          }),
      );
      if (!staged) return drained;
      const record = staged.payload as unknown as SyncBatchRecordDto;
      const applied = await this.applyExpectedRecord(
        tenantId,
        record,
        staged.payload_hash,
      );
      drained.push(applied.result);
      if (!applied.accepted) return drained;
      await this.withTenantBoundTransaction(tenantId, async (manager) => {
        await this.outboxRepoFor(manager).delete({ id: staged.id });
      });
      expectedSequence += 1;
    }
  }

  private async withTenantBoundTransaction<T>(
    tenantId: string,
    operation: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      await this.bindTenantContext(manager, tenantId);
      return operation(manager);
    });
  }

  private async bindTenantContext(
    manager: EntityManager,
    tenantId: string,
  ): Promise<void> {
    await manager.query(SET_LOCAL_TENANT_SQL, [tenantId]);
  }

  private assertDirectCreditNoteBoundary(
    dtos: SyncInvoiceDto[],
    allowCreditNotes: boolean,
  ): void {
    if (allowCreditNotes) return;
    if (dtos.some((dto) => this.isCreditNoteInvoice(dto))) {
      throw new BadRequestException(
        'Credit-note invoices must use the batch CREDIT_NOTE sync boundary',
      );
    }
  }

  private assertRecordCreditNoteBoundary(record: SyncBatchRecordDto): void {
    const error = this.resolveRecordCreditNoteBoundaryError(record);
    if (error) throw new BadRequestException(error.message);
  }

  private resolveRecordCreditNoteBoundaryError(
    record: SyncBatchRecordDto,
  ): { code: string; message: string } | null {
    if (record.documentType === 'CREDIT_NOTE') {
      if (!record.invoice) {
        return {
          code: 'CREDIT_NOTE_INVOICE_REQUIRED',
          message: 'CREDIT_NOTE documentType requires an invoice payload',
        };
      }
      if (record.invoice.type !== 'creditNote') {
        return {
          code: 'CREDIT_NOTE_DOCUMENT_TYPE_MISMATCH',
          message: 'CREDIT_NOTE documentType requires invoice.type=creditNote',
        };
      }
      return null;
    }
    if (!record.invoice) return null;
    if (record.invoice.type === 'creditNote') {
      return {
        code: 'CREDIT_NOTE_DOCUMENT_TYPE_MISMATCH',
        message:
          'creditNote invoice type is only valid with CREDIT_NOTE documentType',
      };
    }
    return null;
  }

  private resolveUnsupportedLegacyCreditNoteRecord(
    record: SyncBatchRecordDto,
  ): { code: string; message: string } | null {
    if (record.documentType !== 'CREDIT_NOTE' || record.flowType) return null;
    return {
      code: 'CREDIT_NOTE_FLOW_TYPE_REQUIRED',
      message:
        'CREDIT_NOTE records require deterministic flowType until backend replay is implemented',
    };
  }

  private assertSupportedCreditNoteStockBehavior(
    record: SyncBatchRecordDto,
  ): void {
    const error = this.resolveUnsupportedCreditNoteStockBehavior(record);
    if (error) throw new BadRequestException(error.message);
  }

  private resolveUnsupportedCreditNoteStockBehavior(
    record: SyncBatchRecordDto,
  ): { code: string; message: string } | null {
    if (record.documentType !== 'CREDIT_NOTE') return null;
    if (record.movements?.length) {
      return {
        code: 'CREDIT_NOTE_STOCK_REPLAY_UNSUPPORTED',
        message:
          'CREDIT_NOTE inventory movement deltas are not supported until backend Kardex replay is implemented',
      };
    }
    return null;
  }

  private resolveCreditNoteUnsupportedErrorFromMessage(
    message: string,
  ): { code: string; retryable: boolean } | null {
    if (message.includes('inventory movement deltas are not supported')) {
      return { code: 'CREDIT_NOTE_STOCK_REPLAY_UNSUPPORTED', retryable: false };
    }
    if (message.includes('requires Kardex compensation')) {
      return {
        code: 'CREDIT_NOTE_KARDEX_COMPENSATION_UNSUPPORTED',
        retryable: false,
      };
    }
    return null;
  }

  private resolveCreditNoteOriginErrorFromMessage(
    message: string,
  ): { code: string; retryable: boolean } | null {
    if (message.includes('credit-note origin invoice item')) {
      return { code: 'CREDIT_NOTE_ORIGIN_ITEM_INVALID', retryable: false };
    }
    if (message.includes('duplicate credit-note origin invoice item')) {
      return { code: 'CREDIT_NOTE_ORIGIN_ITEM_INVALID', retryable: false };
    }
    if (message.includes('credit-note origin invoice was not found')) {
      return { code: 'CREDIT_NOTE_ORIGIN_MISSING', retryable: false };
    }
    if (message.includes('requires origin sale Kardex movement snapshots')) {
      return { code: 'CREDIT_NOTE_ORIGIN_MOVEMENT_MISSING', retryable: false };
    }
    if (message.includes('credit-note refund quantity')) {
      return { code: 'CREDIT_NOTE_REFUND_QUANTITY_INVALID', retryable: false };
    }
    if (message.includes('credit-note restock quantity exceeds')) {
      return { code: 'CREDIT_NOTE_RESTOCK_QUANTITY_EXCEEDED', retryable: false };
    }
    if (message.includes('collides with an existing non-credit invoice')) {
      return { code: 'CREDIT_NOTE_INVOICE_ID_COLLISION', retryable: false };
    }
    return null;
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
        const unitCostNio = round4(Number(insumo.averageCost ?? 0));
        const averageCostAfterNio = round4(Number(insumo.averageCost ?? 0));
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
            sourceDocumentId: `${INVOICE_SOURCE_DOCUMENT_PREFIX}${invoice.id}`,
            sourceDocumentType: movementType,
            compensationForKardexId,
            originInvoiceItemId:
              movementType === MovementType.SALE ? item.id : null,
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
    if (record.documentType === 'CREDIT_NOTE') {
      await this.appendCreditNoteCompensation(tenantId, record, manager);
      return;
    }
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

  private async skipMatchingCreditNoteReplay(
    tenantId: string,
    dto: SyncInvoiceDto,
    manager?: EntityManager,
  ): Promise<boolean> {
    if (!this.isCreditNoteInvoice(dto)) return false;

    const existing = await this.invoiceRepoFor(manager).findOne({
      where: { id: dto.id, tenant_id: tenantId },
      relations: ['items', 'payments'],
    });
    if (!existing) return false;

    if (existing.type !== 'creditNote') {
      throw new BadRequestException(
        `Incoming credit-note invoice ${dto.id} collides with an existing non-credit invoice id.`,
      );
    }

    const incomingHash = this.calculateCreditNoteInvoiceHash(dto);
    const existingHash = this.calculateCreditNoteInvoiceHash({
      id: existing.id,
      number: existing.number,
      createdAt: existing.created_at.toISOString(),
      userId: existing.userId,
      subtotal: Number(existing.subtotal),
      totalTax: Number(existing.totalTax),
      total: Number(existing.total),
      isCanceled: existing.isCanceled,
      voidReason: existing.voidReason,
      paymentStatus: existing.paymentStatus,
      customerId: existing.customerId,
      globalTaxOverride: existing.globalTaxOverride,
      type: existing.type,
      relatedInvoiceId: existing.relatedInvoiceId,
      originInvoiceId: existing.originInvoiceId,
      refundReasonCode: existing.refundReasonCode,
      refundReasonPolicy:
        existing.refundReasonPolicy as SyncInvoiceDto['refundReasonPolicy'],
      items: (existing.items ?? []).map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        originalTaxRate: Number(item.originalTaxRate),
        appliedTaxRate: Number(item.appliedTaxRate),
        taxAmount: Number(item.taxAmount),
        total: Number(item.total),
        discount: Number(item.discount),
        variantId: item.variantId,
        notes: item.notes,
        recipeVersionId: item.recipeVersionId,
        originInvoiceItemId: item.originInvoiceItemId,
      })),
      payments: (existing.payments ?? []).map((payment) => ({
        id: payment.id,
        method: payment.method,
        amount: Number(payment.amount),
        currency: payment.currency,
        exchangeRate: Number(payment.exchangeRate),
      })),
    });

    if (incomingHash !== existingHash) {
      throw new BadRequestException(
        `Incoming credit-note invoice ${dto.id} conflicts with an existing credit-note invoice payload.`,
      );
    }

    return true;
  }

  private async assertCreditNoteOriginInvoiceIsRegularSale(
    tenantId: string,
    dto: SyncInvoiceDto,
    manager?: EntityManager,
  ): Promise<void> {
    if (!this.isCreditNoteInvoice(dto)) return;
    if (!dto.originInvoiceId) return;

    const origin = await this.invoiceRepoFor(manager).findOne({
      where: { id: dto.originInvoiceId, tenant_id: tenantId },
    });
    if (!origin) {
      throw new BadRequestException('credit-note origin invoice was not found');
    }
    if (origin.type === 'creditNote') {
      throw new BadRequestException(
        'credit-note origin invoice must be a regular sale invoice',
      );
    }
  }

  private async assertCreditNoteOriginItemsBelongToOriginInvoice(
    tenantId: string,
    dto: SyncInvoiceDto,
    manager?: EntityManager,
  ): Promise<void> {
    if (!this.isCreditNoteInvoice(dto)) return;
    if (!dto.originInvoiceId) return;

    const originItemIds = (dto.items ?? [])
      .map((item) => item.originInvoiceItemId)
      .filter((originItemId): originItemId is string => Boolean(originItemId));
    if (!originItemIds.length) return;

    const uniqueOriginItemIds = new Set(originItemIds);
    if (uniqueOriginItemIds.size !== originItemIds.length) {
      throw new BadRequestException(
        'duplicate credit-note origin invoice item references are not allowed',
      );
    }

    const originItems = await this.itemRepoFor(manager).find({
      where: {
        id: In([...uniqueOriginItemIds]),
        invoiceId: dto.originInvoiceId,
        tenant_id: tenantId,
      },
    });
    const originItemsById = new Map(originItems.map((item) => [item.id, item]));

    const missingOriginItemIds = [...uniqueOriginItemIds].filter(
      (originItemId) => !originItemsById.has(originItemId),
    );
    const sameTenantItemsOutsideOriginInvoice = missingOriginItemIds.length
      ? await this.itemRepoFor(manager).find({
          where: {
            id: In(missingOriginItemIds),
            tenant_id: tenantId,
          },
        })
      : [];
    if (sameTenantItemsOutsideOriginInvoice.length) {
      throw new BadRequestException(
        'credit-note origin invoice item must belong to the credit-note origin invoice',
      );
    }

    for (const originItemId of uniqueOriginItemIds) {
      const originItem = originItemsById.get(originItemId);
      if (!originItem) {
        throw new BadRequestException(
          'credit-note origin invoice item was not found for this tenant',
        );
      }
      if (originItem.invoiceId !== dto.originInvoiceId) {
        throw new BadRequestException(
          'credit-note origin invoice item must belong to the credit-note origin invoice',
        );
      }
      if (originItem.tenant_id !== tenantId) {
        throw new BadRequestException(
          'credit-note origin invoice item belongs to another tenant',
        );
      }
    }
  }

  private async appendCreditNoteCompensation(
    tenantId: string,
    record: SyncBatchRecordDto,
    manager: EntityManager,
  ): Promise<void> {
    const invoice = record.invoice;
    if (!invoice) return;
    const policy = invoice.refundReasonPolicy;
    if (!policy || CREDIT_NOTE_NO_STOCK_POLICIES.has(policy)) return;
    if (policy !== CREDIT_NOTE_RESTOCK_POLICY) {
      throw new BadRequestException(
        `Unsupported credit-note refund reason policy ${policy}`,
      );
    }

    const originItemIds = (invoice.items ?? [])
      .map((item) => item.originInvoiceItemId)
      .filter((originItemId): originItemId is string => Boolean(originItemId));
    if (!originItemIds.length) return;

    const originItems = await this.itemRepoFor(manager).find({
      where: {
        id: In(originItemIds),
        invoiceId: invoice.originInvoiceId,
        tenant_id: tenantId,
      },
    });
    const originItemsById = new Map(
      originItems.map((originItem) => [originItem.id, originItem]),
    );
    const originMovements = await manager.find(InventoryMovement, {
      where: {
        tenant_id: tenantId,
        sourceDocumentId: `${INVOICE_SOURCE_DOCUMENT_PREFIX}${invoice.originInvoiceId}`,
        sourceDocumentType: MovementType.SALE,
      },
    });
    const existingCompensations = originMovements.length
      ? await manager.find(InventoryMovement, {
          where: {
            tenant_id: tenantId,
            sourceDocumentType: 'CREDIT_NOTE',
            originMovementId: In(originMovements.map((movement) => movement.id)),
          },
        })
      : [];

    for (const creditItem of invoice.items ?? []) {
      const originItemId = creditItem.originInvoiceItemId;
      if (!originItemId) continue;
      const originItem = originItemsById.get(originItemId);
      if (!originItem) {
        throw new BadRequestException(
          'credit-note origin invoice item was not found for this tenant',
        );
      }
      const originQuantity = Math.abs(Number(originItem.quantity));
      if (originQuantity === 0) {
        throw new BadRequestException(
          'credit-note origin invoice item quantity must be greater than zero',
        );
      }
      const refundQuantity = Math.abs(Number(creditItem.quantity));
      if (refundQuantity <= 0) {
        throw new BadRequestException(
          'credit-note refund quantity must be greater than zero',
        );
      }
      if (refundQuantity > originQuantity) {
        throw new BadRequestException(
          'credit-note refund quantity exceeds the origin item quantity',
        );
      }
      const refundRatio = refundQuantity / originQuantity;
      const movementsForLine = originMovements.filter((movement) =>
        this.isMovementBoundToOriginInvoiceItem(movement, originItemId),
      );
      if (!movementsForLine.length) {
        throw new BadRequestException(
          'credit-note restock requires origin sale Kardex movement snapshots',
        );
      }

      for (const originMovement of movementsForLine) {
        await this.appendCreditNoteMovementFromOrigin({
          tenantId,
          record,
          manager,
          originMovement,
          originInvoiceItemId: originItemId,
          refundRatio,
          refundReasonPolicy: policy,
          existingCompensations,
        });
      }
    }
  }

  private isMovementBoundToOriginInvoiceItem(
    movement: InventoryMovement,
    originInvoiceItemId: string,
  ): boolean {
    return movement.originInvoiceItemId === originInvoiceItemId;
  }

  private async appendCreditNoteMovementFromOrigin(input: {
    tenantId: string;
    record: SyncBatchRecordDto;
    manager: EntityManager;
    originMovement: InventoryMovement;
    originInvoiceItemId: string;
    refundRatio: number;
    refundReasonPolicy: string;
    existingCompensations: InventoryMovement[];
  }): Promise<void> {
    const { tenantId, record, manager, originMovement } = input;
    const invoice = record.invoice;
    if (!invoice) return;

    const existingForOriginMovement = input.existingCompensations.filter(
      (movement) =>
        movement.originMovementId === originMovement.id &&
        movement.originInvoiceItemId === input.originInvoiceItemId,
    );
    const existingForSameCreditNote = existingForOriginMovement.find(
      (movement) => movement.sourceDocumentId === invoice.id,
    );
    if (existingForSameCreditNote) return;

    const quantity = round4(
      Math.abs(Number(originMovement.quantity)) * input.refundRatio,
    );
    const priorCompensatedQuantity = round4(
      existingForOriginMovement.reduce(
        (total, movement) => total + Math.abs(Number(movement.quantity)),
        0,
      ),
    );
    const originMovementQuantity = round4(
      Math.abs(Number(originMovement.quantity)),
    );
    if (round4(priorCompensatedQuantity + quantity) > originMovementQuantity) {
      throw new BadRequestException(
        'credit-note restock quantity exceeds the remaining origin movement quantity',
      );
    }

    const insumo = await manager
      .createQueryBuilder(Insumo, 'insumo')
      .setLock('pessimistic_write')
      .where('insumo.id = :insumoId', { insumoId: originMovement.insumoId })
      .andWhere('insumo.tenant_id = :tenantId', { tenantId })
      .getOne();
    if (!insumo) {
      this.logger.warn(
        `Skipping credit-note compensation due to unresolved insumo ${originMovement.insumoId}`,
      );
      return;
    }

    const previousStock = Number(insumo.stock);
    const newStock = round4(previousStock + quantity);
    const unitCostNio = round4(Number(originMovement.unitCostNio));
    const averageCostAfterNio = round4(Number(insumo.averageCost ?? 0));
    insumo.stock = newStock;
    insumo.existenciaActual = newStock;
    await manager.save(Insumo, insumo);

    await manager.save(
      this.movementRepository.create({
        tenant_id: tenantId,
        insumoId: originMovement.insumoId,
        type: MovementType.CREDIT_NOTE_RESTOCK,
        quantity,
        previousStock,
        newStock,
        averageCostAfterNio,
        unitCostNio,
        totalCostNio: round4(quantity * unitCostNio),
        idempotencyKey: `${record.idempotencyKey}:${input.originInvoiceItemId}:${originMovement.id}`,
        sourceDeviceId: record.sourceDeviceId,
        sourceSequence: String(record.sourceSequence),
        sourceDocumentId: invoice.id,
        sourceDocumentType: 'CREDIT_NOTE',
        compensationForKardexId: originMovement.id,
        originMovementId: originMovement.id,
        originInvoiceItemId: input.originInvoiceItemId,
        refundReasonPolicy: input.refundReasonPolicy,
        user_id: invoice.userId,
      }),
    );
  }

  private isCreditNoteInvoice(dto: SyncInvoiceDto): boolean {
    return dto.type === 'creditNote';
  }

  private normalizeInvoiceProvenanceForPersistence(
    dto: SyncInvoiceDto,
    allowCreditNotes: boolean,
  ): InvoiceForPersistence {
    if (allowCreditNotes && this.isCreditNoteInvoice(dto)) {
      return { ...dto, items: dto.items ?? [] };
    }

    return {
      ...dto,
      originInvoiceId: null,
      refundReasonCode: null,
      refundReasonPolicy: null,
      items: (dto.items ?? []).map((item) => ({
        ...item,
        originInvoiceItemId: null,
      })),
    };
  }

  private calculateCreditNoteInvoiceHash(dto: SyncInvoiceDto): string {
    return createHash('sha256')
      .update(
        stableStringify({
          id: dto.id,
          number: dto.number,
          createdAt: new Date(dto.createdAt).toISOString(),
          userId: dto.userId,
          subtotal: Number(dto.subtotal),
          totalTax: Number(dto.totalTax),
          total: Number(dto.total),
          isCanceled: dto.isCanceled ?? false,
          voidReason: dto.voidReason ?? null,
          paymentStatus: dto.paymentStatus,
          customerId: dto.customerId ?? null,
          globalTaxOverride: dto.globalTaxOverride ?? false,
          type: dto.type ?? 'regular',
          relatedInvoiceId: dto.relatedInvoiceId ?? null,
          originInvoiceId: dto.originInvoiceId ?? null,
          refundReasonCode: dto.refundReasonCode ?? null,
          refundReasonPolicy: dto.refundReasonPolicy ?? null,
          items: [...(dto.items ?? [])]
            .map((item) => ({
              id: item.id,
              productId: item.productId,
              productName: item.productName,
              quantity: Number(item.quantity),
              unitPrice: Number(item.unitPrice),
              originalTaxRate: Number(item.originalTaxRate),
              appliedTaxRate: Number(item.appliedTaxRate),
              taxAmount: Number(item.taxAmount),
              total: Number(item.total),
              discount: Number(item.discount),
              variantId: item.variantId ?? null,
              notes: item.notes ?? null,
              recipeVersionId: item.recipeVersionId ?? null,
              originInvoiceItemId: item.originInvoiceItemId ?? null,
            }))
            .sort((left, right) => left.id.localeCompare(right.id)),
          payments: [...(dto.payments ?? [])]
            .map((payment) => ({
              id: payment.id,
              method: payment.method,
              amount: Number(payment.amount),
              currency: payment.currency,
              exchangeRate: Number(payment.exchangeRate),
            }))
            .sort((left, right) => left.id.localeCompare(right.id)),
        }),
      )
      .digest('hex');
  }

  private itemRepoFor(manager?: EntityManager): Repository<InvoiceItem> {
    return manager ? manager.getRepository(InvoiceItem) : this.itemRepository;
  }

  private paymentRepoFor(manager?: EntityManager): Repository<Payment> {
    return manager ? manager.getRepository(Payment) : this.paymentRepository;
  }

  private receiptRepoFor(
    manager?: EntityManager,
  ): Repository<InventorySyncReceipt> {
    return manager
      ? (manager.getRepository(InventorySyncReceipt) ?? this.receiptRepository)
      : this.receiptRepository;
  }

  private outboxRepoFor(
    manager?: EntityManager,
  ): Repository<InventorySyncOutbox> {
    return manager
      ? (manager.getRepository(InventorySyncOutbox) ?? this.outboxRepository)
      : this.outboxRepository;
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
