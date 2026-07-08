import {
  Get,
  Controller,
  Post,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ShrinkageService } from './shrinkage.service';
import { InventoryService } from './inventory.service';
import { RecipeService } from './recipe.service';
import { SyncMovementsDto } from './dto/create-inventory-movement.dto';
import { PurchaseDocumentDto } from './dto/purchase-document.dto';
import { SyncRecipeVersionDocumentDto } from './dto/sync-recipe-version-document.dto';
import { GetTenantId } from '../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../core/database/rls.interceptor';
import { InventoryPurchaseService } from './inventory-purchase.service';
import { AuthGuard } from '../identity/guards/auth.guard';
import { RolesGuard } from '../identity/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { UserRole } from '../identity/entities/user.entity';
import { FxRateResolverService } from './fx-rate-resolver.service';
import { GetBcnFxRateQueryDto } from './dto/get-bcn-fx-rate-query.dto';

@Controller('inventory')
@UseInterceptors(TenantInterceptor)
export class InventoryMovementController {
  constructor(
    private readonly fxRateResolverService: FxRateResolverService,
    private readonly purchaseService: InventoryPurchaseService,
    private readonly shrinkageService: ShrinkageService,
    private readonly inventoryService: InventoryService,
    private readonly recipeService: RecipeService,
  ) {}

  @Post('movements/sync')
  async syncMovements(
    @Body() syncDto: SyncMovementsDto,
    @GetTenantId() tenantId: string,
  ) {
    return this.inventoryService.syncMovements(syncDto.movements, tenantId);
  }

  @Post('purchase')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async previewPurchase(
    @Body() dto: PurchaseDocumentDto,
    @GetTenantId() tenantId: string,
  ) {
    return this.purchaseService.previewPurchase({
      id: dto.id,
      tenantId,
      insumoId: dto.insumoId,
      supplierId: dto.supplierId,
      invoiceNumber: dto.invoiceNumber,
      fiscalAuthorizationCode: dto.fiscalAuthorizationCode,
      quantity: dto.quantity,
      unitCost: dto.unitCost,
      currency: dto.currency,
      invoiceDate: dto.invoiceDate,
      entryTimestamp: dto.entryTimestamp,
      fxRateMode: dto.fxRateMode,
      bcnRate: dto.bcnRate,
    });
  }

  @Get('fx/bcn')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getBcnFxRate(@Query() query: GetBcnFxRateQueryDto) {
    return this.fxRateResolverService.getBcnRateByInvoiceDate(
      query.invoiceDate,
    );
  }

  @Post('purchases')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async recordPurchase(
    @Body() dto: PurchaseDocumentDto,
    @GetTenantId() tenantId: string,
  ) {
    return this.purchaseService.recordPurchase({
      id: dto.id,
      tenantId,
      insumoId: dto.insumoId,
      supplierId: dto.supplierId,
      invoiceNumber: dto.invoiceNumber,
      fiscalAuthorizationCode: dto.fiscalAuthorizationCode,
      quantity: dto.quantity,
      unitCost: dto.unitCost,
      currency: dto.currency,
      invoiceDate: dto.invoiceDate,
      entryTimestamp: dto.entryTimestamp,
      fxRateMode: dto.fxRateMode,
      bcnRate: dto.bcnRate,
      lotCode: dto.lotCode,
      receivedDate: dto.receivedDate,
      expirationDate: dto.expirationDate,
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

  @Post('recipes/versions')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async ingestRecipeVersion(
    @Body() dto: SyncRecipeVersionDocumentDto,
    @GetTenantId() tenantId: string,
  ) {
    return this.recipeService.ingestPosVersion({ tenantId, dto });
  }
}
