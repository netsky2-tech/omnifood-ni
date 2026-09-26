import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { RecipePublicationState } from '../../inventory/entities/recipe-version.entity';

/**
 * #523 T7 — why a template recipe was skipped on apply. The only reason
 * today is the existing-tenant-recipe-is-authoritative guard; the guard's
 * behaviour is unchanged, only its silence was removed.
 */
export type TemplateRecipeSkipReason = 'VERSION_ALREADY_EXISTS';

export interface SkippedTemplateRecipe {
  productName: string;

  reason: TemplateRecipeSkipReason;

  /**
   * Real publication state of the version that already exists for the
   * product (DRAFT vs PUBLISHED vs ARCHIVED), so the operator knows whether
   * the skipped recipe is awaiting review or already live.
   */
  existingState: RecipePublicationState;
}

export class ApplyTemplateDto {
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @IsInt()
  templateVersion?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedItemIds?: string[];

  @IsOptional()
  @IsObject()
  productPriceOverrides?: Record<string, number>;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsBoolean()
  overrideExisting?: boolean;

  @IsOptional()
  @IsString()
  prefixSku?: string;
}

export interface TemplateSummaryResponse {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  insumoCount: number;
  productCount: number;
}

export interface ApplyTemplateResult {
  tenantId: string;
  templateCode: string;
  templateVersion?: number;
  applicationId?: string;
  insumosCreated: number;
  insumosSkipped: number;
  productsCreated: number;
  productsSkipped: number;
  recipesCreated: number;
  /**
   * #523 T5 — operator-facing signal (neutral Spanish, usted) that the
   * created recipes are PENDING SUGGESTIONS requiring human review. UI copy
   * only: it never enters invoices, snapshots, or any reasonCode.
   */
  recipesPendingReviewMessage: string;
  /**
   * #523 T7 — per skipped recipe: product name, the fact a version already
   * existed, and its real state. Empty when nothing was skipped.
   */
  recipesSkipped: SkippedTemplateRecipe[];
}
