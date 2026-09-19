import { Injectable } from '@nestjs/common';
import { DataSource, MoreThan } from 'typeorm';
import {
  InventoryReadinessPort,
  InventoryReadinessResult,
  InventoryScope,
} from '../ports/inventory-readiness.port';
import { Warehouse } from '../../inventory/entities/warehouse.entity';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { Product } from '../../inventory/entities/product.entity';
import { Invoice } from '../../sales/entities/invoice.entity';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';

@Injectable()
export class InventoryReadinessAdapter implements InventoryReadinessPort {
  constructor(private readonly dataSource: DataSource) {}

  async evaluateInventoryReadiness(
    tenantId: string,
  ): Promise<InventoryReadinessResult> {
    const trimmedTenant = tenantId?.trim();
    if (!trimmedTenant) {
      return {
        inventoryReady: false,
        scope: 'NONE',
        warehouseCount: 0,
        trackedProductCount: 0,
        trackedInsumoCount: 0,
        itemsWithStockCount: 0,
        hasDefaultWarehouse: false,
        notes: ['Tenant context is empty or invalid'],
        inventoryEnrichmentPendingCount: 0,
      };
    }

    // Every query in this method runs inside a tenant-bound transaction
    // (issue #358). The readiness fan-out reads `invoices`, whose RLS policy
    // (1809060000000-AlignInvoiceTenantPolicyPredicate) uses the uuid-form
    // predicate `tenant_id = current_setting('app.tenant_id', true)::uuid`.
    // On pooled connections where a previous request issued a
    // transaction-local `set_config('app.tenant_id', ...)` that already
    // committed, PostgreSQL leaves the setting DEFINED AND EMPTY, and the
    // `::uuid` cast of the empty string raises QueryFailedError:
    // `invalid input syntax for type uuid: ""`. Binding the context once at
    // the beginning of a transaction on the same executor makes every read
    // below correct by construction, including on poisoned pooled
    // connections and for any other table that later gains RLS.
    return runInTenantTransaction(
      this.dataSource,
      trimmedTenant,
      async (manager) => {
        const warehouseRepository = manager.getRepository(Warehouse);
        const productRepository = manager.getRepository(Product);
        const insumoRepository = manager.getRepository(Insumo);
        const invoiceRepository = manager.getRepository(Invoice);

        const warehouseCount = await warehouseRepository.count({
          where: { tenant_id: trimmedTenant, is_active: true },
        });

        const trackedProductCount = await productRepository.count({
          where: { tenant_id: trimmedTenant, is_active: true },
        });

        const productsWithStockCount = await productRepository.count({
          where: {
            tenant_id: trimmedTenant,
            is_active: true,
            stock: MoreThan(0),
          },
        });

        const trackedInsumoCount = await insumoRepository.count({
          where: { tenant_id: trimmedTenant },
        });

        const insumosWithStockCount = await insumoRepository.count({
          where: {
            tenant_id: trimmedTenant,
            stock: MoreThan(0),
          },
        });

        const itemsWithStockCount =
          productsWithStockCount + insumosWithStockCount;

        let scope: InventoryScope = 'NONE';
        if (warehouseCount > 0 && trackedInsumoCount > 0) {
          scope = 'ADVANCED';
        } else if (
          warehouseCount > 0 ||
          trackedProductCount > 0 ||
          trackedInsumoCount > 0
        ) {
          scope = 'BASIC';
        }

        // AC-07, AC-40: Having stock is NOT required for inventory readiness.
        // Having warehouse or tracked items establishes sufficient inventory
        // structure.
        const inventoryReady =
          warehouseCount > 0 ||
          trackedProductCount > 0 ||
          trackedInsumoCount > 0;

        const inventoryEnrichmentPendingCount = await invoiceRepository.count({
          where: {
            tenant_id: trimmedTenant,
            inventoryOutcome: 'APPLIED_INVENTORY_PENDING',
          },
        });

        const notes: string[] = [];
        if (warehouseCount === 0) {
          notes.push('NO_DEFAULT_WAREHOUSE');
        }
        if (itemsWithStockCount === 0 && inventoryReady) {
          notes.push('INITIAL_STOCK_NOT_LOADED_OPTIONAL');
        }
        if (inventoryEnrichmentPendingCount > 0) {
          notes.push('INVENTORY_ENRICHMENT_PENDING');
        }

        return {
          inventoryReady,
          scope,
          warehouseCount,
          trackedProductCount,
          trackedInsumoCount,
          itemsWithStockCount,
          hasDefaultWarehouse: warehouseCount > 0,
          notes,
          inventoryEnrichmentPendingCount,
        };
      },
    );
  }
}
