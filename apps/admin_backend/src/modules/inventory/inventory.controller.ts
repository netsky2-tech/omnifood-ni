import { Controller, Post, Body } from '@nestjs/common';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('purchase')
  async recordPurchase(
    @Body() dto: { insumoId: string; quantity: number; cost: number },
  ) {
    return this.inventoryService.recordPurchase(
      dto.insumoId,
      dto.quantity,
      dto.cost,
    );
  }
}
