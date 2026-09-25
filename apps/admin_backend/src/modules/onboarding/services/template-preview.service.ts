import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as crypto from 'crypto';
import {
  runInTenantTransaction,
  resolveTenantContextId,
} from '../../../core/database/tenant-transaction';
import { IndustryTemplate } from '../entities/industry-template.entity';
import {
  TemplateSeedLink,
  TemplateTargetEntityType,
} from '../entities/template-seed-link.entity';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { Product } from '../../inventory/entities/product.entity';

export type TemplateDiffStatus =
  | 'NEW'
  | 'EXISTING_LINKED'
  | 'EXISTING_UNLINKED'
  | 'CONFLICT'
  | 'UNSUPPORTED';

export interface TemplateItemDiff {
  itemId: string;
  itemType: 'PRODUCT' | 'INGREDIENT' | 'RECIPE';
  displayName: string;
  templateCode: string;
  templateVersion: number;
  sourceFingerprint: string;
  diffStatus: TemplateDiffStatus;
  proposedEffect: string;
  suggestedValues: Record<string, any>;
  existingEntityId?: string;
  selected: boolean;
}

export interface TemplatePreviewSummary {
  totalItems: number;
  newCount: number;
  existingLinkedCount: number;
  existingUnlinkedCount: number;
  conflictCount: number;
  unsupportedCount: number;
}

export interface TemplatePreviewResult {
  templateCode: string;
  templateVersion: number;
  templateName: string;
  templateFingerprint: string;
  items: TemplateItemDiff[];
  summary: TemplatePreviewSummary;
}

export interface TemplatePreviewOptions {
  selectedItemIds?: string[];
}

@Injectable()
export class TemplatePreviewService {
  constructor(
    @InjectRepository(IndustryTemplate)
    private readonly templateRepo: Repository<IndustryTemplate>,
    @InjectRepository(TemplateSeedLink)
    private readonly seedLinkRepo: Repository<TemplateSeedLink>,
    @InjectRepository(Insumo)
    private readonly insumoRepo: Repository<Insumo>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly dataSource: DataSource,
  ) {}

  public computeFingerprint(payload: Record<string, any>): string {
    const raw = JSON.stringify(payload);
    return crypto
      .createHash('sha256')
      .update(raw)
      .digest('hex')
      .substring(0, 32);
  }

  async buildPreview(
    tenantId: string,
    templateCode: string,
    options?: TemplatePreviewOptions,
  ): Promise<TemplatePreviewResult> {
    // Fail closed on a blank tenant before even the global template lookup:
    // the same TenantContextRequiredError contract as the other bound paths.
    // runInTenantTransaction re-resolves (cheaply) before opening the
    // tenant-bound transaction.
    const trimmedTenant = resolveTenantContextId(tenantId);

    const trimmedCode = templateCode?.trim();
    if (!trimmedCode) {
      throw new BadRequestException('Template code must not be empty');
    }

    const template = await this.templateRepo.findOne({
      where: [{ code: trimmedCode }, { id: trimmedCode }],
      relations: [
        'templateInsumos',
        'templateProducts',
        'templateProducts.recipeItems',
      ],
    });

    if (!template) {
      throw new NotFoundException(
        `Industry template '${trimmedCode}' not found`,
      );
    }

    const version = template.version ?? 1;

    // Every tenant-bearing read below is RLS-protected (the seed-link table
    // is FORCED by 1809230000000; insumos/products carry tenant rows), so
    // they must share ONE transaction whose tenant context is bound before
    // the first protected access. Manager-scoped repositories keep the whole
    // read transaction-consistent; the pooled repositories are never used
    // for tenant-bearing data.
    const { existingLinks, insumoByName, productByName } =
      await runInTenantTransaction(
        this.dataSource,
        trimmedTenant,
        async (manager) => {
          const seedLinkRepo = manager.getRepository(TemplateSeedLink);
          const insumoRepo = manager.getRepository(Insumo);
          const productRepo = manager.getRepository(Product);

          // Load existing seed links for this tenant & template
          const links = await seedLinkRepo.find({
            where: {
              tenant_id: trimmedTenant,
              template_code: template.code,
            },
          });

          // Load existing entities for name-matching fallback
          // (EXISTING_UNLINKED)
          const existingInsumos = await insumoRepo.find({
            where: { tenant_id: trimmedTenant },
          });
          const insumoByName = new Map<string, Insumo>();
          for (const ins of existingInsumos) {
            insumoByName.set(ins.name.trim().toLowerCase(), ins);
          }

          const existingProducts = await productRepo.find({
            where: { tenant_id: trimmedTenant },
          });
          const productByName = new Map<string, Product>();
          for (const prod of existingProducts) {
            productByName.set(prod.name.trim().toLowerCase(), prod);
          }

          return { existingLinks: links, insumoByName, productByName };
        },
      );

    const linkMap = new Map<string, TemplateSeedLink>();
    for (const link of existingLinks) {
      linkMap.set(`${link.source_item_id}:${link.target_entity_type}`, link);
    }

    const items: TemplateItemDiff[] = [];
    const selectedSet = options?.selectedItemIds
      ? new Set(options.selectedItemIds)
      : null;

    // 1. Process Insumos
    if (template.templateInsumos) {
      for (const tIns of template.templateInsumos) {
        const fp = this.computeFingerprint({
          templateCode: template.code,
          version,
          type: 'INGREDIENT',
          name: tIns.name.trim(),
          purchaseUom: tIns.purchase_uom,
          consumptionUom: tIns.consumption_uom,
          conversionFactor: tIns.conversion_factor,
        });

        const linkKey = `${tIns.id}:${TemplateTargetEntityType.INSUMO}`;
        const existingLink = linkMap.get(linkKey);

        let diffStatus: TemplateDiffStatus = 'NEW';
        let proposedEffect = 'CREATE_INSUMO';
        let existingEntityId: string | undefined;

        if (existingLink) {
          diffStatus = 'EXISTING_LINKED';
          proposedEffect = 'NO_OP';
          existingEntityId = existingLink.target_entity_id;
        } else {
          const matchByName = insumoByName.get(tIns.name.trim().toLowerCase());
          if (matchByName) {
            diffStatus = 'EXISTING_UNLINKED';
            proposedEffect = 'LINK_EXISTING';
            existingEntityId = matchByName.id;
          }
        }

        const isSelected = selectedSet ? selectedSet.has(tIns.id) : true;

        items.push({
          itemId: tIns.id,
          itemType: 'INGREDIENT',
          displayName: tIns.name.trim(),
          templateCode: template.code,
          templateVersion: version,
          sourceFingerprint: fp,
          diffStatus,
          proposedEffect,
          suggestedValues: {
            purchaseUom: tIns.purchase_uom,
            consumptionUom: tIns.consumption_uom,
            conversionFactor: tIns.conversion_factor,
            parLevel: tIns.par_level,
            minStock: tIns.min_stock,
            isPerishable: tIns.is_perishable,
            negativeStockPolicy: tIns.negative_stock_policy,
          },
          existingEntityId,
          selected: isSelected,
        });
      }
    }

    // 2. Process Products
    if (template.templateProducts) {
      for (const tProd of template.templateProducts) {
        const recipeItemsSummary = (tProd.recipeItems || []).map((r) => ({
          insumoName: r.template_insumo_name,
          grossQuantity: r.gross_quantity,
          shrinkPct: r.technical_shrink_pct,
          uom: r.component_uom,
        }));

        const fp = this.computeFingerprint({
          templateCode: template.code,
          version,
          type: 'PRODUCT',
          name: tProd.name.trim(),
          category: tProd.category,
          uom: tProd.uom,
          suggestedPrice: tProd.suggested_price,
          recipeItems: recipeItemsSummary,
        });

        const linkKey = `${tProd.id}:${TemplateTargetEntityType.PRODUCT}`;
        const existingLink = linkMap.get(linkKey);

        let diffStatus: TemplateDiffStatus = 'NEW';
        let proposedEffect = 'CREATE_PRODUCT';
        let existingEntityId: string | undefined;

        if (existingLink) {
          diffStatus = 'EXISTING_LINKED';
          proposedEffect = 'NO_OP';
          existingEntityId = existingLink.target_entity_id;
        } else {
          const matchByName = productByName.get(
            tProd.name.trim().toLowerCase(),
          );
          if (matchByName) {
            diffStatus = 'EXISTING_UNLINKED';
            proposedEffect = 'LINK_EXISTING';
            existingEntityId = matchByName.id;
          }
        }

        const isSelected = selectedSet ? selectedSet.has(tProd.id) : true;

        items.push({
          itemId: tProd.id,
          itemType: 'PRODUCT',
          displayName: tProd.name.trim(),
          templateCode: template.code,
          templateVersion: version,
          sourceFingerprint: fp,
          diffStatus,
          proposedEffect,
          suggestedValues: {
            category: tProd.category,
            uom: tProd.uom,
            suggestedPrice: tProd.suggested_price,
            isPerishable: tProd.is_perishable,
            hasRecipe: (tProd.recipeItems || []).length > 0,
            recipeItems: recipeItemsSummary,
          },
          existingEntityId,
          selected: isSelected,
        });
      }
    }

    const summary: TemplatePreviewSummary = {
      totalItems: items.length,
      newCount: items.filter((i) => i.diffStatus === 'NEW').length,
      existingLinkedCount: items.filter(
        (i) => i.diffStatus === 'EXISTING_LINKED',
      ).length,
      existingUnlinkedCount: items.filter(
        (i) => i.diffStatus === 'EXISTING_UNLINKED',
      ).length,
      conflictCount: items.filter((i) => i.diffStatus === 'CONFLICT').length,
      unsupportedCount: items.filter((i) => i.diffStatus === 'UNSUPPORTED')
        .length,
    };

    return {
      templateCode: template.code,
      templateVersion: version,
      templateName: template.name,
      templateFingerprint:
        template.source_fingerprint ??
        this.computeFingerprint({ code: template.code, version }),
      items,
      summary,
    };
  }
}
