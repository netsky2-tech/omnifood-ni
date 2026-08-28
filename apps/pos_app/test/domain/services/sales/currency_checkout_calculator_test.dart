import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/services/sales/currency_checkout_calculator.dart';

void main() {
  group('CurrencyCheckoutCalculator (Multi-Currency & Dual FX)', () {
    const commercialRate = 36.50;
    const bcnOfficialRate = 36.6241;

    test('calculates total in USD from total NIO using commercial exchange rate', () {
      final calc = CurrencyCheckoutCalculator(
        commercialRate: commercialRate,
        bcnOfficialRate: bcnOfficialRate,
      );

      // C$ 365.00 NIO / 36.50 = $10.00 USD
      expect(calc.calculateTotalUsd(365.00), 10.00);

      // C$ 500.00 NIO / 36.50 = 13.6986 -> $13.70 USD
      expect(calc.calculateTotalUsd(500.00), 13.70);

      // C$ 1,000.00 NIO / 36.50 = 27.3972 -> $27.40 USD
      expect(calc.calculateTotalUsd(1000.00), 27.40);
    });

    test('tender in NIO: exact payment produces zero change', () {
      final calc = CurrencyCheckoutCalculator(
        commercialRate: commercialRate,
        bcnOfficialRate: bcnOfficialRate,
      );

      final breakdown = calc.calculateTender(
        totalNio: 500.00,
        tenderAmount: 500.00,
        tenderCurrency: 'NIO',
        changeCurrencyPreference: 'NIO',
      );

      expect(breakdown.isSufficient, isTrue);
      expect(breakdown.tenderAmountNio, 500.00);
      expect(breakdown.changeNio, 0.00);
      expect(breakdown.changeUsd, 0.00);
      expect(breakdown.effectiveChange, 0.00);
      expect(breakdown.remainingNio, 0.00);
    });

    test('tender in NIO: excess payment calculates change in NIO and equivalent USD', () {
      final calc = CurrencyCheckoutCalculator(
        commercialRate: commercialRate,
        bcnOfficialRate: bcnOfficialRate,
      );

      // Bill of C$ 350.00 paid with C$ 500.00 -> Change C$ 150.00
      final breakdownNio = calc.calculateTender(
        totalNio: 350.00,
        tenderAmount: 500.00,
        tenderCurrency: 'NIO',
        changeCurrencyPreference: 'NIO',
      );

      expect(breakdownNio.isSufficient, isTrue);
      expect(breakdownNio.tenderAmountNio, 500.00);
      expect(breakdownNio.changeNio, 150.00);
      // Change in USD: 150 / 36.50 = 4.1095 -> $4.11 USD
      expect(breakdownNio.changeUsd, 4.11);
      expect(breakdownNio.effectiveChange, 150.00);
      expect(breakdownNio.changeCurrency, 'NIO');

      // Same payment but customer prefers change in USD
      final breakdownUsd = calc.calculateTender(
        totalNio: 350.00,
        tenderAmount: 500.00,
        tenderCurrency: 'NIO',
        changeCurrencyPreference: 'USD',
      );

      expect(breakdownUsd.effectiveChange, 4.11);
      expect(breakdownUsd.changeCurrency, 'USD');
    });

    test('tender in USD: converts tendered USD to NIO and calculates change accurately', () {
      final calc = CurrencyCheckoutCalculator(
        commercialRate: commercialRate,
        bcnOfficialRate: bcnOfficialRate,
      );

      // Ticket C$ 500.00 paid with a $20.00 USD bill:
      // $20 * 36.50 = C$ 730.00 NIO tendered.
      // Change NIO = 730 - 500 = C$ 230.00 NIO.
      // Change USD = 230 / 36.50 = $6.30 USD.
      final breakdown = calc.calculateTender(
        totalNio: 500.00,
        tenderAmount: 20.00,
        tenderCurrency: 'USD',
        changeCurrencyPreference: 'NIO',
      );

      expect(breakdown.isSufficient, isTrue);
      expect(breakdown.tenderAmountNio, 730.00);
      expect(breakdown.changeNio, 230.00);
      expect(breakdown.changeUsd, 6.30);
      expect(breakdown.effectiveChange, 230.00);
      expect(breakdown.changeCurrency, 'NIO');
    });

    test('insufficient payment reports remaining balance and zero change', () {
      final calc = CurrencyCheckoutCalculator(
        commercialRate: commercialRate,
        bcnOfficialRate: bcnOfficialRate,
      );

      // Ticket C$ 1,000.00 paid with $20.00 USD (C$ 730.00)
      final breakdown = calc.calculateTender(
        totalNio: 1000.00,
        tenderAmount: 20.00,
        tenderCurrency: 'USD',
      );

      expect(breakdown.isSufficient, isFalse);
      expect(breakdown.tenderAmountNio, 730.00);
      expect(breakdown.remainingNio, 270.00);
      expect(breakdown.changeNio, 0.00);
      expect(breakdown.changeUsd, 0.00);
    });

    test('quick cash denomination suggestions for NIO', () {
      final calc = CurrencyCheckoutCalculator(
        commercialRate: commercialRate,
        bcnOfficialRate: bcnOfficialRate,
      );

      // For a C$ 340.00 ticket
      final suggestions = calc.getSuggestedDenominations(
        totalNio: 340.00,
        currency: 'NIO',
      );

      // Suggestions should include exact C$340, next hundred (C$400), C$500 bill, C$1000 bill
      expect(suggestions, contains(340.00));
      expect(suggestions, contains(400.00));
      expect(suggestions, contains(500.00));
      expect(suggestions, contains(1000.00));
      expect(suggestions.every((s) => s >= 340.00), isTrue);
    });

    test('quick cash denomination suggestions for USD', () {
      final calc = CurrencyCheckoutCalculator(
        commercialRate: commercialRate,
        bcnOfficialRate: bcnOfficialRate,
      );

      // For a C$ 438.00 ticket (approx $12.00 USD)
      final suggestions = calc.getSuggestedDenominations(
        totalNio: 438.00,
        currency: 'USD',
      );

      // Suggestions should include exact USD ($12.00), $15, $20 bill, $50 bill
      expect(suggestions, contains(12.00));
      expect(suggestions, contains(15.00));
      expect(suggestions, contains(20.00));
      expect(suggestions, contains(50.00));
      expect(suggestions.every((s) => s >= 12.00), isTrue);
    });

    test('triangulation: edge case with centavos and mixed currency precision', () {
      final calc = CurrencyCheckoutCalculator(
        commercialRate: 36.50,
        bcnOfficialRate: 36.6241,
      );

      // C$ 123.45 paid with $5.00 USD ($5 * 36.50 = C$ 182.50)
      // Change NIO = 182.50 - 123.45 = C$ 59.05 NIO
      // Change USD = 59.05 / 36.50 = 1.6178 -> $1.62 USD
      final breakdown = calc.calculateTender(
        totalNio: 123.45,
        tenderAmount: 5.00,
        tenderCurrency: 'USD',
        changeCurrencyPreference: 'NIO',
      );

      expect(breakdown.isSufficient, isTrue);
      expect(breakdown.tenderAmountNio, 182.50);
      expect(breakdown.changeNio, 59.05);
      expect(breakdown.changeUsd, 1.62);
      expect(breakdown.effectiveChange, 59.05);

      // Same with USD change preference
      final breakdownUsd = calc.calculateTender(
        totalNio: 123.45,
        tenderAmount: 5.00,
        tenderCurrency: 'USD',
        changeCurrencyPreference: 'USD',
      );
      expect(breakdownUsd.effectiveChange, 1.62);
    });

    test('triangulation: zero and micro-centavo resilience', () {
      final calc = CurrencyCheckoutCalculator(
        commercialRate: 36.50,
        bcnOfficialRate: 36.6241,
      );

      final zeroBreakdown = calc.calculateTender(
        totalNio: 0.00,
        tenderAmount: 0.00,
      );
      expect(zeroBreakdown.isSufficient, isTrue);
      expect(zeroBreakdown.changeNio, 0.00);

      // C$ 0.01 paid with C$ 1.00
      final microBreakdown = calc.calculateTender(
        totalNio: 0.01,
        tenderAmount: 1.00,
      );
      expect(microBreakdown.isSufficient, isTrue);
      expect(microBreakdown.changeNio, 0.99);
    });

    test('exact USD equivalent tender (e.g. C\\\$69.00 = \\\$1.89 USD at 36.50) is sufficient with 0 remaining', () {
      final calc = CurrencyCheckoutCalculator(
        commercialRate: 36.50,
        bcnOfficialRate: 36.6241,
      );

      final totalUsd = calc.calculateTotalUsd(69.00);
      expect(totalUsd, 1.89);

      final breakdown = calc.calculateTender(
        totalNio: 69.00,
        tenderAmount: totalUsd,
        tenderCurrency: 'USD',
      );

      expect(breakdown.isSufficient, isTrue);
      expect(breakdown.remainingNio, 0.00);
      expect(breakdown.changeNio, 0.00);
      expect(breakdown.tenderAmountNio, 69.00);
    });
  });
}
