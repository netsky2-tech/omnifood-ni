import { Controller, Post, Body, UseInterceptors } from '@nestjs/common';
import { ShrinkageService } from './shrinkage.service';
import { InventoryService } from './inventory.service';
import { SyncMovementsDto } from './dto/create-inventory-movement.dto';
import { GetTenantId } from '../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../core/database/rls.interceptor';
import { InventoryPurchaseService } from './inventory-purchase.service';

@Controller('inventory')
@UseInterceptors(TenantInterceptor)
export class InventoryMovementController {
  constructor(
    private readonly purchaseService: InventoryPurchaseService,
    private readonly shrinkageService: ShrinkageService,
    private readonly inventoryService: InventoryService,
  ) {}

  @Post('movements/sync')
  async syncMovements(
    @Body() syncDto: SyncMovementsDto,
    @GetTenantId() tenantId: string,
  ) {
    return this.inventoryService.syncMovements(syncDto.movements, tenantId);
  }

  @Post('purchase')
  async recordPurchase(
    @Body()
    dto: {
      insumoId: string;
      quantity: number;
      unitCost: number;
      currency: 'NIO' | 'USD';
      invoiceDate: string;
      supplierName?: string;
    },
    @GetTenantId() tenantId: string,
  ) {
    return this.purchaseService.recordPurchase({
      tenantId,
      insumoId: dto.insumoId,
      quantity: dto.quantity,
      unitCost: dto.unitCost,
      currency: dto.currency,
      invoiceDate: dto.invoiceDate,
      supplierName: dto.supplierName,
    });
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
