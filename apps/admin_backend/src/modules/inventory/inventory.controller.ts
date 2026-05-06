import { Controller, Post, Body, UseInterceptors } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { GetTenantId } from '../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../core/database/rls.interceptor';

@Controller('inventory')
@UseInterceptors(TenantInterceptor)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('purchase')
  async recordPurchase(
    @Body() dto: { insumoId: string; quantity: number; cost: number },
    @GetTenantId() tenantId: string,
  ) {
    return this.inventoryService.recordPurchase(
      dto.insumoId,
      dto.quantity,
      dto.cost,
      tenantId,
    );
  }
}
