import {
  BadRequestException,
  Get,
  Controller,
  Post,
  Body,
  Param,
  Query,
  UnauthorizedException,
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
import { SyncTransportGuard } from '../identity/guards/sync-transport.guard';
import type { RequestWithDevicePrincipal } from '../identity/guards/sync-transport.guard';
import { RequireSyncScopes } from '../identity/decorators/sync-scopes.decorator';
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

const TERMINAL_IDEMPOTENCY_PREFIX = 'production';

const readAuthenticatedTerminalId = (
  request: RequestWithDevicePrincipal,
): string | undefined => {
  // Device transport: the terminal identity is the device the transport guard
  // authenticated (the device principal), never a claim from a human session.
  const terminalId = request.devicePrincipal?.deviceId;

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

const bindProductionDocumentTerminal = (
  document: ProductionOrderDocumentDto,
  request: RequestWithDevicePrincipal,
): ProductionOrderDocumentDto => {
  const authenticatedTerminalId = readAuthenticatedTerminalId(request);
  const terminalId = authenticatedTerminalId || document.terminalId?.trim();
  if (!terminalId) {
    throw new BadRequestException(
      'terminalId is required for production order documents (claim or payload)',
    );
  }

  if (!authenticatedTerminalId && document.idempotencyKey?.includes(':')) {
    const segments = document.idempotencyKey.split(':');
    if (segments.length >= 3 && segments[1] !== terminalId) {
      throw new BadRequestException(
        'production terminalId must match the terminal segment in idempotencyKey when no authenticated terminal claim is available',
      );
    }
  }

  const idempotencyKey = document.idempotencyKey?.includes(':')
    ? buildProductionIdempotencyKeyForTerminal(
        document.idempotencyKey,
        terminalId,
      )
    : `production:${terminalId}:${document.id}`;

  return Object.assign(new ProductionOrderDocumentDto(), document, {
    idempotencyKey,
    terminalId,
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

  /**
   * Fail-closed tenant binding for the device transport routes: the tenant
   * always comes from the authenticated device principal the transport guard
   * attached, never from a human user. On a valid device token this is always
   * present; the check keeps an unbound request from reaching the services.
   */
  private requireTenant(tenantId?: string): string {
    if (!tenantId?.trim()) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return tenantId.trim();
  }

  // ST-05 (issue #314): the former `GET /inventory/alerts` surface is
  // retired. It answered the stock-summary report shape the POS forensic
  // model cannot consume; forensic alerts now reach terminals only through
  // the device-authenticated `/v1/sync/inbound/deltas` projection. The
  // distinct `/inventory/reports/alerts` report surface remains intact.

  @Post('movements/sync')
  @UseGuards(SyncTransportGuard)
  @RequireSyncScopes('sync:push')
  async syncMovements(
    @Body() syncDto: SyncMovementsDto,
    @GetTenantId() tenantId: string | undefined,
  ) {
    return this.inventoryService.syncMovements(
      syncDto.movements,
      this.requireTenant(tenantId),
    );
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
  // Device transport (ST-03, issue #478): this write is transmitted by the POS
  // background sync pass, where no human session is guaranteed. The
  // AuthoritativeCurrentUserGuard human authorization that used to gate this
  // route is gone: actor authorization is now a declared dependency on the
  // DSI-6/OHAC offline-human-authorization workstream (founder decision,
  // 2026-09-21). Device identity alone is not recorded as sufficient
  // authority; authorization is captured at authoring time, not at transmit
  // time.
  @UseGuards(SyncTransportGuard)
  @RequireSyncScopes('sync:push')
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
  @UseGuards(SyncTransportGuard)
  @RequireSyncScopes('sync:push')
  async recordShrinkage(
    @Body() dto: CreateShrinkageDto,
    @GetTenantId() tenantId: string | undefined,
  ) {
    // Device transport only: the tenant identity comes from the device
    // principal the guard validated, never from a human user or the body.
    // Issue #512: the insumos/products tables are tenant-protected, so the
    // shrinkage write runs inside a tenant-bound transaction; the bound
    // tenant id must be threaded in here and fail closed when missing.
    const boundTenantId = this.requireTenant(tenantId);
    if (dto.targetType === 'PRODUCT') {
      return this.shrinkageService.recordProductShrinkage(boundTenantId, {
        productId: dto.productId ?? '',
        quantity: dto.quantity,
        reason: dto.reason,
        observation: dto.observation,
        recipeVersionId: dto.recipeVersionId,
      });
    }

    return this.shrinkageService.recordShrinkage(
      boundTenantId,
      dto.insumoId,
      dto.quantity,
      dto.reason,
      dto.observation,
    );
  }

  @Post('count-sessions')
  // Device transport (ST-04, issue #445): this write is transmitted by the POS
  // background sync pass, where no human session is guaranteed. The
  // AuthoritativeCurrentUserGuard human authorization that a human route
  // would carry is absent: actor authorization is a declared dependency on
  // the DSI-6/OHAC offline-human-authorization workstream (founder decision,
  // 2026-09-21). Device identity alone is not recorded as sufficient
  // authority; authorization is captured at authoring time, not at transmit
  // time.
  @UseGuards(SyncTransportGuard)
  @RequireSyncScopes('sync:push')
  async recordCountSession(
    @Body() dto: CountSessionDocumentDto,
    @GetTenantId() tenantId: string | undefined,
  ) {
    return this.countSessionService.replayCountSession({
      tenantId: this.requireTenant(tenantId),
      document: dto,
    });
  }

  @Post('production-orders/close')
  // Device transport (ST-03, issue #478): this write is transmitted by the POS
  // background sync pass, where no human session is guaranteed. The
  // AuthoritativeCurrentUserGuard human authorization that used to gate this
  // route is gone: actor authorization is now a declared dependency on the
  // DSI-6/OHAC offline-human-authorization workstream (founder decision,
  // 2026-09-21). Device identity alone is not recorded as sufficient
  // authority; authorization is captured at authoring time, not at transmit
  // time. The terminal is bound from the authenticated device principal.
  @UseGuards(SyncTransportGuard)
  @RequireSyncScopes('sync:push')
  async closeProductionOrder(
    @Body() dto: ProductionOrderDocumentDto,
    @GetTenantId() tenantId: string,
    @Req() request: RequestWithDevicePrincipal,
  ) {
    return this.productionService.replayProductionClose({
      tenantId,
      document: bindProductionDocumentTerminal(dto, request),
    });
  }

  @Post('recipes/versions')
  // Device transport (ST-03, issue #478): this write is transmitted by the POS
  // background sync pass, where no human session is guaranteed. The
  // AuthoritativeCurrentUserGuard human authorization that used to gate this
  // route is gone: actor authorization is now a declared dependency on the
  // DSI-6/OHAC offline-human-authorization workstream (founder decision,
  // 2026-09-21). Device identity alone is not recorded as sufficient
  // authority; authorization is captured at authoring time, not at transmit
  // time.
  @UseGuards(SyncTransportGuard)
  @RequireSyncScopes('sync:push')
  async ingestRecipeVersion(
    @Body() dto: SyncRecipeVersionDocumentDto,
    @GetTenantId() tenantId: string,
  ) {
    console.log(
      '[RECIPE-VERSION] tenantId=%s dto.id=%s productId=%s components=%d',
      tenantId,
      dto.id,
      dto.productId,
      dto.components?.length,
    );
    try {
      const result = await this.recipeService.ingestPosVersion({
        tenantId,
        dto,
      });
      console.log(
        '[RECIPE-VERSION] SUCCESS recipeVersionId=%s',
        result?.recipeVersionId,
      );
      return result;
    } catch (err: unknown) {
      const errName = err instanceof Error ? err.name : 'Unknown';
      const errMessage =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : JSON.stringify(err);
      console.error('[RECIPE-VERSION] ERROR %s: %s', errName, errMessage);
      throw err;
    }
  }
}
