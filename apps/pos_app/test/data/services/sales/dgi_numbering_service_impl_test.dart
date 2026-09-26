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

/// D-21 (and B2a D-16/D-18/D-1 heritage): there is NO range for
/// computerized systems — only consecutive, progressive, gapless numbering.
/// The exhaustion gate is gone; the sequence is unbounded. The single
/// failure state is FISCAL_SEQUENCE_UNCONFIGURED (no consecutivo inicial
/// configured, or a corrupt/unparseable cursor). The prefix is optional:
/// blank → plain decimal folio with no padding; present → prefix +
/// zero-padded 8-digit folio. The persisted last folio remains authoritative
/// (D-18) and the persisted cursor is never overwritten (D-1); the boot and
/// read paths never write.
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

    test('incrementNumber throws FISCAL_SEQUENCE_UNCONFIGURED', () async {
      await expectLater(
        service.incrementNumber(),
        throwsA(isA<FiscalSequenceUnconfiguredError>()),
      );
    });

    test('corrupt/unparseable cursor throws FISCAL_SEQUENCE_UNCONFIGURED',
        () async {
      // D-18 spirit: a corrupt cursor is the same named configuration state,
      // never a self-healed default.
      await service.initializeRange(prefix: '001-001-01-', start: 7);
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(key: 'dgi_current_number', value: 'not-a-number'),
      );

      await expectLater(
        service.getNextNumber(),
        throwsA(isA<FiscalSequenceUnconfiguredError>()),
      );
      await expectLater(
        service.incrementNumber(),
        throwsA(isA<FiscalSequenceUnconfiguredError>()),
      );
    });

    test('cursor below 1 throws FISCAL_SEQUENCE_UNCONFIGURED', () async {
      await service.initializeRange(prefix: '001-001-01-', start: 7);
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(key: 'dgi_current_number', value: '0'),
      );

      await expectLater(
        service.getNextNumber(),
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

      // Byte-identical absence: no config row was materialized.
      expect(await database.localConfigDao.getConfigByKey('dgi_prefix'), isNull);
      expect(
          await database.localConfigDao.getConfigByKey('dgi_range_start'), isNull);
      // D-21: the retired range-end key is never recreated.
      expect(
          await database.localConfigDao.getConfigByKey('dgi_range_end'), isNull);
      expect(await database.localConfigDao.getConfigByKey('dgi_current_number'),
          isNull);
    });
  });

  group('D-21: blank prefix issues PLAIN unpadded numeric folios', () {
    test('blank prefix issues consecutive plain folios 1, 2, 3 (no padding)',
        () async {
      await service.initializeRange(prefix: '', start: 1);

      expect(await service.getNextNumber(), '1');
      await service.incrementNumber();
      expect(await service.getNextNumber(), '2');
      await service.incrementNumber();
      expect(await service.getNextNumber(), '3');
    });

    test('absent prefix row also issues plain folios (prefix is optional)',
        () async {
      // Simulate a device configured before the prefix existed at all.
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(key: 'dgi_current_number', value: '4'),
      );

      expect(await service.getNextNumber(), '4');
    });

    test(
        'plain folio collision cross-check: persisted plain folio is never reused',
        () async {
      await service.initializeRange(prefix: '', start: 1);
      final first = await service.getNextNumber();
      expect(first, '1');
      await database.invoiceDao.insertInvoice(
        InvoiceEntity(
          id: 'invoice-plain-1',
          number: first,
          createdAt: DateTime.now().millisecondsSinceEpoch,
          userId: 'cashier-1',
          subtotal: 100,
          totalTax: 15,
          total: 115,
        ),
      );
      // Cursor rewound artificially (crash between print and cursor save):
      // the persisted plain folio is authoritative — never reused.
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(key: 'dgi_current_number', value: '1'),
      );

      expect(await service.getNextNumber(), '2');
    });
  });

  group('D-21: prefix present keeps the zero-padded format unchanged', () {
    test('prefix present issues prefix + zero-padded 8-digit folio', () async {
      await service.initializeRange(prefix: '001-001-01-', start: 5);

      expect(await service.getNextNumber(), '001-001-01-00000005');
      await service.incrementNumber();
      expect(await service.getNextNumber(), '001-001-01-00000006');
    });

    test('padded folio collision cross-check is unchanged (D-18)',
        () async {
      await service.initializeRange(prefix: '001-001-01-', start: 1);
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
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(key: 'dgi_current_number', value: '1'),
      );

      expect(await service.getNextNumber(), '001-001-01-00000002');
    });
  });

  group('D-21: mixed transition — prefix set after plain numbers started', () {
    test(
        'adding a prefix after plain folios: cursor continues, never resets',
        () async {
      await service.initializeRange(prefix: '', start: 1);
      expect(await service.getNextNumber(), '1');
      await service.incrementNumber();
      expect(await service.getNextNumber(), '2');
      await service.incrementNumber();

      // Re-provisioning with a prefix (e.g. the letter arrives with a serie)
      // must NOT reset the consecutivo: D-1 keeps the persisted cursor.
      await service.initializeRange(prefix: '001-001-01-', start: 1);

      expect(await service.getNextNumber(), '001-001-01-00000003');
    });

    test('transition is one-way on the cursor: the next plain read continues',
        () async {
      await service.initializeRange(prefix: '', start: 1);
      await service.getNextNumber();
      await service.incrementNumber(); // cursor → 2
      await service.initializeRange(prefix: 'B-', start: 1);
      final prefixed = await service.getNextNumber();
      expect(prefixed, 'B-00000002');
      await service.incrementNumber(); // cursor → 3

      // If the prefix row were later cleared, numbering continues from 3 —
      // never back to 1.
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(key: 'dgi_prefix', value: ''),
      );
      expect(await service.getNextNumber(), '3');
    });
  });

  group('D-1: reads never rewrite a configured sequence', () {
    test('repeated reads leave the config byte-identical', () async {
      await service.initializeRange(prefix: '001-001-01-', start: 1);
      final readCurrent =
          await database.localConfigDao.getConfigByKey('dgi_current_number');
      final readStart =
          await database.localConfigDao.getConfigByKey('dgi_range_start');
      final readPrefix =
          await database.localConfigDao.getConfigByKey('dgi_prefix');

      await service.getNextNumber();
      await service.getNextNumber();
      await service.incrementNumber();

      expect(
          (await database.localConfigDao.getConfigByKey('dgi_current_number'))!
              .value,
          '2',
          reason: 'only the increment advanced the cursor');
      expect(
          (await database.localConfigDao.getConfigByKey('dgi_range_start'))!
              .value,
          readStart!.value);
      expect(
          (await database.localConfigDao.getConfigByKey('dgi_prefix'))!.value,
          readPrefix!.value);
      expect(
          await database.localConfigDao.getConfigByKey('dgi_range_end'), isNull,
          reason: 'D-21: the retired end key is never written');
    });

    test('initializeRange never overwrites a persisted cursor (D-1)', () async {
      await service.initializeRange(prefix: '001-001-01-', start: 1);
      await service.getNextNumber();
      await service.incrementNumber();
      final persisted =
          await database.localConfigDao.getConfigByKey('dgi_current_number');

      await service.initializeRange(prefix: '001-001-01-', start: 99);

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
      // be blocked before any invoice row exists. D-21: the only failure
      // state is UNCONFIGURED — no consecutivo inicial configured.
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
          contains(
              'Configure la autorización fiscal DGI (consecutivo inicial) antes de facturar'),
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
