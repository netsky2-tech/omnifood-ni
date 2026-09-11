import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import { SaleInventoryRemediationDto } from '../dto/sale-inventory-remediation.dto';
import { InventoryRemediationReceipt } from '../entities/inventory-remediation-receipt.entity';
import { Invoice } from '../../sales/entities/invoice.entity';
import { InventorySyncReceipt } from '../entities/inventory-sync-receipt.entity';
import { RecipeVersion } from '../entities/recipe-version.entity';
import { RecipeDetail } from '../entities/recipe-detail.entity';
import { Insumo } from '../entities/insumo.entity';
import { InventoryMovement, MovementType } from '../entities/inventory-movement.entity';
import { AuditLog } from '../../identity/entities/audit-log.entity';

@Injectable()
export class SaleInventoryRemediationService {
  constructor(private readonly dataSource: DataSource) {}

  buildRequestHash(
    tenantId: string,
    invoiceId: string,
    recipeVersionId: string,
    reason: string,
  ): string {
    const canonical = `remediation:v1|${tenantId}|${invoiceId}|${recipeVersionId}|${reason.trim()}`;
    return createHash('sha256').update(canonical, 'utf8').digest('hex');
  }

  async remediateSaleInventory(
    tenantId: string,
    dto: SaleInventoryRemediationDto,
    actor: { userId: string; role: string },
  ): Promise<InventoryRemediationReceipt> {
    if (
      (dto as any).actor ||
      (dto as any).actor_user_id ||
      (dto as any).actor_role ||
      (dto as any).userId ||
      (dto as any).role
    ) {
      throw new BadRequestException(
        'Actor fields in body are strictly rejected; identity is derived only from JWT principal',
      );
    }

    const requestHash = this.buildRequestHash(
      tenantId,
      dto.invoiceId,
      dto.recipeVersionId,
      dto.reason,
    );

    const existingByKey = await this.dataSource
      .getRepository(InventoryRemediationReceipt)
      .findOne({
        where: {
          tenant_id: tenantId,
          idempotency_key: dto.idempotencyKey,
        },
      });

    if (existingByKey) {
      if (existingByKey.request_hash === requestHash) {
        return existingByKey;
      }
      throw new ConflictException({
        code: 'IDEMPOTENCY_MISMATCH',
        message: 'Idempotency key reused with differing request payload',
      });
    }

    const existingByInvoice = await this.dataSource
      .getRepository(InventoryRemediationReceipt)
      .findOne({
        where: {
          tenant_id: tenantId,
          source_invoice_id: dto.invoiceId,
          command_type: 'SALE_INVENTORY_REMEDIATION',
        },
      });

    if (existingByInvoice) {
      throw new ConflictException({
        code: 'ALREADY_REMEDIATED',
        message: 'Invoice has already been remediated',
        priorReceiptId: existingByInvoice.id,
      });
    }

    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const concurrentByKey = await manager.findOne(InventoryRemediationReceipt, {
        where: {
          tenant_id: tenantId,
          idempotency_key: dto.idempotencyKey,
        },
      });
      if (concurrentByKey) {
        if (concurrentByKey.request_hash === requestHash) return concurrentByKey;
        throw new ConflictException({ code: 'IDEMPOTENCY_MISMATCH' });
      }

      const concurrentByInvoice = await manager.findOne(
        InventoryRemediationReceipt,
        {
          where: {
            tenant_id: tenantId,
            source_invoice_id: dto.invoiceId,
            command_type: 'SALE_INVENTORY_REMEDIATION',
          },
        },
      );
      if (concurrentByInvoice) {
        throw new ConflictException({
          code: 'ALREADY_REMEDIATED',
          priorReceiptId: concurrentByInvoice.id,
        });
      }

      const invoice = await manager
        .createQueryBuilder(Invoice, 'inv')
        .setLock('pessimistic_write')
        .leftJoinAndSelect('inv.items', 'items')
        .where('inv.id = :invoiceId AND inv.tenant_id = :tenantId', {
          invoiceId: dto.invoiceId,
          tenantId,
        })
        .getOne();

      if (!invoice) {
        throw new NotFoundException(`Invoice ${dto.invoiceId} not found`);
      }

      if (invoice.inventoryOutcome !== 'APPLIED_INVENTORY_PENDING') {
        throw new BadRequestException(
          `Invoice outcome is ${invoice.inventoryOutcome}, expected APPLIED_INVENTORY_PENDING`,
        );
      }

      const syncReceipt = await manager
        .createQueryBuilder(InventorySyncReceipt, 'rcpt')
        .setLock('pessimistic_write')
        .where('rcpt.tenant_id = :tenantId', { tenantId })
        .andWhere('rcpt.idempotency_key LIKE :keyPattern', {
          keyPattern: `%${invoice.id}%`,
        })
        .getOne();

      const recipeVersion = await manager
        .createQueryBuilder(RecipeVersion, 'rv')
        .where('rv.id = :recipeVersionId AND rv.tenant_id = :tenantId', {
          recipeVersionId: dto.recipeVersionId,
          tenantId,
        })
        .getOne();

      if (!recipeVersion) {
        throw new NotFoundException(
          `Recipe version ${dto.recipeVersionId} not found`,
        );
      }

      if (recipeVersion.is_active !== true) {
        throw new BadRequestException(
          `Recipe version ${dto.recipeVersionId} is not published/active`,
        );
      }

      const details = await manager.find(RecipeDetail, {
        where: {
          tenant_id: tenantId,
          recipe_version_id: dto.recipeVersionId,
        },
      });

      const receiptId = randomUUID();
      const auditEventId = randomUUID();
      const movementsResult: Array<{
        insumoId: string;
        quantity: number;
        saleCorrelationId: string;
      }> = [];

      const totalSoldUnits =
        invoice.items?.reduce(
          (sum, item) => sum + Number(item.quantity || 1),
          0,
        ) || 1;

      let ordinal = 0;
      for (const detail of details) {
        const insumo = await manager
          .createQueryBuilder(Insumo, 'ins')
          .setLock('pessimistic_write')
          .where('ins.id = :insumoId AND ins.tenant_id = :tenantId', {
            insumoId: detail.insumo_id,
            tenantId,
          })
          .getOne();

        if (!insumo) {
          throw new NotFoundException(`Insumo ${detail.insumo_id} not found`);
        }

        const deductQty = Number(detail.quantity) * totalSoldUnits;
        const previousStock = Number(insumo.stock);
        const newStock = previousStock - deductQty;

        insumo.stock = newStock;
        insumo.existenciaActual = newStock;
        await manager.save(Insumo, insumo);

        const correlationId = createHash('sha256')
          .update(
            `remediation-movement:v1|${tenantId}|${invoice.id}|${dto.recipeVersionId}|${ordinal}|${detail.insumo_id}`,
            'utf8',
          )
          .digest('hex');

        const movement = manager.create(InventoryMovement, {
          tenant_id: tenantId,
          insumoId: insumo.id,
          type: MovementType.ADJUSTMENT,
          quantity: -deductQty,
          previousStock,
          newStock,
          sourceDocumentType: 'INVENTORY_REMEDIATION',
          sourceDocumentId: `remediation:${receiptId}`,
          saleCorrelationId: correlationId,
        });

        await manager.save(InventoryMovement, movement);
        movementsResult.push({
          insumoId: insumo.id,
          quantity: -deductQty,
          saleCorrelationId: correlationId,
        });
        ordinal++;
      }

      const auditLog = manager.create(AuditLog, {
        id: auditEventId,
        tenant_id: tenantId,
        user_id: actor.userId,
        device_id: 'BACKOFFICE',
        action: 'SALE_INVENTORY_REMEDIATED',
        target_type: 'invoice',
        target_id: invoice.id,
        metadata: JSON.stringify({
          invoiceId: invoice.id,
          recipeVersionId: dto.recipeVersionId,
          remediationReceiptId: receiptId,
          actorRole: actor.role,
          reason: dto.reason,
        }),
        timestamp: new Date(),
      });
      await manager.save(AuditLog, auditLog);

      const receipt = manager.create(InventoryRemediationReceipt, {
        id: receiptId,
        tenant_id: tenantId,
        idempotency_key: dto.idempotencyKey,
        command_type: 'SALE_INVENTORY_REMEDIATION',
        request_hash: requestHash,
        source_invoice_id: invoice.id,
        source_inventory_receipt_id: syncReceipt?.id ?? invoice.id,
        recipe_version_id: dto.recipeVersionId,
        actor_user_id: actor.userId,
        actor_role: actor.role,
        reason: dto.reason,
        status: 'APPLIED',
        result: {
          status: 'APPLIED',
          remediatedMovements: movementsResult,
        },
        audit_event_id: auditEventId,
        created_at: new Date(),
        completed_at: new Date(),
      });

      return manager.save(InventoryRemediationReceipt, receipt);
    });
  }
}
