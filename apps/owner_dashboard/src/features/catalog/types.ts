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
