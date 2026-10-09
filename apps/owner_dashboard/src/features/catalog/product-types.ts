import { z } from "zod";

export type ProductType = "SIMPLE" | "COMPOUND" | "VARIANT_PARENT";

/**
 * Values that may arrive stored in the database. The backend enum also has
 * `PREPARED` (behaviourally identical to `COMPOUND` for consumption), which is
 * intentionally NOT offered in the picker but must round-trip without being
 * coerced to another type.
 */
export type StoredProductType = ProductType | "PREPARED";

export const PRODUCT_TYPES: { id: ProductType; label: string }[] = [
  { id: "SIMPLE", label: "Simple" },
  { id: "COMPOUND", label: "Compuesto (con receta)" },
  { id: "VARIANT_PARENT", label: "Padre de Variantes" },
];

/**
 * Creation-time question (issue #618): maps an operator answer, phrased in
 * business language, to the product type to create. No default: creation is
 * blocked until the operator answers. `PREPARED` is intentionally absent —
 * it is a legacy stored value only, never a destination (#615/#617).
 */
export const CREATE_TYPE_ANSWERS: { id: ProductType; answer: string }[] = [
  { id: "COMPOUND", answer: "Sí, se prepara con ingredientes" },
  { id: "SIMPLE", answer: "No, se compra y se revende tal cual" },
  {
    id: "VARIANT_PARENT",
    answer: "Es un grupo de versiones del mismo ítem (por ejemplo por tamaño)",
  },
];

export interface Product {
  id: string;
  tenant_id: string;
  name: string;
  uom: string;
  product_type: StoredProductType;
  category_code: string | null;
  warehouse_id: string | null;
  is_perishable: boolean;
  stock: number;
  averageCost: number;
  sellPrice: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateProductInput {
  name: string;
  uom: string;
  product_type: ProductType;
  category_code?: string;
  warehouse_id?: string;
  is_perishable?: boolean;
  stock?: number;
  averageCost?: number;
  sellPrice?: number;
  is_active?: boolean;
}

export interface UpdateProductInput {
  name?: string;
  uom?: string;
  product_type?: StoredProductType;
  category_code?: string;
  warehouse_id?: string;
  is_perishable?: boolean;
  sellPrice?: number;
  is_active?: boolean;
}

// --- Product dialog form validation (Unit B, form sweep) ---

/**
 * Validation schema for the product dialog. Replaces the dialog's native-only
 * HTML constraints (name: required + maxLength=200; uom: required on the
 * select; sellPrice: type=number step="0.01" min="0", not required) so the app
 * — not the browser's balloon — owns the operator's feedback, and submits that
 * bypass the submit button (e.g. programmatic requestSubmit()) are still
 * guarded.
 *
 * Fidelity rules, measured against the native attributes:
 * - A single schema serves both modes on purpose: the name input, the UOM
 *   select and the price input render with the same native attributes in
 *   create AND edit, so create and edit cannot diverge here. The only
 *   mode-conditional fields (the create-time type question and the edit-only
 *   product_type select) carry no native constraints and are guarded by the
 *   existing handler logic, not by this schema.
 * - `name` and `uom` are validated RAW (no trim): native `required` only
 *   blocks the empty string, so a whitespace-only value was valid before and
 *   MUST remain valid (the submit path still trims — a no-op on every value
 *   the native attributes accepted).
 * - `sellPrice` mirrors `type=number step="0.01" min="0"` exactly: a number,
 *   minimum 0, at most 2 decimals, NOT required. `0` is legal today and must
 *   stay legal; no maximum is invented (native had none). An emptied input
 *   becomes `0` in the submit path (Number("") handling), same as before.
 */
export const productFormSchema = z.object({
  name: z
    .string()
    .min(1, "El nombre es obligatorio")
    .max(200, "El nombre no debe exceder 200 caracteres"),
  uom: z.string().min(1, "La unidad de medida es obligatoria"),
  sellPrice: z
    .number({ invalid_type_error: "El precio de venta debe ser un número" })
    .min(0, "El precio de venta debe ser mayor o igual a 0")
    .refine(
      (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9,
      "El precio de venta no puede tener más de 2 decimales",
    ),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;
