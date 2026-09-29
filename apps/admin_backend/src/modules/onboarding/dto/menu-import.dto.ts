import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Transport shape shared by the preview and commit handlers.
 *
 * There is no multer in this project and no server-side staging storage for
 * the menu import: the owner dashboard reads the .xlsx in the browser and
 * posts it as a base64 JSON body. The tenant always comes from
 * `GetTenantId` (human session), never from the body.
 */
export class MenuImportRequestDto {
  /** Full .xlsx workbook, base64-encoded (one worksheet per menu category). */
  @IsString()
  @IsNotEmpty()
  fileBase64: string;
}

/** Sheet name plus the Excel row number where an import problem was found. */
export interface MenuImportRowIssue {
  sheet: string;
  row: number;
  message: string;
}

/**
 * A missing insumo the import will CREATE (never blocks). `review: true` is
 * stable UI copy: the owner should revisit cost/PAR for these rows later —
 * they are created with stock 0 and averageCost 0.
 */
export interface MenuImportInsumoToCreate {
  name: string;
  purchaseUom: string;
  consumptionUom: string;
  review: true;
}

/**
 * Why a product's recipe was not created. Mirrors the
 * `SkippedTemplateRecipe` semantics of the industry-template apply flow.
 */
export interface MenuImportRecipeSkipped {
  productName: string;
  reason: 'VERSION_ALREADY_EXISTS';
  existingState: string;
}

/**
 * Result contract shared by POST /onboarding/menu-import/preview and
 * POST /onboarding/menu-import/commit.
 *
 * Shape note (deliberate): the scalar fields are counts, while
 * `insumosToCreate`, `recipesSkipped`, `errors` and `warnings` are arrays —
 * the owner must review created insumos and skipped recipes, not just see a
 * number. Commit re-parses the same payload and fails closed on any error,
 * so a successful commit reports what it actually wrote.
 */
export interface MenuImportSummary {
  /** Worksheets processed (one per menu category). */
  categories: number;
  productsToCreate: number;
  productsToUpdate: number;
  recipesToCreate: number;
  recipesSkipped: MenuImportRecipeSkipped[];
  insumosToCreate: MenuImportInsumoToCreate[];
  errors: MenuImportRowIssue[];
  warnings: MenuImportRowIssue[];
}
