import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Insumo } from './entities/insumo.entity';
import { Product } from './entities/product.entity';
import { Recipe } from './entities/recipe.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { Supplier } from './entities/supplier.entity';
import { Warehouse } from './entities/warehouse.entity';
import { UomConversion } from './entities/uom-conversion.entity';
import { Batch } from './entities/batch.entity';
import { RecipeVersion } from './entities/recipe-version.entity';
import { RecipeDetail } from './entities/recipe-detail.entity';
import { ProductionOrder } from './entities/production-order.entity';
import { ProductionOrderLine } from './entities/production-order-line.entity';
import { Shrinkage } from './entities/shrinkage.entity';
import { ShrinkageDetail } from './entities/shrinkage-detail.entity';
import { InventorySyncOutbox } from './entities/inventory-sync-outbox.entity';
import { InventorySyncReceipt } from './entities/inventory-sync-receipt.entity';
import { InventoryService } from './inventory.service';
import { PurchaseService } from './purchase.service';
import { ShrinkageService } from './shrinkage.service';
import { CostCalculatorService } from './cost-calculator.service';
import { InventoryMovementController } from './inventory-movement.controller';
import { InventoryMovementService } from './inventory-movement.service';
import {
  FX_RATE_RESOLVER,
  InventoryPurchaseService,
} from './inventory-purchase.service';
import { FxRateResolverService } from './fx-rate-resolver.service';
import { RecipeService } from './recipe.service';
import { BomExplosionService } from './bom-explosion.service';
import { ProductionService } from './production.service';
import { BatchCostingService } from './batch-costing.service';
import { InventoryAdjustmentService } from './inventory-adjustment.service';
import {
  FORENSIC_ALERT_DISPATCHER,
  ForensicAlertService,
} from './forensic-alert.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Insumo,
      Product,
      Recipe,
      InventoryMovement,
      Supplier,
      Warehouse,
      UomConversion,
      Batch,
      RecipeVersion,
      RecipeDetail,
      ProductionOrder,
      ProductionOrderLine,
      Shrinkage,
      ShrinkageDetail,
      InventorySyncOutbox,
      InventorySyncReceipt,
    ]),
  ],
  controllers: [InventoryMovementController],
  providers: [
    InventoryService,
    InventoryMovementService,
    InventoryPurchaseService,
    RecipeService,
    BomExplosionService,
    BatchCostingService,
    ProductionService,
    PurchaseService,
    ShrinkageService,
    CostCalculatorService,
    InventoryAdjustmentService,
    ForensicAlertService,
    {
      provide: FORENSIC_ALERT_DISPATCHER,
      useValue: {
        dispatchToAdmins: async () => Promise.resolve(),
      },
    },
    {
      provide: FX_RATE_RESOLVER,
      useClass: FxRateResolverService,
    },
  ],
  exports: [
    TypeOrmModule,
    InventoryService,
    InventoryMovementService,
    InventoryPurchaseService,
    RecipeService,
    BomExplosionService,
    BatchCostingService,
    ProductionService,
    PurchaseService,
    ShrinkageService,
    CostCalculatorService,
    InventoryAdjustmentService,
    ForensicAlertService,
  ],
})
export class InventoryModule {}
