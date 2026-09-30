import { z } from "zod";

import {
  isValidNicaraguaFiscalId,
  RUC_ACCEPTED_FORMS_MESSAGE,
} from "./nicaragua-fiscal";

// --- Fiscal Setup ---

export const FiscalRegime = {
  CUOTA_FIJA: "CUOTA_FIJA",
  REGIMEN_GENERAL: "REGIMEN_GENERAL",
} as const;

export type FiscalRegime = (typeof FiscalRegime)[keyof typeof FiscalRegime];

// --- Business Profile (BXW-007 U2) ---

/**
 * BXW-007 U2: mirrors the backend TenantOperationMode enum (POS canon
 * vocabulary, apps/pos_app TenantOperationMode). The POS default is
 * FOODPARK_QSR.
 */
export const TenantOperationMode = {
  FOODPARK_QSR: "FOODPARK_QSR",
  RESTAURANT: "RESTAURANT",
  HYBRID: "HYBRID",
} as const;

export type TenantOperationMode =
  (typeof TenantOperationMode)[keyof typeof TenantOperationMode];

/**
 * BXW-007 U2: mirrors the backend CheckoutFxMode enum (POS canon checkout FX
 * source). The POS default is COMMERCIAL.
 */
export const CheckoutFxMode = {
  COMMERCIAL: "COMMERCIAL",
  BCN_OFFICIAL: "BCN_OFFICIAL",
} as const;

export type CheckoutFxMode = (typeof CheckoutFxMode)[keyof typeof CheckoutFxMode];

/**
 * BXW-007 U2 (contract rev 2): never trust the stored string. A missing,
 * null, non-string or non-member value resolves to null — "never configured
 * in the cloud" — so the form can keep the neutral "Sin definir" sentinel
 * instead of silently affirming a default. Affirming a default would
 * downgrade terminals an operator set to RESTAURANT/HYBRID locally.
 */
export function resolveTenantOperationMode(
  raw: unknown,
): TenantOperationMode | null {
  return (
    Object.values(TenantOperationMode) as string[]
  ).includes(raw as string)
    ? (raw as TenantOperationMode)
    : null;
}

export function resolveCheckoutFxMode(raw: unknown): CheckoutFxMode | null {
  return (Object.values(CheckoutFxMode) as string[]).includes(raw as string)
    ? (raw as CheckoutFxMode)
    : null;
}

/**
 * D-21 (#554): DGI authorization code charset — letters, digits, hyphens and
 * slashes ONLY, mirroring the backend DGI_AUTHORIZATION_CODE_PATTERN.
 * Intentionally NOT a structural mask: DGI's format is not documented.
 */
export const DGI_AUTHORIZATION_CODE_PATTERN = /^[A-Za-z0-9\-/]*$/;

export const fiscalSetupSchema = z.object({
  regime: z.enum([FiscalRegime.CUOTA_FIJA, FiscalRegime.REGIMEN_GENERAL], {
    errorMap: () => ({ message: "El régimen debe ser CUOTA_FIJA o REGIMEN_GENERAL" }),
  }),
  businessName: z
    .string()
    .trim()
    .min(1, "El nombre comercial es obligatorio"),
  // PR-1: issuer RUC mandatory; HTTP enforcement lands in PR-2.
  ruc: z
    .string()
    .trim()
    .min(1, RUC_ACCEPTED_FORMS_MESSAGE)
    .refine((ruc) => isValidNicaraguaFiscalId(ruc), {
      message: RUC_ACCEPTED_FORMS_MESSAGE,
    }),
  commercialFxSpread: z
    .number({ invalid_type_error: "El spread cambiario debe ser un número" })
    .min(0, "El spread cambiario debe ser mayor o igual a 0"),
  // BXW-007 U2 (contract rev 2): OPTIONAL-UNTIL-SET. Absence (undefined,
  // null, or the "" sentinel of the "Sin definir" select option) is valid:
  // it means the tenant never configured the value in the cloud, and every
  // terminal keeps its local value. A PRESENT value must be a valid wire
  // literal — the Spanish rejection fires only for an invalid member. The
  // submit path omits the key entirely when the sentinel is selected, so
  // `""` never reaches the wire.
  operationMode: z.preprocess(
    (raw) => (raw === "" ? undefined : raw),
    z.enum(
      [
        TenantOperationMode.FOODPARK_QSR,
        TenantOperationMode.RESTAURANT,
        TenantOperationMode.HYBRID,
      ],
      {
        errorMap: () => ({
          message:
            "El modo de operación debe ser FOODPARK_QSR, RESTAURANT o HYBRID",
        }),
      },
    ).nullish(),
  ),
  checkoutFxMode: z.preprocess(
    (raw) => (raw === "" ? undefined : raw),
    z.enum([CheckoutFxMode.COMMERCIAL, CheckoutFxMode.BCN_OFFICIAL], {
      errorMap: () => ({
        message:
          "La tasa de cambio en cobro en divisas debe ser COMMERCIAL o BCN_OFFICIAL",
      }),
    }).nullish(),
  ),
  pricesIncludeTax: z.boolean(),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  // D-21 (#554): optional DGI authorization letter data. Mirrors the backend
  // FiscalSetupDto: charset + 50-char ceiling only — NO structural mask,
  // because DGI's code format is not officially documented (the operator
  // types what the letter says). An empty code is meaningful: the backend
  // clears the stored value through a superseding null tombstone.
  dgiAuthorizationCode: z
    .string()
    .trim()
    .max(50, "El código de autorización no debe exceder 50 caracteres")
    .refine(
      (code) => code === "" || DGI_AUTHORIZATION_CODE_PATTERN.test(code),
      {
        message:
          "El código de autorización solo admite letras, números, guiones y barras",
      },
    )
    .optional(),
  dgiAuthorizationIssuedAt: z.string().optional(),
  dgiAuthorizationExpiresAt: z.string().optional(),
})
.superRefine((values, ctx) => {
  // D-21 (#554): the authorization dates are optional but PAIRED — if one is
  // filled the other must be too — and expiry must be on or after issuance,
  // mirroring the backend DgiAuthorizationDateRangeConstraint.
  const issued = values.dgiAuthorizationIssuedAt;
  const expires = values.dgiAuthorizationExpiresAt;
  if (issued && !expires) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["dgiAuthorizationExpiresAt"],
      message:
        "Si indica la fecha de emisión, también debe indicar la fecha de vencimiento",
    });
  }
  if (!issued && expires) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["dgiAuthorizationIssuedAt"],
      message:
        "Si indica la fecha de vencimiento, también debe indicar la fecha de emisión",
    });
  }
  if (issued && expires) {
    const issuedMs = Date.parse(issued);
    const expiresMs = Date.parse(expires);
    if (
      !Number.isNaN(issuedMs) &&
      !Number.isNaN(expiresMs) &&
      expiresMs < issuedMs
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dgiAuthorizationExpiresAt"],
        message:
          "La fecha de vencimiento debe ser posterior o igual a la fecha de emisión",
      });
    }
  }
});

// --- DGI Authorization Expiry Warning (D-21, #554) ---

/** Owner decision (D-21): the warning lead time is FIXED at 30 days. */
export const DGI_AUTHORIZATION_EXPIRY_WARNING_LEAD_DAYS = 30;

export type DgiAuthorizationExpiryState = "none" | "warning" | "expired";

export interface DgiAuthorizationExpiryStatus {
  state: DgiAuthorizationExpiryState;
  /** Days from `now` to the expiry date; negative when already expired. */
  daysUntilExpiry: number | null;
}

/**
 * Parses a date string as LOCAL midnight so day-count arithmetic against a
 * local `now` never drifts with the UTC offset. Accepts date-only strings
 * (YYYY-MM-DD, what <input type="date"> yields) and full ISO-8601
 * timestamps (what the fiscal snapshot may carry back).
 */
function parseAsLocalMidnight(value: string): Date | null {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (dateOnly) {
    return new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
    );
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  const parsedDate = new Date(parsed);
  return new Date(
    parsedDate.getFullYear(),
    parsedDate.getMonth(),
    parsedDate.getDate(),
  );
}

/**
 * D-21 (#554): resolves the owner-facing expiry warning state for the DGI
 * authorization letter. Absence (null/empty/corrupt) resolves to "none" —
 * absence must look like absence, and the banner never blocks saving.
 */
export function resolveDgiAuthorizationExpiryStatus(
  expiresAt: string | null | undefined,
  now: Date,
): DgiAuthorizationExpiryStatus {
  if (typeof expiresAt !== "string" || expiresAt.trim() === "") {
    return { state: "none", daysUntilExpiry: null };
  }
  const expiry = parseAsLocalMidnight(expiresAt.trim());
  if (!expiry) {
    return { state: "none", daysUntilExpiry: null };
  }
  const todayMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const daysUntilExpiry = Math.round(
    (expiry.getTime() - todayMidnight.getTime()) / 86_400_000,
  );
  if (daysUntilExpiry < 0) {
    return { state: "expired", daysUntilExpiry };
  }
  if (daysUntilExpiry <= DGI_AUTHORIZATION_EXPIRY_WARNING_LEAD_DAYS) {
    return { state: "warning", daysUntilExpiry };
  }
  return { state: "none", daysUntilExpiry };
}

export type FiscalSetupFormValues = z.output<typeof fiscalSetupSchema>;
/**
 * BXW-007 U2 (rev 2): the RHF form-state type. The `""` sentinel of the
 * "Sin definir" option and the preprocess normalization make the INPUT
 * type differ from the parsed OUTPUT type, so the form is keyed on the
 * input while onSubmit receives the normalized output.
 */
export type FiscalSetupFormInput = z.input<typeof fiscalSetupSchema>;

export interface FiscalSetupResponse {
  tenantId: string;
  businessName: string;
  ruc: string | null;
  regime: FiscalRegime;
  taxRateIva: number;
  pricesIncludeTax: boolean;
  commercialFxSpread: number;
  /**
   * BXW-007 U2 (rev 2): null = the tenant never configured it in the cloud.
   * Absent is tolerated for snapshots from configs predating U2 and is
   * treated exactly like null — never as a default.
   */
  operationMode?: TenantOperationMode | null;
  /**
   * BXW-007 U2 (rev 2): null = the tenant never configured it in the cloud.
   * Absent is tolerated for snapshots from configs predating U2 and is
   * treated exactly like null — never as a default.
   */
  checkoutFxMode?: CheckoutFxMode | null;
  configuredAt?: string;
  /** D-21 (#554): null when no DGI authorization is configured. */
  dgiAuthorizationCode?: string | null;
  dgiAuthorizationIssuedAt?: string | null;
  dgiAuthorizationExpiresAt?: string | null;
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

// --- Canonical Product Template CSV ---

export const CANONICAL_PRODUCT_TEMPLATE_CSV = `nombre,precioVenta,uom,categoria
"Agua natural 600ml",15,"UN","Bebidas"
"Coca-Cola 500ml",20,"UN","Bebidas"
"Pizza personal",80,"UN","Comida"
"Combo almuerzo",120,"UN","Combos";\n`;

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
