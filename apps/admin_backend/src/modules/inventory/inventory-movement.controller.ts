import { Controller, Post, Body } from '@nestjs/common';
import { PurchaseService } from './purchase.service';
import { ShrinkageService } from './shrinkage.service';
import { InventoryService } from './inventory.service';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto';

@Controller('inventory')
export class InventoryMovementController {
  constructor(
    private readonly purchaseService: PurchaseService,
    private readonly shrinkageService: ShrinkageService,
    private readonly inventoryService: InventoryService,
  ) {}

  @Post('movements/sync')
  async syncMovements(@Body() movements: CreateInventoryMovementDto[]) {
    return this.inventoryService.syncMovements(movements);
  }

  @Post('purchase')
  async recordPurchase(
    @Body()
    dto: {
      insumoId: string;
      supplierId: string;
      quantity: number;
      cost: number;
    },
  ) {
    return this.purchaseService.recordPurchase(
      dto.insumoId,
      dto.supplierId,
      dto.quantity,
      dto.cost,
    );
  }

  @Post('shrinkage')
  async recordShrinkage(
    @Body() dto: { insumoId: string; quantity: number; reason: string },
  ) {
    return this.shrinkageService.recordShrinkage(
      dto.insumoId,
      dto.quantity,
      dto.reason,
    );
  }
}
