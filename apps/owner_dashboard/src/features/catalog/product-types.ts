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
