import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/daos/customer/customer_dao.dart';
import 'package:pos_app/data/daos/customer/customer_point_transaction_dao.dart';
import 'package:pos_app/data/daos/inventory/authority_projection_dao.dart';
import 'package:pos_app/data/daos/inventory/recipe_dao.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/daos/sales/invoice_item_dao.dart';
import 'package:pos_app/data/daos/sales/payment_dao.dart';
import 'package:pos_app/data/mappers/sales_mapper.dart';
import 'package:pos_app/data/models/customer/customer_entity.dart';
import 'package:pos_app/data/models/customer/customer_point_transaction_entity.dart';
import 'package:pos_app/data/models/inventory/authority_projection_entities.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/inventory/product_entity.dart';
import 'package:pos_app/data/models/sales/invoice_item_entity.dart';
import 'package:pos_app/data/models/sales/payment_entity.dart';
import 'package:pos_app/data/repositories/sales/sales_repository_impl.dart';
import 'package:pos_app/domain/models/config/printer_config.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/customer/customer.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/models/printer/receipt_document.dart';
import 'package:pos_app/domain/services/config/printer_config_service.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';

import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import '../../../data/repositories/sales/sales_repository_impl_test.mocks.dart' as repo_mocks;
import 'named_invoice_integration_test.mocks.dart';

class _StubLocalConfigDao extends Mock implements LocalConfigDao {
  final Map<String, String> _configs = {
    'commercial_exchange_rate': '36.50',
    'bcn_official_exchange_rate': '36.6241',
  };

  @override
  Future<LocalConfigEntity?> getConfigByKey(String key) async {
    final value = _configs[key];
    if (value == null) return null;
    return LocalConfigEntity(key: key, value: value);
  }
}

class _StubProductDao extends Mock implements ProductDao {
  @override
  Future<ProductEntity?> findProductById(String id) async => null;
}

class _StubAuthorityProjectionDao extends Mock implements AuthorityProjectionDao {
  @override
  Future<List<AuthorityRecipeVersionEntity>> findActivePublishedVersions(
    String tenantId,
    String productId,
    String saleTime,
  ) async => [];
}

class _StubCustomerPointTransactionDao extends Mock implements CustomerPointTransactionDao {
  @override
  Future<void> recordPointTransactionAndUpdateBalance(
    CustomerPointTransactionEntity entity,
    String customerId,
    double newBalance,
    int updatedAt,
  ) async {}
}

class _StubInvoiceItemDao extends Mock implements InvoiceItemDao {
  @override
  Future<List<InvoiceItemEntity>> getItemsByInvoiceId(String invoiceId) async => [
    InvoiceItemEntity(
      id: 'item-reprint-1',
      invoiceId: invoiceId,
      productId: 'prod-cafe',
      productName: 'Café Latte',
      quantity: 1.0,
      unitPrice: 100.0,
      originalTaxRate: 0.15,
      appliedTaxRate: 0.15,
      taxAmount: 15.0,
      total: 115.0,
      discount: 0.0,
    ),
  ];
}

/// Post-review ITEM 4: records every catalog write so the
/// "ad-hoc named sale must not pollute the customer catalog" claim is
/// FALSIFIABLE — a regression that saves an ad-hoc customer would call
/// [saveCustomerCalls] and fail the assertion.
class _RecordingCustomerDao extends Fake implements CustomerDao {
  int saveCustomerCalls = 0;
  final List<CustomerEntity> saved = [];

  @override
  Future<void> saveCustomer(CustomerEntity customer) async {
    saveCustomerCalls++;
    saved.add(customer);
  }
}

class _StubPaymentDao extends Mock implements PaymentDao {
  @override
  Future<List<PaymentEntity>> getPaymentsByInvoiceId(String invoiceId) async => [
    PaymentEntity(
      id: 'pay-reprint-1',
      invoiceId: invoiceId,
      method: 'cash',
      amount: 115.0,
      currency: 'NIO',
      exchangeRate: 36.50,
      amountNio: 115.0,
      createdAt: DateTime.now().millisecondsSinceEpoch,
    ),
  ];
}

@GenerateNiceMocks([
  MockSpec<SalesRepository>(),
  MockSpec<InventoryRepository>(),
  MockSpec<AuthRepository>(),
  MockSpec<AppDatabase>(),
  MockSpec<PrinterConfigService>(),
])
void main() {
  late MockSalesRepository mockSalesRepo;
  late MockInventoryRepository mockInventoryRepo;
  late MockAuthRepository mockAuthRepo;
  late MockAppDatabase mockDb;
  late MockPrinterConfigService mockConfigService;
  late MockPrinterAdapter mockPrinter;
  late SaleViewModel viewModel;
  late _RecordingCustomerDao recordingCustomerDao;

  final currentUser = const User(
    id: 'user-manager-1',
    name: 'Gerente Principal',
    email: 'gerente@soho.com',
    role: UserRole.manager,
    tenantId: 'tenant-soho-1',
    isActive: true,
  );

  final sampleProduct = const Product(
    id: 'prod-cafe',
    name: 'Café Latte',
    sellPrice: 115.0,
    averageCost: 40.0,
    uom: 'Unidad',
    stock: 50.0,
    sku: 'LAT-01',
    category: 'Bebidas',
    taxRate: 0.15,
  );

  setUp(() async {
    mockSalesRepo = MockSalesRepository();
    mockInventoryRepo = MockInventoryRepository();
    mockAuthRepo = MockAuthRepository();
    mockDb = MockAppDatabase();
    mockConfigService = MockPrinterConfigService();
    mockPrinter = MockPrinterAdapter();

    when(mockDb.localConfigDao).thenReturn(_StubLocalConfigDao());
    when(mockDb.productDao).thenReturn(_StubProductDao());
    when(mockDb.authorityProjectionDao).thenReturn(_StubAuthorityProjectionDao());
    when(mockDb.customerPointTransactionDao).thenReturn(_StubCustomerPointTransactionDao());
    when(mockDb.invoiceItemDao).thenReturn(_StubInvoiceItemDao());
    when(mockDb.paymentDao).thenReturn(_StubPaymentDao());
    recordingCustomerDao = _RecordingCustomerDao();
    when(mockDb.customerDao).thenReturn(recordingCustomerDao);

    when(mockAuthRepo.getCurrentUser()).thenAnswer((_) async => currentUser);
    when(mockConfigService.getPrinterConfig()).thenAnswer((_) async => const PrinterConfig(
      autoPrintInvoice: true,
      paperWidthMm: 58,
      headerBusinessName: 'SOHO COFFEE',
      headerLegalName: 'SOHO TRIBUTO AL CAFE S.A.',
      fiscalRuc: 'J0310000001234',
      headerAddress: 'Plaza Jean Paul Genie',
      headerPhone: '+505 2270-0000',
    ));

    viewModel = SaleViewModel(
      mockSalesRepo,
      mockInventoryRepo,
      mockAuthRepo,
      mockDb,
      null,
      false,
      null,
      null,
      mockConfigService,
      mockPrinter,
    );

    await viewModel.loadExchangeRates();
    viewModel.setCompanyTaxRegime(TaxRegime.regimenGeneral);
    viewModel.addToCart(sampleProduct);
  });

  tearDown(() {
    viewModel.dispose();
  });

  group('Named invoice fiscal snapshot & print fidelity (odd/factura-con-nombre)', () {
    test('1. Anonymous sale: persists null customer snapshot and prints "Cliente: Contado" (no UUID, no N/A)', () async {
      Invoice? capturedInvoice;
      when(mockSalesRepo.saveSale(
        invoice: anyNamed('invoice'),
        items: anyNamed('items'),
        payments: anyNamed('payments'),
      )).thenAnswer((invocation) async {
        capturedInvoice = invocation.namedArguments[const Symbol('invoice')] as Invoice;
      });

      await viewModel.processSale(
        [PaymentMethod.cash],
        customerName: null,
        customerTaxId: null,
      );

      expect(capturedInvoice, isNotNull);
      expect(capturedInvoice!.customerId, isNull);
      expect(capturedInvoice!.customerName, isNull);
      expect(capturedInvoice!.customerTaxId, isNull);

      final printed = mockPrinter.lastPrintedText!;
      final printedLines = printed.split('\n');

      // Pinned layout contract: the value is right-aligned by the shared
      // formatKeyValue idiom (house style used by Fecha:/Atendido por:), so
      // "Cliente:" and "Contado" sit on the SAME line separated by padding —
      // never left-adjacent, and exactly once.
      final clienteLines = printedLines
          .where((line) => line.trim().startsWith('Cliente:'))
          .toList();
      expect(clienteLines, hasLength(1));
      expect(
        RegExp(r'^Cliente:\s+Contado$').hasMatch(clienteLines.single.trim()),
        isTrue,
        reason: 'anonymous sale must print exactly one "Cliente:      Contado" line',
      );

      // No RUC line for an anonymous sale.
      expect(printedLines.any((line) => line.contains('RUC/Cedula:')), isFalse);

      // Width invariant: the ticket is 58mm — every printed line <= 32 cols.
      for (final line in printedLines) {
        expect(
          line.length,
          lessThanOrEqualTo(32),
          reason: 'Line exceeds 32 cols: "$line" (${line.length})',
        );
      }

      // No internal customer id may leak into the printed ticket.
      expect(printedLines.any((line) => line.contains('cust-uuid')), isFalse);

      expect(printed, isNot(contains('Cliente: N/A')));
      expect(printed, isNot(contains('user-manager-1')));
    });

    test('2. Ad-hoc named sale (name only): persists customerName, customerId is NULL, and prints name without RUC', () async {
      Invoice? capturedInvoice;
      when(mockSalesRepo.saveSale(
        invoice: anyNamed('invoice'),
        items: anyNamed('items'),
        payments: anyNamed('payments'),
      )).thenAnswer((invocation) async {
        capturedInvoice = invocation.namedArguments[const Symbol('invoice')] as Invoice;
      });

      await viewModel.processSale(
        [PaymentMethod.cash],
        customerName: 'María Eugenia Flores',
        customerTaxId: null,
      );

      expect(capturedInvoice, isNotNull);
      // Crucial architectural invariant: ad-hoc customer MUST NOT pollute catalog.
      // Post-review ITEM 4: the claim is now falsifiable — the (stubbed)
      // customer DAO records every save, so a regression that persists an
      // ad-hoc customer can no longer slip through an unstubbed nice-mock.
      expect(capturedInvoice!.customerId, isNull);
      expect(recordingCustomerDao.saveCustomerCalls, 0,
          reason: 'an ad-hoc named sale must NEVER write the customer catalog');
      expect(recordingCustomerDao.saved, isEmpty);
      expect(capturedInvoice!.customerName, 'María Eugenia Flores');
      expect(capturedInvoice!.customerTaxId, isNull);

      final printed = mockPrinter.lastPrintedText!;
      expect(printed, contains('Cliente:'));
      expect(printed, contains('María Eugenia Flores'));
      expect(printed, isNot(contains('Cliente: Contado')));
      expect(printed, isNot(contains('RUC/Cedula:')));
    });

    test('3. Ad-hoc named sale with RUC: persists both and prints both independently', () async {
      Invoice? capturedInvoice;
      when(mockSalesRepo.saveSale(
        invoice: anyNamed('invoice'),
        items: anyNamed('items'),
        payments: anyNamed('payments'),
      )).thenAnswer((invocation) async {
        capturedInvoice = invocation.namedArguments[const Symbol('invoice')] as Invoice;
      });

      await viewModel.processSale(
        [PaymentMethod.cash],
        customerName: 'Inversiones del Norte S.A.',
        customerTaxId: 'J0310000007777',
      );

      expect(capturedInvoice, isNotNull);
      expect(capturedInvoice!.customerId, isNull);
      expect(capturedInvoice!.customerName, 'Inversiones del Norte S.A.');
      expect(capturedInvoice!.customerTaxId, 'J0310000007777');

      final printed = mockPrinter.lastPrintedText!;
      expect(printed, contains('Cliente:'));
      expect(printed, contains('Inversiones del Norte S.A.'));
      expect(printed, contains('RUC/Cedula:'));
      expect(printed, contains('J0310000007777'));
    });

    test('4. Registered customer: preloads snapshot, sets customerId, and NEVER prints UUID', () async {
      const registeredCustomer = Customer(
        id: 'cust-uuid-4242-9999',
        name: 'Carlos Mendoza',
        taxId: '001-150885-0002Y',
        pointsBalance: 50.0,
      );

      await viewModel.selectCustomer(registeredCustomer);

      expect(viewModel.customerName, 'Carlos Mendoza');
      expect(viewModel.customerTaxId, '001-150885-0002Y');
      expect(viewModel.selectedCustomer?.id, 'cust-uuid-4242-9999');

      Invoice? capturedInvoice;
      when(mockSalesRepo.saveSale(
        invoice: anyNamed('invoice'),
        items: anyNamed('items'),
        payments: anyNamed('payments'),
      )).thenAnswer((invocation) async {
        capturedInvoice = invocation.namedArguments[const Symbol('invoice')] as Invoice;
      });

      await viewModel.processSale([PaymentMethod.cash]);

      expect(capturedInvoice, isNotNull);
      // Bound to registered customer for loyalty
      expect(capturedInvoice!.customerId, 'cust-uuid-4242-9999');
      // Fiscal snapshot captured
      expect(capturedInvoice!.customerName, 'Carlos Mendoza');
      expect(capturedInvoice!.customerTaxId, '001-150885-0002Y');

      final printed = mockPrinter.lastPrintedText!;
      expect(printed, contains('Cliente:'));
      expect(printed, contains('Carlos Mendoza'));
      expect(printed, contains('RUC/Cedula:'));
      expect(printed, contains('001-150885-0002Y'));
      // Absolute guarantee: the internal customerId UUID NEVER appears in the printed ticket (D-2 / #97)
      expect(printed, isNot(contains('cust-uuid-4242-9999')));
    });

    test('5. Reprint fidelity: reprinted ticket reproduces customerName and taxId from persisted invoice snapshot', () async {
      final persistedNamedInvoice = Invoice(
        id: 'inv-reprint-1',
        number: '001-001-01-00000042',
        createdAt: DateTime(2026, 10, 6, 14, 30),
        userId: 'user-manager-1',
        subtotal: 100.0,
        totalTax: 15.0,
        total: 115.0,
        customerName: 'Corporación Turística S.A.',
        customerTaxId: 'J0310000008888',
      );

      final items = [
        InvoiceItem(
          id: 'item-1',
          invoiceId: 'inv-reprint-1',
          productId: 'prod-cafe',
          productName: 'Café Latte',
          quantity: 1,
          unitPrice: 100.0,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 15.0,
          total: 115.0,
        ),
      ];

      final payments = [
        Payment(
          id: 'pay-1',
          invoiceId: 'inv-reprint-1',
          method: PaymentMethod.cash,
          amount: 115.0,
          currency: 'NIO',
          exchangeRate: 36.50,
        ),
      ];

      when(mockSalesRepo.prepareReprintInvoice('inv-reprint-1', any)).thenAnswer(
        (_) async => ReprintPreparation(
          invoice: persistedNamedInvoice,
          fiscalHeader: const {
            'businessName': 'SOHO COFFEE',
            'ruc': 'J0310000001234',
            'address': 'Plaza Jean Paul Genie',
            'phone': '+505 2270-0000',
            'fiscalAuthorizationNumber': 'AUTH-999',
          },
          taxRegime: TaxRegime.regimenGeneral,
          items: items,
          payments: payments,
        ),
      );

      final reprintOk = await viewModel.reprintInvoice('inv-reprint-1', 'CLIENT_REQUEST');

      expect(reprintOk, isTrue);
      final printed = mockPrinter.lastPrintedText!;
      expect(printed, contains('REIMPRESIÓN'));
      expect(printed, contains('Cliente:'));
      expect(printed, contains('Corporación Turística S.A.'));
      expect(printed, contains('RUC/Cedula:'));
      expect(printed, contains('J0310000008888'));
    });
  });

  /// Post-review ITEM 4: real repository-level persistence coverage. The
  /// widget scenarios above inspect in-memory objects handed to a mocked
  /// repository, so they cannot catch a Floor mapper/migration regression
  /// on the customer snapshot columns. These tests drive the REAL DAO path
  /// (in-memory Floor database via sqflite_common_ffi, same harness as
  /// sales_repository_reprint_test.dart / sales_repository_void_test.dart).
  group('Named invoice REAL persistence: Floor round trip, void preservation, reprint provenance', () {
    late AppDatabase database;
    late SalesRepositoryImpl repository;

    setUpAll(() {
      sqfliteFfiInit();
      databaseFactory = databaseFactoryFfi;
    });

    setUp(() async {
      database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();

      final numberingService = repo_mocks.MockDgiNumberingService();
      final auditRepository = repo_mocks.MockAuditRepository();
      final reverseInventoryUseCase = repo_mocks.MockReverseSaleInventoryUseCase();
      final processInventoryUseCase = repo_mocks.MockProcessSaleInventoryUseCase();
      when(processInventoryUseCase.execute(any))
          .thenAnswer((_) async => const <InventoryMovement>[]);
      final inventoryRepository = repo_mocks.MockInventoryRepository();
      when(inventoryRepository.getProductById(any)).thenAnswer((_) async => null);
      when(numberingService.getNextNumber())
          .thenAnswer((_) async => '001-001-01-00000042');
      when(numberingService.incrementNumber()).thenAnswer((_) async {});
      when(auditRepository.log(any, metadata: anyNamed('metadata')))
          .thenAnswer((_) async {});
      when(auditRepository.prepareLog(any, metadata: anyNamed('metadata')))
          .thenAnswer((_) async => null);
      when(reverseInventoryUseCase.execute(any, any))
          .thenAnswer((_) async => []);

      repository = SalesRepositoryImpl(
        database: database,
        invoiceDao: database.invoiceDao,
        itemDao: database.invoiceItemDao,
        paymentDao: database.paymentDao,
        transactionDao: database.salesTransactionDao,
        numberingService: numberingService,
        movementEngine: repo_mocks.MockMovementEngine(),
        auditRepository: auditRepository,
        processInventoryUseCase: processInventoryUseCase,
        reverseInventoryUseCase: reverseInventoryUseCase,
        inventoryRepository: inventoryRepository,
      );
    });

    tearDown(() async {
      await database.close();
    });

    Future<void> seedIssuanceConfig() async {
      // The real DGI transaction reads and advances the sequence itself
      // (fiscal authority lives in SQLite, not in the numbering service).
      await database.localConfigDao
          .saveConfig(LocalConfigEntity(key: 'dgi_current_number', value: '42'));
      await database.localConfigDao
          .saveConfig(LocalConfigEntity(key: 'dgi_prefix', value: '001-001-01-'));
      await database.localConfigDao.saveConfig(LocalConfigEntity(
        key: 'printer_header_business_name',
        value: 'SOHO COFFEE',
      ));
      await database.localConfigDao
          .saveConfig(LocalConfigEntity(key: 'ruc', value: 'J0310000001234'));
      await database.localConfigDao.saveConfig(LocalConfigEntity(
        key: 'printer_header_address',
        value: 'Plaza Jean Paul Genie',
      ));
      await database.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'printer_header_phone', value: '+505 2270-0000'));
      await database.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'dgi_authorization_code', value: 'AUTH-999'));
      await database.localConfigDao
          .saveConfig(LocalConfigEntity(key: 'tax_regime', value: 'REGIMEN_GENERAL'));
    }

    Invoice namedInvoice() => Invoice(
          id: 'inv-named-persist-1',
          number: 'PENDING',
          createdAt: DateTime(2026, 10, 6, 9, 30),
          userId: 'user-manager-1',
          subtotal: 100.0,
          totalTax: 15.0,
          total: 115.0,
          customerId: 'cust-named-1',
          customerName: 'Corporación Turística S.A.',
          customerTaxId: 'J0310000008888',
          commercialRate: 36.5,
          bcnOfficialRate: 36.6241,
          totalUsd: 3.14,
        );

    Future<void> saveNamedSale() async {
      await database.customerDao.saveCustomer(CustomerEntity(
        id: 'cust-named-1',
        name: 'Corporación Turística S.A.',
        taxId: 'J0310000008888',
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      ));
      await seedIssuanceConfig();
      await repository.saveSale(
        invoice: namedInvoice(),
        items: const [
          InvoiceItem(
            id: 'item-named-persist-1',
            invoiceId: 'inv-named-persist-1',
            productId: 'prod-cafe',
            productName: 'Café Latte',
            quantity: 1,
            unitPrice: 100.0,
            originalTaxRate: 0.15,
            appliedTaxRate: 0.15,
            taxAmount: 15.0,
            total: 115.0,
          ),
        ],
        payments: [
          Payment(
            id: 'pay-named-persist-1',
            invoiceId: 'inv-named-persist-1',
            method: PaymentMethod.cash,
            amount: 115.0,
            currency: 'NIO',
            exchangeRate: 36.5,
            createdAt: DateTime(2026, 10, 6, 9, 30),
          ),
        ],
      );
    }

    test('a named sale persists customerName/customerTaxId through the REAL DAO path and reads back unchanged', () async {
      await saveNamedSale();

      final persisted = await database.invoiceDao.getInvoiceById('inv-named-persist-1');
      expect(persisted, isNotNull, reason: 'the sale must exist in SQLite after saveSale');
      expect(persisted!.number, '001-001-01-00000042',
          reason: 'the DGI numbering path must have run (real DAO, not a mock)');
      expect(persisted.customerName, 'Corporación Turística S.A.',
          reason: 'the fiscal snapshot name must survive the DB round trip');
      expect(persisted.customerTaxId, 'J0310000008888',
          reason: 'the fiscal snapshot tax id must survive the DB round trip');

      final domain = SalesMapper.toInvoiceDomain(persisted);
      expect(domain.customerName, 'Corporación Turística S.A.');
      expect(domain.customerTaxId, 'J0310000008888');
    });

    test('a VOID of the named invoice preserves the fiscal snapshot unchanged (DGI: cancellation never rewrites the document)', () async {
      await saveNamedSale();

      await repository.voidInvoice('inv-named-persist-1', 'ERROR_DE_CAPTURA');

      final voided = await database.invoiceDao.getInvoiceById('inv-named-persist-1');
      expect(voided, isNotNull);
      expect(voided!.isCanceled, isTrue);
      expect(voided.voidReason, contains('ERROR_DE_CAPTURA'));
      expect(voided.customerName, 'Corporación Turística S.A.',
          reason: 'DGI DT 09-2007: cancellation must not rewrite the fiscal snapshot');
      expect(voided.customerTaxId, 'J0310000008888',
          reason: 'DGI DT 09-2007: cancellation must not rewrite the fiscal snapshot');
    });

    test('reprint takes the customer snapshot from the PERSISTED ROW, not the live catalog or live config', () async {
      await saveNamedSale();

      // Change BOTH provenance sources the reprint must NOT read: the
      // customer catalog entry and the live fiscal config.
      await database.customerDao.saveCustomer(CustomerEntity(
        id: 'cust-named-1',
        name: 'Cliente Renombrado S.A.',
        taxId: 'X9999999999999',
        createdAt: 1700000000000,
        updatedAt: 1800000000000,
      ));
      await database.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'printer_header_business_name', value: 'Café Renombrado S.A.'));
      await database.localConfigDao
          .saveConfig(LocalConfigEntity(key: 'ruc', value: 'B999888777000'));

      final preparation = await repository.prepareReprintInvoice(
        'inv-named-persist-1',
        'CLIENTE_PERDIO_TICKET',
      );

      expect(preparation.invoice.customerName, 'Corporación Turística S.A.',
          reason: 'the reprint invoice must carry the ISSUED snapshot, not the renamed catalog entry');
      expect(preparation.invoice.customerTaxId, 'J0310000008888');
      expect(preparation.fiscalHeader['businessName'], 'SOHO COFFEE',
          reason: 'the header comes from the issuance snapshot, never live config');

      final document = ReceiptDocument.fromInvoice(
        preparation.invoice,
        items: preparation.items,
        payments: preparation.payments,
        taxRegime: preparation.taxRegime,
        isReprint: true,
        reprintAt: DateTime(2026, 10, 7, 9, 0),
        businessName: preparation.fiscalHeader['businessName'],
        ruc: preparation.fiscalHeader['ruc'],
      );
      expect(document.customerName, 'Corporación Turística S.A.');
      expect(document.customerRuc, 'J0310000008888');
      // The live (renamed) values must be absent from the document.
      expect(document.customerName, isNot('Cliente Renombrado S.A.'));
      expect(document.customerRuc, isNot('X9999999999999'));
    });
  });
}
