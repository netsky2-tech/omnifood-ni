import { Test, TestingModule } from '@nestjs/testing';
import { InventoryMovementController } from './inventory-movement.controller';
import { PurchaseService } from './purchase.service';
import { ShrinkageService } from './shrinkage.service';

describe('InventoryController', () => {
  let controller: InventoryMovementController;
  let purchaseService: PurchaseService;
  let shrinkageService: ShrinkageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventoryMovementController],
      providers: [
        {
          provide: PurchaseService,
          useValue: {
            recordPurchase: jest.fn(),
          },
        },
        {
          provide: ShrinkageService,
          useValue: {
            recordShrinkage: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<InventoryMovementController>(
      InventoryMovementController,
    );
    purchaseService = module.get<PurchaseService>(PurchaseService);
    shrinkageService = module.get<ShrinkageService>(ShrinkageService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('recordPurchase', () => {
    it('should call purchaseService recordPurchase', async () => {
      const dto = {
        insumoId: 'ins-123',
        supplierId: 'sup-456',
        quantity: 10,
        cost: 50,
      };
      await controller.recordPurchase(dto);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(purchaseService.recordPurchase).toHaveBeenCalledWith(
        'ins-123',
        'sup-456',
        10,
        50,
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
