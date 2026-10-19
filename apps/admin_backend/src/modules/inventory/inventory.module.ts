import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Insumo } from './entities/insumo.entity';
import { InsumoMarketPrice } from './entities/insumo-market-price.entity';
import { Product } from './entities/product.entity';
import { Recipe } from './entities/recipe.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { Supplier } from './entities/supplier.entity';
import { Warehouse } from './entities/warehouse.entity';
import { UomConversion } from './entities/uom-conversion.entity';
import { Batch } from './entities/batch.entity';
import { BatchOutflowTrace } from './entities/batch-outflow-trace.entity';
import { PurchaseDocument } from './entities/purchase-document.entity';
import { RecipeVersion } from './entities/recipe-version.entity';
import { RecipeDetail } from './entities/recipe-detail.entity';
import { ProductionOrder } from './entities/production-order.entity';
import { ProductionOrderLine } from './entities/production-order-line.entity';
import { ProductionBatchHistory } from './entities/production-batch-history.entity';
import { Shrinkage } from './entities/shrinkage.entity';
import { ShrinkageDetail } from './entities/shrinkage-detail.entity';
import { CountSession } from './entities/count-session.entity';
import { CountSessionEntry } from './entities/count-session-entry.entity';
import { InventorySyncOutbox } from './entities/inventory-sync-outbox.entity';
import { InventorySyncReceipt } from './entities/inventory-sync-receipt.entity';
import { BcnFxRate } from './entities/bcn-fx-rate.entity';
import { SystemParametersConfig } from './entities/system-parameters-config.entity';
import { KardexRecalculateQueue } from './entities/kardex-recalculate-queue.entity';
import { KardexCorrection } from './entities/kardex-correction.entity';
import { ProductInventoryMappingVersion } from './entities/product-inventory-mapping-version.entity';
import { InventoryRemediationReceipt } from './entities/inventory-remediation-receipt.entity';
import { ProductInventoryMappingService } from './services/product-inventory-mapping.service';
import { SaleInventoryRemediationService } from './services/sale-inventory-remediation.service';
import { ShrinkageService } from './shrinkage.service';
import { CostCalculatorService } from './cost-calculator.service';
import { InventoryMovementController } from './inventory-movement.controller';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { RecipeController } from './recipe.controller';
import { InsumoController } from './insumo.controller';
import {
  FX_RATE_RESOLVER,
  InventoryPurchaseService,
} from './inventory-purchase.service';
import { FxRateResolverService } from './fx-rate-resolver.service';
import { RecipeService } from './recipe.service';
import { BomExplosionService } from './bom-explosion.service';
import { ProductionService } from './production.service';
import { BatchCostingService } from './batch-costing.service';
import {
  FORENSIC_ALERT_DISPATCHER,
  ForensicAlertService,
} from './forensic-alert.service';
import { UomConversionCalculator } from './uom-conversion-calculator';
import { ForensicAlertEmailDispatcher } from './forensic-alert-email.dispatcher';
import { IdentityModule } from '../identity/identity.module';
import { DeviceSyncModule } from '../identity/device-sync.module';
import { TenantModule } from '../tenant/tenant.module';
import { CountSessionService } from './count-session.service';
import { CountSessionPrintableService } from './services/count-session-printable.service';
import { GovernanceApprovalService } from './services/governance-approval.service';
import { KardexRegularizationService } from './services/kardex-regularization.service';
import { RegularizationController } from './controllers/regularization.controller';
import { RemediationController } from './controllers/remediation.controller';
import { InventoryReportsService } from './services/inventory-reports.service';
import { TheoreticalCostService } from './services/theoretical-cost.service';
import { InventoryValuationService } from './inventory-valuation.service';
import { InventoryReportsController } from './controllers/inventory-reports.controller';
import { UomCatalogController } from './controllers/uom-catalog.controller';
import { CatalogValue } from '../catalog/entities/catalog-value.entity';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    IdentityModule,
    AuditModule,
    DeviceSyncModule,
    // R19 T3: the printable count list consumes the RESOLVED company
    // identity from where the tenant data lives (S4); the renderer itself
    // never reads the tenant row.
    TenantModule,
    TypeOrmModule.forFeature([
      Insumo,
      // S9 (L33) / R-01: the client's own market price, with its date. Without
      // this in forFeature the valuation service cannot read it, and the
      // reference would silently stay on the purchase-cost fallback forever.
      InsumoMarketPrice,
      Product,
      Recipe,
      InventoryMovement,
      Supplier,
      Warehouse,
      UomConversion,
      Batch,
      // R3: the outflow trace a sale records and a cancellation reads back.
      // Without forFeature the draw dies on EntityMetadataNotFoundError.
      BatchOutflowTrace,
      PurchaseDocument,
      RecipeVersion,
      RecipeDetail,
      ProductionOrder,
      ProductionOrderLine,
      ProductionBatchHistory,
      Shrinkage,
      ShrinkageDetail,
      // R19: the count session document and its append-only counted entries;
      // without forFeature the first real count dies on
      // EntityMetadataNotFoundError.
      CountSession,
      CountSessionEntry,
      InventorySyncOutbox,
      InventorySyncReceipt,
      BcnFxRate,
      SystemParametersConfig,
      KardexRecalculateQueue,
      KardexCorrection,
      ProductInventoryMappingVersion,
      InventoryRemediationReceipt,
      // The tenant's own units-of-measure registry. The insumo conversion
      // guard honours a unit the operator registered in Catálogos, so it
      // must read that catalog.
      CatalogValue,
    ]),
  ],
  controllers: [
    InventoryMovementController,
    RegularizationController,
    RemediationController,
    InventoryReportsController,
    ProductController,
    RecipeController,
    InsumoController,
    UomCatalogController,
  ],
  providers: [
    InventoryPurchaseService,
    RecipeService,
    BomExplosionService,
    BatchCostingService,
    ProductionService,
    ShrinkageService,
    CostCalculatorService,
    CountSessionService,
    CountSessionPrintableService,
    ForensicAlertService,
    GovernanceApprovalService,
    KardexRegularizationService,
    InventoryReportsService,
    TheoreticalCostService,
    // S9 (L33) / R-01: lower-of-cost-or-market writedowns.
    InventoryValuationService,
    UomConversionCalculator,
    FxRateResolverService,
    ProductService,
    ProductInventoryMappingService,
    SaleInventoryRemediationService,
    {
      provide: FORENSIC_ALERT_DISPATCHER,
      useClass: ForensicAlertEmailDispatcher,
    },
    {
      provide: FX_RATE_RESOLVER,
      useExisting: FxRateResolverService,
    },
  ],
  exports: [
    TypeOrmModule,
    InventoryPurchaseService,
    RecipeService,
    BomExplosionService,
    BatchCostingService,
    ProductionService,
    ShrinkageService,
    CostCalculatorService,
    CountSessionService,
    ForensicAlertService,
    GovernanceApprovalService,
    KardexRegularizationService,
    UomConversionCalculator,
    ProductService,
    ProductInventoryMappingService,
    SaleInventoryRemediationService,
  ],
})
export class InventoryModule {}
