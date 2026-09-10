import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { SyncInvoiceDto, CreateInvoiceItemDto, InventorySnapshotBindingDto } from '../dto/sync-invoice.dto';
import { ProductInventoryMappingVersion } from '../../inventory/entities/product-inventory-mapping-version.entity';
import { RecipeVersion, RecipePublicationState } from '../../inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../inventory/entities/recipe-detail.entity';
import { Insumo } from '../../inventory/entities/insumo.entity';

export interface ValidatedBindingToApply {
  item: CreateInvoiceItemDto;
  binding: InventorySnapshotBindingDto;
  explodedQuantity: number;
}

export interface SaleTimeSnapshotValidationResult {
  policyVersion: 'SALE_TIME_V1';
  outcome: 'APPLIED' | 'APPLIED_NO_INVENTORY_IMPACT' | 'APPLIED_INVENTORY_PENDING';
  reason: { code: string; lines: string[] } | null;
  acknowledgedMovementCorrelationIds: string[];
  bindingsToApply: ValidatedBindingToApply[];
}

@Injectable()
export class SaleInventoryOutcomeService {
  /**
   * Validates SALE_TIME_V1 snapshot contracts per design Section D3.
   * Never queries current active catalog or mutable recipe at ingestion time.
   * Returns null if this invoice does not use SALE_TIME_V1 snapshots (legacy path).
   */
  async validateSaleTimeSnapshot(
    tenantId: string,
    invoice: SyncInvoiceDto,
    manager: EntityManager,
  ): Promise<SaleTimeSnapshotValidationResult | null> {
    const items = invoice.items ?? [];
    if (items.length === 0) return null;

    const v1Count = items.filter(
      (item) => item.inventorySnapshotVersion === 'SALE_TIME_V1',
    ).length;

    if (v1Count === 0) {
      return null;
    }

    if (v1Count !== items.length) {
      throw new BadRequestException(
        'Mixed legacy and SALE_TIME_V1 snapshots are rejected',
      );
    }

    const seenCorrelationIds = new Set<string>();
    const pendingLines: string[] = [];
    const noImpactLines: string[] = [];
    const bindingsToApply: ValidatedBindingToApply[] = [];
    const allCorrelationIds: string[] = [];

    for (const item of items) {
      const snapshot = item.inventorySnapshot;
      if (!snapshot) {
        throw new BadRequestException(
          `Item ${item.id} specified SALE_TIME_V1 but omitted inventorySnapshot`,
        );
      }

      if (!['SIMPLE', 'PREPARED', 'COMPOUND'].includes(snapshot.classification)) {
        throw new BadRequestException(
          `Invalid snapshot classification ${snapshot.classification} on item ${item.id}`,
        );
      }

      if (
        !['DIRECT', 'RECIPE', 'NO_IMPACT', 'PENDING_RECIPE'].includes(
          snapshot.disposition,
        )
      ) {
        throw new BadRequestException(
          `Invalid snapshot disposition ${snapshot.disposition} on item ${item.id}`,
        );
      }

      if (!snapshot.catalogRevision || typeof snapshot.catalogRevision !== 'string') {
        throw new BadRequestException(
          `Missing or invalid catalogRevision on item ${item.id}`,
        );
      }

      const bindings = snapshot.bindings ?? [];

      // Validate correlation ID uniqueness and bindings arithmetic
      for (const b of bindings) {
        if (!b.saleCorrelationId || typeof b.saleCorrelationId !== 'string') {
          throw new BadRequestException(
            `Missing saleCorrelationId on binding for item ${item.id}`,
          );
        }
        if (seenCorrelationIds.has(b.saleCorrelationId)) {
          throw new BadRequestException(
            `Duplicate saleCorrelationId '${b.saleCorrelationId}' across invoice bindings`,
          );
        }
        seenCorrelationIds.add(b.saleCorrelationId);

        if (typeof b.quantityPerSaleUnit !== 'number' || b.quantityPerSaleUnit <= 0) {
          throw new BadRequestException(
            `Invalid quantityPerSaleUnit ${b.quantityPerSaleUnit} on item ${item.id}`,
          );
        }

        // Verify insumo exists and belongs to this tenant
        const insumoRepo = manager.getRepository(Insumo);
        const insumo = await insumoRepo.findOne({
          where: { id: b.insumoId, tenant_id: tenantId },
        });
        if (!insumo) {
          throw new BadRequestException(
            `insumoId '${b.insumoId}' not found or does not belong to tenant '${tenantId}'`,
          );
        }
      }

      switch (snapshot.disposition) {
        case 'DIRECT': {
          if (snapshot.classification !== 'SIMPLE') {
            throw new BadRequestException(
              `Item ${item.id} has DIRECT disposition but classification is not SIMPLE`,
            );
          }
          if (!snapshot.mappingVersionId) {
            throw new BadRequestException(
              `Item ${item.id} has DIRECT disposition but missing mappingVersionId`,
            );
          }
          if (bindings.length !== 1) {
            throw new BadRequestException(
              `Item ${item.id} with DIRECT disposition must have exactly 1 binding, got ${bindings.length}`,
            );
          }

          // Verify mappingVersionId in DB against tenant, product and insumo
          const mappingRepo = manager.getRepository(ProductInventoryMappingVersion);
          const mapping = await mappingRepo.findOne({
            where: {
              id: snapshot.mappingVersionId,
              tenant_id: tenantId,
              product_id: item.productId,
              insumo_id: bindings[0].insumoId,
            },
          });
          if (!mapping) {
            throw new BadRequestException(
              `Invalid or cross-tenant mappingVersionId '${snapshot.mappingVersionId}' for product '${item.productId}'`,
            );
          }

          const lineQty = Math.abs(Number(item.quantity));
          const explodedQty = Number(
            (lineQty * bindings[0].quantityPerSaleUnit).toFixed(4),
          );
          bindingsToApply.push({
            item,
            binding: bindings[0],
            explodedQuantity: explodedQty,
          });
          allCorrelationIds.push(bindings[0].saleCorrelationId);
          break;
        }

        case 'RECIPE': {
          if (!['PREPARED', 'COMPOUND'].includes(snapshot.classification)) {
            throw new BadRequestException(
              `Item ${item.id} has RECIPE disposition but classification is not PREPARED/COMPOUND`,
            );
          }
          if (!snapshot.recipeVersionId) {
            throw new BadRequestException(
              `Item ${item.id} has RECIPE disposition but missing recipeVersionId`,
            );
          }

          // Verify recipe version is published, tenant-owned, and bound to product
          const recipeVerRepo = manager.getRepository(RecipeVersion);
          const recipeVer = await recipeVerRepo.findOne({
            where: {
              id: snapshot.recipeVersionId,
              tenant_id: tenantId,
              product_id: item.productId,
              publication_state: RecipePublicationState.PUBLISHED,
            },
          });
          if (!recipeVer) {
            throw new BadRequestException(
              `Invalid, unpublished, or cross-tenant recipeVersionId '${snapshot.recipeVersionId}' for product '${item.productId}'`,
            );
          }

          // Verify components in recipe_details
          const detailRepo = manager.getRepository(RecipeDetail);
          const details = await detailRepo.find({
            where: {
              recipe_version_id: snapshot.recipeVersionId,
              tenant_id: tenantId,
            },
          });

          for (const b of bindings) {
            if (b.recipeComponentId) {
              const matchingDetail = details.find(
                (d) =>
                  d.id === b.recipeComponentId &&
                  d.insumo_id === b.insumoId,
              );
              if (!matchingDetail) {
                throw new BadRequestException(
                  `recipeComponentId '${b.recipeComponentId}' not found or does not match insumo '${b.insumoId}'`,
                );
              }
            }

            const lineQty = Math.abs(Number(item.quantity));
            const explodedQty = Number(
              (lineQty * b.quantityPerSaleUnit).toFixed(4),
            );
            bindingsToApply.push({
              item,
              binding: b,
              explodedQuantity: explodedQty,
            });
            allCorrelationIds.push(b.saleCorrelationId);
          }
          break;
        }

        case 'NO_IMPACT': {
          if (snapshot.classification !== 'SIMPLE') {
            throw new BadRequestException(
              `Item ${item.id} has NO_IMPACT disposition but classification is not SIMPLE`,
            );
          }
          if (snapshot.reasonCode !== 'NO_EXPLICIT_INSUMO_MAPPING') {
            throw new BadRequestException(
              `Item ${item.id} has NO_IMPACT disposition but invalid reasonCode '${snapshot.reasonCode}'`,
            );
          }
          if (bindings.length > 0) {
            throw new BadRequestException(
              `Item ${item.id} has NO_IMPACT disposition but contains bindings`,
            );
          }
          noImpactLines.push(item.id);
          break;
        }

        case 'PENDING_RECIPE': {
          if (!['PREPARED', 'COMPOUND'].includes(snapshot.classification)) {
            throw new BadRequestException(
              `Item ${item.id} has PENDING_RECIPE disposition but classification is not PREPARED/COMPOUND`,
            );
          }
          if (snapshot.reasonCode !== 'MISSING_PUBLISHED_RECIPE') {
            throw new BadRequestException(
              `Item ${item.id} has PENDING_RECIPE disposition but invalid reasonCode '${snapshot.reasonCode}'`,
            );
          }
          if (bindings.length > 0) {
            throw new BadRequestException(
              `Item ${item.id} has PENDING_RECIPE disposition but contains bindings`,
            );
          }
          pendingLines.push(item.id);
          break;
        }
      }
    }

    // Determine atomic outcome
    let calculatedOutcome: 'APPLIED' | 'APPLIED_NO_INVENTORY_IMPACT' | 'APPLIED_INVENTORY_PENDING';
    let calculatedReason: { code: string; lines: string[] } | null = null;
    let finalBindings: ValidatedBindingToApply[] = [];
    let finalAckIds: string[] = [];

    if (pendingLines.length > 0) {
      calculatedOutcome = 'APPLIED_INVENTORY_PENDING';
      calculatedReason = {
        code: 'MISSING_PUBLISHED_RECIPE',
        lines: pendingLines,
      };
      finalBindings = [];
      finalAckIds = [];
    } else if (bindingsToApply.length > 0) {
      calculatedOutcome = 'APPLIED';
      calculatedReason = null;
      finalBindings = bindingsToApply;
      finalAckIds = allCorrelationIds;
    } else {
      calculatedOutcome = 'APPLIED_NO_INVENTORY_IMPACT';
      calculatedReason = {
        code: 'NO_EXPLICIT_INSUMO_MAPPING',
        lines: noImpactLines,
      };
      finalBindings = [];
      finalAckIds = [];
    }

    // Snapshot outcome mismatch check
    if (invoice.inventoryOutcome && invoice.inventoryOutcome !== calculatedOutcome) {
      throw new BadRequestException(
        `Snapshot outcome mismatch: client sent '${invoice.inventoryOutcome}', calculated '${calculatedOutcome}'`,
      );
    }

    return {
      policyVersion: 'SALE_TIME_V1',
      outcome: calculatedOutcome,
      reason: calculatedReason,
      acknowledgedMovementCorrelationIds: finalAckIds,
      bindingsToApply: finalBindings,
    };
  }
}
