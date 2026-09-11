import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import {
  InventoryReadinessPort,
  InventoryReadinessResult,
  InventoryScope,
} from '../ports/inventory-readiness.port';
import { Warehouse } from '../../inventory/entities/warehouse.entity';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { Product } from '../../inventory/entities/product.entity';
import { Invoice } from '../../sales/entities/invoice.entity';

@Injectable()
export class InventoryReadinessAdapter implements InventoryReadinessPort {
  constructor(
    @InjectRepository(Warehouse)
    private readonly warehouseRepository: Repository<Warehouse>,
    @InjectRepository(Insumo)
    private readonly insumoRepository: Repository<Insumo>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
  ) {}

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

    const warehouseCount = await this.warehouseRepository.count({
      where: { tenant_id: trimmedTenant, is_active: true },
    });

    const trackedProductCount = await this.productRepository.count({
      where: { tenant_id: trimmedTenant, is_active: true },
    });

    const productsWithStockCount = await this.productRepository.count({
      where: {
        tenant_id: trimmedTenant,
        is_active: true,
        stock: MoreThan(0),
      },
    });

    const trackedInsumoCount = await this.insumoRepository.count({
      where: { tenant_id: trimmedTenant },
    });

    const insumosWithStockCount = await this.insumoRepository.count({
      where: {
        tenant_id: trimmedTenant,
        stock: MoreThan(0),
      },
    });

    const itemsWithStockCount = productsWithStockCount + insumosWithStockCount;

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
    // Having warehouse or tracked items establishes sufficient inventory structure.
    const inventoryReady =
      warehouseCount > 0 || trackedProductCount > 0 || trackedInsumoCount > 0;

    const inventoryEnrichmentPendingCount = await this.invoiceRepository.count({
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
  }
}
