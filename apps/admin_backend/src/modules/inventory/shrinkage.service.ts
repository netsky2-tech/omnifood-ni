/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { drawBatchOutflow } from './batch-allocation';
import { todayCalendarDay } from '../../core/database/calendar-day';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { runInTenantTransaction } from '../../core/database/tenant-transaction';
import { Insumo } from './entities/insumo.entity';
import { Product } from './entities/product.entity';
import {
  InventoryMovement,
  MovementType,
} from './entities/inventory-movement.entity';
import {
  ForensicAlertService,
  shouldCreateHighValueInventoryAlert,
} from './forensic-alert.service';
import { RecipeService } from './recipe.service';
import { BomExplosionService } from './bom-explosion.service';
import {
  MERMA_REASONS,
  normalizeMermaReason,
  requireMermaObservation,
} from './merma-taxonomy';

const SCALE_4 = 4;
const round4 = (value: number): number => Number(value.toFixed(SCALE_4));

export interface RecordProductShrinkageInput {
  productId: string;
  quantity: number;
  reason: string;
  observation: string;
  recipeVersionId?: string;
}

@Injectable()
export class ShrinkageService {
  constructor(
    @InjectRepository(Insumo)
    private readonly insumoRepo: Repository<Insumo>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(InventoryMovement)
    private readonly movementRepo: Repository<InventoryMovement>,
    private readonly dataSource: DataSource,
    private readonly forensicAlertService: ForensicAlertService,
    private readonly recipeService: RecipeService,
    private readonly bomExplosionService: BomExplosionService,
  ) {}

  async recordShrinkage(
    tenantId: string,
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

    // A shrinkage IS a document, and the ledger row has to name it: the kardex
    // `source_document_id` column is NOT NULL, and both inserts here used to
    // omit it, so EVERY shrinkage failed with a NOT NULL violation — the
    // transaction rolled back and nothing was ever recorded.
    //
    // The identity is minted HERE, before the insert, so the same id names the
    // ledger row AND the forensic alert reference. Deriving the alert reference
    // from `movement.id` (as this used to) ties a document reference to a row
    // that only exists once the insert needing it has already succeeded.
    //
    // One id per shrinkage request, not per movement: the product path explodes
    // one shrinkage into several component movements and all of them belong to
    // the same document.
    const shrinkageDocumentId = randomUUID();

    // Issue #512: the insumos/products tables are tenant-protected, so the
    // whole shrinkage write runs inside a tenant-bound transaction. The bind
    // is the first statement on the manager and a blank tenant id fails
    // closed before any connection is borrowed.
    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const insumo = await manager.findOne(Insumo, {
          where: { id: insumoId } as any,
        });
        if (!insumo)
          throw new NotFoundException(`Insumo ${insumoId} not found`);

        const previousStock = Number(insumo.stock);
        const newStock = round4(previousStock - normalizedQuantity);
        const unitCostNio = round4(Number(insumo.averageCost));
        const totalCostNio = round4(normalizedQuantity * unitCostNio);

        insumo.stock = newStock;
        insumo.existenciaActual = newStock;
        const updatedInsumo = await manager.save(insumo);

        // R13: the aggregate just left; the BATCH balances have to leave with
        // it, or FEFO keeps reading a balance that is no longer real.
        await drawBatchOutflow({
          manager,
          tenantId: insumo.tenant_id,
          insumoId: insumo.id,
          quantity: normalizedQuantity,
          operationDay: todayCalendarDay(),
        });

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
          sourceDocumentId: shrinkageDocumentId,
        });
        await manager.save(movement);

        await this.createHighValueShrinkageAlertIfNeeded({
          tenantId: insumo.tenant_id,
          insumoId: insumo.id,
          insumoName: insumo.name,
          quantity: normalizedQuantity,
          totalCostNio,
          originDocumentRef: `shrinkage:${shrinkageDocumentId}`,
          manager,
        });

        return updatedInsumo;
      },
    );
  }

  async recordProductShrinkage(
    tenantId: string,
    input: RecordProductShrinkageInput,
  ): Promise<Product> {
    if (!input.productId.trim()) {
      throw new BadRequestException(
        'productId is required for product shrinkage',
      );
    }

    const canonicalReason = normalizeMermaReason(input.reason);
    if (canonicalReason == null) {
      throw new BadRequestException(
        `Invalid shrinkage type: ${input.reason}. Allowed: ${Object.values(MERMA_REASONS).join(', ')}`,
      );
    }
    const requiredObservation = requireMermaObservation(input.observation);
    const normalizedQuantity = round4(input.quantity);

    // Same document identity rule as recordShrinkage: minted before the insert,
    // shared by every component movement this shrinkage explodes into.
    const shrinkageDocumentId = randomUUID();

    // Issue #512: same tenant-bound transaction contract as recordShrinkage.
    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const product = await manager.findOne(Product, {
          where: { id: input.productId },
        });
        if (!product) {
          throw new NotFoundException(`Product ${input.productId} not found`);
        }

        const recipeVersionId =
          input.recipeVersionId ??
          (
            await this.recipeService.findActiveVersion(
              product.tenant_id,
              product.id,
            )
          )?.id;
        if (!recipeVersionId) {
          throw new BadRequestException(
            `Product ${product.id} does not have an active recipe for shrinkage explosion`,
          );
        }

        const snapshot = await this.recipeService.getSnapshot(
          recipeVersionId,
          product.tenant_id,
          product.id,
        );
        const exploded = this.bomExplosionService.explode({
          snapshotComponents: snapshot.components,
          orderQuantity: normalizedQuantity,
        });

        for (const [insumoId, explodedQuantity] of exploded.entries()) {
          const normalizedIngredientQuantity = round4(explodedQuantity);
          const insumo = await manager.findOne(Insumo, {
            where: { id: insumoId },
          });
          if (!insumo) {
            throw new NotFoundException(`Insumo ${insumoId} not found`);
          }

          const previousStock = Number(insumo.stock);
          const newStock = round4(previousStock - normalizedIngredientQuantity);
          const unitCostNio = round4(Number(insumo.averageCost));
          const totalCostNio = round4(
            normalizedIngredientQuantity * unitCostNio,
          );

          insumo.stock = newStock;
          insumo.existenciaActual = newStock;
          await manager.save(insumo);

          // Same contract per exploded component (R13).
          await drawBatchOutflow({
            manager,
            tenantId: insumo.tenant_id,
            insumoId: insumo.id,
            quantity: normalizedIngredientQuantity,
            operationDay: todayCalendarDay(),
          });

          const movement = manager.create(InventoryMovement, {
            tenant_id: insumo.tenant_id,
            insumoId: insumo.id,
            type: MovementType.SHRINKAGE,
            quantity: -normalizedIngredientQuantity,
            previousStock,
            newStock,
            averageCostAfterNio: unitCostNio,
            unitCostNio,
            totalCostNio,
            reason: canonicalReason,
            observation: requiredObservation,
            sourceDocumentType: 'SHRINKAGE',
            sourceDocumentId: shrinkageDocumentId,
          });
          await manager.save(movement);

          await this.createHighValueShrinkageAlertIfNeeded({
            tenantId: insumo.tenant_id,
            insumoId: insumo.id,
            insumoName: insumo.name,
            quantity: normalizedIngredientQuantity,
            totalCostNio,
            originDocumentRef: `product-shrinkage:${product.id}:${shrinkageDocumentId}`,
            manager,
          });
        }

        return product;
      },
    );
  }

  private async createHighValueShrinkageAlertIfNeeded(input: {
    tenantId: string;
    insumoId: string;
    insumoName: string;
    quantity: number;
    totalCostNio: number;
    originDocumentRef: string;
    manager: Parameters<ForensicAlertService['create']>[1];
  }): Promise<void> {
    if (
      !shouldCreateHighValueInventoryAlert({
        valuationNio: input.totalCostNio,
        movementType: MovementType.SHRINKAGE,
        sourceDocumentType: 'SHRINKAGE',
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
        message: `High-value shrinkage detected for ${input.insumoName}`,
        metadata: {
          movementType: MovementType.SHRINKAGE,
          sourceDocumentType: 'SHRINKAGE',
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
