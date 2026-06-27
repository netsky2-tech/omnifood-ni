import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { ROLES_KEY } from '../../core/decorators/roles.decorator';
import { UserRole } from '../identity/entities/user.entity';
import { AuthGuard } from '../identity/guards/auth.guard';
import { RolesGuard } from '../identity/guards/roles.guard';
import { InventoryMovementController } from './inventory-movement.controller';
import { InventoryPurchaseService } from './inventory-purchase.service';
import { ShrinkageService } from './shrinkage.service';
import { InventoryService } from './inventory.service';
import { RecipeService } from './recipe.service';

describe('InventoryController', () => {
  let controller: InventoryMovementController;
  let purchaseService: InventoryPurchaseService;
  let shrinkageService: ShrinkageService;
  let recipeService: RecipeService;
  let configService: ConfigService;

  const jwtServiceMock = {
    verifyAsync: jest.fn(),
  };

  const reflectorMock = {
    getAllAndOverride: jest.fn(),
  };

  const configServiceMock = {
    get: jest.fn().mockReturnValue('test-secret'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventoryMovementController],
      providers: [
        {
          provide: InventoryPurchaseService,
          useValue: {
            previewPurchase: jest.fn(),
            recordPurchase: jest.fn(),
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
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('keeps the recipe ingestion route protected by auth + role guards', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      InventoryMovementController.prototype,
      'ingestRecipeVersion',
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
    expect(configService).toBeDefined();
  });

  describe('recordPurchase', () => {
    it('should call purchaseService previewPurchase for review payload', async () => {
      const dto = {
        insumoId: 'ins-123',
        quantity: 10,
        unitCost: 50,
        currency: 'USD' as const,
        invoiceDate: '2026-01-10',
      };

      await controller.previewPurchase(dto, 'tenant-A');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(purchaseService.previewPurchase).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-A',
          currency: 'USD',
          invoiceDate: '2026-01-10',
        }),
      );
    });

    it('should call purchaseService recordPurchase', async () => {
      const dto = {
        insumoId: 'ins-123',
        quantity: 10,
        unitCost: 50,
        currency: 'NIO' as const,
        invoiceDate: '2026-01-10',
      };
      await controller.recordPurchase(dto, 'tenant-A');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(purchaseService.recordPurchase).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-A',
          insumoId: 'ins-123',
          quantity: 10,
          unitCost: 50,
          currency: 'NIO',
          invoiceDate: '2026-01-10',
        }),
      );
    });

    it('should pass batch capture metadata when provided', async () => {
      const dto = {
        insumoId: 'ins-321',
        quantity: 4,
        unitCost: 20,
        currency: 'NIO' as const,
        invoiceDate: '2026-01-12',
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
  });

  describe('recordShrinkage', () => {
    it('should call shrinkageService recordShrinkage', async () => {
      const dto = { insumoId: 'ins-123', quantity: 5, reason: 'Test' };
      await controller.recordShrinkage(dto);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(shrinkageService.recordShrinkage).toHaveBeenCalledWith(
        'ins-123',
        5,
        'Test',
      );
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
});
