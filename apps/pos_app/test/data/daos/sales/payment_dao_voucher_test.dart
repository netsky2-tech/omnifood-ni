import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/models/sales/payment_entity.dart';

void main() {
  late AppDatabase database;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();

    // Seed test invoice
    await database.invoiceDao.insertInvoice(
      InvoiceEntity(
        id: 'inv-test-01',
        number: '001-001-01-00000001',
        createdAt: DateTime.now().millisecondsSinceEpoch,
        userId: 'user-01',
        subtotal: 1000.0,
        totalTax: 150.0,
        total: 1150.0,
        isCanceled: false,
        syncStatus: 'pending',
        paymentStatus: 'paid',
        type: 'regular',
        terminalId: 'pos-01',
        sourceSequence: 1,
        idempotencyKey: 'key-1',
        payloadHash: 'hash-1',
        bcnOfficialRate: 36.6241,
        commercialRate: 36.50,
        totalUsd: 31.51,
      ),
    );
  });

  tearDown(() async {
    await database.close();
  });

  group('PaymentDao Card Voucher Queries & Reconciliation', () {
    test('getPendingCardPayments returns only pending card vouchers ordered by createdAt', () async {
      final now = DateTime.now().millisecondsSinceEpoch;

      final p1 = PaymentEntity(
        id: 'pay-cash',
        invoiceId: 'inv-test-01',
        method: 'cash',
        amount: 300.0,
        amountNio: 300.0,
        createdAt: now - 3000,
      );

      final p2 = PaymentEntity(
        id: 'pay-card-pending-1',
        invoiceId: 'inv-test-01',
        method: 'card',
        amount: 400.0,
        amountNio: 400.0,
        voucherCode: 'PENDIENTE',
        reconciliationStatus: 'PENDIENTE',
        cardBrand: 'VISA',
        cardType: 'CREDITO',
        bankPos: 'BAC',
        createdAt: now - 2000,
      );

      final p3 = PaymentEntity(
        id: 'pay-card-reconciled',
        invoiceId: 'inv-test-01',
        method: 'card',
        amount: 200.0,
        amountNio: 200.0,
        voucherCode: '123456',
        reconciliationStatus: 'CONCILIADO',
        cardBrand: 'MASTERCARD',
        cardType: 'DEBITO',
        bankPos: 'BANPRO',
        createdAt: now - 1000,
      );

      final p4 = PaymentEntity(
        id: 'pay-card-pending-2',
        invoiceId: 'inv-test-01',
        method: 'card',
        amount: 250.0,
        amountNio: 250.0,
        voucherCode: 'PENDIENTE',
        reconciliationStatus: 'PENDIENTE',
        cardBrand: 'AMEX',
        cardType: 'CREDITO',
        bankPos: 'LAFISE',
        createdAt: now,
      );

      await database.paymentDao.insertPayments([p1, p2, p3, p4]);

      final pending = await database.paymentDao.getPendingCardPayments();
      expect(pending.length, 2);
      expect(pending[0].id, 'pay-card-pending-1');
      expect(pending[1].id, 'pay-card-pending-2');

      final count = await database.paymentDao.countPendingCardPayments();
      expect(count, 2);
    });

    test('reconciling a pending card payment updates voucher code and status in SQLite', () async {
      final now = DateTime.now().millisecondsSinceEpoch;

      final payment = PaymentEntity(
        id: 'pay-to-reconcile',
        invoiceId: 'inv-test-01',
        method: 'card',
        amount: 500.0,
        amountNio: 500.0,
        voucherCode: 'PENDIENTE',
        reconciliationStatus: 'PENDIENTE',
        cardBrand: 'VISA',
        cardType: 'CREDITO',
        bankPos: 'BAC',
        createdAt: now,
      );

      await database.paymentDao.insertPayments([payment]);

      expect(await database.paymentDao.countPendingCardPayments(), 1);

      // Reconcile
      final reconciledPayment = PaymentEntity(
        id: payment.id,
        invoiceId: payment.invoiceId,
        method: payment.method,
        amount: payment.amount,
        amountNio: payment.amountNio,
        currency: payment.currency,
        exchangeRate: payment.exchangeRate,
        changeGiven: payment.changeGiven,
        changeCurrency: payment.changeCurrency,
        voucherCode: '654321',
        reconciliationStatus: 'CONCILIADO',
        cardBrand: payment.cardBrand,
        cardType: payment.cardType,
        bankPos: payment.bankPos,
        last4: '9876',
        batchNumber: '002',
        reconciledAt: DateTime.now().millisecondsSinceEpoch,
        reconciledByUserId: 'supervisor-01',
        createdAt: payment.createdAt,
      );

      await database.paymentDao.updatePayment(reconciledPayment);

      expect(await database.paymentDao.countPendingCardPayments(), 0);

      final retrieved = await database.paymentDao.getPaymentsByInvoiceId('inv-test-01');
      expect(retrieved.length, 1);
      expect(retrieved.first.voucherCode, '654321');
      expect(retrieved.first.reconciliationStatus, 'CONCILIADO');
      expect(retrieved.first.last4, '9876');
      expect(retrieved.first.reconciledByUserId, 'supervisor-01');
    });
  });
}
