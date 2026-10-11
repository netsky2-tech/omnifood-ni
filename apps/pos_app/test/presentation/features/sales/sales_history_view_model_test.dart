import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/core/localization/display_name_resolver.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/models/sales/invoice_item_entity.dart';
import 'package:pos_app/data/models/sales/invoice_item_modifier_entity.dart';
import 'package:pos_app/data/models/sales/payment_entity.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/presentation/features/sales/view_models/sales_history_view_model.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// SOHO P3 S3a: first honest view-model coverage of the sales history.
/// Real in-memory Floor database on purpose (repository lesson): a fake DAO
/// would not prove the entity→domain mapping or the date/totals behaviour
/// against the real schema.
void main() {
  late AppDatabase database;
  late SalesHistoryViewModel viewModel;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    viewModel = SalesHistoryViewModel(database);
  });

  tearDown(() async {
    await database.close();
  });

  DateTime day(int y, int m, int d) => DateTime(y, m, d);

  Future<void> insertSale(
    AppDatabase db, {
    required String id,
    required String number,
    required DateTime createdAt,
    String? localIssueDate,
    String productName = 'Cerveza Toña',
    bool canceled = false,
    double subtotal = 100,
    double tax = 15,
    double total = 115,
  }) async {
    await db.invoiceDao.insertInvoice(
      InvoiceEntity(
        id: id,
        number: number,
        createdAt: createdAt.millisecondsSinceEpoch,
        userId: 'cashier-1',
        subtotal: subtotal,
        totalTax: tax,
        total: total,
        isCanceled: canceled,
        localIssueDate: localIssueDate,
      ),
    );
    await db.invoiceItemDao.insertItems([
      InvoiceItemEntity(
        id: '$id-item-1',
        invoiceId: id,
        productId: 'p-item',
        productName: productName,
        quantity: 1,
        unitPrice: subtotal,
        originalTaxRate: 0.15,
        appliedTaxRate: 0.15,
        taxAmount: tax,
        total: total,
      ),
    ]);
    await db.paymentDao.insertPayments([
      PaymentEntity(
        id: '$id-pay-1',
        invoiceId: id,
        method: 'cash',
        amount: total,
      ),
    ]);
  }

  group('SalesHistoryViewModel - date range filter (SOHO P3 S3a)', () {
    test('both bounds are INCLUSIVE and default is no filter', () async {
      final dA = day(2026, 2, 5);
      final dB = day(2026, 2, 6);
      final dC = day(2026, 2, 7);
      await insertSale(
        database,
        id: 'inv-a',
        number: '001',
        createdAt: dA.add(const Duration(hours: 10)),
        localIssueDate: '2026-02-05',
      );
      await insertSale(
        database,
        id: 'inv-b',
        number: '002',
        createdAt: dB.add(const Duration(hours: 10)),
        localIssueDate: '2026-02-06',
      );
      await insertSale(
        database,
        id: 'inv-c',
        number: '003',
        createdAt: dC.add(const Duration(hours: 10)),
        localIssueDate: '2026-02-07',
      );
      await viewModel.loadInvoices();
      expect(viewModel.loadErrorMessage, isNull);

      // Default: NO date filter — current behaviour preserved.
      expect(viewModel.filterDateFrom, isNull);
      expect(viewModel.filterDateTo, isNull);
      expect(viewModel.filteredInvoices.length, 3);

      // Exact single day: both ends inclusive.
      viewModel.setDateRange(dB, dB);
      expect(viewModel.filteredInvoices.map((i) => i.id), ['inv-b']);

      // Two-day window: from-day and to-day both included.
      viewModel.setDateRange(dA, dB);
      expect(viewModel.filteredInvoices.map((i) => i.id).toSet(), {
        'inv-a',
        'inv-b',
      });

      viewModel.clearDateRange();
      expect(viewModel.filterDateFrom, isNull);
      expect(viewModel.filterDateTo, isNull);
      expect(viewModel.filteredInvoices.length, 3);
    });

    test(
      'sale at 23:59 belongs to its LOCAL fiscal day, never shifted by UTC',
      () async {
        // 23:59 local on 2026-02-05. In UTC-negative zones (Nicaragua is
        // UTC-6) this epoch instant is already 2026-02-06 in UTC; a UTC-based
        // day filter would push it to the wrong fiscal day.
        final nearMidnight = day(
          2026,
          2,
          5,
        ).add(const Duration(hours: 23, minutes: 59));
        await insertSale(
          database,
          id: 'inv-night',
          number: '001',
          createdAt: nearMidnight,
        );
        await insertSale(
          database,
          id: 'inv-next',
          number: '002',
          createdAt: day(2026, 2, 6).add(const Duration(hours: 9)),
          localIssueDate: '2026-02-06',
        );
        await viewModel.loadInvoices();

        viewModel.setDateRange(day(2026, 2, 5), day(2026, 2, 5));
        expect(
          viewModel.filteredInvoices.map((i) => i.id),
          ['inv-night'],
          reason: 'a 23:59 local sale stays on its local fiscal day',
        );

        viewModel.setDateRange(day(2026, 2, 6), day(2026, 2, 6));
        expect(
          viewModel.filteredInvoices.map((i) => i.id),
          ['inv-next'],
          reason: 'the near-midnight sale must not leak into the next day',
        );
      },
    );

    test('stored local issue date (fiscal fact) wins over createdAt', () async {
      // Issued on a shift that crossed midnight: the sale was CREATED at
      // 23:40 on the 5th but its fiscal day (fixed at issuance, D-12) is
      // the 6th. The filter must honour the stored fiscal fact.
      final nearMidnight = day(
        2026,
        2,
        5,
      ).add(const Duration(hours: 23, minutes: 40));
      await insertSale(
        database,
        id: 'inv-cross',
        number: '001',
        createdAt: nearMidnight,
        localIssueDate: '2026-02-06',
      );
      await viewModel.loadInvoices();

      viewModel.setDateRange(day(2026, 2, 5), day(2026, 2, 5));
      expect(viewModel.filteredInvoices, isEmpty);

      viewModel.setDateRange(day(2026, 2, 6), day(2026, 2, 6));
      expect(viewModel.filteredInvoices.map((i) => i.id), ['inv-cross']);
    });

    test('text search AND date range combine with AND semantics', () async {
      final dA = day(2026, 2, 5);
      final dB = day(2026, 2, 6);
      await insertSale(
        database,
        id: 'inv-tona-a',
        number: '001',
        createdAt: dA.add(const Duration(hours: 10)),
        localIssueDate: '2026-02-05',
      );
      await insertSale(
        database,
        id: 'inv-tona-b',
        number: '002',
        createdAt: dB.add(const Duration(hours: 10)),
        localIssueDate: '2026-02-06',
      );
      await insertSale(
        database,
        id: 'inv-burger-a',
        number: '003',
        createdAt: dA.add(const Duration(hours: 11)),
        localIssueDate: '2026-02-05',
        productName: 'Hamburguesa',
      );
      await viewModel.loadInvoices();

      viewModel.setSearchQuery('toña');
      expect(
        viewModel.filteredInvoices.length,
        2,
        reason: 'search alone matches both Toña sales',
      );

      viewModel.setDateRange(dA, dA);
      expect(
        viewModel.filteredInvoices.map((i) => i.id),
        ['inv-tona-a'],
        reason: 'search AND date range must intersect',
      );
    });
  });

  group(
    'SalesHistoryViewModel - totals over the filtered set (SOHO P3 S3a)',
    () {
      test(
        'cancelled invoices are excluded from money and counted separately',
        () async {
          final dA = day(2026, 2, 5);
          await insertSale(
            database,
            id: 'inv-1',
            number: '001',
            createdAt: dA.add(const Duration(hours: 9)),
            localIssueDate: '2026-02-05',
          );
          await insertSale(
            database,
            id: 'inv-2',
            number: '002',
            createdAt: dA.add(const Duration(hours: 10)),
            localIssueDate: '2026-02-05',
          );
          await insertSale(
            database,
            id: 'inv-3',
            number: '003',
            createdAt: dA.add(const Duration(hours: 11)),
            localIssueDate: '2026-02-05',
          );
          // ANULADA: must NOT inflate the day's revenue.
          await insertSale(
            database,
            id: 'inv-void',
            number: '004',
            createdAt: dA.add(const Duration(hours: 12)),
            localIssueDate: '2026-02-05',
            canceled: true,
            subtotal: 500,
            tax: 75,
            total: 575,
          );
          await viewModel.loadInvoices();

          final totals = viewModel.filteredTotals;
          expect(totals.invoiceCount, 4);
          expect(totals.cancelledCount, 1);
          expect(totals.subtotalSum, closeTo(300, 0.001));
          expect(totals.taxSum, closeTo(45, 0.001));
          expect(totals.totalSum, closeTo(345, 0.001));
        },
      );

      test(
        'totals cover the FULL filtered set, not the visible window',
        () async {
          final dA = day(2026, 2, 5);
          final dB = day(2026, 2, 6);
          for (var i = 0; i < 52; i++) {
            await insertSale(
              database,
              id: 'inv-day-a-$i',
              number: 'A$i',
              createdAt: dA.add(Duration(minutes: i)),
              localIssueDate: '2026-02-05',
            );
          }
          await insertSale(
            database,
            id: 'inv-day-b',
            number: 'B1',
            createdAt: dB.add(const Duration(hours: 9)),
            localIssueDate: '2026-02-06',
          );
          await insertSale(
            database,
            id: 'inv-day-b2',
            number: 'B2',
            createdAt: dB.add(const Duration(hours: 10)),
            localIssueDate: '2026-02-06',
          );
          await viewModel.loadInvoices();

          // No filter: 54 invoices, window shows only the first page.
          expect(
            viewModel.visibleInvoices.length,
            SalesHistoryViewModel.pageSize,
          );
          expect(viewModel.hasMoreVisibleInvoices, isTrue);
          var totals = viewModel.filteredTotals;
          expect(
            totals.invoiceCount,
            54,
            reason: 'totals are over the ENTIRE filtered set',
          );
          expect(totals.totalSum, closeTo(54 * 115, 0.001));

          // Single-day filter still spans more than one page; totals stay whole.
          viewModel.setDateRange(dA, dA);
          expect(
            viewModel.visibleInvoices.length,
            SalesHistoryViewModel.pageSize,
          );
          totals = viewModel.filteredTotals;
          expect(totals.invoiceCount, 52);
          expect(totals.totalSum, closeTo(52 * 115, 0.001));
        },
      );
    },
  );

  group('SalesHistoryViewModel - bounded display window (SOHO P3 S3a)', () {
    test('page size, reveal-more and honest more-remaining flag', () async {
      final dA = day(2026, 2, 5);
      for (var i = 0; i < 55; i++) {
        await insertSale(
          database,
          id: 'inv-w-$i',
          number: 'W$i',
          createdAt: dA.add(Duration(minutes: i)),
          localIssueDate: '2026-02-05',
        );
      }
      await viewModel.loadInvoices();

      expect(viewModel.visibleInvoices.length, 50);
      expect(viewModel.hasMoreVisibleInvoices, isTrue);

      viewModel.revealMoreVisible();
      expect(viewModel.visibleInvoices.length, 55);
      expect(viewModel.hasMoreVisibleInvoices, isFalse);

      // A filter change restarts the window.
      viewModel.setDateRange(dA, dA);
      expect(viewModel.visibleInvoices.length, 50);
      expect(
        viewModel.hasMoreVisibleInvoices,
        isTrue,
        reason: '5 rows of the same day are still hidden',
      );
    });
  });

  group('SalesHistoryViewModel - honest failure surfacing (SOHO P3 S3a)', () {
    test(
      'a caught invoice read failure is distinguishable from no sales',
      () async {
        final failingDb = await $FloorAppDatabase
            .inMemoryDatabaseBuilder()
            .build();
        // Closing the database makes the REAL invoice read throw for real.
        await failingDb.close();
        final vm = SalesHistoryViewModel(failingDb);
        try {
          await vm.loadInvoices();
        } on Exception {
          // Escaping would already be a contract violation; the current code
          // swallows, so the assertion below is the real RED/GREEN check.
        }
        expect(
          vm.loadErrorMessage,
          isNotNull,
          reason: 'a failed read must NOT render as an empty history',
        );
        expect(vm.hasLoadError, isTrue);
      },
    );

    test('row-context failures are counted, not silently degraded', () async {
      await insertSale(
        database,
        id: 'inv-good',
        number: '001',
        createdAt: day(2026, 2, 5).add(const Duration(hours: 9)),
        localIssueDate: '2026-02-05',
      );
      await insertSale(
        database,
        id: 'inv-bad',
        number: '002',
        createdAt: day(2026, 2, 5).add(const Duration(hours: 10)),
        localIssueDate: '2026-02-05',
      );
      final vm = _VmWithContextFailure(database, const {'inv-bad'});
      await vm.loadInvoices();

      expect(vm.rowContextFailureCount, 1);
      expect(vm.getRowContext('inv-good'), isNotNull);
      expect(vm.getRowContext('inv-bad'), isNull);
      expect(
        vm.loadErrorMessage,
        isNull,
        reason: 'a context failure is per-row, not a whole-load failure',
      );
    });

    test(
      'D-14 preserved: unknown cashier id renders the fallback label',
      () async {
        await insertSale(
          database,
          id: 'inv-ghost',
          number: '001',
          createdAt: day(2026, 2, 5).add(const Duration(hours: 9)),
          localIssueDate: '2026-02-05',
        );
        await viewModel.loadInvoices();

        final ctx = viewModel.getRowContext('inv-ghost');
        expect(ctx, isNotNull);
        expect(ctx!.cashierName, kUnresolvedUserNameLabel);
        expect(
          ctx.cashierName.contains('ghost'),
          isFalse,
          reason: 'never leak the raw UUID into the row',
        );
      },
    );
  });

  group('SalesHistoryViewModel - detail mirror (round-2 §17.4)', () {
    test('getInvoiceItems carries the line modifiers the cart charged',
        () async {
      await insertSale(
        database,
        id: 'inv-mod',
        number: '001-000001',
        createdAt: DateTime(2026, 10, 10),
      );
      await database.salesTransactionDao.insertInvoiceItemModifiers([
        InvoiceItemModifierEntity(
          id: 'mod-1',
          invoiceItemId: 'inv-mod-item-1',
          name: 'Leche: Entera',
          extraPrice: 0,
          quantity: 1,
        ),
        InvoiceItemModifierEntity(
          id: 'mod-2',
          invoiceItemId: 'inv-mod-item-1',
          name: 'Extra shot',
          extraPrice: 15,
          quantity: 2,
        ),
      ]);

      final items = await viewModel.getInvoiceItems('inv-mod');

      expect(items, hasLength(1));
      final extras = items.single.selectedModifiers;
      expect(
        extras.map((m) => m.name).toList(),
        <String>['Leche: Entera', 'Extra shot'],
        reason: 'the detail mirrors the cart, in the modifiers insertion '
            'order the receipt path also uses',
      );
      expect(extras.last.extraPrice, 15);
      expect(extras.last.quantity, 2);
    });

    test('a line with no modifiers stays empty, never fabricated', () async {
      await insertSale(
        database,
        id: 'inv-nomod',
        number: '001-000002',
        createdAt: DateTime(2026, 10, 10),
      );

      final items = await viewModel.getInvoiceItems('inv-nomod');

      expect(items.single.selectedModifiers, isEmpty);
    });
  });
}

/// Test double that forces the per-invoice context read to fail for the
/// given invoice ids — proves the row-context failure counter without
/// corrupting the real database.
class _VmWithContextFailure extends SalesHistoryViewModel {
  final Set<String> failFor;

  _VmWithContextFailure(super.database, this.failFor);

  @override
  Future<InvoiceRowContext> loadRowContext(Invoice invoice) async {
    if (failFor.contains(invoice.id)) {
      throw StateError('simulated context read failure');
    }
    return super.loadRowContext(invoice);
  }
}
