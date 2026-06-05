import { Test, TestingModule } from '@nestjs/testing';
import { InventoryMovementController } from './inventory-movement.controller';
import { InventoryPurchaseService } from './inventory-purchase.service';
import { ShrinkageService } from './shrinkage.service';
import { InventoryService } from './inventory.service';

describe('InventoryController', () => {
  let controller: InventoryMovementController;
  let purchaseService: InventoryPurchaseService;
  let shrinkageService: ShrinkageService;

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
      ],
    }).compile();

    controller = module.get<InventoryMovementController>(
      InventoryMovementController,
    );
    purchaseService = module.get<InventoryPurchaseService>(
      InventoryPurchaseService,
    );
    shrinkageService = module.get<ShrinkageService>(ShrinkageService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
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
});
