import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/services/sales/tip_engine.dart';

void main() {
  group('TipEngine - TDD & Triangulation (DGI Non-Taxable Invariant)', () {
    const commercialRate = 36.50;

    test('Case 1 (Triangulation): None / 0% tip results in zero tip amount and unmodified total', () {
      final calc = TipEngine.calculate(
        subtotalNio: 1000.00,
        taxNio: 150.00,
        discountNio: 0.00,
        tipType: TipType.none,
        commercialRate: commercialRate,
      );

      expect(calc.tipAmountNio, 0.00);
      expect(calc.tipAmountUsd, 0.00);
      expect(calc.effectivePercentage, 0.00);
      expect(calc.totalWithTipNio, 1150.00);
      expect(calc.totalWithTipUsd, closeTo(1150.00 / 36.50, 0.01));
      // Invariant check: Tax is untouched
      expect(calc.taxNio, 150.00);
    });

    test('Case 2 (Triangulation): Suggested 10% tip calculates 10% of net subtotal (C\$ 1,000 -> C\$ 100)', () {
      final calc = TipEngine.calculate(
        subtotalNio: 1000.00,
        taxNio: 150.00,
        discountNio: 0.00,
        tipType: TipType.suggestedTenPercent,
        commercialRate: commercialRate,
      );

      expect(calc.tipAmountNio, 100.00);
      expect(calc.effectivePercentage, 10.00);
      expect(calc.tipAmountUsd, closeTo(100.00 / 36.50, 0.01));
      expect(calc.totalWithTipNio, 1250.00); // 1000 + 150 + 100
      // Invariant: IVA 15% is NOT applied on tip (150 NIO remains 150 NIO)
      expect(calc.taxNio, 150.00);
    });

    test('Case 3 (Triangulation): Custom percentage (15% on C\$ 450 subtotal with C\$ 50 discount)', () {
      // Subtotal net after discount = 400.00, Tax 15% on 400 = 60.00
      final calc = TipEngine.calculate(
        subtotalNio: 450.00,
        taxNio: 60.00,
        discountNio: 50.00,
        tipType: TipType.customPercentage,
        customPercentage: 15.0,
        commercialRate: commercialRate,
      );

      // 15% of (450 - 50) = 60.00 NIO
      expect(calc.tipAmountNio, 60.00);
      expect(calc.effectivePercentage, 15.00);
      expect(calc.totalWithTipNio, 520.00); // 400 net + 60 tax + 60 tip
    });

    test('Case 4 (Triangulation): Fixed amount in NIO (C\$ 75.00 tip)', () {
      final calc = TipEngine.calculate(
        subtotalNio: 500.00,
        taxNio: 75.00,
        discountNio: 0.00,
        tipType: TipType.fixedAmountNio,
        fixedAmount: 75.00,
        commercialRate: commercialRate,
      );

      expect(calc.tipAmountNio, 75.00);
      expect(calc.effectivePercentage, 15.00); // 75 / 500 = 15%
      expect(calc.totalWithTipNio, 650.00); // 500 + 75 + 75
    });

    test('Case 5 (Triangulation): Fixed amount in USD (\$5.00 tip converted at commercial rate 36.50 = C\$ 182.50)', () {
      final calc = TipEngine.calculate(
        subtotalNio: 800.00,
        taxNio: 120.00,
        discountNio: 0.00,
        tipType: TipType.fixedAmountUsd,
        fixedAmount: 5.00,
        commercialRate: commercialRate,
      );

      expect(calc.tipAmountNio, 182.50);
      expect(calc.tipAmountUsd, 5.00);
      expect(calc.totalWithTipNio, 1102.50); // 800 + 120 + 182.50
    });

    test('Case 6 (Boundary & Zero Protection): Zero or negative subtotal yields 0.00 tip safely', () {
      final calcZero = TipEngine.calculate(
        subtotalNio: 0.00,
        taxNio: 0.00,
        discountNio: 0.00,
        tipType: TipType.suggestedTenPercent,
        commercialRate: commercialRate,
      );

      expect(calcZero.tipAmountNio, 0.00);
      expect(calcZero.totalWithTipNio, 0.00);

      final calcNegative = TipEngine.calculate(
        subtotalNio: 100.00,
        taxNio: 15.00,
        discountNio: 0.00,
        tipType: TipType.fixedAmountNio,
        fixedAmount: -50.00, // Negative fixed amount should clamp to 0
        commercialRate: commercialRate,
      );

      expect(calcNegative.tipAmountNio, 0.00);
      expect(calcNegative.totalWithTipNio, 115.00);
    });

    test('Case 7 (Rounding Precision): Odd amounts round deterministically to 2 decimal places', () {
      // Subtotal: 333.33 * 10% = 33.333 -> 33.33
      final calc = TipEngine.calculate(
        subtotalNio: 333.33,
        taxNio: 50.00,
        discountNio: 0.00,
        tipType: TipType.suggestedTenPercent,
        commercialRate: commercialRate,
      );

      expect(calc.tipAmountNio, 33.33);
      expect(calc.totalWithTipNio, 416.66);
    });
  });
}
