import { z } from "zod";

// --- Fiscal Setup ---

export const FiscalRegime = {
  CUOTA_FIJA: "CUOTA_FIJA",
  REGIMEN_GENERAL: "REGIMEN_GENERAL",
} as const;

export type FiscalRegime = (typeof FiscalRegime)[keyof typeof FiscalRegime];

export const fiscalSetupSchema = z.object({
  regime: z.enum([FiscalRegime.CUOTA_FIJA, FiscalRegime.REGIMEN_GENERAL], {
    errorMap: () => ({ message: "El régimen debe ser CUOTA_FIJA o REGIMEN_GENERAL" }),
  }),
  businessName: z
    .string()
    .trim()
    .min(1, "El nombre comercial es obligatorio"),
  ruc: z
    .string()
    .trim()
    .optional()
    .or(z.literal("")),
  commercialFxSpread: z
    .number({ invalid_type_error: "El spread cambiario debe ser un número" })
    .min(0, "El spread cambiario debe ser mayor o igual a 0"),
  pricesIncludeTax: z.boolean(),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
});

export type FiscalSetupFormValues = z.infer<typeof fiscalSetupSchema>;

export interface FiscalSetupResponse {
  tenantId: string;
  businessName: string;
  ruc: string | null;
  regime: FiscalRegime;
  taxRateIva: number;
  pricesIncludeTax: boolean;
  commercialFxSpread: number;
  configuredAt?: string;
}

// --- Industry Templates ---

export interface IndustryTemplate {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  insumoCount: number;
  productCount: number;
}

export interface ApplyTemplateDto {
  overrideExisting?: boolean;
  prefixSku?: string;
}

export interface ApplyTemplateResult {
  tenantId: string;
  templateCode: string;
  insumosCreated: number;
  insumosSkipped: number;
  productsCreated: number;
  productsSkipped: number;
  recipesCreated: number;
}

// --- Bulk Import (Staging & Validation) ---

export const MAX_IMPORT_CHUNK_SIZE = 100; // ODAV-32 requirement: chunk size <= 100

export const importRowSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
  sku: z.string().trim().optional(),
  precioVenta: z
    .union([z.number(), z.string()])
    .refine((val) => {
      const num = typeof val === "number" ? val : parseFloat(val);
      return !isNaN(num) && num >= 0;
    }, "El precio de venta debe ser un número positivo"),
  costoInsumo: z
    .union([z.number(), z.string()])
    .optional()
    .refine((val) => {
      if (val === undefined || val === "") return true;
      const num = typeof val === "number" ? val : parseFloat(val);
      return !isNaN(num) && num >= 0;
    }, "El costo de insumo debe ser un número positivo"),
  categoria: z.string().trim().optional(),
  porcentajeIva: z.union([z.number(), z.string()]).optional(),
  uom: z.string().trim().optional(),
  stockInicial: z.union([z.number(), z.string()]).optional(),
});

export type ImportRowDto = z.infer<typeof importRowSchema>;

export interface UploadBatchDto {
  sessionToken?: string;
  rows: ImportRowDto[];
}

export type CommitMode = "VALID_ONLY" | "ALL_OR_NOTHING";
export type DuplicateResolution = "REPLACE" | "SKIP" | "FAIL";

export const commitImportSchema = z.object({
  sessionToken: z.string().uuid("sessionToken debe ser un UUID válido"),
  mode: z.enum(["VALID_ONLY", "ALL_OR_NOTHING"], {
    errorMap: () => ({ message: "mode debe ser VALID_ONLY o ALL_OR_NOTHING" }),
  }),
  duplicateResolution: z
    .enum(["REPLACE", "SKIP", "FAIL"], {
      errorMap: () => ({ message: "duplicateResolution debe ser REPLACE, SKIP o FAIL" }),
    })
    .optional(),
});

export type CommitImportDto = z.infer<typeof commitImportSchema>;

export interface RowErrorDiagnostic {
  rowNumber: number;
  rawNombre?: string;
  rawSku?: string;
  reason: string;
}

export interface UploadSummaryResponse {
  sessionToken: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  errors: RowErrorDiagnostic[];
}

export interface CommitSummaryResponse {
  sessionToken: string;
  mode: CommitMode;
  productsCreated: number;
  productsUpdated: number;
  productsSkipped: number;
  totalCommitted: number;
  committedAt: string;
}

export interface ImportProgressState {
  chunkIndex: number;
  totalChunks: number;
  percent: number;
  uploadedRows: number;
  totalRows: number;
}
