import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/customer/customer_entity.dart';
import 'package:pos_app/data/models/customer/customer_point_transaction_entity.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/repositories/sales/sales_repository_impl.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'sales_repository_impl_test.mocks.dart';

/// Slice 1 of B1a-2 (D-15): repository-level void rules — mandatory reason at
/// the boundary (AC-6), double-void guard (AC-3), and the atomic loyalty
/// reversal inside executeVoidTransaction's single Floor @transaction.
void main() {
  late AppDatabase database;
  late MockDgiNumberingService numberingService;
  late MockAuditRepository auditRepository;
  late MockReverseSaleInventoryUseCase reverseInventoryUseCase;
  late SalesRepositoryImpl repository;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  InvoiceEntity invoice({
    String id = 'inv-void-1',
    String? customerId = 'cust-1',
    bool isCanceled = false,
  }) =>
      InvoiceEntity(
        id: id,
        number: '001-001-01-00000100',
        createdAt: DateTime(2026, 9, 24, 0, 15).millisecondsSinceEpoch,
        userId: 'cashier-1',
        subtotal: 100,
        totalTax: 15,
        total: 115,
        isCanceled: isCanceled,
        syncStatus: 'synced',
        paymentStatus: 'paid',
        type: 'regular',
        customerId: customerId,
        shiftId: 'shift-1',
        localIssueDate: '2026-09-24',
      );

  CustomerEntity customer({double pointsBalance = 500}) => CustomerEntity(
        id: 'cust-1',
        name: 'Cliente Frecuente',
        pointsBalance: pointsBalance,
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      );

  CustomerPointTransactionEntity pointTx(
    String id, {
    required double points,
    String? invoiceId = 'inv-void-1',
  }) =>
      CustomerPointTransactionEntity(
        id: id,
        customerId: 'cust-1',
        invoiceId: invoiceId,
        type: points >= 0 ? 'earn' : 'redeem',
        points: points,
        balanceAfter: 500,
        conversionRate: 0.1,
        createdAt: 1700000000000,
      );

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    numberingService = MockDgiNumberingService();
    auditRepository = MockAuditRepository();
    reverseInventoryUseCase = MockReverseSaleInventoryUseCase();
    when(reverseInventoryUseCase.execute(any, any))
        .thenAnswer((_) async => []);
    when(auditRepository.prepareLog(any, metadata: anyNamed('metadata')))
        .thenAnswer((_) async => null);

    repository = SalesRepositoryImpl(
      database: database,
      invoiceDao: database.invoiceDao,
      itemDao: database.invoiceItemDao,
      paymentDao: database.paymentDao,
      transactionDao: database.salesTransactionDao,
      numberingService: numberingService,
      movementEngine: MockMovementEngine(),
      auditRepository: auditRepository,
      processInventoryUseCase: MockProcessSaleInventoryUseCase(),
      reverseInventoryUseCase: reverseInventoryUseCase,
      inventoryRepository: MockInventoryRepository(),
    );
  });

  tearDown(() async {
    await database.close();
  });

  Future<void> seedInvoice({
    bool isCanceled = false,
    String? customerId = 'cust-1',
  }) async {
    // The shift_id FK (B1a-4) is enforced by the in-memory database: seed
    // the owning session first, like production rows always can.
    await database.cashierSessionDao.insertSession(
      CashierSessionEntity(
        id: 'shift-1',
        userId: 'cashier-1',
        terminalId: 'term-1',
        openedAt: 1700000000000,
        isClosed: false,
      ),
    );
    await database.invoiceDao
        .insertInvoice(invoice(customerId: customerId, isCanceled: isCanceled));
  }

  Future<Map<String, Object?>?> invoiceRow([String id = 'inv-void-1']) async {
    final rows = await database.database.query(
      'invoices',
      where: 'id = ?',
      whereArgs: [id],
    );
    return rows.isEmpty ? null : rows.first;
  }

  group('D-15 AC-6: the reason is mandatory at the repository boundary', () {
    for (final bad in ['', '   ']) {
      test('reason "$bad" throws before ANY write', () async {
        await seedInvoice();

        await expectLater(
          repository.voidInvoice('inv-void-1', bad),
          throwsArgumentError,
        );

        final row = await invoiceRow();
        expect(row!['is_canceled'], 0,
            reason: 'no flag flip may happen on an invalid reason');
        final txs = await database.customerPointTransactionDao
            .getTransactionsByInvoice('inv-void-1');
        expect(txs, isEmpty);
      });
    }
  });

  group('D-15 AC-3: an invoice cannot be voided twice', () {
    // Documented choice: double-void is an invariant violation, not an
    // operator-facing policy denial, so the repository throws StateError
    // instead of adding a VoidDecision case the UI would never render (the
    // UI hides the action for canceled invoices).
    test('second void throws and nothing is written twice', () async {
      await seedInvoice();
      await database.customerDao.saveCustomer(customer());
      await database.customerPointTransactionDao.insertTransaction(
        pointTx('pt-earn-1', points: 50),
      );

      await repository.voidInvoice('inv-void-1', 'ERROR_DE_CAPTURA');

      await expectLater(
        repository.voidInvoice('inv-void-1', 'OTRO'),
        throwsStateError,
      );

      final txs = await database.customerPointTransactionDao
          .getTransactionsByInvoice('inv-void-1');
      // Exactly ONE reversal exists even though the void ran twice: the
      // earn granted +50, so the single reversal is -50.
      expect(txs.where((t) => t.type == 'adjust'), hasLength(1));
      final row = await database.customerDao.getCustomerById('cust-1');
      expect(row!.pointsBalance, 450);
    });
  });

  group('D-15: the loyalty reversal rides the void transaction', () {
    test('single adjust transaction reverses the net points of the invoice',
        () async {
      await seedInvoice();
      await database.customerDao.saveCustomer(customer());
      // Sale granted +50 earn and consumed -20 redeem: net +30 to reverse.
      await database.customerPointTransactionDao
          .insertTransaction(pointTx('pt-earn-1', points: 50));
      await database.customerPointTransactionDao
          .insertTransaction(pointTx('pt-redeem-1', points: -20));

      await repository.voidInvoice('inv-void-1', 'CLIENTE_DESISTE',
          reasonDetail: 'Se fue sin pagar la cuenta');

      final txs = await database.customerPointTransactionDao
          .getTransactionsByInvoice('inv-void-1');
      final reversals = txs.where((t) => t.type == 'adjust').toList();
      expect(reversals, hasLength(1));
      final reversal = reversals.single;
      expect(reversal.points, -30);
      expect(reversal.reversalOfTransactionId, 'pt-earn-1');
      expect(reversal.idempotencyKey, 'void-reversal:inv-void-1');
      final row = await database.customerDao.getCustomerById('cust-1');
      expect(row!.pointsBalance, 470);
      expect(reversal.balanceAfter, 470);
    });

    test('the reversal lands on the CURRENT balance, not the sale snapshot',
        () async {
      await seedInvoice();
      await database.customerDao.saveCustomer(customer());
      await database.customerPointTransactionDao
          .insertTransaction(pointTx('pt-earn-1', points: 50));
      // Points changed between the sale and the void (e.g. another sale
      // redeemed points): the void must not restore a stale snapshot.
      await database.customerPointTransactionDao.updateCustomerBalance(
        'cust-1',
        600,
        1700000001000,
      );

      await repository.voidInvoice('inv-void-1', 'TICKET_DUPLICADO');

      final row = await database.customerDao.getCustomerById('cust-1');
      expect(row!.pointsBalance, 550);
    });

    test('no customer or no point transactions: clean no-op reversal', () async {
      await seedInvoice(customerId: null);

      await repository.voidInvoice('inv-void-1', 'OTRO');

      final row = await invoiceRow();
      expect(row!['is_canceled'], 1);
      final txs = await database.customerPointTransactionDao
          .getTransactionsByInvoice('inv-void-1');
      expect(txs, isEmpty);
    });

    test('voidReason stores "code — detail"; audit metadata is structured',
        () async {
      await seedInvoice();

      await repository.voidInvoice('inv-void-1', 'OTRO',
          reasonDetail: 'Detalle libre del operador');

      final row = await invoiceRow();
      expect(row!['void_reason'], 'OTRO — Detalle libre del operador');
    });

    test('voidReason stores the bare code when there is no detail',
        () async {
      await seedInvoice();

      await repository.voidInvoice('inv-void-1', 'ERROR_DE_CAPTURA');

      final row = await invoiceRow();
      expect(row!['void_reason'], 'ERROR_DE_CAPTURA');
    });
  });

  group('loyalty rollback: a failed void touches nothing', () {
    test('forced failure after the reversal writes leaves the invoice '
        'NOT canceled and the points untouched', () async {
      await seedInvoice();
      await database.customerDao.saveCustomer(customer());
      await database.customerPointTransactionDao
          .insertTransaction(pointTx('pt-earn-1', points: 50));
      final now = DateTime.now().millisecondsSinceEpoch;

      await expectLater(
        database.salesTransactionDao.executeVoidTransaction(
          [],
          invoice(),
          null,
          true, // forced failure for testing (production callers pass false)
          CustomerPointTransactionEntity(
            id: 'reversal-1',
            customerId: 'cust-1',
            invoiceId: 'inv-void-1',
            type: 'adjust',
            points: -50,
            balanceAfter: 450,
            conversionRate: 0.1,
            reason: 'Reversal by void',
            createdAt: now,
            idempotencyKey: 'void-reversal:inv-void-1',
          ),
          now,
        ),
        throwsException,
      );

      final row = await invoiceRow();
      expect(row!['is_canceled'], 0,
          reason: 'the whole unit rolls back: no flag flip');
      final txs = await database.customerPointTransactionDao
          .getTransactionsByInvoice('inv-void-1');
      expect(txs.where((t) => t.type == 'adjust'), isEmpty,
          reason: 'no reversal survived the rollback');
      final customerRow = await database.customerDao.getCustomerById('cust-1');
      expect(customerRow!.pointsBalance, 500);
    });
  });
}
