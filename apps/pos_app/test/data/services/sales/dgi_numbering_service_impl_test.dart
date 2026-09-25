import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/repositories/sales/sales_repository_impl.dart';
import 'package:pos_app/data/services/sales/dgi_numbering_service_impl.dart';
import 'package:pos_app/domain/usecases/inventory/reverse_sale_inventory_use_case.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/usecases/inventory/process_sale_inventory_use_case.dart';
import 'package:pos_app/domain/services/inventory/movement_engine.dart';
import 'package:pos_app/domain/services/sales/dgi_numbering_service.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// B2a (D-16/D-18/D-1): the fiscal sequence is a first-class nullable state.
/// The invented 1-1000 ranges are gone; the numbering fails closed with
/// named errors; the boot/read paths never write.
void main() {
  late AppDatabase database;
  late DgiNumberingServiceImpl service;
  late DgiNumberingServiceImpl noInvoiceDaoService;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    service = DgiNumberingServiceImpl(
      database.localConfigDao,
      database.invoiceDao,
    );
    noInvoiceDaoService = DgiNumberingServiceImpl(database.localConfigDao);
  });

  tearDown(() async {
    await database.close();
  });

  group('D-16: unconfigured sequence is a named fail-closed state', () {
    test('getNextNumber throws FISCAL_SEQUENCE_UNCONFIGURED', () async {
      await expectLater(
        service.getNextNumber(),
        throwsA(isA<FiscalSequenceUnconfiguredError>()),
      );
    });

    test('isRangeExhausted throws FISCAL_SEQUENCE_UNCONFIGURED', () async {
      await expectLater(
        service.isRangeExhausted(),
        throwsA(isA<FiscalSequenceUnconfiguredError>()),
      );
    });

    test('incrementNumber throws FISCAL_SEQUENCE_UNCONFIGURED', () async {
      await expectLater(
        service.incrementNumber(),
        throwsA(isA<FiscalSequenceUnconfiguredError>()),
      );
    });

    test('read paths NEVER materialize a sequence (D-1 regression)', () async {
      // This is the test that would have caught the duplicate-numbers bug:
      // the old impl self-healed by writing 1-1000000 on every read.
      await expectLater(
        service.getNextNumber(),
        throwsA(isA<FiscalSequenceUnconfiguredError>()),
      );
      await expectLater(
        service.isRangeExhausted(),
        throwsA(isA<FiscalSequenceUnconfiguredError>()),
      );

      // Byte-identical absence: no config row was materialized.
      expect(await database.localConfigDao.getConfigByKey('dgi_prefix'), isNull);
      expect(
          await database.localConfigDao.getConfigByKey('dgi_range_start'), isNull);
      expect(
          await database.localConfigDao.getConfigByKey('dgi_range_end'), isNull);
      expect(await database.localConfigDao.getConfigByKey('dgi_current_number'),
          isNull);
    });
  });

  group('D-16: nullable end is a legitimate first-class state', () {
    test('a series without end is never exhausted and keeps issuing', () async {
      await service.initializeRange(prefix: '001-001-01-', start: 5, end: null);

      expect(await service.isRangeExhausted(), isFalse);
      expect(await service.getNextNumber(), '001-001-01-00000005');
      await service.incrementNumber();
      expect(await service.getNextNumber(), '001-001-01-00000006');
      // Still not exhausted after many issuances.
      await service.incrementNumber();
      expect(await service.isRangeExhausted(), isFalse);
    });

    test('the absent end stays absent after reads (no materialization)',
        () async {
      await service.initializeRange(prefix: '001-001-01-', start: 5, end: null);
      await service.getNextNumber();
      await service.incrementNumber();

      expect(await database.localConfigDao.getConfigByKey('dgi_range_end'),
          isNull);
    });
  });

  group('D-18: exhaustion never reuses, wraps, or self-extends', () {
    test('inclusive end is servable; strictly after it the named error fires',
        () async {
      await service.initializeRange(prefix: '001-001-01-', start: 1, end: 2);

      expect(await service.isRangeExhausted(), isFalse);
      expect(await service.getNextNumber(), '001-001-01-00000001');
      await service.incrementNumber();
      expect(await service.isRangeExhausted(), isFalse);
      expect(await service.getNextNumber(), '001-001-01-00000002');
      await service.incrementNumber();

      expect(await service.isRangeExhausted(), isTrue);
      await expectLater(
        service.getNextNumber(),
        throwsA(isA<FiscalSequenceExhaustedError>()),
      );
    });

    test('the last number stays consumed: no wrap, no cursor rewind', () async {
      await service.initializeRange(prefix: '001-001-01-', start: 1, end: 2);
      await service.getNextNumber();
      await service.incrementNumber();
      await service.getNextNumber();
      await service.incrementNumber();

      final before = await database.localConfigDao
          .getConfigByKey('dgi_current_number');
      await expectLater(
        service.getNextNumber(),
        throwsA(isA<FiscalSequenceExhaustedError>()),
      );
      expect(await service.isRangeExhausted(), isTrue);
      final after =
          await database.localConfigDao.getConfigByKey('dgi_current_number');
      expect(after!.value, before!.value, reason: 'no wrap: cursor untouched');
    });

    test('a persisted folio is never reused even when the cursor lags',
        () async {
      await service.initializeRange(prefix: '001-001-01-', start: 1, end: 50);
      final first = await service.getNextNumber();
      await database.invoiceDao.insertInvoice(
        InvoiceEntity(
          id: 'invoice-1',
          number: first,
          createdAt: DateTime.now().millisecondsSinceEpoch,
          userId: 'cashier-1',
          subtotal: 100,
          totalTax: 15,
          total: 115,
        ),
      );
      // Cursor rewound artificially (crash between print and save): the
      // persisted folio is authoritative — never reused.
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(key: 'dgi_current_number', value: '1'),
      );

      expect(await service.getNextNumber(), '001-001-01-00000002');
    });
  });

  group('D-1: reads never rewrite a configured sequence', () {
    test('repeated reads leave the config byte-identical', () async {
      await service.initializeRange(prefix: '001-001-01-', start: 1, end: 50);
      final readCurrent =
          await database.localConfigDao.getConfigByKey('dgi_current_number');
      final readStart =
          await database.localConfigDao.getConfigByKey('dgi_range_start');
      final readEnd =
          await database.localConfigDao.getConfigByKey('dgi_range_end');
      final readPrefix =
          await database.localConfigDao.getConfigByKey('dgi_prefix');

      await service.getNextNumber();
      await service.isRangeExhausted();
      await service.getNextNumber();

      expect(
          (await database.localConfigDao.getConfigByKey('dgi_current_number'))!
              .value,
          readCurrent!.value);
      expect(
          (await database.localConfigDao.getConfigByKey('dgi_range_start'))!
              .value,
          readStart!.value);
      expect(
          (await database.localConfigDao.getConfigByKey('dgi_range_end'))!.value,
          readEnd!.value);
      expect(
          (await database.localConfigDao.getConfigByKey('dgi_prefix'))!.value,
          readPrefix!.value);
    });

    test('initializeRange never overwrites a persisted cursor (D-1)', () async {
      await service.initializeRange(prefix: '001-001-01-', start: 1, end: 50);
      await service.getNextNumber();
      await service.incrementNumber();
      final persisted =
          await database.localConfigDao.getConfigByKey('dgi_current_number');

      await service.initializeRange(prefix: '001-001-01-', start: 1, end: 99);

      expect(
        (await database.localConfigDao.getConfigByKey('dgi_current_number'))!
            .value,
        persisted!.value,
        reason: 'D-1: provisioning never overwrites a persisted sequence',
      );
    });
  });

  group('issuance gate: a sale cannot emit without a configured sequence', () {
    test(
        'saveSale fails with the named error and the Spanish directive message',
        () async {
      // Real numbering service over an UNCONFIGURED database: the sale must
      // be blocked before any invoice row exists.
      final repository = SalesRepositoryImpl(
        database: database,
        invoiceDao: database.invoiceDao,
        itemDao: database.invoiceItemDao,
        paymentDao: database.paymentDao,
        transactionDao: database.salesTransactionDao,
        numberingService: service,
        movementEngine: _NoopMovementEngine(),
        auditRepository: _NoopAuditRepository(),
        processInventoryUseCase:
            ProcessSaleInventoryUseCase(_NoopMovementEngine()),
        reverseInventoryUseCase:
            ReverseSaleInventoryUseCase(_NoopMovementEngine()),
        inventoryRepository: _NoopInventoryRepository(),
      );
      final invoice = Invoice(
        id: 'inv-gate-1',
        number: '',
        createdAt: DateTime.now(),
        userId: 'cashier-1',
        subtotal: 100,
        totalTax: 15,
        total: 115,
        paymentStatus: PaymentStatus.paid,
        syncStatus: SyncStatus.pending,
        type: InvoiceType.regular,
      );

      await expectLater(
        repository.saveSale(
            invoice: invoice, items: const [], payments: const []),
        throwsA(isA<FiscalSequenceUnconfiguredError>().having(
          (e) => e.message,
          'message',
          contains('Configure el rango DGI antes de facturar'),
        )),
      );

      final rows = await database.database.query('invoices');
      expect(rows, isEmpty, reason: 'no fiscal document is emitted');
    });
  });
}

class _NoopMovementEngine implements MovementEngine {
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnsupportedError('Not used by this test');
}

class _NoopAuditRepository implements AuditRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnsupportedError('Not used by this test');
}

class _NoopInventoryRepository implements InventoryRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnsupportedError('Not used by this test');
}

class _NoopProcessInventoryUseCase {
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnsupportedError('Not used by this test');
}
