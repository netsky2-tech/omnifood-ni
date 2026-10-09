import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
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

    group('shift voucher counts (S2 #68)', () {
      late final now = DateTime.now().millisecondsSinceEpoch;

      Future<void> seedShiftInvoicesAndPayments() async {
        // The invoices' shift_id carries a real FK to cashier_sessions.
        await database.cashierSessionDao.insertSession(
          CashierSessionEntity(
            id: 'shift-A',
            userId: 'user-01',
            terminalId: 'pos-01',
            openedAt: now - 7200000,
            expectedNio: 0,
          ),
        );
        await database.cashierSessionDao.insertSession(
          CashierSessionEntity(
            id: 'shift-B',
            userId: 'user-01',
            terminalId: 'pos-01',
            openedAt: now - 3600000,
            expectedNio: 0,
          ),
        );

        // Two invoices in shift-A (one canceled), one in shift-B.
        await database.invoiceDao.insertInvoice(
          InvoiceEntity(
            id: 'inv-shift-a-1',
            number: '001-001-01-00000011',
            createdAt: now,
            userId: 'user-01',
            subtotal: 100.0,
            totalTax: 15.0,
            total: 115.0,
            isCanceled: false,
            syncStatus: 'synced',
            paymentStatus: 'paid',
            type: 'regular',
            terminalId: 'pos-01',
            shiftId: 'shift-A',
          ),
        );
        await database.invoiceDao.insertInvoice(
          InvoiceEntity(
            id: 'inv-shift-a-canceled',
            number: '001-001-01-00000012',
            createdAt: now,
            userId: 'user-01',
            subtotal: 100.0,
            totalTax: 15.0,
            total: 115.0,
            isCanceled: true,
            syncStatus: 'synced',
            paymentStatus: 'paid',
            type: 'regular',
            terminalId: 'pos-01',
            shiftId: 'shift-A',
          ),
        );
        await database.invoiceDao.insertInvoice(
          InvoiceEntity(
            id: 'inv-shift-b-1',
            number: '001-001-01-00000013',
            createdAt: now,
            userId: 'user-01',
            subtotal: 100.0,
            totalTax: 15.0,
            total: 115.0,
            isCanceled: false,
            syncStatus: 'synced',
            paymentStatus: 'paid',
            type: 'regular',
            terminalId: 'pos-01',
            shiftId: 'shift-B',
          ),
        );

        PaymentEntity cardPayment(
          String id,
          String invoiceId,
          String status,
        ) =>
            PaymentEntity(
              id: id,
              invoiceId: invoiceId,
              method: 'card',
              amount: 100.0,
              amountNio: 100.0,
              voucherCode: status == 'PENDIENTE' ? 'PENDIENTE' : '654321',
              reconciliationStatus: status,
              cardBrand: 'VISA',
              cardType: 'CREDITO',
              bankPos: 'BAC',
              createdAt: now,
            );

        await database.paymentDao.insertPayments([
          // shift-A: 2 pending, 1 reconciled, 1 overridden, 1 cash.
          cardPayment('pay-a-pend-1', 'inv-shift-a-1', 'PENDIENTE'),
          cardPayment('pay-a-pend-2', 'inv-shift-a-1', 'PENDIENTE'),
          cardPayment('pay-a-reconciled', 'inv-shift-a-1', 'CONCILIADO'),
          cardPayment('pay-a-override', 'inv-shift-a-1', 'MANUAL_OVERRIDE'),
          PaymentEntity(
            id: 'pay-a-cash',
            invoiceId: 'inv-shift-a-1',
            method: 'cash',
            amount: 50.0,
            amountNio: 50.0,
            createdAt: now,
          ),
          // The canceled invoice's card payment rides the same shift-A
          // join; the spec'd shift queries filter only method + status.
          cardPayment('pay-a-canceled', 'inv-shift-a-canceled', 'PENDIENTE'),
          // shift-B: 1 pending only — must never leak into shift-A.
          cardPayment('pay-b-pend', 'inv-shift-b-1', 'PENDIENTE'),
        ]);
      }

      test('counts card payments by reconciliation status for the shift',
          () async {
        await seedShiftInvoicesAndPayments();

        // 2 on the live invoice + 1 on the canceled one: the spec'd shift
        // queries filter only method + reconciliation status, and the
        // canceled invoice's rows belong to the same shift.
        expect(
          await database.paymentDao.countPendingCardPaymentsForShift('shift-A'),
          3,
        );
        expect(
          await database.paymentDao
              .countReconciledCardPaymentsForShift('shift-A'),
          1,
        );
        expect(
          await database.paymentDao
              .countOverriddenCardPaymentsForShift('shift-A'),
          1,
        );
      });

      test('counts are scoped to the shift and zero for an unknown shift',
          () async {
        await seedShiftInvoicesAndPayments();

        expect(
          await database.paymentDao.countPendingCardPaymentsForShift('shift-B'),
          1,
        );
        expect(
          await database.paymentDao
              .countReconciledCardPaymentsForShift('shift-B'),
          0,
        );
        expect(
          await database.paymentDao
              .countOverriddenCardPaymentsForShift('shift-B'),
          0,
        );
        expect(
          await database.paymentDao
              .countPendingCardPaymentsForShift('shift-unknown'),
          0,
        );
        expect(
          await database.paymentDao
              .countReconciledCardPaymentsForShift('shift-unknown'),
          0,
        );
        expect(
          await database.paymentDao
              .countOverriddenCardPaymentsForShift('shift-unknown'),
          0,
        );
      });

      test('non-card payments are never counted', () async {
        await seedShiftInvoicesAndPayments();

        // shift-A carries one cash payment; the pending count stays at the
        // three card rows even though the shift has 4 non-reconciled rows
        // total.
        expect(
          await database.paymentDao.countPendingCardPaymentsForShift('shift-A'),
          3,
        );
      });
    });

    group('reconciliation sync outbox (S1a #68)', () {
      test('a freshly inserted payment defaults reconciliation_sync_status to synced', () async {
        final now = DateTime.now().millisecondsSinceEpoch;

        final payment = PaymentEntity(
          id: 'pay-default-synced',
          invoiceId: 'inv-test-01',
          method: 'card',
          amount: 100.0,
          amountNio: 100.0,
          voucherCode: 'PENDIENTE',
          reconciliationStatus: 'PENDIENTE',
          createdAt: now,
        );

        await database.paymentDao.insertPayments([payment]);

        // A payment created at checkout travels inside the sale sync, so it
        // must not create reconciliation outbox work.
        expect(
          await database.paymentDao.getPendingReconciliations(),
          isEmpty,
        );

        final stored =
            await database.paymentDao.getPaymentsByInvoiceId('inv-test-01');
        expect(stored.first.reconciliationSyncStatus, 'synced');
      });

      test('getPendingReconciliations returns only rows with sync status pending', () async {
        final now = DateTime.now().millisecondsSinceEpoch;

        final pendingRow = PaymentEntity(
          id: 'pay-outbox-pending',
          invoiceId: 'inv-test-01',
          method: 'card',
          amount: 450.0,
          amountNio: 450.0,
          voucherCode: '778899',
          reconciliationStatus: 'CONCILIADO',
          reconciliationSyncStatus: 'pending',
          batchNumber: '007',
          last4: '4321',
          reconciledAt: now,
          reconciledByUserId: 'cajero-01',
          createdAt: now,
        );
        final syncedRow = PaymentEntity(
          id: 'pay-outbox-synced',
          invoiceId: 'inv-test-01',
          method: 'card',
          amount: 350.0,
          amountNio: 350.0,
          voucherCode: '112233',
          reconciliationStatus: 'CONCILIADO',
          createdAt: now,
        );

        await database.paymentDao.insertPayments([pendingRow, syncedRow]);

        final pending = await database.paymentDao.getPendingReconciliations();
        expect(pending, hasLength(1));
        expect(pending.single.id, 'pay-outbox-pending');
        expect(pending.single.reconciliationSyncStatus, 'pending');
      });

      test('updateReconciliationSyncStatus flips only the target row', () async {
        final now = DateTime.now().millisecondsSinceEpoch;

        final rowA = PaymentEntity(
          id: 'pay-sync-a',
          invoiceId: 'inv-test-01',
          method: 'card',
          amount: 450.0,
          amountNio: 450.0,
          voucherCode: '778899',
          reconciliationStatus: 'CONCILIADO',
          reconciliationSyncStatus: 'pending',
          createdAt: now,
        );
        final rowB = PaymentEntity(
          id: 'pay-sync-b',
          invoiceId: 'inv-test-01',
          method: 'card',
          amount: 350.0,
          amountNio: 350.0,
          voucherCode: '112233',
          reconciliationStatus: 'CONCILIADO',
          reconciliationSyncStatus: 'pending',
          createdAt: now,
        );

        await database.paymentDao.insertPayments([rowA, rowB]);
        expect(
          await database.paymentDao.getPendingReconciliations(),
          hasLength(2),
        );

        await database.paymentDao
            .updateReconciliationSyncStatus('pay-sync-a', 'synced');

        final stillPending =
            await database.paymentDao.getPendingReconciliations();
        expect(stillPending, hasLength(1));
        expect(stillPending.single.id, 'pay-sync-b');
      });
    });
  });

  group('override supervisor credential column (v65 → v66 migration)', () {
    // Harness note: this follows the repo's existing migration-test pattern
    // (test/data/database/*_migration_test.dart) — a raw sqflite_ffi
    // database opened at the old version, with the guarded migration
    // function run directly. The payments table is created here with the
    // exact v65 shape (pre-override_supervisor_ref).
    late String dbPath;

    setUpAll(() {
      sqfliteFfiInit();
      databaseFactory = databaseFactoryFfi;
    });

    setUp(() async {
      dbPath =
          '${await databaseFactory.getDatabasesPath()}/payment_v66_migration_test.db';
      await databaseFactory.deleteDatabase(dbPath);
    });

    tearDown(() async {
      await databaseFactory.deleteDatabase(dbPath);
    });

    Future<dynamic> openV65WithLegacyRow() async {
      final db = await databaseFactory.openDatabase(
        dbPath,
        options: OpenDatabaseOptions(
          version: 65,
          onCreate: (database, version) async {
            await database.execute('''
              CREATE TABLE payments (
                id TEXT NOT NULL PRIMARY KEY,
                invoice_id TEXT NOT NULL,
                method TEXT NOT NULL,
                amount REAL NOT NULL,
                currency TEXT NOT NULL,
                exchange_rate REAL NOT NULL,
                amount_nio REAL NOT NULL,
                change_given REAL NOT NULL,
                change_currency TEXT NOT NULL,
                voucher_code TEXT,
                card_brand TEXT,
                card_type TEXT,
                bank_pos TEXT,
                reconciliation_status TEXT,
                last4 TEXT,
                batch_number TEXT,
                reconciled_at INTEGER,
                reconciled_by_user_id TEXT,
                reconciliation_sync_status TEXT NOT NULL DEFAULT 'synced',
                created_at INTEGER
              )
            ''');
            // A pre-fix MANUAL_OVERRIDE row: the typed supervisor string
            // abused reconciled_by_user_id, no credential column existed.
            await database.execute('''
              INSERT INTO payments (id, invoice_id, method, amount, currency,
                exchange_rate, amount_nio, change_given, change_currency,
                voucher_code, reconciliation_status, reconciled_by_user_id,
                reconciliation_sync_status)
              VALUES ('pay-legacy-override', 'inv-legacy', 'card', 300.0,
                'NIO', 1.0, 300.0, 0.0, 'NIO', 'OVERRIDE: sin voucher',
                'MANUAL_OVERRIDE', 'sup-legacy', 'pending')
            ''');
          },
        ),
      );
      return db;
    }

    test('migration65_66 adds the nullable column and legacy rows read back null', () async {
      final db = await openV65WithLegacyRow();

      await migration65_66.migrate(db);

      final columns = await db.rawQuery('PRAGMA table_info(payments)');
      final names = columns.map((c) => c['name'] as String).toSet();
      expect(names, contains('override_supervisor_ref'));

      final row = (await db.rawQuery(
        'SELECT * FROM payments WHERE id = ?',
        ['pay-legacy-override'],
      )).single;
      // Old rows must read back null — NOT crash and NOT inherit the
      // abused reconciled_by_user_id value.
      expect(row['override_supervisor_ref'], isNull);
      // The historical (wrong-shape) value is preserved untouched.
      expect(row['reconciled_by_user_id'], 'sup-legacy');

      await db.close();
    });

    test('migration65_66 is a no-op when the column already exists (re-run safety)', () async {
      final db = await openV65WithLegacyRow();

      await migration65_66.migrate(db);
      // Second run must not throw (SQLite has no ADD COLUMN IF NOT EXISTS).
      await migration65_66.migrate(db);

      final columns = await db.rawQuery('PRAGMA table_info(payments)');
      final refColumns =
          columns.where((c) => c['name'] == 'override_supervisor_ref');
      expect(refColumns, hasLength(1));

      await db.close();
    });

    test('the new column round-trips verbatim through the DAO on a fresh v66 schema', () async {
      final now = DateTime.now().millisecondsSinceEpoch;
      final payment = PaymentEntity(
        id: 'pay-ref-roundtrip',
        invoiceId: 'inv-test-01',
        method: 'card',
        amount: 250.0,
        amountNio: 250.0,
        voucherCode: 'OVERRIDE: papel atascado',
        reconciliationStatus: 'MANUAL_OVERRIDE',
        reconciliationSyncStatus: 'pending',
        reconciledAt: now,
        reconciledByUserId: 'cajero-01',
        overrideSupervisorRef: ' supervisor-mariana ',
        createdAt: now,
      );

      await database.paymentDao.insertPayments([payment]);
      final stored =
          await database.paymentDao.getPaymentsByInvoiceId('inv-test-01');
      // Stored verbatim — including whitespace: never validated, never
      // normalized client-side (the backend normalizes whitespace-only to
      // null on its side).
      expect(stored.first.overrideSupervisorRef, ' supervisor-mariana ');
      expect(stored.first.reconciledByUserId, 'cajero-01');

      // A row written without the credential reads back null.
      final plain = PaymentEntity(
        id: 'pay-ref-null',
        invoiceId: 'inv-test-01',
        method: 'card',
        amount: 100.0,
        amountNio: 100.0,
        voucherCode: '654321',
        reconciliationStatus: 'CONCILIADO',
        createdAt: now,
      );
      await database.paymentDao.insertPayments([plain]);
      final all = await database.paymentDao.getPaymentsByInvoiceId('inv-test-01');
      expect(
        all.firstWhere((p) => p.id == 'pay-ref-null').overrideSupervisorRef,
        isNull,
      );
    });
  });
}
