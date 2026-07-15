import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { ROLES_KEY } from '../../core/decorators/roles.decorator';
import { UserRole } from '../identity/entities/user.entity';
import { AuthGuard } from '../identity/guards/auth.guard';
import { RolesGuard } from '../identity/guards/roles.guard';
import {
  IDENTITY_JWT_CONFIG,
  type IdentityJwtConfig,
} from '../identity/config/identity-jwt.config';
import { InventoryMovementController } from './inventory-movement.controller';
import { FxRateResolverService } from './fx-rate-resolver.service';
import { InventoryPurchaseService } from './inventory-purchase.service';
import { ShrinkageService } from './shrinkage.service';
import { InventoryService } from './inventory.service';
import { RecipeService } from './recipe.service';
import { CountSessionService } from './count-session.service';
import { ProductionService } from './production.service';

describe('InventoryController', () => {
  let controller: InventoryMovementController;
  let purchaseService: InventoryPurchaseService;
  let shrinkageService: ShrinkageService;
  let recipeService: RecipeService;
  let countSessionService: CountSessionService;
  let configService: ConfigService;
  const getBcnRateByInvoiceDate = jest.fn();

  const jwtServiceMock = {
    verifyAsync: jest.fn(),
  };

  const reflectorMock = {
    getAllAndOverride: jest.fn(),
  };

  const jwtEnvironment = {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-only-jwt-secret-with-at-least-thirty-two-bytes',
    JWT_ISSUER: 'omnifood-admin-test',
    JWT_AUDIENCE: 'omnifood-pos-test',
    JWT_ACCESS_TTL_SECONDS: '3600',
    JWT_REFRESH_TTL_SECONDS: '604800',
    JWT_CLOCK_TOLERANCE_SECONDS: '5',
    JWT_ALGORITHM: 'HS256',
  } as const;

  const configServiceMock = {
    get: jest.fn((key: keyof typeof jwtEnvironment) => jwtEnvironment[key]),
  };
  const identityJwtConfig: IdentityJwtConfig = {
    secret: jwtEnvironment.JWT_SECRET,
    issuer: jwtEnvironment.JWT_ISSUER,
    audience: jwtEnvironment.JWT_AUDIENCE,
    accessTokenTtlSeconds: Number(jwtEnvironment.JWT_ACCESS_TTL_SECONDS),
    refreshTokenTtlSeconds: Number(jwtEnvironment.JWT_REFRESH_TTL_SECONDS),
    clockToleranceSeconds: Number(jwtEnvironment.JWT_CLOCK_TOLERANCE_SECONDS),
    algorithm: jwtEnvironment.JWT_ALGORITHM,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventoryMovementController],
      providers: [
        {
          provide: FxRateResolverService,
          useValue: {
            getBcnRateByInvoiceDate,
          },
        },
        {
          provide: InventoryPurchaseService,
          useValue: {
            previewPurchase: jest.fn(),
            recordPurchase: jest.fn(),
            correctPurchase: jest.fn(),
          },
        },
        {
          provide: ShrinkageService,
          useValue: {
            recordShrinkage: jest.fn(),
          },
        },
        {
          provide: InventoryService,
          useValue: {
            syncMovements: jest.fn(),
          },
        },
        {
          provide: RecipeService,
          useValue: {
            ingestPosVersion: jest.fn(),
          },
        },
        {
          provide: CountSessionService,
          useValue: {
            replayCountSession: jest.fn(),
          },
        },
        {
          provide: ProductionService,
          useValue: {
            replayProductionClose: jest.fn(),
          },
        },
        AuthGuard,
        RolesGuard,
        {
          provide: JwtService,
          useValue: jwtServiceMock,
        },
        {
          provide: Reflector,
          useValue: reflectorMock,
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
        {
          provide: IDENTITY_JWT_CONFIG,
          useValue: identityJwtConfig,
        },
      ],
    }).compile();

    controller = module.get<InventoryMovementController>(
      InventoryMovementController,
    );
    purchaseService = module.get<InventoryPurchaseService>(
      InventoryPurchaseService,
    );
    shrinkageService = module.get<ShrinkageService>(ShrinkageService);
    recipeService = module.get<RecipeService>(RecipeService);
    countSessionService = module.get<CountSessionService>(CountSessionService);
    configService = module.get<ConfigService>(ConfigService);
  });

  const expectRouteToRequireInventoryWriterRole = (
    handlerName:
      | 'previewPurchase'
      | 'recordPurchase'
      | 'correctPurchase'
      | 'ingestRecipeVersion'
      | 'getBcnFxRate',
  ): void => {
    const descriptor = Object.getOwnPropertyDescriptor(
      InventoryMovementController.prototype,
      handlerName,
    ) as TypedPropertyDescriptor<(...args: never[]) => unknown> | undefined;
    const handler = descriptor?.value;

    expect(handler).toBeDefined();
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
      AuthGuard,
      RolesGuard,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([
      UserRole.OWNER,
      UserRole.MANAGER,
    ]);
  };

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('keeps the recipe ingestion route protected by auth + role guards', () => {
    expectRouteToRequireInventoryWriterRole('ingestRecipeVersion');
    expect(configService).toBeDefined();
  });

  it('keeps the purchase preview route protected by auth + role guards', () => {
    expectRouteToRequireInventoryWriterRole('previewPurchase');
  });

  it('keeps the purchase posting route protected by auth + role guards', () => {
    expectRouteToRequireInventoryWriterRole('recordPurchase');
  });

  it('keeps the purchase correction route protected by auth + role guards', () => {
    expectRouteToRequireInventoryWriterRole('correctPurchase');
  });

  it('keeps the BCN FX lookup route protected by auth + role guards', () => {
    expectRouteToRequireInventoryWriterRole('getBcnFxRate');
  });

  describe('recordPurchase', () => {
    it('should call purchaseService previewPurchase for review payload', async () => {
      const dto = {
        id: 'purchase-doc-1',
        insumoId: 'ins-123',
        supplierId: 'sup-1',
        invoiceNumber: 'INV-1001',
        quantity: 10,
        unitCost: 50,
        currency: 'USD' as const,
        invoiceDate: '2026-01-10',
        entryTimestamp: '2026-01-10T08:15:00.000Z',
        fxRateMode: 'official' as const,
        bcnRate: 36.5,
      };

      await controller.previewPurchase(dto, 'tenant-A');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(purchaseService.previewPurchase).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-A',
          currency: 'USD',
          invoiceDate: '2026-01-10',
          fxRateMode: 'official',
        }),
      );
    });

    it('should call purchaseService recordPurchase', async () => {
      const dto = {
        id: 'purchase-doc-1',
        insumoId: 'ins-123',
        supplierId: 'sup-1',
        invoiceNumber: 'INV-1001',
        quantity: 10,
        unitCost: 50,
        currency: 'NIO' as const,
        fxRateMode: 'explicit' as const,
        invoiceDate: '2026-01-10',
        entryTimestamp: '2026-01-10T08:15:00.000Z',
      };
      await controller.recordPurchase(dto, 'tenant-A');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(purchaseService.recordPurchase).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-A',
          insumoId: 'ins-123',
          supplierId: 'sup-1',
          invoiceNumber: 'INV-1001',
          quantity: 10,
          unitCost: 50,
          currency: 'NIO',
          fxRateMode: 'explicit',
          invoiceDate: '2026-01-10',
          entryTimestamp: '2026-01-10T08:15:00.000Z',
        }),
      );
    });

    it('should pass batch capture metadata when provided', async () => {
      const dto = {
        id: 'purchase-doc-2',
        insumoId: 'ins-321',
        supplierId: 'sup-1',
        invoiceNumber: 'INV-1002',
        quantity: 4,
        unitCost: 20,
        currency: 'NIO' as const,
        invoiceDate: '2026-01-12',
        entryTimestamp: '2026-01-12T09:00:00.000Z',
        lotCode: 'LOT-001',
        receivedDate: '2026-01-12',
        expirationDate: '2026-02-12',
      };

      await controller.recordPurchase(dto, 'tenant-A');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(purchaseService.recordPurchase).toHaveBeenCalledWith(
        expect.objectContaining({
          lotCode: 'LOT-001',
          receivedDate: '2026-01-12',
          expirationDate: '2026-02-12',
        }),
      );
    });

    it('should call purchaseService correctPurchase for append-only corrections', async () => {
      await controller.correctPurchase(
        'purchase-doc-1',
        { reason: 'Wrong invoice entered' },
        'tenant-A',
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(purchaseService.correctPurchase).toHaveBeenCalledWith({
        tenantId: 'tenant-A',
        purchaseDocumentId: 'purchase-doc-1',
        reason: 'Wrong invoice entered',
      });
    });
  });

  describe('recordShrinkage', () => {
    it('should call shrinkageService recordShrinkage', async () => {
      const dto = {
        insumoId: 'ins-123',
        quantity: 5,
        reason: 'MALA_PREPARACION',
        observation: 'Prep loss confirmed',
      };
      await controller.recordShrinkage(dto);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(shrinkageService.recordShrinkage).toHaveBeenCalledWith(
        'ins-123',
        5,
        'MALA_PREPARACION',
        'Prep loss confirmed',
      );
    });
  });

  describe('getBcnFxRate', () => {
    it('delegates the invoice date query to FxRateResolverService', async () => {
      await controller.getBcnFxRate({ invoiceDate: '2026-01-03' });

      expect(getBcnRateByInvoiceDate).toHaveBeenCalledWith('2026-01-03');
    });
  });

  describe('ingestRecipeVersion', () => {
    it('delegates tenant + dto to recipeService.ingestPosVersion', async () => {
      const dto = {
        id: '00000000-0000-4000-8000-000000000abc',
        productId: '00000000-0000-4000-8000-000000000prd',
        productName: 'Gallopinto',
        versionNumber: 1,
        yieldQuantity: 10,
        technicalShrinkPct: 0,
        createdAt: '2026-06-26T12:00:00.000Z',
        publishedAt: '2026-06-26T12:00:00.000Z',
        components: [
          {
            ingredientId: '00000000-0000-4000-8000-000000000ins',
            ingredientName: 'Arroz',
            ingredientType: 'INSUMO' as const,
            grossQuantity: 5,
            technicalShrinkPct: 0,
            componentUom: 'kg',
          },
        ],
      };

      await controller.ingestRecipeVersion(dto, 'tenant-A');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(recipeService.ingestPosVersion).toHaveBeenCalledWith({
        tenantId: 'tenant-A',
        dto,
      });
    });
  });

  describe('recordCountSession', () => {
    it('delegates tenant + count-session document to CountSessionService', async () => {
      const dto = {
        id: 'count-1',
        warehouseId: 'wh-1',
        warehouseName: 'Bodega Central',
        cutoffAt: '2026-06-02T10:00:00.000Z',
        status: 'posted' as const,
        createdAt: '2026-06-02T09:00:00.000Z',
        updatedAt: '2026-06-02T10:00:00.000Z',
        postedAt: '2026-06-02T10:00:00.000Z',
        movementReferences: ['count-1:line-1'],
        lines: [
          {
            id: 'line-1',
            insumoId: 'ins-1',
            insumoName: 'Leche',
            uom: 'L',
            theoreticalQuantity: 15,
            approvedEntryIndex: 0,
            entries: [{ countedQuantity: 10 }],
          },
        ],
      };

      await controller.recordCountSession(dto, 'tenant-A');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(countSessionService.replayCountSession).toHaveBeenCalledWith({
        tenantId: 'tenant-A',
        document: dto,
      });
    });
  });
});
