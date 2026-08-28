import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/models/sales/payment_entity.dart';
import 'package:pos_app/ui/features/cash/cash_shift_view_model.dart';

void main() {
  late AppDatabase database;
  late CashShiftViewModel viewModel;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();

    viewModel = CashShiftViewModel.fromDatabase(
      database: database,
      currentUserId: 'cajero-01',
    );

    // Open shift
    await viewModel.openShift(initialFloatNio: 1000.0, initialFloatUsd: 50.0);
    expect(viewModel.hasActiveShift, isTrue);

    // Seed test invoice
    await database.invoiceDao.insertInvoice(
      InvoiceEntity(
        id: 'inv-guard-01',
        number: '001-001-01-00000099',
        createdAt: DateTime.now().millisecondsSinceEpoch,
        userId: 'cajero-01',
        subtotal: 500.0,
        totalTax: 75.0,
        total: 575.0,
        isCanceled: false,
        syncStatus: 'pending',
        paymentStatus: 'paid',
        type: 'regular',
        terminalId: 'pos-01',
        sourceSequence: 1,
        idempotencyKey: 'idemp-guard-1',
        payloadHash: 'hash-guard-1',
        bcnOfficialRate: 36.6241,
        commercialRate: 36.50,
        totalUsd: 15.75,
      ),
    );
  });

  tearDown(() async {
    await database.close();
  });

  group('CashShiftViewModel - Corte Z Fiscal Voucher Guard (Slice 3.3)', () {
    test('blocks closeShiftWithBlindCount if pending card vouchers exist', () async {
      final now = DateTime.now().millisecondsSinceEpoch;

      // Insert pending card payment
      final pendingPayment = PaymentEntity(
        id: 'pay-pending-blocker',
        invoiceId: 'inv-guard-01',
        method: 'card',
        amount: 575.0,
        amountNio: 575.0,
        voucherCode: 'PENDIENTE',
        reconciliationStatus: 'PENDIENTE',
        bankPos: 'BAC',
        cardBrand: 'VISA',
        createdAt: now,
      );
      await database.paymentDao.insertPayments([pendingPayment]);

      // Attempt to close shift
      final closed = await viewModel.closeShiftWithBlindCount(
        countedNio: 1000.0,
        countedUsd: 50.0,
      );

      expect(closed, isFalse);
      expect(viewModel.hasActiveShift, isTrue);
      expect(viewModel.errorMessage, contains('pendientes de conciliar'));
      expect(viewModel.errorMessage, contains('Corte Z Fiscal'));
    });

    test('allows closeShiftWithBlindCount once all vouchers are reconciled', () async {
      final now = DateTime.now().millisecondsSinceEpoch;

      // Insert reconciled card payment
      final reconciledPayment = PaymentEntity(
        id: 'pay-reconciled-ok',
        invoiceId: 'inv-guard-01',
        method: 'card',
        amount: 575.0,
        amountNio: 575.0,
        voucherCode: '123456',
        reconciliationStatus: 'CONCILIADO',
        bankPos: 'BAC',
        cardBrand: 'VISA',
        createdAt: now,
      );
      await database.paymentDao.insertPayments([reconciledPayment]);

      // Attempt to close shift
      final closed = await viewModel.closeShiftWithBlindCount(
        countedNio: 1000.0,
        countedUsd: 50.0,
      );

      expect(closed, isTrue);
      expect(viewModel.hasActiveShift, isFalse);
      expect(viewModel.lastClosedShift?.isClosed, isTrue);
      expect(viewModel.lastClosedShift?.zReportSequence, 1);
    });
  });
}
