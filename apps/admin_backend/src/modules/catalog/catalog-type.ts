/**
 * Catalog type registry.
 *
 * The set of catalog TYPES is a system protocol/invariant: it is fixed by the
 * application contract and is NOT tenant-configurable. Only the VALUES inside
 * each catalog are tenant-administrable (managed via the Catalog API). This
 * respects the OmniFood NI rule: business/tenant catalogs must be
 * administrable from the system, while protocol/invariant states may remain as
 * technical constants.
 *
 * `UOM` is the single shared units-of-measure catalog. Inventory consumption
 * UOM, purchase UOM and sales-product UOM all draw from this same pool — a
 * unit of measure (e.g. "kg") is identical regardless of context, so duplicating
 * it per usage would create inconsistent master data.
 */
export const CATALOG_TYPE = {
  UOM: 'UOM',
  INVENTORY_CATEGORY: 'INVENTORY_CATEGORY',
  INVENTORY_TYPE: 'INVENTORY_TYPE',
  SALES_PRODUCT_CATEGORY: 'SALES_PRODUCT_CATEGORY',
  SALES_PRODUCT_TYPE: 'SALES_PRODUCT_TYPE',
} as const;

export type CatalogType = (typeof CATALOG_TYPE)[keyof typeof CATALOG_TYPE];

export const CATALOG_TYPES: readonly CatalogType[] =
  Object.values(CATALOG_TYPE);

export function isCatalogType(value: unknown): value is CatalogType {
  return (
    typeof value === 'string' && CATALOG_TYPES.includes(value as CatalogType)
  );
}
