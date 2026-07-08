import { Test, TestingModule } from '@nestjs/testing';
import { CostCalculatorService } from './cost-calculator.service';

describe('CostCalculatorService', () => {
  let service: CostCalculatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CostCalculatorService],
    }).compile();

    service = module.get<CostCalculatorService>(CostCalculatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateAverageCost', () => {
    it('should calculate weighted average cost correctly', () => {
      const currentStock = 10;
      const currentAverageCost = 100;
      const purchaseQuantity = 5;
      const purchaseUnitCost = 110;

      const result = service.calculateAverageCost(
        currentStock,
        currentAverageCost,
        purchaseQuantity,
        purchaseUnitCost,
      );

      // (10 * 100 + 5 * 110) / (10 + 5)
      // (1000 + 550) / 15 = 1550 / 15 = 103.33333333
      expect(result).toBeCloseTo(103.33333333, 8);
    });

    it('should handle zero initial stock', () => {
      const currentStock = 0;
      const currentAverageCost = 0;
      const purchaseQuantity = 10;
      const purchaseUnitCost = 50;

      const result = service.calculateAverageCost(
        currentStock,
        currentAverageCost,
        purchaseQuantity,
        purchaseUnitCost,
      );

      expect(result).toBe(50);
    });

    it('should return 0 if total stock is 0', () => {
      const result = service.calculateAverageCost(0, 0, 0, 0);
      expect(result).toBe(0);
    });
  });

  describe('calculatePurchaseCpp', () => {
    it('calculates CPP for zero stock using the NIO entry cost', () => {
      const result = service.calculatePurchaseCpp({
        currentStock: 0,
        currentCppNio: 0,
        entryQuantity: 10,
        entryUnitCost: 12.34567,
        currency: 'NIO',
      });

      expect(result).toEqual({
        previousStock: 0,
        previousCppNio: 0,
        projectedStock: 10,
        unitCostNio: 12.3457,
        projectedCppNio: 12.3457,
      });
    });

    it('calculates CPP when stock is temporarily negative', () => {
      const result = service.calculatePurchaseCpp({
        currentStock: -5,
        currentCppNio: 50,
        entryQuantity: 10,
        entryUnitCost: 80,
        currency: 'NIO',
      });

      // (-5 * 50 + 10 * 80) / (-5 + 10) = 550 / 5 = 110
      expect(result).toEqual({
        previousStock: -5,
        previousCppNio: 50,
        projectedStock: 5,
        unitCostNio: 80,
        projectedCppNio: 110,
      });
    });

    it('returns zero CPP when a purchase exactly offsets temporary negative stock', () => {
      const result = service.calculatePurchaseCpp({
        currentStock: -10,
        currentCppNio: 50,
        entryQuantity: 10,
        entryUnitCost: 80,
        currency: 'NIO',
      });

      expect(result).toEqual({
        previousStock: -10,
        previousCppNio: 50,
        projectedStock: 0,
        unitCostNio: 80,
        projectedCppNio: 0,
      });
    });

    it('converts USD unit cost with the provided BCN rate before CPP', () => {
      const result = service.calculatePurchaseCpp({
        currentStock: 8,
        currentCppNio: 40,
        entryQuantity: 4,
        entryUnitCost: 2.5,
        currency: 'USD',
        bcnRateNio: 36.7123,
      });

      expect(result.unitCostNio).toBe(91.7808);
      expect(result.projectedCppNio).toBe(57.2603);
    });

    it('rounds purchase CPP outputs to 4 decimals', () => {
      const result = service.calculatePurchaseCpp({
        currentStock: 3,
        currentCppNio: 1.11119,
        entryQuantity: 2,
        entryUnitCost: 2.22229,
        currency: 'NIO',
      });

      expect(result.previousCppNio).toBe(1.1112);
      expect(result.unitCostNio).toBe(2.2223);
      expect(result.projectedCppNio).toBe(1.5556);
    });
  });
});
