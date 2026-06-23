import { UomConversionCalculator, roundToScale } from './uom-conversion-calculator';

describe('UomConversionCalculator', () => {
  const calculator = new UomConversionCalculator();

  describe('toInventoryBaseQuantity', () => {
    it('converts 50 lb -> 22.6796 kg using factor 0.453592 (the documented rule)', () => {
      // purchaseQuantity * factorToInventoryBase = inventoryBaseQuantity
      const result = calculator.toInventoryBaseQuantity(50, 0.453592);
      expect(result).toBe(22.6796);
    });

    it('is identity when factor is 1 (same unit)', () => {
      expect(calculator.toInventoryBaseQuantity(12.5, 1)).toBe(12.5);
    });

    it('rounds to 4 decimal places (NUMERIC 14,4)', () => {
      // 3 * 0.3333333 = 0.9999999 -> rounds to 1.0000
      expect(calculator.toInventoryBaseQuantity(3, 0.3333333)).toBe(1);
      // 1/3 lb in kg = 0.1511973... -> 0.1512
      expect(calculator.toInventoryBaseQuantity(1 / 3, 0.453592)).toBe(0.1512);
    });

    it('preserves the smallest 4-decimal increment (0.0001)', () => {
      expect(calculator.toInventoryBaseQuantity(0.0001, 1)).toBe(0.0001);
    });

    it('throws when factor is non-positive (infallible inventory guard)', () => {
      expect(() => calculator.toInventoryBaseQuantity(10, 0)).toThrow();
      expect(() => calculator.toInventoryBaseQuantity(10, -1)).toThrow();
    });

    it('converts a saco of 50lb directly to kg in one step', () => {
      // 1 saco = 50 lb, 1 lb = 0.453592 kg -> 1 saco = 22.6796 kg
      // Here the purchase unit is "saco" and factor already encodes kg/saco.
      expect(calculator.toInventoryBaseQuantity(2, 22.6796)).toBe(45.3592);
    });
  });

  describe('fromInventoryBaseQuantity (inverse)', () => {
    it('converts 22.6796 kg back to 50 lb', () => {
      expect(calculator.fromInventoryBaseQuantity(22.6796, 0.453592)).toBe(50);
    });

    it('throws when factor is non-positive', () => {
      expect(() => calculator.fromInventoryBaseQuantity(10, 0)).toThrow();
    });
  });

  describe('roundToScale', () => {
    it('rounds half away from zero', () => {
      expect(roundToScale(0.12345, 4)).toBe(0.1235);
      expect(roundToScale(-0.12345, 4)).toBe(-0.1235);
      expect(roundToScale(2.5, 0)).toBe(3);
    });
  });
});
