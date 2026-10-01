import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { validate } from 'class-validator';
import type { ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { Request } from 'express';
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
import { UserRole } from '../identity/entities/user.entity';
import { CreateShrinkageDto } from './dto/create-shrinkage.dto';
import type { SyncMovementsDto } from './dto/create-inventory-movement.dto';
import { ProductionOrderDocumentDto } from './dto/production-order-document.dto';
import { CountSessionDocumentDto } from './dto/count-session-document.dto';
import { ManualPurchaseDto } from './dto/purchase-manual.dto';
import { PurchaseDocumentDto } from './dto/purchase-document.dto';
import { PreviewPurchaseDto } from './dto/preview-purchase.dto';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
  ListSuppliersQueryDto,
} from './dto/supplier.dto';

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
 * Exercise the shrinkage delegation directly against the handler. Since the
 * tenant-bound transaction work (issue #512) the handler threads the tenant
 * id bound by the device transport guard into the shrinkage services.
 */
const callRecordShrinkage = (
  controller: InventoryMovementController,
  dto: CreateShrinkageDto,
  tenantId: string,
): Promise<unknown> =>
  (
    controller.recordShrinkage as unknown as (
      dto: CreateShrinkageDto,
      tenantId: string,
    ) => Promise<unknown>
  )(dto, tenantId);

describe('InventoryMovementController device transport routes', () => {
  let controller: InventoryMovementController;
  const inventoryService = { syncMovements: jest.fn() };
  const countSessionService = { replayCountSession: jest.fn() };
  const productionService = { replayProductionClose: jest.fn() };
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
        { provide: CountSessionService, useValue: countSessionService },
        { provide: ProductionService, useValue: productionService },
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
    ['POST inventory/purchases', 'recordPurchase'],
    ['POST inventory/recipes/versions', 'ingestRecipeVersion'],
    ['POST inventory/production-orders/close', 'closeProductionOrder'],
    ['POST inventory/count-sessions', 'recordCountSession'],
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

  describe('listPurchases (GET inventory/purchases — owner dashboard)', () => {
    it('declares the human transport with an OWNER/MANAGER role gate', () => {
      const handler = handlerOf('listPurchases');

      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
        AuthGuard,
      );
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
        RolesGuard,
      );
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([
        UserRole.OWNER,
        UserRole.MANAGER,
      ]);
      // Human oversight read: never the device transport guard or a push scope.
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).not.toContain(
        SyncTransportGuard,
      );
      expect(Reflect.getMetadata(SYNC_SCOPES_KEY, handler)).toBeUndefined();
    });

    it('delegates the history read to the purchase service with the bound tenant', async () => {
      const listPurchases = jest.fn().mockResolvedValue([]);
      (
        controller as unknown as {
          purchaseService: { listPurchases: unknown };
        }
      ).purchaseService = { listPurchases } as never;
      const query = {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        supplierId: 'sup-1',
        limit: 50,
      };

      await controller.listPurchases(
        query as never,
        'tenant-A',
      );

      expect(listPurchases).toHaveBeenCalledWith({
        tenantId: 'tenant-A',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        supplierId: 'sup-1',
        insumoId: undefined,
        limit: 50,
      });
    });
  });

  describe('purchase CPP preview (POST inventory/purchase — human transport)', () => {
    it('declares POST purchase as human with OWNER/MANAGER and never the device transport', () => {
      const handler = handlerOf('previewPurchase');

      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(AuthGuard);
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(RolesGuard);
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([
        UserRole.OWNER,
        UserRole.MANAGER,
      ]);
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).not.toContain(
        SyncTransportGuard,
      );
      expect(Reflect.getMetadata(SYNC_SCOPES_KEY, handler)).toBeUndefined();
    });

    // Bug fix (founder, 2026-09-30): the preview route validated with
    // PurchaseDocumentDto, whose @IsNotEmpty `id` the dashboard's
    // ManualPurchaseInput never sends (the document id is generated
    // server-side at commit). The preview is a read-only CPP projection —
    // `previewPurchase` never reads `id` — so its DTO must not require one.
    it('validates with the preview DTO so a payload without id is accepted', async () => {
      const previewPurchase = jest.fn().mockResolvedValue({});
      (
        controller as unknown as {
          purchaseService: { previewPurchase: unknown };
        }
      ).purchaseService = { previewPurchase } as never;
      const dto = Object.assign(new PreviewPurchaseDto(), {
        insumoId: 'ins-1',
        supplierId: 'sup-1',
        invoiceNumber: 'F-900',
        quantity: 2,
        unitCost: 50,
        currency: 'NIO',
        invoiceDate: '2026-09-30',
        entryTimestamp: '2026-09-30T10:00:00.000Z',
      });

      await controller.previewPurchase(dto, 'tenant-A');

      expect(previewPurchase).toHaveBeenCalledWith({
        // No id, no fiscalAuthorizationCode: the read-only projection never
        // consumes them (assertBatchMetadata and the fiscal code only apply
        // to the commit path, recordPurchase).
        id: undefined,
        fiscalAuthorizationCode: undefined,
        tenantId: 'tenant-A',
        insumoId: 'ins-1',
        supplierId: 'sup-1',
        invoiceNumber: 'F-900',
        quantity: 2,
        unitCost: 50,
        currency: 'NIO',
        invoiceDate: '2026-09-30',
        entryTimestamp: '2026-09-30T10:00:00.000Z',
        fxRateMode: undefined,
        bcnRate: undefined,
      });
    });

    it('still forwards explicit fx rate fields when present', async () => {
      const previewPurchase = jest.fn().mockResolvedValue({});
      (
        controller as unknown as {
          purchaseService: { previewPurchase: unknown };
        }
      ).purchaseService = { previewPurchase } as never;
      const dto = Object.assign(new PreviewPurchaseDto(), {
        insumoId: 'ins-1',
        supplierId: 'sup-1',
        invoiceNumber: 'F-900',
        quantity: 2,
        unitCost: 50,
        currency: 'USD',
        invoiceDate: '2026-09-30',
        entryTimestamp: '2026-09-30T10:00:00.000Z',
        fxRateMode: 'explicit',
        bcnRate: 36.5,
      });

      await controller.previewPurchase(dto, 'tenant-A');

      expect(previewPurchase).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: 'USD',
          fxRateMode: 'explicit',
          bcnRate: 36.5,
        }),
      );
    });

    // The preview must still fail closed on real input errors: dropping `id`
    // relaxes NOTHING else (§18.4 — the preview wall mirrors ManualPurchaseDto
    // minus exactly the commit-only fields).
    it('rejects a preview DTO with quantity 0', async () => {
      const dto = Object.assign(new PreviewPurchaseDto(), {
        insumoId: 'ins-1',
        supplierId: 'sup-1',
        invoiceNumber: 'F-900',
        quantity: 0,
        unitCost: 50,
        currency: 'NIO',
        invoiceDate: '2026-09-30',
        entryTimestamp: '2026-09-30T10:00:00.000Z',
      });

      const errors = await validate(dto);

      expect(errors.map((e) => e.property)).toContain('quantity');
    });

    it('rejects a USD preview DTO without bcnRate in explicit mode', async () => {
      const dto = Object.assign(new PreviewPurchaseDto(), {
        insumoId: 'ins-1',
        supplierId: 'sup-1',
        invoiceNumber: 'F-900',
        quantity: 2,
        unitCost: 50,
        currency: 'USD',
        invoiceDate: '2026-09-30',
        entryTimestamp: '2026-09-30T10:00:00.000Z',
        fxRateMode: 'explicit',
      });

      const errors = await validate(dto);

      expect(errors.map((e) => e.property)).toContain('bcnRate');
    });

    // Regression guard: the device transport contract keeps requiring the
    // document id; only the preview route dropped it.
    it('still rejects a PurchaseDocumentDto without id', async () => {
      const dto = Object.assign(new PurchaseDocumentDto(), {
        insumoId: 'ins-1',
        supplierId: 'sup-1',
        invoiceNumber: 'F-900',
        quantity: 2,
        unitCost: 50,
        currency: 'NIO',
        invoiceDate: '2026-09-30',
        entryTimestamp: '2026-09-30T10:00:00.000Z',
      });

      const errors = await validate(dto);

      expect(errors.map((e) => e.property)).toContain('id');
    });
  });

  describe('manual purchase + suppliers (SOHO purchases, human transport)', () => {
    it('declares POST purchases/manual as human with OWNER/MANAGER and never the device transport', () => {
      const handler = handlerOf('recordManualPurchase');

      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
        AuthGuard,
      );
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
        RolesGuard,
      );
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([
        UserRole.OWNER,
        UserRole.MANAGER,
      ]);
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).not.toContain(
        SyncTransportGuard,
      );
      expect(Reflect.getMetadata(SYNC_SCOPES_KEY, handler)).toBeUndefined();
    });

    it('declares GET suppliers as human with OWNER/MANAGER', () => {
      const handler = handlerOf('listSuppliers');

      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
        AuthGuard,
      );
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
        RolesGuard,
      );
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([
        UserRole.OWNER,
        UserRole.MANAGER,
      ]);
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).not.toContain(
        SyncTransportGuard,
      );
    });

    it('declares POST suppliers as human with OWNER/MANAGER', () => {
      const handler = handlerOf('createSupplier');

      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
        AuthGuard,
      );
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
        RolesGuard,
      );
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([
        UserRole.OWNER,
        UserRole.MANAGER,
      ]);
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).not.toContain(
        SyncTransportGuard,
      );
    });

    it('declares PUT suppliers/:id as human with OWNER/MANAGER', () => {
      const handler = handlerOf('updateSupplier');

      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
        AuthGuard,
      );
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
        RolesGuard,
      );
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([
        UserRole.OWNER,
        UserRole.MANAGER,
      ]);
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).not.toContain(
        SyncTransportGuard,
      );
    });

    it('delegates the manual purchase to recordPurchase with a server-generated id and the bound tenant', async () => {
      const recordPurchase = jest.fn().mockResolvedValue({});
      (
        controller as unknown as {
          purchaseService: { recordPurchase: unknown };
        }
      ).purchaseService = { recordPurchase } as never;
      const dto = Object.assign(new ManualPurchaseDto(), {
        insumoId: 'ins-1',
        supplierId: 'sup-1',
        invoiceNumber: 'F-900',
        quantity: 2,
        unitCost: 50,
        currency: 'NIO',
        invoiceDate: '2026-09-30',
        entryTimestamp: '2026-09-30T10:00:00.000Z',
      });

      await controller.recordManualPurchase(dto, 'tenant-A');

      expect(recordPurchase).toHaveBeenCalledTimes(1);
      const arg = recordPurchase.mock.calls[0][0];
      expect(arg.tenantId).toBe('tenant-A');
      // The human route generates the document id server-side; the form
      // never carries a POS document id.
      expect(typeof arg.id).toBe('string');
      expect(arg.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(arg).toMatchObject({
        insumoId: 'ins-1',
        supplierId: 'sup-1',
        invoiceNumber: 'F-900',
        quantity: 2,
        unitCost: 50,
        currency: 'NIO',
      });
    });

    it('delegates supplier creation with the bound tenant, never a body tenant', async () => {
      const createSupplier = jest.fn().mockResolvedValue({ id: 'sup-9' });
      (
        controller as unknown as {
          purchaseService: { createSupplier: unknown };
        }
      ).purchaseService = { createSupplier } as never;
      const dto = Object.assign(new CreateSupplierDto(), {
        name: 'Distribuidora Nica',
        phone: '5555-1234',
      });

      await controller.createSupplier(dto, 'tenant-A');

      expect(createSupplier).toHaveBeenCalledWith({
        tenantId: 'tenant-A',
        name: 'Distribuidora Nica',
        phone: '5555-1234',
        contactPerson: undefined,
        creditTerms: undefined,
      });
    });

    it('delegates the supplier list read with the bound tenant and query flags', async () => {
      const listSuppliers = jest.fn().mockResolvedValue([]);
      (
        controller as unknown as {
          purchaseService: { listSuppliers: unknown };
        }
      ).purchaseService = { listSuppliers } as never;

      const query = Object.assign(new ListSuppliersQueryDto(), {
        includeInactive: true,
      });

      await controller.listSuppliers('tenant-A', query);

      expect(listSuppliers).toHaveBeenCalledWith({
        tenantId: 'tenant-A',
        includeInactive: true,
      });
    });

    it('delegates supplier update with the bound tenant and route params', async () => {
      const updateSupplier = jest.fn().mockResolvedValue({ id: 'sup-1' });
      (
        controller as unknown as {
          purchaseService: { updateSupplier: unknown };
        }
      ).purchaseService = { updateSupplier } as never;

      const dto = Object.assign(new UpdateSupplierDto(), {
        name: 'Nuevo Nombre',
        phone: '8888-7777',
        isActive: false,
      });

      await controller.updateSupplier('sup-1', dto, 'tenant-A');

      expect(updateSupplier).toHaveBeenCalledWith({
        id: 'sup-1',
        tenantId: 'tenant-A',
        name: 'Nuevo Nombre',
        phone: '8888-7777',
        contactPerson: undefined,
        creditTerms: undefined,
        isActive: false,
      });
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

  describe('recordCountSession', () => {
    it('delegates the count document with the device principal tenant', async () => {
      const dto = Object.assign(new CountSessionDocumentDto(), {
        id: 'count-doc-1',
      });

      await controller.recordCountSession(dto, 'tenant-123');

      expect(countSessionService.replayCountSession).toHaveBeenCalledWith({
        tenantId: 'tenant-123',
        document: dto,
      });
    });

    it('fails closed when no tenant context is bound', async () => {
      const dto = Object.assign(new CountSessionDocumentDto(), {
        id: 'count-doc-1',
      });

      await expect(
        controller.recordCountSession(dto, undefined),
      ).rejects.toThrow(UnauthorizedException);
      expect(countSessionService.replayCountSession).not.toHaveBeenCalled();
    });
  });

  describe('closeProductionOrder', () => {
    it('binds the terminal from the device principal the transport guard validated, never from the payload', async () => {
      const dto = Object.assign(new ProductionOrderDocumentDto(), {
        id: 'prod-doc-1',
        terminalId: 'payload-spoofed-terminal',
        idempotencyKey: 'production:payload-spoofed-terminal:prod-doc-1',
        sourceSequence: 11,
        payloadHash: 'hash-1',
      });
      const request = {
        headers: {},
        devicePrincipal: {
          principalType: 'DEVICE_SYNC',
          credentialId: 'credential-1',
          tenantId: 'tenant-123',
          deviceId: 'terminal-claim-1',
          scopes: ['sync:push'],
          credentialVersion: 1,
        },
      } as unknown as Request;

      await controller.closeProductionOrder(dto, 'tenant-123', request);

      expect(productionService.replayProductionClose).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-123',
          document: expect.objectContaining({
            terminalId: 'terminal-claim-1',
            idempotencyKey: 'production:terminal-claim-1:prod-doc-1',
          }),
        }),
      );
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

      await callRecordShrinkage(controller, dto, 'tenant-123');

      expect(shrinkageService.recordShrinkage).toHaveBeenCalledWith(
        'tenant-123',
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

      await callRecordShrinkage(controller, dto, 'tenant-123');

      expect(shrinkageService.recordProductShrinkage).toHaveBeenCalledWith(
        'tenant-123',
        {
          productId: 'product-1',
          quantity: 1,
          reason: 'SPOILAGE',
          observation: 'expired batch',
          recipeVersionId: undefined,
        },
      );
    });
  });
});
