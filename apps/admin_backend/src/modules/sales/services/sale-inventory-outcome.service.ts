import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { EntityManager } from 'typeorm';
import { SyncInvoiceDto, CreateInvoiceItemDto, InventorySnapshotBindingDto } from '../dto/sync-invoice.dto';
import { SyncBatchRecordDto } from '../dto/sync-batch.dto';
import { ProductInventoryMappingVersion } from '../../inventory/entities/product-inventory-mapping-version.entity';
import { RecipeVersion, RecipePublicationState } from '../../inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../inventory/entities/recipe-detail.entity';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { Product, ProductType } from '../../inventory/entities/product.entity';
import {
  BomExplosionService,
  hasSubRecipeComponent,
} from '../../inventory/bom-explosion.service';
import {
  resolveDeviations,
  type DeviationInsumo,
  type DeviationLeaf,
} from '../../inventory/modifier-deviation-resolver';

export interface ValidatedBindingToApply {
  item: CreateInvoiceItemDto;
  binding: InventorySnapshotBindingDto;
  explodedQuantity: number;
}

export interface SaleTimeSnapshotValidationResult {
  policyVersion: 'SALE_TIME_V1' | 'LEGACY_SYNC_TIME_V1';
  outcome: 'APPLIED' | 'APPLIED_NO_INVENTORY_IMPACT' | 'APPLIED_INVENTORY_PENDING';
  reason: { code: string; lines: string[] } | null;
  acknowledgedMovementCorrelationIds: string[];
  bindingsToApply: ValidatedBindingToApply[];
}

@Injectable()
export class SaleInventoryOutcomeService {
  constructor(
    private readonly bomExplosionService: BomExplosionService,
  ) {}

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
    // R28 / M4: the lines whose DECLARED deviation does not match the
    // demand the cloud recomputed.
    const deviationMismatchLines: string[] = [];
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

          // R28 / M4: the cloud RECOMPUTES the demand the line should have
          // and COMPARES it with the one the terminal sent. The terminal is
          // the authority of the demand, but it is not taken on faith: a
          // terminal that declares a deviation and applies it differently
          // is caught here, and the line degrades to APPLIED_INVENTORY_PENDING
          // (fail-closed, like the negative-stock guard).
          //
          // Only what the terminal DECLARED is verified: a terminal whose
          // catalogue predates the effect sends no deviation, and there is
          // nothing to compare — it is not punished (the SOHO guarantee:
          // this feature degrades the inventory, never the sale).
          const declaredDeviations = (item.modifiers ?? []).filter(
            (modifier) =>
              modifier.inventoryEffect &&
              modifier.inventoryEffect !== 'NONE',
          );
          if (declaredDeviations.length > 0) {
            const deviationMismatch = await this.verifyDeclaredDeviations({
              tenantId,
              item,
              recipeVersionId: snapshot.recipeVersionId,
              rootProductId: item.productId,
              details,
              bindings,
              manager,
            });
            if (deviationMismatch) {
              deviationMismatchLines.push(item.id);
            }
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
    } else if (deviationMismatchLines.length > 0) {
      // R28 / M4: the terminal declared a deviation and the demand it sent
      // is not the one the cloud recomputed. The line is NOT applied (the
      // movements wait), the fiscal document is persisted and the stream
      // sequence advances — the same atomic degradation the negative-stock
      // guard uses, so one bad line never wedges the pipeline.
      calculatedOutcome = 'APPLIED_INVENTORY_PENDING';
      calculatedReason = {
        code: 'RECIPE_DEVIATION_MISMATCH',
        lines: deviationMismatchLines,
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

  /**
   * First-acceptance legacy classifier for sales payloads per Section D3.
   * Resolves R3-002 deterministic component sorting and R3-003 frozen acceptedAt.
   */
  async classifyLegacySyncTime(tenantId: string, record: SyncBatchRecordDto, manager: EntityManager, acceptedAt: Date = new Date()): Promise<SaleTimeSnapshotValidationResult | null> {
    const invoice = record.invoice;
    if (!invoice?.items?.length) return { policyVersion: 'LEGACY_SYNC_TIME_V1', outcome: 'APPLIED_NO_INVENTORY_IMPACT', reason: null, acknowledgedMovementCorrelationIds: [], bindingsToApply: [] };
    if (invoice.items.some((it) => it.inventorySnapshotVersion && it.inventorySnapshotVersion !== 'LEGACY_SYNC_TIME_V1')) throw new BadRequestException('Mixed legacy and SALE_TIME_V1 snapshots are rejected');
    const mappingRepo = manager.getRepository?.(ProductInventoryMappingVersion), insumoRepo = manager.getRepository?.(Insumo), productRepo = manager.getRepository?.(Product), recipeVerRepo = manager.getRepository?.(RecipeVersion), recipeDetailRepo = manager.getRepository?.(RecipeDetail);
    if (!mappingRepo && !productRepo) return null;

    const pendingLines: string[] = [], noImpactLines: string[] = [], bindingsToApply: ValidatedBindingToApply[] = [], allCorrelationIds: string[] = [];
    const isCancel = record.documentType === 'SALE_CANCEL', acceptedAtIso = acceptedAt.toISOString();

    for (const item of invoice.items) {
      const corrId = (idx: number, insumo: string) => createHash('sha256').update(`sale-movement:v1|${tenantId}|${record.sourceDeviceId}|${invoice.id}|${item.id}|${idx}|${insumo}|${isCancel ? 'SALE_CANCEL' : 'SALE'}`).digest('hex');

      const mapping = mappingRepo?.createQueryBuilder ? await mappingRepo.createQueryBuilder('m')
        .where('m.tenant_id = :tenantId AND m.product_id = :productId AND m.effective_at <= :acceptedAt AND (m.superseded_at IS NULL OR m.superseded_at > :acceptedAt)', { tenantId, productId: item.productId, acceptedAt })
        .orderBy('m.effective_at', 'DESC').getOne() : null;

      if (mapping) {
        if (!(await insumoRepo?.findOne({ where: { id: mapping.insumo_id, tenant_id: tenantId } }))) throw new BadRequestException(`insumoId '${mapping.insumo_id}' from mapping version '${mapping.id}' not found or does not belong to tenant '${tenantId}'`);
        const cId = corrId(0, mapping.insumo_id), binding: InventorySnapshotBindingDto = { bindingOrdinal: 0, insumoId: mapping.insumo_id, quantityPerSaleUnit: 1, saleCorrelationId: cId };
        item.inventorySnapshotVersion = 'LEGACY_SYNC_TIME_V1';
        item.inventorySnapshot = { classification: 'SIMPLE', disposition: 'DIRECT', catalogRevision: 'legacy-sync-time', mappingVersionId: mapping.id, acceptedAt: acceptedAtIso, bindings: [binding] };
        bindingsToApply.push({ item, binding, explodedQuantity: Math.abs(Number(item.quantity)) });
        allCorrelationIds.push(cId);
        continue;
      }

      if (!productRepo || typeof productRepo.findOne !== 'function') return null;
      const product = await productRepo.findOne({ where: { id: item.productId, tenant_id: tenantId } });
      if (!product) throw new BadRequestException(`Product '${item.productId}' not found for tenant '${tenantId}'`);

      if (product.product_type === ProductType.SIMPLE) {
        item.inventorySnapshotVersion = 'LEGACY_SYNC_TIME_V1';
        item.inventorySnapshot = { classification: 'SIMPLE', disposition: 'NO_IMPACT', reasonCode: 'NO_EXPLICIT_INSUMO_MAPPING', catalogRevision: 'legacy-sync-time', acceptedAt: acceptedAtIso, bindings: [] };
        noImpactLines.push(item.id);
        continue;
      }

      if (product.product_type === ProductType.PREPARED || product.product_type === ProductType.COMPOUND) {
        const recipeVer = recipeVerRepo?.createQueryBuilder ? await recipeVerRepo.createQueryBuilder('rv')
          .where('rv.tenant_id = :tenantId AND rv.product_id = :productId AND rv.publication_state = :pubState AND (rv.fecha_inicio_vigencia IS NULL OR rv.fecha_inicio_vigencia <= :acceptedAt) AND (rv.fecha_fin_vigencia IS NULL OR rv.fecha_fin_vigencia > :acceptedAt)', { tenantId, productId: item.productId, pubState: RecipePublicationState.PUBLISHED, acceptedAt })
          .orderBy('rv.fecha_inicio_vigencia', 'DESC', 'NULLS LAST').addOrderBy('rv.version_number', 'DESC').getOne() : null;

        if (recipeVer) {
          const details = ((await recipeDetailRepo?.find({ where: { recipe_version_id: recipeVer.id, tenant_id: tenantId } })) ?? []).sort((a, b) => a.insumo_id.localeCompare(b.insumo_id) || (a.id ?? '').localeCompare(b.id ?? ''));
          const itemBindings: InventorySnapshotBindingDto[] = [];

          // R11 (S7): a SUB_RECIPE component names a PRODUCT, not an insumo, so
          // the flat per-detail loop rejected the whole sale with "insumoId …
          // not found". When the recipe has a sub-recipe, descend to the leaf
          // insumos exactly like the legacy explode() path does after R4.
          if (hasSubRecipeComponent(details)) {
            const leafQuantities =
              await this.bomExplosionService.explodeWithSubRecipes({
                rootProductId: item.productId,
                orderQuantity: 1,
                rootComponents: details,
                resolveSubRecipeComponents: (subRecipeProductId) =>
                  this.resolveActiveRecipeComponents(
                    manager,
                    tenantId,
                    subRecipeProductId,
                    acceptedAt,
                  ),
              });
            const rootComponentByInsumo = new Map(
              details.map((detail) => [detail.insumo_id, detail.id] as const),
            );
            let ordinal = 0;
            for (const [
              insumoId,
              quantityPerSaleUnit,
            ] of leafQuantities.entries()) {
              if (
                !(await insumoRepo?.findOne({
                  where: { id: insumoId, tenant_id: tenantId },
                }))
              ) {
                throw new BadRequestException(
                  `insumoId '${insumoId}' in recipe '${recipeVer.id}' not found for tenant '${tenantId}'`,
                );
              }
              const cId = corrId(ordinal, insumoId);
              const binding: InventorySnapshotBindingDto = {
                bindingOrdinal: ordinal,
                insumoId,
                recipeComponentId: rootComponentByInsumo.get(insumoId),
                quantityPerSaleUnit,
                saleCorrelationId: cId,
              };
              itemBindings.push(binding);
              allCorrelationIds.push(cId);
              bindingsToApply.push({
                item,
                binding,
                explodedQuantity: Number(
                  (
                    Math.abs(Number(item.quantity)) * quantityPerSaleUnit
                  ).toFixed(4),
                ),
              });
              ordinal += 1;
            }
          } else {
            for (let i = 0; i < details.length; i++) {
              const d = details[i];
              if (!(await insumoRepo?.findOne({ where: { id: d.insumo_id, tenant_id: tenantId } }))) throw new BadRequestException(`insumoId '${d.insumo_id}' in recipe '${recipeVer.id}' not found for tenant '${tenantId}'`);
              const cId = corrId(i, d.insumo_id), qty = Number(d.quantity), b: InventorySnapshotBindingDto = { bindingOrdinal: i, insumoId: d.insumo_id, recipeComponentId: d.id, quantityPerSaleUnit: qty, saleCorrelationId: cId };
              itemBindings.push(b); allCorrelationIds.push(cId);
              bindingsToApply.push({ item, binding: b, explodedQuantity: Number((Math.abs(Number(item.quantity)) * qty).toFixed(4)) });
            }
          }
          item.inventorySnapshotVersion = 'LEGACY_SYNC_TIME_V1';
          item.inventorySnapshot = { classification: product.product_type, disposition: 'RECIPE', catalogRevision: 'legacy-sync-time', recipeVersionId: recipeVer.id, acceptedAt: acceptedAtIso, bindings: itemBindings };
          continue;
        }

        item.inventorySnapshotVersion = 'LEGACY_SYNC_TIME_V1';
        item.inventorySnapshot = { classification: product.product_type, disposition: 'PENDING_RECIPE', reasonCode: 'MISSING_PUBLISHED_RECIPE', catalogRevision: 'legacy-sync-time', acceptedAt: acceptedAtIso, bindings: [] };
        pendingLines.push(item.id);
        continue;
      }
      throw new BadRequestException(`Unsupported or missing product type '${product.product_type}' for product '${item.productId}'`);
    }

    const outcome = pendingLines.length > 0 ? 'APPLIED_INVENTORY_PENDING' : bindingsToApply.length > 0 ? 'APPLIED' : 'APPLIED_NO_INVENTORY_IMPACT';
    const reason = pendingLines.length > 0 ? { code: 'MISSING_PUBLISHED_RECIPE', lines: pendingLines } : outcome === 'APPLIED_NO_INVENTORY_IMPACT' ? { code: 'NO_EXPLICIT_INSUMO_MAPPING', lines: noImpactLines } : null;
    if (invoice.inventoryOutcome && invoice.inventoryOutcome !== outcome) throw new BadRequestException(`Snapshot outcome mismatch: client sent '${invoice.inventoryOutcome}', calculated '${outcome}'`);

    return { policyVersion: 'LEGACY_SYNC_TIME_V1', outcome, reason, acknowledgedMovementCorrelationIds: outcome === 'APPLIED' ? allCorrelationIds : [], bindingsToApply: outcome === 'APPLIED' ? bindingsToApply : [] };
  }

  /**
   * R11 (S7): the active PUBLISHED recipe's components for a sub-recipe
   * product, resolved inside the same tenant-bound manager the classification
   * already uses. A missing active recipe is a DATA error, named instead of
   * silently dropping the sub-recipe's ingredients.
   */
  /**
   * R28 / M4 — the cloud recomputes the demand of a line that DECLARED a
   * deviation and compares it with the demand the terminal sent.
   *
   * The recomputation uses the SAME algorithm as the terminal (the mirror in
   * `modifier-deviation-resolver.ts`), so the two demands are comparable:
   * the recipe's explosion plus the declared effects, with the same
   * inheritance and the same skip reasons.
   *
   * Returns TRUE when the line does NOT match, which degrades the sale to
   * APPLIED_INVENTORY_PENDING (fail-closed, like the negative-stock guard).
   *
   * What it deliberately does NOT do: verify anything the terminal did not
   * declare. A terminal whose catalogue predates the effect sends no
   * deviation and there is nothing to compare — it is not punished, because
   * the SOHO guarantee (D6) says this feature degrades the inventory, never
   * the sale.
   */
  private async verifyDeclaredDeviations(input: {
    tenantId: string;
    item: CreateInvoiceItemDto;
    recipeVersionId: string;
    rootProductId: string;
    details: RecipeDetail[];
    bindings: InventorySnapshotBindingDto[];
    manager: EntityManager;
  }): Promise<boolean> {
    const {
      tenantId,
      item,
      recipeVersionId,
      rootProductId,
      details,
      bindings,
      manager,
    } = input;

    const declared = (item.modifiers ?? []).filter(
      (modifier) => modifier.inventoryEffect && modifier.inventoryEffect !== 'NONE',
    );
    if (declared.length === 0) return false;

    // 1. The recipe's own consumption (per sold unit), with the root
    //    component that introduced each leaf — the same attribution the
    //    terminal's explosion produces.
    const rootComponentByInsumo = new Map<string, string>();
    for (const detail of details) {
      if (detail.ingredient_type === 'INSUMO') {
        rootComponentByInsumo.set(detail.insumo_id, detail.id);
      }
    }
    const rootComponents = details
      .filter((detail) => detail.ingredient_type === 'INSUMO')
      .map((detail) => ({
        id: detail.id,
        insumoId: detail.insumo_id,
        quantityPerSaleUnit: Number(detail.quantity),
      }));

    const leafQuantities = await this.bomExplosionService.explodeWithSubRecipes({
      rootProductId,
      orderQuantity: 1,
      rootComponents: details,
      resolveSubRecipeComponents: (subRecipeProductId) =>
        this.resolveActiveRecipeComponents(
          manager,
          tenantId,
          subRecipeProductId,
          new Date(),
        ),
    });
    const leaves: DeviationLeaf[] = [...leafQuantities.entries()].map(
      ([insumoId, quantityPerSaleUnit]) => ({
        insumoId,
        quantityPerSaleUnit: Number(quantityPerSaleUnit),
        rootComponentId: rootComponentByInsumo.get(insumoId) ?? null,
      }),
    );

    // 2. The tenant's insumos the effects reference. An effect that names an
    //    insumo the company has NOT registered is NO_IMPACT on both sides
    //    (the SOHO guarantee), so the cloud must know it too.
    const referencedInsumoIds = new Set<string>();
    for (const modifier of declared) {
      if (modifier.effectInsumoId) referencedInsumoIds.add(modifier.effectInsumoId);
      if (modifier.effectTargetInsumoId) {
        referencedInsumoIds.add(modifier.effectTargetInsumoId);
      }
    }
    for (const detail of details) {
      if (detail.ingredient_type === 'INSUMO') {
        referencedInsumoIds.add(detail.insumo_id);
      }
    }
    const insumoRepo = manager.getRepository(Insumo);
    // ONLY the ACTIVE insumos: the terminal's authority projects the
    // catalog's active rows, so an effect that points at a DEACTIVATED
    // insumo is NO_IMPACT on both sides. If the cloud considered it
    // applicable, the two demands would disagree and every such sale would
    // degrade — the opposite of the SOHO guarantee.
    const tenantInsumos = await insumoRepo.find({
      where: { tenant_id: tenantId, is_active: true },
    });
    const tenantInsumosById = new Map<string, DeviationInsumo>(
      tenantInsumos.map((insumo) => [
        insumo.id,
        {
          id: insumo.id,
          consumptionUom: insumo.consumptionUom ?? '',
          isActive: true,
        },
      ]),
    );

    // 3. The demand the cloud expects, and the demand the terminal sent.
    const expected = resolveDeviations({
      leaves,
      rootComponents,
      modifiers: declared,
      tenantInsumosById,
    });
    const sent = new Map<string, number>();
    for (const binding of bindings) {
      sent.set(
        binding.insumoId,
        Number(
          (
            (sent.get(binding.insumoId) ?? 0) +
            Number(binding.quantityPerSaleUnit)
          ).toFixed(4),
        ),
      );
    }

    // 4. Compare. The tolerance absorbs the four-decimal rounding of the
    //    two sides; anything beyond it is a real divergence.
    const TOLERANCE = 0.0001;
    const insumoIds = new Set<string>([
      ...expected.demand.keys(),
      ...sent.keys(),
    ]);
    for (const insumoId of insumoIds) {
      const expectedQty = expected.demand.get(insumoId) ?? 0;
      const sentQty = sent.get(insumoId) ?? 0;
      if (Math.abs(expectedQty - sentQty) > TOLERANCE) {
        return true;
      }
    }
    return false;
  }

  private async resolveActiveRecipeComponents(
    manager: EntityManager,
    tenantId: string,
    productId: string,
    acceptedAt: Date,
  ): Promise<RecipeDetail[]> {
    const recipeVerRepo = manager.getRepository?.(RecipeVersion);
    const recipeDetailRepo = manager.getRepository?.(RecipeDetail);
    if (!recipeVerRepo?.createQueryBuilder || !recipeDetailRepo) {
      return [];
    }

    const version = await recipeVerRepo
      .createQueryBuilder('rv')
      .where(
        'rv.tenant_id = :tenantId AND rv.product_id = :productId AND rv.publication_state = :pubState AND (rv.fecha_inicio_vigencia IS NULL OR rv.fecha_inicio_vigencia <= :acceptedAt) AND (rv.fecha_fin_vigencia IS NULL OR rv.fecha_fin_vigencia > :acceptedAt)',
        {
          tenantId,
          productId,
          pubState: RecipePublicationState.PUBLISHED,
          acceptedAt,
        },
      )
      .orderBy('rv.fecha_inicio_vigencia', 'DESC', 'NULLS LAST')
      .addOrderBy('rv.version_number', 'DESC')
      .getOne();

    if (!version) {
      throw new BadRequestException(
        `Sub-recipe product ${productId} does not have an active published recipe`,
      );
    }

    const details =
      (await recipeDetailRepo.find({
        where: { recipe_version_id: version.id, tenant_id: tenantId },
      })) ?? [];

    return [...details].sort(
      (a, b) =>
        a.insumo_id.localeCompare(b.insumo_id) ||
        (a.id ?? '').localeCompare(b.id ?? ''),
    );
  }
}
