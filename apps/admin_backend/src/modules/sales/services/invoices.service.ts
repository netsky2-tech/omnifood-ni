import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { Payment } from '../entities/payment.entity';
import { SyncInvoiceDto } from '../dto/sync-invoice.dto';
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

  async syncInvoices(tenantId: string, dtos: SyncInvoiceDto[]): Promise<void> {
    for (const dto of dtos) {
      await this.invoiceRepository.upsert(
        { ...dto, tenant_id: tenantId, created_at: new Date(dto.createdAt) },
        ['id'],
      );
      if (dto.items?.length) {
        await this.itemRepository.upsert(
          dto.items.map((item) => ({ ...item, invoiceId: dto.id })),
          ['id'],
        );
      }
      if (dto.payments?.length) {
        await this.paymentRepository.upsert(
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
        if (record.invoice) await this.syncInvoices(tenantId, [record.invoice]);
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
      const newStock = Number((previousStock + delta).toFixed(4));
      this.assertNegativeStockPolicy(
        insumo.negativeStockPolicy,
        newStock,
        movement.insumoId,
        record.documentType as MovementType,
      );
      const unitCostNio = Number(
        (movement.unitCostNio ?? Number(insumo.averageCost)).toFixed(4),
      );
      insumo.stock = newStock;
      insumo.existenciaActual = newStock;
      await manager.save(Insumo, insumo);

      await manager.save(
        this.movementRepository.create({
          tenant_id: tenantId,
          insumoId: movement.insumoId,
          type: record.documentType as MovementType,
          quantity: delta,
          previousStock,
          newStock,
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
