import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { SyncTransportGuard } from '../identity/guards/sync-transport.guard';
import {
  DEVICE_SYNC_JWT_CONFIG,
  type DeviceSyncJwtConfig,
} from '../identity/config/device-sync-jwt.config';
import { AuthGuard } from '../identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../identity/guards/authoritative-current-user.guard';
import { RolesGuard } from '../identity/guards/roles.guard';
import { CurrentUserAuthorizationService } from '../identity/services/current-user-authorization.service';
import {
  IDENTITY_JWT_CONFIG,
  type IdentityJwtConfig,
} from '../identity/config/identity-jwt.config';
import { SYNC_SCOPES_KEY } from '../identity/decorators/sync-scopes.decorator';
import { ROLES_KEY } from '../../core/decorators/roles.decorator';
import { InventoryMovementController } from './inventory-movement.controller';
import { InventoryService } from './inventory.service';
import { ShrinkageService } from './shrinkage.service';
import { FxRateResolverService } from './fx-rate-resolver.service';
import { InventoryPurchaseService } from './inventory-purchase.service';
import { RecipeService } from './recipe.service';
import { CountSessionService } from './count-session.service';
import { ProductionService } from './production.service';
import { InventoryReportsService } from './services/inventory-reports.service';
import { CreateShrinkageDto } from './dto/create-shrinkage.dto';
import type { SyncMovementsDto } from './dto/create-inventory-movement.dto';

const handlerOf = (handlerName: string): unknown => {
  const handler = Object.getOwnPropertyDescriptor(
    InventoryMovementController.prototype,
    handlerName,
  )?.value;
  if (typeof handler !== 'function') {
    throw new Error(`Missing ${handlerName} handler`);
  }
  return handler;
};

const unauthenticatedContext = (request: Record<string, unknown> = {}) =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

/**
 * Exercise the shrinkage delegation directly against the handler.
 */
const callRecordShrinkage = (
  controller: InventoryMovementController,
  dto: CreateShrinkageDto,
): Promise<unknown> =>
  (
    controller.recordShrinkage as unknown as (
      dto: CreateShrinkageDto,
    ) => Promise<unknown>
  )(dto);

describe('InventoryMovementController device transport routes', () => {
  let controller: InventoryMovementController;
  const inventoryService = { syncMovements: jest.fn() };
  const shrinkageService = {
    recordShrinkage: jest.fn(),
    recordProductShrinkage: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventoryMovementController],
      providers: [
        { provide: FxRateResolverService, useValue: {} },
        { provide: InventoryPurchaseService, useValue: {} },
        { provide: ShrinkageService, useValue: shrinkageService },
        { provide: InventoryService, useValue: inventoryService },
        { provide: RecipeService, useValue: {} },
        { provide: CountSessionService, useValue: {} },
        { provide: ProductionService, useValue: {} },
        { provide: InventoryReportsService, useValue: {} },
        AuthGuard,
        AuthoritativeCurrentUserGuard,
        RolesGuard,
        {
          provide: CurrentUserAuthorizationService,
          useValue: { authorize: jest.fn((token: unknown) => token) },
        },
        { provide: JwtService, useValue: { verifyAsync: jest.fn() } },
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
        {
          provide: ConfigService,
          useValue: { get: jest.fn(() => 'omnifood-test') },
        },
        {
          provide: IDENTITY_JWT_CONFIG,
          useValue: {
            secret: 'test-only-jwt-secret-with-at-least-thirty-two-bytes',
            issuer: 'omnifood-admin-test',
            audience: 'omnifood-pos-test',
            accessTokenTtlSeconds: 3600,
            refreshTokenTtlSeconds: 604800,
            clockToleranceSeconds: 5,
            algorithm: 'HS256',
          } as IdentityJwtConfig,
        },
        {
          // The real SyncTransportGuard stays as the declared route guard;
          // only its collaborators are mocked so the metadata assertions keep
          // referencing the class the platform actually validates tokens with.
          provide: DEVICE_SYNC_JWT_CONFIG,
          useValue: {
            secret: 'test-only-device-secret-with-at-least-32-bytes!!',
            issuer: 'omnifood-admin-test',
            audience: 'omnifood-device-test',
            accessTokenTtlSeconds: 3600,
            renewalTtlSeconds: 604800,
            clockToleranceSeconds: 5,
            algorithm: 'HS256',
          } as DeviceSyncJwtConfig,
        },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();

    controller = module.get<InventoryMovementController>(
      InventoryMovementController,
    );
    jest.clearAllMocks();
  });

  describe.each([
    ['POST inventory/movements/sync', 'syncMovements'],
    ['POST inventory/shrinkage', 'recordShrinkage'],
  ])('%s', (_route, handlerName) => {
    it('declares the device sync transport with the sync:push scope', () => {
      const handler = handlerOf(handlerName);

      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
        SyncTransportGuard,
      ]);
      expect(Reflect.getMetadata(SYNC_SCOPES_KEY, handler)).toEqual([
        'sync:push',
      ]);
    });

    it('leaves no human role gate on the device transport route', () => {
      const handler = handlerOf(handlerName);

      expect(Reflect.getMetadata(ROLES_KEY, handler)).toBeUndefined();
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).not.toContain(
        AuthGuard,
      );
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).not.toContain(
        RolesGuard,
      );
    });

    it('rejects an unauthenticated request with no device bearer token', async () => {
      // The real guard, not an override: fail-closed on a missing bearer is
      // the acceptance criterion for these routes (issue #445).
      const guard = new SyncTransportGuard(
        {} as JwtService,
        {} as DeviceSyncJwtConfig,
        {} as DataSource,
        new Reflector(),
      );

      await expect(
        guard.canActivate(unauthenticatedContext({ headers: {} })),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('syncMovements', () => {
    it('delegates the movement batch with the device principal tenant', async () => {
      const dto = { movements: [] } as unknown as SyncMovementsDto;

      await controller.syncMovements(dto, 'tenant-123');

      expect(inventoryService.syncMovements).toHaveBeenCalledWith(
        dto.movements,
        'tenant-123',
      );
    });

    it('fails closed when no tenant context is bound', async () => {
      const dto = { movements: [] } as unknown as SyncMovementsDto;

      await expect(controller.syncMovements(dto, undefined)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(inventoryService.syncMovements).not.toHaveBeenCalled();
    });
  });

  describe('recordShrinkage', () => {
    it('delegates insumo shrinkage to ShrinkageService', async () => {
      const dto = {
        targetType: 'INSUMO',
        insumoId: 'insumo-1',
        quantity: 2,
        reason: 'SPOILAGE',
        observation: 'broken jar',
      } as CreateShrinkageDto;
      shrinkageService.recordShrinkage.mockResolvedValue({ id: 'insumo-1' });

      await callRecordShrinkage(controller, dto);

      expect(shrinkageService.recordShrinkage).toHaveBeenCalledWith(
        'insumo-1',
        2,
        'SPOILAGE',
        'broken jar',
      );
    });

    it('delegates product shrinkage to ShrinkageService', async () => {
      const dto = {
        targetType: 'PRODUCT',
        productId: 'product-1',
        quantity: 1,
        reason: 'SPOILAGE',
        observation: 'expired batch',
      } as CreateShrinkageDto;
      shrinkageService.recordProductShrinkage.mockResolvedValue({
        id: 'product-1',
      });

      await callRecordShrinkage(controller, dto);

      expect(shrinkageService.recordProductShrinkage).toHaveBeenCalledWith({
        productId: 'product-1',
        quantity: 1,
        reason: 'SPOILAGE',
        observation: 'expired batch',
        recipeVersionId: undefined,
      });
    });
  });
});
