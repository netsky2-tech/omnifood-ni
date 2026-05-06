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
});
