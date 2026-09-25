import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/customer/customer_entity.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/models/sales/invoice_item_entity.dart';
import 'package:pos_app/data/repositories/sales/sales_repository_impl.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/printer/receipt_document.dart';
import 'package:pos_app/domain/services/printer/receipt_layout_formatter.dart';
import 'package:pos_app/domain/usecases/sales/void_decision.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'sales_repository_impl_test.mocks.dart';

/// B1r slice 1 (D-13, #547): the reprint engine. The paper must reproduce
/// the document AS ISSUED from the immutable fiscal header snapshot — never
/// under current config — and the REPRINT_REQUESTED audit rides request
/// acceptance. Print-only: the numbering service is never touched.
void main() {
  late AppDatabase database;
  late MockAuditRepository auditRepository;
  late MockDgiNumberingService numberingService;
  late MockReverseSaleInventoryUseCase reverseInventoryUseCase;
  late SalesRepositoryImpl repository;

  const originalHeader = {
    'businessName': 'Café Original',
    'ruc': 'A0011234567890',
    'address': 'Plaza Original 123',
    'phone': '555-0101',
    'fiscalAuthorizationNumber': 'AUT-DGI-2026-0001',
    'taxRegime': 'REGIMEN_GENERAL',
  };

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  InvoiceEntity invoice({
    String? fiscalHeaderSnapshot,
    bool isCanceled = false,
  }) =>
      InvoiceEntity(
        id: 'inv-reprint-1',
        number: '001-001-01-00000010',
        createdAt: DateTime(2026, 9, 24, 12, 0).millisecondsSinceEpoch,
        userId: 'cashier-1',
        subtotal: 100,
        totalTax: 15,
        total: 115,
        isCanceled: isCanceled,
        syncStatus: 'synced',
        paymentStatus: 'paid',
        type: 'regular',
        shiftId: 'shift-1',
        localIssueDate: '2026-09-24',
        fiscalHeaderSnapshot: fiscalHeaderSnapshot,
      );

  InvoiceItemEntity originItem({String invoiceId = 'inv-reprint-1'}) =>
      InvoiceItemEntity(
        id: 'origin-item-1',
        invoiceId: invoiceId,
        productId: 'prod-1',
        productName: 'Café Espresso',
        quantity: 2,
        unitPrice: 50,
        originalTaxRate: 0.15,
        appliedTaxRate: 0.15,
        taxAmount: 15,
        total: 115,
      );

  Future<void> seedIssuedInvoice() async {
    await database.cashierSessionDao.insertSession(
      CashierSessionEntity(
        id: 'shift-1',
        userId: 'cashier-1',
        terminalId: 'term-1',
        openedAt: 1700000000000,
        isClosed: false,
      ),
    );
    await database.customerDao.saveCustomer(
      CustomerEntity(
        id: 'cust-1',
        name: 'Cliente',
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      ),
    );
    await database.invoiceDao.insertInvoice(
      invoice(
        fiscalHeaderSnapshot: jsonEncode(originalHeader),
      ),
    );
    await database.invoiceItemDao.insertItems([originItem()]);
    // The live config at reprint time DIFFERS from issuance: this is the
    // D-13 heart scenario setup.
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(
        key: 'printer_header_business_name',
        value: 'Café Renombrado S.A.',
      ),
    );
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'ruc', value: 'B999888777000'),
    );
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'tax_regime', value: 'CUOTA_FIJA'),
    );
  }

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    auditRepository = MockAuditRepository();
    numberingService = MockDgiNumberingService();
    reverseInventoryUseCase = MockReverseSaleInventoryUseCase();
    when(reverseInventoryUseCase.execute(any, any)).thenAnswer((_) async => []);
    when(auditRepository.log(any, metadata: anyNamed('metadata')))
        .thenAnswer((_) async {});

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

  group('D-13 heart: reprint reproduces the snapshot, not live config', () {
    test('the payload header carries the ISSUANCE values after the config changed',
        () async {
      await seedIssuedInvoice();

      final preparation = await repository.prepareReprintInvoice(
        'inv-reprint-1',
        'CLIENTE_PERDIO_TICKET',
      );

      expect(preparation.fiscalHeader['businessName'], 'Café Original');
      expect(preparation.fiscalHeader['ruc'], 'A0011234567890');
      expect(preparation.fiscalHeader['fiscalAuthorizationNumber'],
          'AUT-DGI-2026-0001');
      expect(preparation.invoice.number, '001-001-01-00000010');
      expect(preparation.invoice, isNotNull);

      // The rendered paper shows the ORIGINAL header; the live (renamed)
      // values are asserted ABSENT — if this can pass by reading live
      // config, the unit has failed.
      final document = ReceiptDocument.fromInvoice(
        preparation.invoice,
        items: preparation.items,
        payments: preparation.payments,
        taxRegime: TaxRegime.regimenGeneral,
        isReprint: true,
        reprintAt: DateTime(2026, 9, 25, 9, 30),
        businessName: preparation.fiscalHeader['businessName'],
        ruc: preparation.fiscalHeader['ruc'],
        address: preparation.fiscalHeader['address'],
        phone: preparation.fiscalHeader['phone'],
        fiscalAuthorizationNumber:
            preparation.fiscalHeader['fiscalAuthorizationNumber'],
      );
      final formatter = ReceiptLayoutFormatter.format80mm();
      final paper = formatter.formatReceiptDocumentText(document);

      expect(paper, contains('Café Original'));
      expect(paper, contains('A0011234567890'));
      expect(paper, isNot(contains('Café Renombrado S.A.')));
      expect(paper, isNot(contains('B999888777000')));
      // The regime is AS ISSUED: GENERAL on the paper even though the live
      // config now says CUOTA_FIJA.
      expect(paper, contains('REGIMEN: GENERAL'));
      expect(paper, isNot(contains('REGIMEN: CUOTA FIJA')));
      expect(paper, contains('*** REIMPRESIÓN ***'));
      expect(paper, contains('Reimpresión:'));
      expect(paper, contains('25/09/2026 09:30'));
    });

    test('a canceled invoice reprint keeps ANULADO and adds REIMPRESIÓN',
        () async {
      await database.cashierSessionDao.insertSession(
        CashierSessionEntity(
          id: 'shift-1',
          userId: 'cashier-1',
          terminalId: 'term-1',
          openedAt: 1700000000000,
          isClosed: false,
        ),
      );
      await database.invoiceDao.insertInvoice(
        invoice(
          isCanceled: true,
          fiscalHeaderSnapshot: jsonEncode(originalHeader),
        ),
      );
      await database.invoiceItemDao.insertItems([originItem()]);

      final preparation = await repository.prepareReprintInvoice(
        'inv-reprint-1',
        'VERIFICACION',
      );
      final document = ReceiptDocument.fromInvoice(
        preparation.invoice,
        items: preparation.items,
        payments: preparation.payments,
        taxRegime: TaxRegime.regimenGeneral,
        isReprint: true,
        reprintAt: DateTime(2026, 9, 25, 9, 30),
        businessName: preparation.fiscalHeader['businessName'],
      );
      final paper =
          ReceiptLayoutFormatter.format58mm().formatReceiptDocumentText(document);

      expect(paper, contains('*** DOCUMENTO ANULADO ***'));
      expect(paper, contains('*** REIMPRESIÓN ***'));
    });
  });

  test('JD-B-003: a snapshot without the tax regime is INCOMPLETE and denies',
      () async {
    await database.cashierSessionDao.insertSession(
      CashierSessionEntity(
        id: 'shift-1',
        userId: 'cashier-1',
        terminalId: 'term-1',
        openedAt: 1700000000000,
        isClosed: false,
      ),
    );
    final withoutRegime = Map<String, String>.from(originalHeader)
      ..remove('taxRegime');
    await database.invoiceDao.insertInvoice(
      invoice(fiscalHeaderSnapshot: jsonEncode(withoutRegime)),
    );
    await database.invoiceItemDao.insertItems([originItem()]);

    await expectLater(
      repository.prepareReprintInvoice('inv-reprint-1', 'VERIFICACION'),
      throwsA(
        isA<StateError>().having(
          (e) => e.message,
          'message',
          contains('corrupted or incomplete'),
        ),
      ),
    );
    verifyNever(auditRepository.log(any, metadata: anyNamed('metadata')));
  });

  test('R2-7: a non-string regime maps to the named denial, never a TypeError',
      () async {
    await database.cashierSessionDao.insertSession(
      CashierSessionEntity(
        id: 'shift-1',
        userId: 'cashier-1',
        terminalId: 'term-1',
        openedAt: 1700000000000,
        isClosed: false,
      ),
    );
    await database.invoiceDao.insertInvoice(
      invoice(
        fiscalHeaderSnapshot:
            jsonEncode({...originalHeader, 'taxRegime': 42}),
      ),
    );
    await database.invoiceItemDao.insertItems([originItem()]);

    await expectLater(
      repository.prepareReprintInvoice('inv-reprint-1', 'VERIFICACION'),
      throwsA(
        isA<StateError>().having(
          (e) => e.message,
          'message',
          contains('REPRINT_SNAPSHOT_UNAVAILABLE'),
        ),
      ),
    );
    verifyNever(auditRepository.log(any, metadata: anyNamed('metadata')));
  });

  group('fail-closed: pre-snapshot and corrupted rows deny reprint', () {
    test('null snapshot denies with REPRINT_SNAPSHOT_UNAVAILABLE, zero side effects',
        () async {
      await database.cashierSessionDao.insertSession(
        CashierSessionEntity(
          id: 'shift-1',
          userId: 'cashier-1',
          terminalId: 'term-1',
          openedAt: 1700000000000,
          isClosed: false,
        ),
      );
      await database.invoiceDao.insertInvoice(invoice(fiscalHeaderSnapshot: null));

      await expectLater(
        repository.prepareReprintInvoice('inv-reprint-1', 'VERIFICACION'),
        throwsA(
          isA<StateError>().having(
            (e) => e.message,
            'message',
            contains('REPRINT_SNAPSHOT_UNAVAILABLE'),
          ),
        ),
      );

      // The denial happens at acceptance: no audit entry is written.
      verifyNever(auditRepository.log(any, metadata: anyNamed('metadata')));
      // Print-only path: the numbering service is never touched (D-13).
      verifyNever(numberingService.getNextNumber());
      verifyNever(numberingService.incrementNumber());
      verifyNever(numberingService.isRangeExhausted());
    });

    test('a corrupted snapshot denies instead of fabricating a header',
        () async {
      await database.cashierSessionDao.insertSession(
        CashierSessionEntity(
          id: 'shift-1',
          userId: 'cashier-1',
          terminalId: 'term-1',
          openedAt: 1700000000000,
          isClosed: false,
        ),
      );
      await database.invoiceDao.insertInvoice(
        invoice(fiscalHeaderSnapshot: '{not-json'),
      );

      await expectLater(
        repository.prepareReprintInvoice('inv-reprint-1', 'VERIFICACION'),
        throwsA(
          isA<StateError>().having(
            (e) => e.message,
            'message',
            contains('corrupted'),
          ),
        ),
      );

      verifyNever(auditRepository.log(any, metadata: anyNamed('metadata')));
    });
  });

  group('audit + reason boundary', () {
    test('writes REPRINT_REQUESTED at acceptance with structured metadata',
        () async {
      await seedIssuedInvoice();

      await repository.prepareReprintInvoice(
        'inv-reprint-1',
        'PAPEL_ATASCADO',
        reasonDetail: 'Segunda impresión del turno',
      );

      final captured = verify(
        auditRepository.log(
          captureAny,
          metadata: captureAnyNamed('metadata'),
        ),
      );
      expect(captured.callCount, 1);
      expect(captured.captured[0] as String, 'REPRINT_REQUESTED');
      final metadata =
          jsonDecode(captured.captured[1] as String) as Map<String, dynamic>;
      expect(metadata['invoice_id'], 'inv-reprint-1');
      expect(metadata['number'], '001-001-01-00000010');
      expect(metadata['reason_code'], 'PAPEL_ATASCADO');
      expect(metadata['reason_detail'], 'Segunda impresión del turno');
      expect(metadata['reprint_at'], isNotEmpty);
    });

    test('blank reason throws before any read or audit', () async {
      await seedIssuedInvoice();

      await expectLater(
        repository.prepareReprintInvoice('inv-reprint-1', '   '),
        throwsArgumentError,
      );

      verifyNever(auditRepository.log(any, metadata: anyNamed('metadata')));
    });
  });
}
