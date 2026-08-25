import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/services/sales/split_payment_calculator.dart';

void main() {
  const commercialRate = 36.50;

  group('SplitPaymentCalculator Unit Tests (TDD)', () {
    test('initial state has remaining equal to full total in NIO and USD', () {
      final calc = SplitPaymentCalculator(
        totalNio: 1000.0,
        commercialRate: commercialRate,
      );

      expect(calc.totalNio, 1000.0);
      expect(calc.totalPaidNio, 0.0);
      expect(calc.remainingNio, 1000.0);
      expect(calc.remainingUsd, closeTo(27.40, 0.01)); // 1000 / 36.50 = 27.397 -> 27.40
      expect(calc.isFullyPaid, isFalse);
      expect(calc.payments, isEmpty);
    });

    test('adding partial cash payment in NIO reduces remaining balance', () {
      var calc = SplitPaymentCalculator(
        totalNio: 1000.0,
        commercialRate: commercialRate,
      );

      final cashPayment = calc.createCashPayment(
        tenderAmount: 400.0,
        tenderCurrency: 'NIO',
        changeCurrencyPreference: 'NIO',
      );

      calc = calc.addPayment(cashPayment);

      expect(calc.payments.length, 1);
      expect(calc.totalPaidNio, 400.0);
      expect(calc.remainingNio, 600.0);
      expect(calc.remainingUsd, closeTo(16.44, 0.01));
      expect(calc.isFullyPaid, isFalse);
    });

    test('adding USD cash payment applies commercial FX rate to reduce balance', () {
      var calc = SplitPaymentCalculator(
        totalNio: 1000.0,
        commercialRate: commercialRate,
      );

      // Pay $10 USD ($10 * 36.50 = C$ 365 NIO)
      final usdCashPayment = calc.createCashPayment(
        tenderAmount: 10.0,
        tenderCurrency: 'USD',
        changeCurrencyPreference: 'NIO',
      );

      calc = calc.addPayment(usdCashPayment);

      expect(calc.payments.length, 1);
      expect(calc.totalPaidNio, 365.0);
      expect(calc.remainingNio, 635.0);
      expect(calc.isFullyPaid, isFalse);
    });

    test('multi-tender split: Cash USD + Card (Fast-Checkout) + Cash NIO exact payment', () {
      var calc = SplitPaymentCalculator(
        totalNio: 1000.0,
        commercialRate: commercialRate,
      );

      // 1. Pay $10 USD (C$ 365 NIO)
      final p1 = calc.createCashPayment(
        tenderAmount: 10.0,
        tenderCurrency: 'USD',
      );
      calc = calc.addPayment(p1);
      expect(calc.remainingNio, 635.0);

      // 2. Pay C$ 500 with Card in Fast-Checkout mode (voucher PENDIENTE)
      final p2 = calc.createCardPayment(
        amount: 500.0,
        currency: 'NIO',
        cardBrand: 'VISA',
        cardType: 'CREDITO',
        bankPos: 'BAC',
        isFastCheckout: true,
      );
      expect(p2.reconciliationStatus, 'PENDIENTE');
      expect(p2.voucherCode, 'PENDIENTE');

      calc = calc.addPayment(p2);
      expect(calc.totalPaidNio, 865.0);
      expect(calc.remainingNio, 135.0);
      expect(calc.isFullyPaid, isFalse);

      // 3. Pay remaining C$ 135 with Cash NIO (tendering C$ 200 bill, change C$ 65 NIO)
      final p3 = calc.createCashPayment(
        tenderAmount: 200.0,
        tenderCurrency: 'NIO',
      );
      calc = calc.addPayment(p3);

      expect(calc.payments.length, 3);
      expect(calc.totalPaidNio, 1000.0);
      expect(calc.remainingNio, 0.0);
      expect(calc.isFullyPaid, isTrue);
      expect(p3.changeGiven, 65.0);
    });

    test('adding Card payment with explicit voucher code sets status CONCILIADO', () {
      final calc = SplitPaymentCalculator(
        totalNio: 500.0,
        commercialRate: commercialRate,
      );

      final cardPayment = calc.createCardPayment(
        amount: 500.0,
        currency: 'NIO',
        cardBrand: 'MASTERCARD',
        cardType: 'DEBITO',
        bankPos: 'BANPRO',
        voucherCode: '987654',
        last4: '4321',
        batchNumber: '001',
      );

      expect(cardPayment.reconciliationStatus, 'CONCILIADO');
      expect(cardPayment.voucherCode, '987654');
      expect(cardPayment.last4, '4321');
      expect(cardPayment.batchNumber, '001');
    });

    test('removing a payment updates remaining balance correctly', () {
      var calc = SplitPaymentCalculator(
        totalNio: 1000.0,
        commercialRate: commercialRate,
      );

      final p1 = calc.createCashPayment(tenderAmount: 300.0, tenderCurrency: 'NIO');
      final p2 = calc.createCashPayment(tenderAmount: 400.0, tenderCurrency: 'NIO');

      calc = calc.addPayment(p1).addPayment(p2);
      expect(calc.totalPaidNio, 700.0);
      expect(calc.remainingNio, 300.0);

      calc = calc.removePayment(p1.id);
      expect(calc.payments.length, 1);
      expect(calc.totalPaidNio, 400.0);
      expect(calc.remainingNio, 600.0);
    });
  });
}
