import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/models/sales/payment_entity.dart';
import 'package:pos_app/data/mappers/sales_mapper.dart';

void main() {
  group('Invoice & Payment Multi-Currency & FX Mapping', () {
    test('Invoice domain to entity maps decoupled exchange rates and USD total', () {
      final now = DateTime.now();
      final invoice = Invoice(
        id: 'inv-101',
        number: '001-001-01-00000001',
        createdAt: now,
        userId: 'user-01',
        subtotal: 1000.0,
        totalTax: 150.0,
        total: 1150.0,
        bcnOfficialRate: 36.6241,
        commercialRate: 36.50,
        totalUsd: 31.51,
      );

      final entity = SalesMapper.toInvoiceEntity(invoice);

      expect(entity.id, 'inv-101');
      expect(entity.total, 1150.0);
      expect(entity.bcnOfficialRate, 36.6241);
      expect(entity.commercialRate, 36.50);
      expect(entity.totalUsd, 31.51);

      final restoredDomain = SalesMapper.toInvoiceDomain(entity);
      expect(restoredDomain.bcnOfficialRate, 36.6241);
      expect(restoredDomain.commercialRate, 36.50);
      expect(restoredDomain.totalUsd, 31.51);
    });

    test('Payment domain to entity maps multi-currency payment and change given details', () {
      final now = DateTime.now();
      final payment = Payment(
        id: 'pay-201',
        invoiceId: 'inv-101',
        method: PaymentMethod.cash,
        amount: 40.0, // paid $40 USD
        currency: 'USD',
        exchangeRate: 36.50,
        amountNio: 1460.0, // 40 * 36.50
        changeGiven: 310.0, // change C$ 310 NIO
        changeCurrency: 'NIO',
        createdAt: now,
      );

      final entity = SalesMapper.toPaymentEntity(payment);

      expect(entity.id, 'pay-201');
      expect(entity.amount, 40.0);
      expect(entity.currency, 'USD');
      expect(entity.exchangeRate, 36.50);
      expect(entity.amountNio, 1460.0);
      expect(entity.changeGiven, 310.0);
      expect(entity.changeCurrency, 'NIO');

      final restoredDomain = SalesMapper.toPaymentDomain(entity);
      expect(restoredDomain.amountNio, 1460.0);
      expect(restoredDomain.changeGiven, 310.0);
      expect(restoredDomain.changeCurrency, 'NIO');
    });
  });
}
