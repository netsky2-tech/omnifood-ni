import {
  BadRequestException,
  Get,
  Controller,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ShrinkageService } from './shrinkage.service';
import { InventoryService } from './inventory.service';
import { RecipeService } from './recipe.service';
import { SyncMovementsDto } from './dto/create-inventory-movement.dto';
import {
  PurchaseCorrectionDto,
  PurchaseDocumentDto,
} from './dto/purchase-document.dto';
import { SyncRecipeVersionDocumentDto } from './dto/sync-recipe-version-document.dto';
import { GetTenantId } from '../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../core/database/rls.interceptor';
import { InventoryPurchaseService } from './inventory-purchase.service';
import { AuthGuard } from '../identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../identity/guards/authoritative-current-user.guard';
import { RolesGuard } from '../identity/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { UserRole } from '../identity/entities/user.entity';
import { FxRateResolverService } from './fx-rate-resolver.service';
import { GetBcnFxRateQueryDto } from './dto/get-bcn-fx-rate-query.dto';
import { CreateShrinkageDto } from './dto/create-shrinkage.dto';
import { CountSessionService } from './count-session.service';
import { CountSessionDocumentDto } from './dto/count-session-document.dto';
import { ProductionOrderDocumentDto } from './dto/production-order-document.dto';
import { ProductionService } from './production.service';

interface RequestWithProductionTerminalClaim extends Request {
  user?: {
    terminal_id?: string;
    terminalId?: string;
    device_id?: string;
    deviceId?: string;
  };
}

const TERMINAL_IDEMPOTENCY_PREFIX = 'production';

const readAuthenticatedTerminalId = (
  request: RequestWithProductionTerminalClaim,
): string | undefined => {
  const terminalId =
    request.user?.terminal_id ??
    request.user?.terminalId ??
    request.user?.device_id ??
    request.user?.deviceId;

  return terminalId?.trim() || undefined;
};

const buildProductionIdempotencyKeyForTerminal = (
  idempotencyKey: string,
  terminalId: string,
): string => {
  const segments = idempotencyKey.split(':');
  if (segments.length < 3 || segments[0] !== TERMINAL_IDEMPOTENCY_PREFIX) {
    throw new BadRequestException(
      'production idempotencyKey must use production:{terminalId}:{documentId}',
    );
  }

  return [segments[0], terminalId, ...segments.slice(2)].join(':');
};

const assertPayloadTerminalMatchesIdempotencyKey = (
  document: ProductionOrderDocumentDto,
): void => {
  const segments = document.idempotencyKey.split(':');
  if (
    segments.length < 3 ||
    segments[0] !== TERMINAL_IDEMPOTENCY_PREFIX ||
    segments[1] !== document.terminalId
  ) {
    throw new BadRequestException(
      'production terminalId must match the terminal segment in idempotencyKey when no authenticated terminal claim is available',
    );
  }
};

const bindProductionDocumentTerminal = (
  document: ProductionOrderDocumentDto,
  request: RequestWithProductionTerminalClaim,
): ProductionOrderDocumentDto => {
  const authenticatedTerminalId = readAuthenticatedTerminalId(request);
  if (!authenticatedTerminalId) {
    assertPayloadTerminalMatchesIdempotencyKey(document);
    return document;
  }

  return Object.assign(new ProductionOrderDocumentDto(), document, {
    idempotencyKey: buildProductionIdempotencyKeyForTerminal(
      document.idempotencyKey,
      authenticatedTerminalId,
    ),
    terminalId: authenticatedTerminalId,
  });
};

@Controller('inventory')
@UseInterceptors(TenantInterceptor)
export class InventoryMovementController {
  constructor(
    private readonly fxRateResolverService: FxRateResolverService,
    private readonly purchaseService: InventoryPurchaseService,
    private readonly shrinkageService: ShrinkageService,
    private readonly inventoryService: InventoryService,
    private readonly recipeService: RecipeService,
    private readonly countSessionService: CountSessionService,
    private readonly productionService: ProductionService,
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
  @UseGuards(AuthGuard, AuthoritativeCurrentUserGuard, RolesGuard)
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

  @Post('purchases/:id/correction')
  @UseGuards(AuthGuard, AuthoritativeCurrentUserGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async correctPurchase(
    @Param('id') id: string,
    @Body() dto: PurchaseCorrectionDto,
    @GetTenantId() tenantId: string,
  ) {
    return this.purchaseService.correctPurchase({
      tenantId,
      purchaseDocumentId: id,
      reason: dto.reason,
    });
  }

  @Post('shrinkage')
  async recordShrinkage(@Body() dto: CreateShrinkageDto) {
    if (dto.targetType === 'PRODUCT') {
      return this.shrinkageService.recordProductShrinkage({
        productId: dto.productId ?? '',
        quantity: dto.quantity,
        reason: dto.reason,
        observation: dto.observation,
        recipeVersionId: dto.recipeVersionId,
      });
    }

    return this.shrinkageService.recordShrinkage(
      dto.insumoId,
      dto.quantity,
      dto.reason,
      dto.observation,
    );
  }

  @Post('count-sessions')
  async recordCountSession(
    @Body() dto: CountSessionDocumentDto,
    @GetTenantId() tenantId: string,
  ) {
    return this.countSessionService.replayCountSession({
      tenantId,
      document: dto,
    });
  }

  @Post('production-orders/close')
  @UseGuards(AuthGuard, AuthoritativeCurrentUserGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async closeProductionOrder(
    @Body() dto: ProductionOrderDocumentDto,
    @GetTenantId() tenantId: string,
    @Req() request: RequestWithProductionTerminalClaim,
  ) {
    return this.productionService.replayProductionClose({
      tenantId,
      document: bindProductionDocumentTerminal(dto, request),
    });
  }

  @Post('recipes/versions')
  @UseGuards(AuthGuard, AuthoritativeCurrentUserGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async ingestRecipeVersion(
    @Body() dto: SyncRecipeVersionDocumentDto,
    @GetTenantId() tenantId: string,
  ) {
    return this.recipeService.ingestPosVersion({ tenantId, dto });
  }
}
