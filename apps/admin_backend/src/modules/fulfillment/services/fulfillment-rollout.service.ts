import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Product } from '../../inventory/entities/product.entity';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { Recipe } from '../../inventory/entities/recipe.entity';
import { TenantFulfillmentRecord } from '../entities/tenant-fulfillment-record.entity';
import { TenantTopologyRevision } from '../entities/tenant-topology-revision.entity';

export enum DiscrepancyType {
  MISSING_RECIPE_BOM = 'MISSING_RECIPE_BOM',
  MISSING_DIRECT_STOCK_INSUMO = 'MISSING_DIRECT_STOCK_INSUMO',
  CROSS_TENANT_INSUMO_LEAK = 'CROSS_TENANT_INSUMO_LEAK',
  LEGACY_UNSPECIFIED_POLICY = 'LEGACY_UNSPECIFIED_POLICY',
}

export interface Discrepancy {
  productId: string;
  productName: string;
  type: DiscrepancyType;
  message: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface UnroutedProduct {
  productId: string;
  productName: string;
  fallbackAction: string;
  fallbackStation: string;
}

export interface BackfillScanResult {
  tenantId: string;
  clean: boolean;
  totalScanned: number;
  discrepancies: Discrepancy[];
  unroutedProducts: UnroutedProduct[];
}

export interface RollbackToggleDto {
  rollback: boolean;
  reason: string;
  authorizedBy: string;
}

export interface RollbackStatus {
  tenantId: string;
  enforcementEnabled: boolean;
  isRolledBack: boolean;
  reason?: string;
  authorizedBy?: string;
  timestamp?: string;
}

export interface ObservabilityDashboard {
  tenantId: string;
  currentRevision: number;
  operationMode: string;
  totalFulfillments: number;
  channelsBreakdown: Record<string, number>;
  enforcementStatus: 'ACTIVE' | 'ROLLED_BACK';
  lastAudit?: Record<string, unknown>;
}

@Injectable()
export class FulfillmentRolloutService {
  private readonly logger = new Logger(FulfillmentRolloutService.name);
  private readonly rollbackState = new Map<string, RollbackStatus>();

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Insumo)
    private readonly insumoRepo: Repository<Insumo>,
    @InjectRepository(Recipe)
    private readonly recipeRepo: Repository<Recipe>,
    @InjectRepository(TenantFulfillmentRecord)
    private readonly fulfillmentRepo: Repository<TenantFulfillmentRecord>,
    @InjectRepository(TenantTopologyRevision)
    private readonly revisionRepo: Repository<TenantTopologyRevision>,
  ) {}

  private async bindTenantContext(
    manager: EntityManager,
    tenantId: string,
  ): Promise<void> {
    await manager.query(`SELECT set_config('app.tenant_id', $1, true)`, [
      tenantId,
    ]);
  }

  async scanBackfillDiscrepancies(
    tenantId: string,
  ): Promise<BackfillScanResult> {
    return this.dataSource.transaction(async (manager) => {
      await this.bindTenantContext(manager, tenantId);

      const pRepo = manager.getRepository(Product);
      const iRepo = manager.getRepository(Insumo);
      const rRepo = manager.getRepository(Recipe);

      const products = await pRepo.find({
        where: { tenant_id: tenantId, is_active: true },
      });

      const recipes = await rRepo.find({
        where: { tenant_id: tenantId },
      });

      const allInsumos = await iRepo.find();
      const tenantInsumoMap = new Map<string, Insumo>();
      const foreignInsumoMap = new Map<string, Insumo>();

      for (const ins of allInsumos) {
        if (ins.tenant_id === tenantId) {
          tenantInsumoMap.set(ins.id, ins);
        } else {
          foreignInsumoMap.set(ins.id, ins);
        }
      }

      const productRecipesMap = new Map<string, Recipe[]>();
      for (const rec of recipes) {
        const list = productRecipesMap.get(rec.productId) ?? [];
        list.push(rec);
        productRecipesMap.set(rec.productId, list);
      }

      const discrepancies: Discrepancy[] = [];
      const unroutedProducts: UnroutedProduct[] = [];

      for (const prod of products) {
        const prodRecipes = productRecipesMap.get(prod.id) ?? [];

        // Check if product is marked as perishable/recipe
        if (prod.is_perishable) {
          if (prodRecipes.length === 0) {
            discrepancies.push({
              productId: prod.id,
              productName: prod.name,
              type: DiscrepancyType.MISSING_RECIPE_BOM,
              message:
                'Product is configured for recipe consumption but has no recipe components registered.',
              severity: 'HIGH',
            });
          } else {
            // Verify all ingredients belong to the same tenant
            for (const rec of prodRecipes) {
              if (foreignInsumoMap.has(rec.ingredientId)) {
                discrepancies.push({
                  productId: prod.id,
                  productName: prod.name,
                  type: DiscrepancyType.CROSS_TENANT_INSUMO_LEAK,
                  message: `Recipe component ${rec.ingredientId} belongs to a foreign tenant.`,
                  severity: 'HIGH',
                });
              }
            }
          }
        } else {
          // Non-perishable / legacy product: unrouted fallback
          unroutedProducts.push({
            productId: prod.id,
            productName: prod.name,
            fallbackAction: 'DIRECT_HANDOFF',
            fallbackStation: 'general-dispatch',
          });
        }
      }

      this.logger.log(
        `[BACKFILL-SCAN] tenant=${tenantId} scanned=${products.length} discrepancies=${discrepancies.length} unrouted=${unroutedProducts.length}`,
      );

      return {
        tenantId,
        clean: discrepancies.length === 0,
        totalScanned: products.length,
        discrepancies,
        unroutedProducts,
      };
    });
  }

  async getRollbackStatus(tenantId: string): Promise<RollbackStatus> {
    await Promise.resolve();
    const existing = this.rollbackState.get(tenantId);
    if (existing) {
      return existing;
    }
    return {
      tenantId,
      enforcementEnabled: true,
      isRolledBack: false,
    };
  }

  async toggleRollback(
    tenantId: string,
    dto: RollbackToggleDto,
  ): Promise<RollbackStatus> {
    await Promise.resolve();
    const status: RollbackStatus = {
      tenantId,
      enforcementEnabled: !dto.rollback,
      isRolledBack: dto.rollback,
      reason: dto.reason,
      authorizedBy: dto.authorizedBy,
      timestamp: new Date().toISOString(),
    };

    this.rollbackState.set(tenantId, status);

    if (dto.rollback) {
      this.logger.warn(
        `[ROLLBACK-ACTIVE] tenant=${tenantId} reason="${dto.reason}" authorizedBy=${dto.authorizedBy} enforcement=DISABLED (retaining all audit, invoices, kardex, and fulfillment history)`,
      );
    } else {
      this.logger.log(
        `[ROLLBACK-RESTORED] tenant=${tenantId} reason="${dto.reason}" authorizedBy=${dto.authorizedBy} enforcement=RESTORED`,
      );
    }

    return status;
  }

  async getObservabilityDashboard(
    tenantId: string,
  ): Promise<ObservabilityDashboard> {
    return this.dataSource.transaction(async (manager) => {
      await this.bindTenantContext(manager, tenantId);

      const revRepo = manager.getRepository(TenantTopologyRevision);
      const fulRepo = manager.getRepository(TenantFulfillmentRecord);

      const latestRev = await revRepo.findOne({
        where: { tenant_id: tenantId },
        order: { revision: 'DESC' },
      });

      const totalFulfillments = await fulRepo.count({
        where: { tenant_id: tenantId },
      });

      const records = await fulRepo.find({
        where: { tenant_id: tenantId },
      });

      const channelsBreakdown: Record<string, number> = {
        PRINT_ONLY: 0,
        KDS_ONLY: 0,
        KDS_AND_PRINT: 0,
      };

      for (const rec of records) {
        if (rec.channel in channelsBreakdown) {
          channelsBreakdown[rec.channel] =
            (channelsBreakdown[rec.channel] ?? 0) + 1;
        }
      }

      const rollback = await this.getRollbackStatus(tenantId);

      return {
        tenantId,
        currentRevision: latestRev?.revision ?? 0,
        operationMode:
          (latestRev?.topology?.operationMode as string) ??
          (latestRev?.topology?.operation_mode as string) ??
          'LEGACY_COMPATIBILITY',
        totalFulfillments,
        channelsBreakdown,
        enforcementStatus: rollback.isRolledBack ? 'ROLLED_BACK' : 'ACTIVE',
        lastAudit: rollback.isRolledBack
          ? {
              reason: rollback.reason,
              authorizedBy: rollback.authorizedBy,
              timestamp: rollback.timestamp,
            }
          : undefined,
      };
    });
  }
}
