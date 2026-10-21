import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import { BomExplosionService } from '../../inventory/bom-explosion.service';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { Product } from '../../inventory/entities/product.entity';
import { RecipeDetail } from '../../inventory/entities/recipe-detail.entity';
import { RecipeVersion } from '../../inventory/entities/recipe-version.entity';
import { CatalogValue } from '../../catalog/entities/catalog-value.entity';
import { CATALOG_TYPE } from '../../catalog/catalog-type';
import {
  resolveDeviations,
  type DeviationInsumo,
  type DeviationLeaf,
  type DeviationRootComponent,
  type DeviationSkipReason,
} from '../../inventory/modifier-deviation-resolver';
import { ModifierGroup } from '../entities/modifier-group.entity';
import { ModifierOption } from '../entities/modifier-option.entity';
import { CategoryModifierGroup } from '../entities/category-modifier-group.entity';
import { ProductModifierGroup } from '../entities/product-modifier-group.entity';
import { Invoice } from '../../sales/entities/invoice.entity';
import { InvoiceItem } from '../../sales/entities/invoice-item.entity';
import { InvoiceItemModifier } from '../../sales/entities/invoice-item-modifier.entity';

/**
 * Why an option's inventory effect cannot be applied for a product.
 *
 * The reasons are the RESOLVER's own skip reasons, verbatim: the cloud and
 * the terminal share the mirror (`modifier-deviation-resolver.ts`) and the
 * conformance contract (`fixtures/modifier-deviation/v1/vectors.json`), so
 * this list says the same thing the terminal would say at the moment of the
 * sale.
 */
export type PendingConfigurationReason =
  | DeviationSkipReason
  | 'PRODUCT_WITHOUT_RECIPE'
  | 'NO_CONFIGURED_QUANTITY';

/** One product where the option's effect cannot be applied. */
export interface PendingModifierProduct {
  product_id: string;
  product_name: string;
  reason: PendingConfigurationReason;
}

/** One option whose inventory effect cannot be applied as it stands. */
export interface PendingModifierConfiguration {
  option_id: string;
  option_name: string;
  group_id: string;
  group_name: string;
  inventory_effect: string;
  effect_insumo_id: string | null;
  effect_target_insumo_id: string | null;
  /** The products that use the option and where the effect does not apply. */
  products: PendingModifierProduct[];
}

/**
 * ONE SOLD LINE whose inventory effect never touched the stock.
 *
 * ME-04: the configuration list above says what the tenant still OWES;
 * this one says what already HAPPENED — a sale that went through without
 * the inventory movement it announced. It is the half of the reconciliation
 * that only the cloud can answer, because the line is what carries the
 * truth.
 */
export interface PendingModifierEffectLine {
  invoice_id: string;
  /** The fiscal number of the sale, when the line has one. */
  invoice_number: string | null;
  /** When the sale happened (ISO 8601). */
  sold_at: string;
  product_id: string;
  product_name: string;
  /** The option the line carries; null for a legacy line. */
  option_id: string | null;
  option_name: string;
  /** Why the effect did not apply (the resolver's own vocabulary). */
  reason: string;
  /** The quantity the line sold. */
  quantity: number;
}

/**
 * The sold lines with a pending effect, plus the honest completeness
 * signal of the page.
 */
export interface PendingModifierEffectReport {
  lines: PendingModifierEffectLine[];
  /** True when more matching lines exist beyond this page. */
  truncated: boolean;
  /** Page size actually applied. */
  limit: number;
}

/**
 * The options whose inventory effect CANNOT be applied as they stand.
 *
 * WHY THIS EXISTS (owner's decision, 2026-10-20): the amount an extra takes
 * out of the stock is CONFIGURATION, and the configuration lives in the
 * backoffice. The terminal never asks the cashier for a number. So somebody
 * has to be able to see which options are missing that configuration — and
 * that somebody is the owner, in the backoffice, not the cashier, at the
 * till.
 *
 * WHY IT USES THE RESOLVER (and not a second guess): the verdict comes from
 * the SAME function the cloud uses to recompute a sale's demand
 * (`resolveDeviations`), fed with the product's published recipe. A separate
 * heuristic would be a second truth, and the two would drift: the list would
 * promise an effect that the terminal never applies.
 *
 * The rule: an option with an inventory effect and NO configured quantity is
 * resolvable only if the product's recipe provides the target component in a
 * compatible unit (it is then INHERITED). Everything else is pending, with
 * the reason the terminal itself would give.
 */
@Injectable()
export class ModifierPendingConfigurationService {
  /** Page size for the sold pending-effect list. */
  static readonly DEFAULT_PENDING_EFFECTS_LIMIT = 50;
  static readonly MAX_PENDING_EFFECTS_LIMIT = 100;

  constructor(
    private readonly dataSource: DataSource,
    private readonly bomExplosionService: BomExplosionService,
  ) {}

  async findPendingConfiguration(
    tenantId: string,
  ): Promise<PendingModifierConfiguration[]> {
    return runInTenantTransaction(this.dataSource, tenantId, (manager) =>
      this.findPendingIn(manager, tenantId),
    );
  }

  /**
   * The SOLD lines whose inventory effect never touched the stock.
   *
   * WHY IT IS A SEPARATE READ: the configuration list says what the tenant
   * still owes; this says what already happened. A sale whose effect was
   * pending is a REAL sale with a MISSING inventory movement, and it is the
   * only thing that can be reconciled against the stock.
   *
   * It reads the same append-only line the terminal wrote (the truth of
   * the effect travels with the line, ME-04) — never a recomputation: the
   * cloud must not decide today what a sale resolved yesterday.
   */
  async findPendingEffects(
    tenantId: string,
    limitInput?: number,
  ): Promise<PendingModifierEffectReport> {
    const limit =
      limitInput === undefined || limitInput === null
        ? ModifierPendingConfigurationService.DEFAULT_PENDING_EFFECTS_LIMIT
        : Math.min(
            Math.trunc(limitInput),
            ModifierPendingConfigurationService.MAX_PENDING_EFFECTS_LIMIT,
          );

    return runInTenantTransaction(this.dataSource, tenantId, async (manager) => {
      // The read is EXPLICIT (a projection, not an entity hydration): the
      // line's truth travels with the sale, and the owner reads the sale it
      // belongs to. The tenant is reached through the invoice: the modifier
      // table carries no tenant column of its own (the line hangs off the
      // item, and the item off the invoice), so the INVOICE's tenant is the
      // isolation boundary, inside the tenant-bound transaction.
      const rows = await manager
        .getRepository(InvoiceItemModifier)
        .createQueryBuilder('modifier')
        .innerJoin(InvoiceItem, 'item', 'item.id = modifier.invoice_item_id')
        .innerJoin(Invoice, 'invoice', 'invoice.id = item.invoice_id')
        .where('invoice.tenant_id = :tenantId', { tenantId })
        .andWhere("modifier.effect_status = 'PENDING'")
        .select([
          'modifier.id AS modifier_id',
          'modifier.name AS modifier_name',
          'modifier.option_id AS option_id',
          'modifier.effect_skip_reason AS effect_skip_reason',
          'modifier.quantity AS modifier_quantity',
          'item.product_id AS product_id',
          'item.product_name AS product_name',
          'invoice.id AS invoice_id',
          'invoice.invoice_number AS invoice_number',
          'invoice.created_at AS invoice_created_at',
        ])
        .orderBy('invoice.created_at', 'DESC')
        .addOrderBy('modifier.id', 'DESC')
        // One probe row beyond the cap so `truncated` is provable.
        .take(limit + 1)
        .getRawMany();

      // One probe row beyond the cap: `truncated` is provable, and the
      // page never claims completeness it does not have.
      const truncated = rows.length > limit;
      const page = truncated ? rows.slice(0, limit) : rows;

      const lines: PendingModifierEffectLine[] = page.map((row) => {
        const soldAt = row['invoice_created_at'];
        return {
          invoice_id: String(row['invoice_id'] ?? ''),
          invoice_number: row['invoice_number']
            ? String(row['invoice_number'])
            : null,
          sold_at:
            soldAt instanceof Date
              ? soldAt.toISOString()
              : new Date(String(soldAt ?? 0)).toISOString(),
          product_id: String(row['product_id'] ?? ''),
          product_name: String(row['product_name'] ?? row['modifier_name'] ?? ''),
          option_id: row['option_id'] ? String(row['option_id']) : null,
          option_name: String(row['modifier_name'] ?? ''),
          reason: String(row['effect_skip_reason'] ?? 'INCOMPLETE'),
          quantity: Number(row['modifier_quantity'] ?? 1),
        };
      });

      return { lines, truncated, limit };
    });
  }

  private async findPendingIn(
    manager: EntityManager,
    tenantId: string,
  ): Promise<PendingModifierConfiguration[]> {
    // 1. The options that DECLARE an effect and have NO configured
    //    quantity: the ones whose amount only the recipe can provide.
    const options = await manager
      .getRepository(ModifierOption)
      .createQueryBuilder('option')
      .where('option.tenant_id = :tenantId', { tenantId })
      .andWhere('option.is_active = true')
      .andWhere("option.inventory_effect <> 'NONE'")
      .andWhere('option.effect_quantity IS NULL')
      .orderBy('option.name', 'ASC')
      .getMany();
    if (options.length === 0) return [];

    const groupIds = [...new Set(options.map((option) => option.group_id))];
    const groups = await manager
      .getRepository(ModifierGroup)
      .find({ where: { tenant_id: tenantId, id: In(groupIds) } });
    const groupById = new Map(groups.map((group) => [group.id, group]));

    // 2. The products that use those groups: the explicit attachments plus
    //    the products of the categories the group is attached to.
    const productAttachments = await manager
      .getRepository(ProductModifierGroup)
      .find({ where: { tenant_id: tenantId, group_id: In(groupIds) } });
    const categoryAttachments = await manager
      .getRepository(CategoryModifierGroup)
      .find({ where: { tenant_id: tenantId, group_id: In(groupIds) } });

    const productIdsByGroup = new Map<string, Set<string>>();
    const addProduct = (groupId: string, productId: string) => {
      const set = productIdsByGroup.get(groupId) ?? new Set<string>();
      set.add(productId);
      productIdsByGroup.set(groupId, set);
    };
    for (const attachment of productAttachments) {
      addProduct(attachment.group_id, attachment.product_id);
    }

    if (categoryAttachments.length > 0) {
      const catalogValueIds = [
        ...new Set(categoryAttachments.map((a) => a.catalog_value_id)),
      ];
      const catalogValues = await manager.getRepository(CatalogValue).find({
        where: { tenant_id: tenantId, id: In(catalogValueIds) },
      });
      const codeByCatalogValueId = new Map(
        catalogValues.map((value) => [value.id, value.code]),
      );
      const codes = [
        ...new Set(
          catalogValues
            .map((value) => value.code)
            .filter((code): code is string => Boolean(code)),
        ),
      ];
      if (codes.length > 0) {
        const products = await manager.getRepository(Product).find({
          where: { tenant_id: tenantId, category_code: In(codes) },
        });
        for (const attachment of categoryAttachments) {
          const code = codeByCatalogValueId.get(attachment.catalog_value_id);
          if (!code) continue;
          for (const product of products) {
            if (product.category_code !== code) continue;
            addProduct(attachment.group_id, product.id);
          }
        }
      }
    }

    // 3. The tenant's ACTIVE insumos: the effect of a deactivated insumo
    //    does not apply (the SOHO guarantee), on both sides.
    const tenantInsumos = await manager.getRepository(Insumo).find({
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

    // 4. The verdict, option by option.
    const pending: PendingModifierConfiguration[] = [];
    for (const option of options) {
      const group = groupById.get(option.group_id);
      if (!group) continue;
      const productIds = [...(productIdsByGroup.get(option.group_id) ?? [])];
      const products: PendingModifierProduct[] = [];
      for (const productId of productIds) {
        const product = await manager.getRepository(Product).findOne({
          where: { id: productId, tenant_id: tenantId },
        });
        if (!product) continue;
        const reason = await this.reasonFor(
          manager,
          tenantId,
          product,
          option,
          tenantInsumosById,
        );
        if (reason) {
          products.push({
            product_id: product.id,
            product_name: product.name,
            reason,
          });
        }
      }
      if (products.length > 0) {
        pending.push({
          option_id: option.id,
          option_name: option.name,
          group_id: group.id,
          group_name: group.name,
          inventory_effect: option.inventory_effect,
          effect_insumo_id: option.effect_insumo_id ?? null,
          effect_target_insumo_id: option.effect_target_insumo_id ?? null,
          products,
        });
      }
    }
    return pending;
  }

  /**
   * Why the option's effect does not apply for this product — or null when
   * it DOES apply (the recipe provides the quantity).
   */
  private async reasonFor(
    manager: EntityManager,
    tenantId: string,
    product: Product,
    option: ModifierOption,
    tenantInsumosById: Map<string, DeviationInsumo>,
  ): Promise<PendingConfigurationReason | null> {
    const version = await this.activePublishedVersion(
      manager,
      tenantId,
      product.id,
    );
    if (!version) return 'PRODUCT_WITHOUT_RECIPE';

    const details = (
      await manager.getRepository(RecipeDetail).find({
        where: { tenant_id: tenantId, recipe_version_id: version.id },
      })
    ).sort(
      (a, b) =>
        a.insumo_id.localeCompare(b.insumo_id) ||
        (a.id ?? '').localeCompare(b.id ?? ''),
    );
    if (details.length === 0) return 'PRODUCT_WITHOUT_RECIPE';

    const rootComponentByInsumo = new Map<string, string>();
    for (const detail of details) {
      if (detail.ingredient_type === 'INSUMO') {
        rootComponentByInsumo.set(detail.insumo_id, detail.id);
      }
    }
    const rootComponents: DeviationRootComponent[] = details
      .filter((detail) => detail.ingredient_type === 'INSUMO')
      .map((detail) => ({
        id: detail.id,
        insumoId: detail.insumo_id,
        quantityPerSaleUnit: Number(detail.quantity),
      }));

    const leafQuantities = await this.bomExplosionService.explodeWithSubRecipes({
      rootProductId: product.id,
      orderQuantity: 1,
      rootComponents: details,
      resolveSubRecipeComponents: (subRecipeProductId) =>
        this.subRecipeComponents(manager, tenantId, subRecipeProductId),
    });
    const leaves: DeviationLeaf[] = [...leafQuantities.entries()].map(
      ([insumoId, quantityPerSaleUnit]) => ({
        insumoId,
        quantityPerSaleUnit: Number(quantityPerSaleUnit),
        rootComponentId: rootComponentByInsumo.get(insumoId) ?? null,
      }),
    );

    const resolution = resolveDeviations({
      leaves,
      rootComponents,
      modifiers: [
        {
          name: option.name,
          extraPrice: 0,
          quantity: 1,
          inventoryEffect: option.inventory_effect,
          effectInsumoId: option.effect_insumo_id ?? null,
          effectTargetInsumoId: option.effect_target_insumo_id ?? null,
          effectQuantity: option.effect_quantity ?? null,
          effectFactor: option.effect_factor ?? null,
        },
      ],
      tenantInsumosById,
    });
    const outcome = resolution.outcomes[0];
    if (!outcome) return 'NO_CONFIGURED_QUANTITY';
    return outcome.skipReason ?? null;
  }

  /** The product's active PUBLISHED recipe version, if it has one. */
  private async activePublishedVersion(
    manager: EntityManager,
    tenantId: string,
    productId: string,
  ): Promise<RecipeVersion | null> {
    return manager
      .getRepository(RecipeVersion)
      .createQueryBuilder('rv')
      .where('rv.tenant_id = :tenantId', { tenantId })
      .andWhere('rv.product_id = :productId', { productId })
      .andWhere('rv.is_active = true')
      .andWhere('rv.publication_state = :state', { state: 'PUBLISHED' })
      .orderBy('rv.version_number', 'DESC')
      .getOne();
  }

  /** The components of a sub-recipe product, for the explosion. */
  private async subRecipeComponents(
    manager: EntityManager,
    tenantId: string,
    productId: string,
  ): Promise<RecipeDetail[]> {
    const version = await this.activePublishedVersion(
      manager,
      tenantId,
      productId,
    );
    if (!version) return [];
    return manager.getRepository(RecipeDetail).find({
      where: { tenant_id: tenantId, recipe_version_id: version.id },
    });
  }
}
