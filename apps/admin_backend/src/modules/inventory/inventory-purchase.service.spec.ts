import { Test, TestingModule } from '@nestjs/testing';
import {
  FX_RATE_RESOLVER,
  InventoryPurchaseService,
} from './inventory-purchase.service';
import { InventoryMovementService } from './inventory-movement.service';

describe('InventoryPurchaseService', () => {
  let service: InventoryPurchaseService;
  const postPurchaseMovement = jest.fn();
  const resolveBcnRateByDate = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryPurchaseService,
        {
          provide: InventoryMovementService,
          useValue: { postPurchaseMovement },
        },
        {
          provide: FX_RATE_RESOLVER,
          useValue: { resolveBcnRateByDate },
        },
      ],
    }).compile();

    service = module.get<InventoryPurchaseService>(InventoryPurchaseService);
  });

  it('converts USD purchase using BCN rate for invoice date', async () => {
    resolveBcnRateByDate.mockResolvedValue(36.5);
    postPurchaseMovement.mockResolvedValue({ id: 'ins-1' });

    await service.recordPurchase({
      tenantId: 'tenant-A',
      insumoId: 'ins-1',
      quantity: 10,
      unitCost: 2,
      currency: 'USD',
      invoiceDate: '2026-01-01',
      supplierName: 'Proveedor X',
    });

    expect(resolveBcnRateByDate).toHaveBeenCalledWith('2026-01-01');
    expect(postPurchaseMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        unitCostNio: 73,
      }),
    );
  });

  it('keeps NIO purchases in NIO-only CPP input rounded to 4 decimals', async () => {
    postPurchaseMovement.mockResolvedValue({ id: 'ins-1' });

    await service.recordPurchase({
      tenantId: 'tenant-A',
      insumoId: 'ins-1',
      quantity: 1,
      unitCost: 10.123456,
      currency: 'NIO',
      invoiceDate: '2026-01-02',
    });

    expect(resolveBcnRateByDate).not.toHaveBeenCalled();
    expect(postPurchaseMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        unitCostNio: 10.1235,
      }),
    );
  });
});
