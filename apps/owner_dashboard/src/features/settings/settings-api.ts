import { api, ApiError, getAccessToken } from "@/lib/api";
import { getApiBaseUrl } from "@/lib/api-base-url";
import {
  MAX_IMPORT_CHUNK_SIZE,
  type FiscalSetupFormValues,
  type FiscalSetupResponse,
  type IndustryTemplate,
  type ApplyTemplateDto,
  type ApplyTemplateResult,
  type UploadBatchDto,
  type UploadSummaryResponse,
  type CommitImportDto,
  type CommitSummaryResponse,
  type RowErrorDiagnostic,
  type ImportRowDto,
  type ImportProgressState,
} from "./types";

// --- Fiscal Setup Endpoints ---

export async function fetchFiscalSetup(
  options?: { signal?: AbortSignal },
): Promise<FiscalSetupResponse> {
  return api.get<FiscalSetupResponse>("/onboarding/fiscal-setup", options);
}

export async function updateFiscalSetup(
  payload: FiscalSetupFormValues,
): Promise<FiscalSetupResponse> {
  return api.post<FiscalSetupResponse>("/onboarding/fiscal-setup", payload);
}

// --- Industry Templates Endpoints ---

export async function fetchIndustryTemplates(): Promise<IndustryTemplate[]> {
  return api.get<IndustryTemplate[]>("/onboarding/templates");
}

export async function getIndustryTemplate(code: string): Promise<IndustryTemplate> {
  return api.get<IndustryTemplate>(`/onboarding/templates/${encodeURIComponent(code)}`);
}

export async function applyIndustryTemplate(
  code: string,
  dto?: ApplyTemplateDto,
): Promise<ApplyTemplateResult> {
  return api.post<ApplyTemplateResult>(
    `/onboarding/templates/${encodeURIComponent(code)}/apply`,
    dto ?? {},
  );
}

// --- Bulk Import & Staging Endpoints ---

export async function uploadImportBatch(
  dto: UploadBatchDto,
): Promise<UploadSummaryResponse> {
  return api.post<UploadSummaryResponse>("/onboarding/import/upload", dto);
}

export async function commitImport(
  dto: CommitImportDto,
): Promise<CommitSummaryResponse> {
  return api.post<CommitSummaryResponse>("/onboarding/import/commit", dto);
}

export async function fetchImportErrors(
  sessionToken: string,
): Promise<{ sessionToken: string; count: number; errors: RowErrorDiagnostic[] }> {
  return api.get<{ sessionToken: string; count: number; errors: RowErrorDiagnostic[] }>(
    `/onboarding/import/errors/${encodeURIComponent(sessionToken)}`,
  );
}

// --- Menu Import from Excel (template / preview / commit) ---

/** GET endpoint that streams the ready-to-fill .xlsx template. */
export const MENU_IMPORT_TEMPLATE_PATH = "/onboarding/menu-import/template";

/** Download filename served by the template endpoint. */
export const MENU_IMPORT_TEMPLATE_FILENAME = "plantilla_menu.xlsx";

/**
 * Client-side size guard for the uploaded workbook.
 * The server caps the base64 payload at 5 MiB of characters (`MAX_BASE64_LENGTH`
 * in `apps/admin_backend/src/modules/onboarding/services/menu-import.service.ts`),
 * which is only ~3.75 MiB of binary. 3.5 MiB binary encodes to ~4.67 MiB base64,
 * safely under that ceiling.
 */
export const MENU_IMPORT_MAX_FILE_BYTES = 3.5 * 1024 * 1024;

/** Sheet + Excel row where an import problem was found. */
export interface MenuImportRowIssue {
  sheet: string;
  row: number;
  message: string;
}

/** A missing insumo the import will CREATE (never blocks; review cost/PAR). */
export interface MenuImportInsumoToCreate {
  name: string;
  purchaseUom: string;
  consumptionUom: string;
  review: true;
}

/** Why a product's recipe was not created. */
export interface MenuImportRecipeSkipped {
  productName: string;
  reason: "VERSION_ALREADY_EXISTS";
  existingState: string;
}

/** Result contract shared by the menu-import preview and commit endpoints. */
export interface MenuImportSummary {
  categories: number;
  productsToCreate: number;
  productsToUpdate: number;
  recipesToCreate: number;
  recipesSkipped: MenuImportRecipeSkipped[];
  insumosToCreate: MenuImportInsumoToCreate[];
  errors: MenuImportRowIssue[];
  warnings: MenuImportRowIssue[];
}

/**
 * Downloads the .xlsx template as a Blob for a browser-side save.
 * Implemented outside `api` because the response is binary, not JSON.
 */
export async function downloadMenuImportTemplate(): Promise<Blob> {
  const token = getAccessToken();
  const response = await fetch(`${getApiBaseUrl()}${MENU_IMPORT_TEMPLATE_PATH}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    throw new ApiError(`API error: ${response.status}`, {
      status: response.status,
      responseBody: null,
      requestId: null,
    });
  }
  return response.blob();
}

export async function previewMenuImport(fileBase64: string): Promise<MenuImportSummary> {
  return api.post<MenuImportSummary>("/onboarding/menu-import/preview", {
    fileBase64,
  });
}

export async function commitMenuImport(fileBase64: string): Promise<MenuImportSummary> {
  return api.post<MenuImportSummary>("/onboarding/menu-import/commit", {
    fileBase64,
  });
}

// --- ODAV-32: Chunked Upload Helper ---

export interface ChunkedUploadOptions {
  chunkSize?: number;
  sessionToken?: string;
  onProgress?: (progress: ImportProgressState) => void;
}

/**
 * Uploads a large dataset in chunks strictly adhering to the ODAV-32 rule:
 * chunk size <= 100 rows per chunk. Reuses sessionToken across chunks.
 */
export async function uploadLargeDatasetInChunks(
  rows: ImportRowDto[],
  options: ChunkedUploadOptions = {},
): Promise<UploadSummaryResponse> {
  if (!rows || rows.length === 0) {
    return {
      sessionToken: options.sessionToken ?? "",
      totalRows: 0,
      validRows: 0,
      errorRows: 0,
      errors: [],
    };
  }

  // ODAV-32 Invariant: Chunk size must be <= 100
  const effectiveChunkSize = Math.min(
    Math.max(1, options.chunkSize ?? MAX_IMPORT_CHUNK_SIZE),
    MAX_IMPORT_CHUNK_SIZE,
  );

  const totalRows = rows.length;
  const totalChunks = Math.ceil(totalRows / effectiveChunkSize);
  let sessionToken = options.sessionToken;
  const allErrors: RowErrorDiagnostic[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const chunkStart = i * effectiveChunkSize;
    const chunkEnd = Math.min(chunkStart + effectiveChunkSize, totalRows);
    const chunkRows = rows.slice(chunkStart, chunkEnd);

    const chunkSummary = await uploadImportBatch({
      sessionToken,
      rows: chunkRows,
    });

    sessionToken = chunkSummary.sessionToken;

    if (chunkSummary.errors && chunkSummary.errors.length > 0) {
      allErrors.push(...chunkSummary.errors);
    }

    if (options.onProgress) {
      options.onProgress({
        chunkIndex: i + 1,
        totalChunks,
        percent: Math.round(((i + 1) / totalChunks) * 100),
        uploadedRows: chunkEnd,
        totalRows,
      });
    }
  }

  const totalErrorCount = allErrors.length;
  const totalValidCount = Math.max(0, totalRows - totalErrorCount);

  return {
    sessionToken: sessionToken ?? "",
    totalRows,
    validRows: totalValidCount,
    errorRows: totalErrorCount,
    errors: allErrors,
  };
}
