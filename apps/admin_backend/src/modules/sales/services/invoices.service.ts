import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { Payment } from '../entities/payment.entity';
import { SyncInvoiceDto, CreateInvoiceItemDto } from '../dto/sync-invoice.dto';
import {
  InventoryMovement,
  MovementType,
} from '../../inventory/entities/inventory-movement.entity';
import { InventorySyncReceipt } from '../../inventory/entities/inventory-sync-receipt.entity';
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

  async syncBatch(tenantId: string, records: SyncBatchRecordDto[]) {
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
          // Persist invoice/items/payments through the same transactional
          // manager as the inventory deltas below. Previously this called
          // `this.syncInvoices(...)`, which used the injected (non-tx)
          // repositories and committed before the inventory movement
          // processing — so a later inventory failure (e.g. a negative
          // stock policy rejection) left an invoice/items persisted with
          // no rolled-back compensation. Routing the upserts through
          // `manager` makes them participate in the SERIALIZABLE tx and
          // rollback together with the inventory deltas.
          await this.syncInvoices(tenantId, [record.invoice], manager);
        }
        await this.appendInventoryDeltas(tenantId, record, manager);
        await manager.save(
          this.receiptRepository.create({
            tenant_id: tenantId,
            idempotency_key: record.idempotencyKey,
            source_device_id: record.sourceDeviceId,
            source_sequence: String(record.sourceSequence),
            payload_hash: `${record.documentType}:${record.invoice?.id ?? record.idempotencyKey}`,
          }),
        );
      });
      processed += 1;
    }
    return { received: records.length, processed, duplicates };
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
