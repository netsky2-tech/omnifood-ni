import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/models/sales/payment_entity.dart';
import 'package:pos_app/ui/features/cash/card_voucher_reconciliation_view_model.dart';

void main() {
  late AppDatabase database;
  late CardVoucherReconciliationViewModel viewModel;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();

    // Seed test invoice
    await database.invoiceDao.insertInvoice(
      InvoiceEntity(
        id: 'inv-rec-01',
        number: '001-001-01-00000088',
        createdAt: DateTime.now().millisecondsSinceEpoch,
        userId: 'user-cajero',
        subtotal: 800.0,
        totalTax: 120.0,
        total: 920.0,
        isCanceled: false,
        syncStatus: 'pending',
        paymentStatus: 'paid',
        type: 'regular',
        terminalId: 'pos-01',
        sourceSequence: 1,
        idempotencyKey: 'idemp-rec-1',
        payloadHash: 'hash-rec-1',
        bcnOfficialRate: 36.6241,
        commercialRate: 36.50,
        totalUsd: 25.21,
      ),
    );

    viewModel = CardVoucherReconciliationViewModel(
      paymentDao: database.paymentDao,
      currentUserId: 'cajero-01',
    );
  });

  tearDown(() async {
    await database.close();
  });

  group('CardVoucherReconciliationViewModel (Slice 3.3)', () {
    test('loadPendingVouchers loads all pending card vouchers accurately', () async {
      final now = DateTime.now().millisecondsSinceEpoch;

      final p1 = PaymentEntity(
        id: 'pay-v-1',
        invoiceId: 'inv-rec-01',
        method: 'card',
        amount: 400.0,
        amountNio: 400.0,
        voucherCode: 'PENDIENTE',
        reconciliationStatus: 'PENDIENTE',
        bankPos: 'BAC',
        cardBrand: 'VISA',
        createdAt: now - 5000,
      );

      final p2 = PaymentEntity(
        id: 'pay-v-2',
        invoiceId: 'inv-rec-01',
        method: 'card',
        amount: 520.0,
        amountNio: 520.0,
        voucherCode: 'PENDIENTE',
        reconciliationStatus: 'PENDIENTE',
        bankPos: 'BANPRO',
        cardBrand: 'MASTERCARD',
        createdAt: now,
      );

      await database.paymentDao.insertPayments([p1, p2]);

      await viewModel.loadPendingVouchers();

      expect(viewModel.pendingVouchers.length, 2);
      expect(viewModel.pendingCount, 2);
      expect(viewModel.hasPendingVouchers, isTrue);
      expect(viewModel.pendingVouchers[0].id, 'pay-v-1');
      expect(viewModel.pendingVouchers[1].id, 'pay-v-2');
    });

    test('reconcileVoucher successfully transitions voucher to CONCILIADO with metadata', () async {
      final now = DateTime.now().millisecondsSinceEpoch;

      final p1 = PaymentEntity(
        id: 'pay-to-recon',
        invoiceId: 'inv-rec-01',
        method: 'card',
        amount: 400.0,
        amountNio: 400.0,
        voucherCode: 'PENDIENTE',
        reconciliationStatus: 'PENDIENTE',
        bankPos: 'BAC',
        cardBrand: 'VISA',
        createdAt: now,
      );

      await database.paymentDao.insertPayments([p1]);
      await viewModel.loadPendingVouchers();
      expect(viewModel.pendingCount, 1);

      // Reconcile
      final success = await viewModel.reconcileVoucher(
        paymentId: 'pay-to-recon',
        voucherCode: '654321',
        batchNumber: '003',
        last4: '1122',
      );

      expect(success, isTrue);
      expect(viewModel.pendingCount, 0);
      expect(viewModel.hasPendingVouchers, isFalse);

      final stored = await database.paymentDao.getPaymentsByInvoiceId('inv-rec-01');
      expect(stored.first.voucherCode, '654321');
      expect(stored.first.reconciliationStatus, 'CONCILIADO');
      expect(stored.first.batchNumber, '003');
      expect(stored.first.last4, '1122');
      expect(stored.first.reconciledByUserId, 'cajero-01');
      expect(stored.first.reconciledAt, isNotNull);
    });

    test('overrideMissingVoucher sets status MANUAL_OVERRIDE with supervisor authorization', () async {
      final now = DateTime.now().millisecondsSinceEpoch;

      final p1 = PaymentEntity(
        id: 'pay-lost-voucher',
        invoiceId: 'inv-rec-01',
        method: 'card',
        amount: 300.0,
        amountNio: 300.0,
        voucherCode: 'PENDIENTE',
        reconciliationStatus: 'PENDIENTE',
        bankPos: 'LAFISE',
        cardBrand: 'AMEX',
        createdAt: now,
      );

      await database.paymentDao.insertPayments([p1]);
      await viewModel.loadPendingVouchers();

      final success = await viewModel.overrideMissingVoucher(
        paymentId: 'pay-lost-voucher',
        reason: 'Ticket de datáfono salió en blanco por falta de papel',
        supervisorId: 'sup-01',
      );

      expect(success, isTrue);
      expect(viewModel.pendingCount, 0);

      final stored = await database.paymentDao.getPaymentsByInvoiceId('inv-rec-01');
      expect(stored.first.reconciliationStatus, 'MANUAL_OVERRIDE');
      expect(stored.first.reconciledByUserId, 'sup-01');
      expect(stored.first.voucherCode, contains('Ticket de datáfono salió en blanco'));
    });
  });
}
