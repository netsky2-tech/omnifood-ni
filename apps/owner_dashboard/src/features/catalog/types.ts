import { z } from "zod";

export type CatalogType =
  | "UOM"
  | "INVENTORY_CATEGORY"
  | "INVENTORY_TYPE"
  | "SALES_PRODUCT_CATEGORY"
  | "SALES_PRODUCT_TYPE";

export const CATALOG_TYPES: { id: CatalogType; label: string }[] = [
  { id: "UOM", label: "Unidades de Medida" },
  { id: "INVENTORY_CATEGORY", label: "Categorías de Inventario" },
  { id: "INVENTORY_TYPE", label: "Tipos de Inventario" },
  { id: "SALES_PRODUCT_CATEGORY", label: "Categorías de Producto" },
  { id: "SALES_PRODUCT_TYPE", label: "Tipos de Producto" },
];

export interface CatalogValue {
  id: string;
  tenant_id: string;
  catalog_type: CatalogType;
  code: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateCatalogValueInput {
  code: string;
  name: string;
  is_active?: boolean;
  sort_order?: number;
}

export interface UpdateCatalogValueInput {
  name?: string;
  is_active?: boolean;
  sort_order?: number;
}

// --- Catalog value dialog form validation (Unit A, form sweep) ---

/** Mirrors the native `pattern="^[A-Za-z0-9_-]+$"` the create form relied on. */
export const CATALOG_CODE_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Validation schema for the catalog value dialog. Replaces the dialog's
 * native-only HTML constraints (code: required + pattern + maxLength=64;
 * name: required + maxLength=120; sortOrder: type=number min=0) so the app
 * — not the browser's balloon — owns the operator's feedback, and submits
 * that bypass the submit button (e.g. programmatic requestSubmit()) are
 * still guarded.
 *
 * Fidelity rules, measured against the native attributes:
 * - `code` is validated RAW (no trim before regex/min): the native pattern
 *   rejected spaces, so any input with spaces was invalid before this
 *   schema existed. The submit path still trims — a no-op on every input
 *   the pattern accepted.
 * - `name` is validated RAW: native `required` only blocks the empty
 *   string, so a whitespace-only name was valid before and MUST remain
 *   valid (the payload still carries `name.trim()`).
 * - `sortOrder` mirrors `type=number` exactly: a number (implicit step=1 →
 *   integer), minimum 0. `0` and an emptied input (`Number("") === 0`)
 *   are legal today and must stay legal.
 *
 * In edit mode the code field is neither rendered nor submitted (the
 * update payload carries only name/sort_order), so the code constraints
 * apply to the create dialog only.
 */
export function catalogValueFormSchema(isEdit: boolean) {
  return z.object({
    code: isEdit
      ? z.string()
      : z
          .string()
          .min(1, "El código es obligatorio")
          .max(64, "El código no debe exceder 64 caracteres")
          .regex(
            CATALOG_CODE_PATTERN,
            "El código solo admite letras, números, guiones y guiones bajos",
          ),
    name: z
      .string()
      .min(1, "El nombre es obligatorio")
      .max(120, "El nombre no debe exceder 120 caracteres"),
    sortOrder: z
      .number({ invalid_type_error: "El orden debe ser un número" })
      .int("El orden debe ser un número entero")
      .min(0, "El orden debe ser mayor o igual a 0"),
  });
}

export type CatalogValueFormValues = z.infer<
  ReturnType<typeof catalogValueFormSchema>
>;
