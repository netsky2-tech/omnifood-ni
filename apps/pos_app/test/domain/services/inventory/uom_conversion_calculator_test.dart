import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/services/inventory/uom_conversion_calculator.dart';

void main() {
  const calculator = UomConversionCalculator();

  group('UomConversionCalculator', () {
    group('toInventoryBaseQuantity', () {
      test('converts 50 lb -> 22.6796 kg using factor 0.453592 (the documented rule)', () {
        // purchaseQuantity * factorToInventoryBase = inventoryBaseQuantity
        expect(
          calculator.toInventoryBaseQuantity(
            purchaseQuantity: 50,
            factorToInventoryBase: 0.453592,
          ),
          22.6796,
        );
      });

      test('is identity when factor is 1 (same unit)', () {
        expect(
          calculator.toInventoryBaseQuantity(
            purchaseQuantity: 12.5,
            factorToInventoryBase: 1,
          ),
          12.5,
        );
      });

      test('rounds to 4 decimal places (NUMERIC 14,4)', () {
        // 3 * 0.3333333 = 0.9999999 -> rounds to 1.0
        expect(
          calculator.toInventoryBaseQuantity(
            purchaseQuantity: 3,
            factorToInventoryBase: 0.3333333,
          ),
          1,
        );
        // (1/3) lb in kg = 0.1511973... -> 0.1512
        expect(
          calculator.toInventoryBaseQuantity(
            purchaseQuantity: 1 / 3,
            factorToInventoryBase: 0.453592,
          ),
          0.1512,
        );
      });

      test('preserves the smallest 4-decimal increment (0.0001)', () {
        expect(
          calculator.toInventoryBaseQuantity(
            purchaseQuantity: 0.0001,
            factorToInventoryBase: 1,
          ),
          0.0001,
        );
      });

      test('throws ArgumentError when factor is non-positive (infallible guard)', () {
        expect(
          () => calculator.toInventoryBaseQuantity(
            purchaseQuantity: 10,
            factorToInventoryBase: 0,
          ),
          throwsArgumentError,
        );
        expect(
          () => calculator.toInventoryBaseQuantity(
            purchaseQuantity: 10,
            factorToInventoryBase: -1,
          ),
          throwsArgumentError,
        );
      });

      test('converts a saco of 50lb to kg in one step', () {
        // 1 saco = 22.6796 kg; 2 sacos = 45.3592 kg
        expect(
          calculator.toInventoryBaseQuantity(
            purchaseQuantity: 2,
            factorToInventoryBase: 22.6796,
          ),
          45.3592,
        );
      });
    });

    group('fromInventoryBaseQuantity (inverse)', () {
      test('converts 22.6796 kg back to 50 lb', () {
        expect(
          calculator.fromInventoryBaseQuantity(
            inventoryBaseQuantity: 22.6796,
            factorToInventoryBase: 0.453592,
          ),
          50,
        );
      });

      test('throws ArgumentError when factor is non-positive', () {
        expect(
          () => calculator.fromInventoryBaseQuantity(
            inventoryBaseQuantity: 10,
            factorToInventoryBase: 0,
          ),
          throwsArgumentError,
        );
      });
    });
  });
}
