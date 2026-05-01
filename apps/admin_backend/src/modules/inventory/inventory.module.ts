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
import { InventoryService } from './inventory.service';
import { PurchaseService } from './purchase.service';
import { ShrinkageService } from './shrinkage.service';
import { InventoryMovementController } from './inventory-movement.controller';

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
    ]),
  ],
  controllers: [InventoryMovementController],
  providers: [InventoryService, PurchaseService, ShrinkageService],
  exports: [TypeOrmModule, InventoryService, PurchaseService, ShrinkageService],
})
export class InventoryModule {}
