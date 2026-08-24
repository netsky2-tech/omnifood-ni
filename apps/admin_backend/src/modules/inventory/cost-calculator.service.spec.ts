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
    it('calculates weighted average CPP for positive inventory', () => {
      const result = service.calculatePurchaseCpp({
        currentStock: 10,
        currentCppNio: 100,
        entryQuantity: 5,
        entryUnitCost: 110,
        currency: 'NIO',
      });

      expect(result).toEqual({
        previousStock: 10,
        previousCppNio: 100,
        projectedStock: 15,
        unitCostNio: 110,
        projectedCppNio: 103.3333,
      });
    });

    it('uses entry unit cost directly when starting stock is zero', () => {
      const result = service.calculatePurchaseCpp({
        currentStock: 0,
        currentCppNio: 0,
        entryQuantity: 10,
        entryUnitCost: 50,
        currency: 'NIO',
      });

      expect(result).toEqual({
        previousStock: 0,
        previousCppNio: 0,
        projectedStock: 10,
        unitCostNio: 50,
        projectedCppNio: 50,
      });
    });

    it('resets projected stock and CPP when stock reaches zero', () => {
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

  describe('calculateRecipeTheoreticalCost', () => {
    it('calculates total batch cost, unit theoretical cost, and margins from components and CPPs', () => {
      const result = service.calculateRecipeTheoreticalCost({
        yieldQuantity: 4, // 4 portions
        sellingPriceNio: 120.0, // C$120.00 selling price per portion
        components: [
          {
            ingredientId: 'ins-carne',
            ingredientName: 'Carne Molida',
            ingredientType: 'INSUMO',
            grossQuantity: 0.8, // 0.8 kg
            technicalShrinkPct: 10.0, // 10% shrink
            unitCostNio: 150.0, // C$150/kg -> 0.8 * 150 = C$120.00
          },
          {
            ingredientId: 'ins-pasta',
            ingredientName: 'Pasta',
            ingredientType: 'INSUMO',
            grossQuantity: 0.4, // 0.4 kg
            technicalShrinkPct: 0,
            unitCostNio: 50.0, // C$50/kg -> 0.4 * 50 = C$20.00
          },
          {
            ingredientId: 'sub-salsa',
            ingredientName: 'Salsa Casera',
            ingredientType: 'SUB_RECIPE',
            grossQuantity: 0.5, // 0.5 L
            technicalShrinkPct: 5.0,
            unitCostNio: 80.0, // C$80/L -> 0.5 * 80 = C$40.00
          },
        ],
      });

      // Total Batch Cost: 120 + 20 + 40 = C$180.00
      expect(result.totalBatchCostNio).toBe(180.0);
      // Unit Theoretical Cost (per portion): 180 / 4 = C$45.00
      expect(result.unitTheoreticalCostNio).toBe(45.0);
      // Margins: Selling Price 120 - Cost 45 = C$75.00 margin (62.5%)
      expect(result.grossMarginNio).toBe(75.0);
      expect(result.grossMarginPct).toBe(62.5);

      // Component breakdown percentages
      expect(result.components).toHaveLength(3);
      // Carne: 120 / 180 = 66.6667%
      expect(result.components[0].totalCostNio).toBe(120.0);
      expect(result.components[0].costPercentage).toBeCloseTo(66.6667, 4);
      // Pasta: 20 / 180 = 11.1111%
      expect(result.components[1].totalCostNio).toBe(20.0);
      expect(result.components[1].costPercentage).toBeCloseTo(11.1111, 4);
      // Salsa: 40 / 180 = 22.2222%
      expect(result.components[2].totalCostNio).toBe(40.0);
      expect(result.components[2].costPercentage).toBeCloseTo(22.2222, 4);
    });

    it('handles zero yield gracefully by defaulting unit cost to total batch cost', () => {
      const result = service.calculateRecipeTheoreticalCost({
        yieldQuantity: 0,
        components: [
          {
            ingredientId: 'ins-1',
            ingredientType: 'INSUMO',
            grossQuantity: 1,
            technicalShrinkPct: 0,
            unitCostNio: 50.0,
          },
        ],
      });

      expect(result.totalBatchCostNio).toBe(50.0);
      expect(result.unitTheoreticalCostNio).toBe(50.0);
    });
  });
});
