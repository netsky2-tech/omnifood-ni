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
