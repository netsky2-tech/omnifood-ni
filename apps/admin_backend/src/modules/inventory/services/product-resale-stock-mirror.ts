import { EntityManager } from 'typeorm';

export interface ResaleMirrorSource {
  managedProductId?: string | null;
  stock: number | string;
  averageCost: number | string;
}

/**
 * Mirrors stock and averageCost from a system-managed PRODUCT_RESALE insumo
 * back onto its owning `products` row inside the caller's transaction.
 * No-ops for regular RAW_MATERIAL insumos (`managedProductId == null`).
 */
export async function mirrorManagedResaleProductStock(
  manager: EntityManager,
  tenantId: string,
  insumo: ResaleMirrorSource,
): Promise<void> {
  if (!insumo.managedProductId) {
    return;
  }
  const stock = Number(insumo.stock);
  const averageCost = Number(insumo.averageCost);
  await manager.query(
    `UPDATE products
       SET stock = $1, "averageCost" = $2, updated_at = NOW()
     WHERE id = $3 AND tenant_id = $4`,
    [
      Number.isFinite(stock) ? stock : 0,
      Number.isFinite(averageCost) ? averageCost : 0,
      insumo.managedProductId,
      tenantId,
    ],
  );
}
