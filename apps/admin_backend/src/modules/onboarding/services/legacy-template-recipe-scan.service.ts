import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RecipeOrigin,
  RecipePublicationState,
  RecipeSuggestionState,
  RecipeVersion,
} from '../../inventory/entities/recipe-version.entity';
import {
  LegacyMigrationDecision,
  LegacyOnboardingMigrationReceipt,
} from '../entities/legacy-migration-receipt.entity';
import { OnboardingSession } from '../entities/onboarding-session.entity';
import { InvoiceItem } from '../../sales/entities/invoice-item.entity';
import { IndustryTemplate } from '../entities/industry-template.entity';

export interface ScanOptions {
  userDecision?: {
    recipeVersionId: string;
    decision: LegacyMigrationDecision;
    reason: string;
    userId?: string;
  };
}

export interface LegacyScanReceiptItem {
  recipeVersionId: string;
  productName: string;
  decision: LegacyMigrationDecision;
  reason: string;
  receiptId?: string;
}

export interface LegacyScanReport {
  tenantId: string;
  scannedCount: number;
  migratedToDraftCount: number;
  keptPublishedCount: number;
  unknownProvenanceCount: number;
  receipts: LegacyScanReceiptItem[];
}

@Injectable()
export class LegacyTemplateRecipeScanService {
  constructor(
    @InjectRepository(RecipeVersion)
    private readonly recipeVersionRepo: Repository<RecipeVersion>,
    @InjectRepository(LegacyOnboardingMigrationReceipt)
    private readonly receiptRepo: Repository<LegacyOnboardingMigrationReceipt>,
    @InjectRepository(OnboardingSession)
    private readonly sessionRepo: Repository<OnboardingSession>,
    @InjectRepository(InvoiceItem)
    private readonly invoiceItemRepo: Repository<InvoiceItem>,
    @InjectRepository(IndustryTemplate)
    private readonly templateRepo: Repository<IndustryTemplate>,
  ) {}

  async scanAndRemediate(
    tenantId: string,
    options?: ScanOptions,
  ): Promise<LegacyScanReport> {
    const trimmedTenant = tenantId?.trim();
    if (!trimmedTenant) {
      throw new BadRequestException('Tenant ID is required');
    }

    // 1. Find all active recipe versions for this tenant
    const activeVersions = await this.recipeVersionRepo.find({
      where: {
        tenant_id: trimmedTenant,
        is_active: true,
      },
    });

    // 2. Check if tenant is operational
    const session = await this.sessionRepo.findOne({
      where: { tenantId: trimmedTenant },
    });
    const isOperational = Boolean(
      session?.activatedAt || session?.firstSuccessfulSaleAt,
    );

    // 3. Load global templates to match known template product names
    const templates = await this.templateRepo.find({
      relations: ['templateProducts'],
    });
    const templateProductNames = new Set<string>();
    for (const t of templates) {
      for (const p of t.templateProducts ?? []) {
        templateProductNames.add(p.name.trim().toLowerCase());
      }
    }

    const receipts: LegacyScanReceiptItem[] = [];
    let migratedToDraftCount = 0;
    let keptPublishedCount = 0;
    let unknownProvenanceCount = 0;

    for (const rv of activeVersions) {
      const productName = rv.product_name || 'Unknown Product';
      const hasTemplateProvenance =
        rv.origin === RecipeOrigin.INDUSTRY_TEMPLATE ||
        templateProductNames.has(productName.trim().toLowerCase());

      let decision: LegacyMigrationDecision;
      let reason: string;

      if (!hasTemplateProvenance) {
        decision = LegacyMigrationDecision.UNKNOWN_PROVENANCE;
        reason =
          'Provenance cannot be reliably attributed to an industry template; retained without mutation for manual review.';
        unknownProvenanceCount++;
      } else {
        // Check historical sales/usage
        const usageCount = await this.invoiceItemRepo.count({
          where: [{ recipeVersionId: rv.id }, { productId: rv.product_id }],
        });
        const hasUsage = usageCount > 0 || isOperational;

        if (
          options?.userDecision &&
          options.userDecision.recipeVersionId === rv.id
        ) {
          decision = options.userDecision.decision;
          reason = options.userDecision.reason;

          if (decision === LegacyMigrationDecision.MOVE_TO_DRAFT) {
            rv.is_active = false;
            rv.publication_state = RecipePublicationState.DRAFT;
            rv.suggestion_state = RecipeSuggestionState.SUGGESTED;
            await this.recipeVersionRepo.save(rv);
            migratedToDraftCount++;
          } else {
            keptPublishedCount++;
          }
        } else if (hasUsage) {
          // SAFETY GUARD: NEVER MUTATE SILENTLY
          decision = LegacyMigrationDecision.KEEP_PUBLISHED;
          reason =
            'Recipe is in active operational use or tenant is operational; retained as PUBLISHED to prevent operational disruption without explicit owner command.';
          keptPublishedCount++;
        } else {
          // Unused template recipe on non-operational tenant: safe auto migration to DRAFT
          decision = LegacyMigrationDecision.MOVE_TO_DRAFT;
          reason =
            'Non-operational tenant with unused template recipe version safely migrated to DRAFT.';
          rv.is_active = false;
          rv.publication_state = RecipePublicationState.DRAFT;
          rv.suggestion_state = RecipeSuggestionState.SUGGESTED;
          await this.recipeVersionRepo.save(rv);
          migratedToDraftCount++;
        }
      }

      const receipt = this.receiptRepo.create({
        tenant_id: trimmedTenant,
        receipt_type: 'LEGACY_TEMPLATE_RECIPE_SCAN',
        target_entity_type: 'RECIPE_VERSION',
        target_entity_id: rv.id,
        decision,
        reason,
        evidence_json: {
          productName,
          origin: rv.origin,
          hasTemplateProvenance,
          isOperational,
        },
        executed_by: options?.userDecision?.userId || 'SYSTEM_SCAN',
      });

      const savedReceipt = await this.receiptRepo.save(receipt);

      receipts.push({
        recipeVersionId: rv.id,
        productName,
        decision,
        reason,
        receiptId: savedReceipt.id,
      });
    }

    return {
      tenantId: trimmedTenant,
      scannedCount: activeVersions.length,
      migratedToDraftCount,
      keptPublishedCount,
      unknownProvenanceCount,
      receipts,
    };
  }
}
