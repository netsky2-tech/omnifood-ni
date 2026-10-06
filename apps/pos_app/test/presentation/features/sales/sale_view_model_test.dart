import 'package:flutter_test/flutter_test.dart';
import 'dart:convert';
import 'package:mockito/mockito.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/domain/services/sales/table_order_service.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/daos/sales/cashier_session_dao.dart';
import 'package:pos_app/data/daos/sales/invoice_dao.dart';
import 'package:pos_app/data/daos/sales/invoice_item_dao.dart';
import 'package:pos_app/data/daos/sales/payment_dao.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import 'package:pos_app/data/models/sales/invoice_item_entity.dart';
import 'package:pos_app/domain/services/config/printer_config_service.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/domain/usecases/sales/void_decision.dart';
import 'package:pos_app/data/daos/sales/hold_ticket_dao.dart';
import 'package:pos_app/data/daos/sales/promotion_dao.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/cashier_session.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/models/config/tenant_config.dart';
import 'package:pos_app/domain/models/config/tenant_operation_mode.dart';
import 'package:pos_app/domain/models/kitchen/kitchen_order.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/daos/kitchen/kitchen_order_dao.dart';
import 'package:pos_app/data/daos/sales/tax_config_dao.dart';
import 'package:pos_app/data/models/sales/restaurant_area_entity.dart';
import 'package:pos_app/data/models/sales/restaurant_table_entity.dart';
import 'package:pos_app/data/models/sales/tax_config_entity.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/services/sales/invoice_fiscal_calculator.dart';
import 'package:pos_app/domain/services/sales/dgi_numbering_service.dart';
import 'package:pos_app/domain/services/sales/tip_engine.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/domain/services/config/tenant_config_service.dart';
import 'package:pos_app/domain/services/kitchen/kitchen_order_service.dart';
import 'sale_view_model_test.mocks.dart';
import 'package:mockito/annotations.dart';
import 'dart:async';
import 'package:pos_app/data/services/sync_service.dart';

class FakeSyncService extends Mock implements SyncService {
  final _controller = StreamController<InboundSyncResult>.broadcast();
  @override
  Stream<InboundSyncResult> get onInboundSync => _controller.stream;
  void emitSync(InboundSyncResult result) => _controller.add(result);
}

class FakeLocalConfigDao extends Mock implements LocalConfigDao {
  final Map<String, String> _configs = {};

  @override
  Future<String?> getConfigValue(String? key) async => _configs[key];

  @override
  Future<LocalConfigEntity?> getConfigByKey(String key) async {
    final val = _configs[key];
    if (val == null) return null;
    return LocalConfigEntity(key: key, value: val);
  }

  @override
  Future<void> saveConfig(LocalConfigEntity config) async {
    _configs[config.key] = config.value;
  }

  @override
  Future<void> deleteConfig(String key) async {
    _configs.remove(key);
  }
}

class FakeKitchenOrderDao extends Mock implements KitchenOrderDao {}

class FakeTaxConfigDao extends Mock implements TaxConfigDao {
  @override
  Future<List<TaxConfigEntity>> getAllTaxConfigs() async => [];
}

class FakeKitchenOrderService extends KitchenOrderService {
  FakeKitchenOrderService(super.database);

  @override
  Future<List<KitchenOrder>> sendDirectSaleToKitchen({
    required String invoiceId,
    required String invoiceNumber,
    required List<CartItem> items,
    String? buzzerNumber,
    String? customerName,
    String? waiterName,
    Map<String, String>? productCategories,
  }) async {
    return [];
  }
}

class FakeTenantConfigService extends TenantConfigService {
  FakeTenantConfigService(super.localConfigDao);

  @override
  Future<TenantConfig> getTenantConfig() async => const TenantConfig();

  @override
  Stream<TenantOperationMode> get onOperationModeChanged =>
      const Stream.empty();
}

@GenerateMocks([
  SalesRepository,
  InventoryRepository,
  AuthRepository,
  AppDatabase,
  CashierSessionDao,
  HoldTicketDao,
  PromotionDao,
  InvoiceDao,
  InvoiceItemDao,
  PaymentDao,
])
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late MockSalesRepository mockSalesRepo;
  late MockInventoryRepository mockInventoryRepo;
  late MockAuthRepository mockAuthRepo;
  late MockAppDatabase mockDb;
  late MockCashierSessionDao mockSessionDao;
  late MockHoldTicketDao mockHoldDao;
  late MockPromotionDao mockPromoDao;
  late MockInvoiceDao mockInvoiceDao;
  late FakeLocalConfigDao fakeLocalConfigDao;
  late FakeKitchenOrderService fakeKitchenOrderService;
  late FakeTenantConfigService fakeTenantConfigService;
  late SaleViewModel viewModel;

  setUp(() {
    mockSalesRepo = MockSalesRepository();
    mockInventoryRepo = MockInventoryRepository();
    mockAuthRepo = MockAuthRepository();
    mockDb = MockAppDatabase();
    mockSessionDao = MockCashierSessionDao();
    mockHoldDao = MockHoldTicketDao();
    mockPromoDao = MockPromotionDao();
    mockInvoiceDao = MockInvoiceDao();
    fakeLocalConfigDao = FakeLocalConfigDao();
    fakeLocalConfigDao.saveConfig(
      LocalConfigEntity(key: 'tax_regime', value: 'CUOTA_FIJA'),
    );

    when(mockDb.cashierSessionDao).thenReturn(mockSessionDao);
    when(mockDb.holdTicketDao).thenReturn(mockHoldDao);
    when(mockDb.promotionDao).thenReturn(mockPromoDao);
    when(mockDb.invoiceDao).thenReturn(mockInvoiceDao);
    when(mockDb.localConfigDao).thenReturn(fakeLocalConfigDao);
    when(mockDb.kitchenOrderDao).thenReturn(FakeKitchenOrderDao());
    when(mockDb.taxConfigDao).thenReturn(FakeTaxConfigDao());

    fakeKitchenOrderService = FakeKitchenOrderService(mockDb);
    fakeTenantConfigService = FakeTenantConfigService(mockDb.localConfigDao);
    when(mockAuthRepo.getCurrentUser()).thenAnswer((_) async => null);

    // Initial loads
    when(mockInventoryRepo.getActiveProducts()).thenAnswer((_) async => []);
    // Issue #552: the session lookup is now scoped to user+terminal, so the
    // default stub follows the scoped query the production code must call.
    when(mockSessionDao.getActiveSessionForUserAndTerminal(any, any))
        .thenAnswer((_) async => null);
    when(mockHoldDao.getAllHoldTickets()).thenAnswer((_) async => []);
    when(mockPromoDao.getActivePromotions()).thenAnswer((_) async => []);
    when(mockPromoDao.getAllPromotions()).thenAnswer((_) async => []);

    viewModel = SaleViewModel(
      mockSalesRepo,
      mockInventoryRepo,
      mockAuthRepo,
      mockDb,
      null,
      true,
      fakeTenantConfigService,
      fakeKitchenOrderService,
    );
  });

  test('processSale fails when there is no authenticated user', () async {
    await expectLater(
      viewModel.processSale([PaymentMethod.cash]),
      throwsA(isA<StateError>()),
    );

    expect(viewModel.errorMessage, 'Usuario no autenticado');
    verifyNever(
      mockSalesRepo.saveSale(
        invoice: anyNamed('invoice'),
        items: anyNamed('items'),
        payments: anyNamed('payments'),
      ),
    );
  });

  test('Initial state should be empty', () {
    expect(viewModel.cart, isEmpty);
    expect(viewModel.total, 0.0);
    expect(viewModel.activeSession, isNull);
  });

  test(
      'issue #552: checkActiveSession resolves only the CURRENT user and terminal session',
      () async {
    const userA = User(
      id: 'user-a',
      name: 'Cajero A',
      role: UserRole.cashier,
      isActive: true,
    );
    const userB = User(
      id: 'user-b',
      name: 'Cajero B',
      role: UserRole.cashier,
      isActive: true,
    );
    final sessionA = CashierSessionEntity(
      id: 'shift-a',
      userId: 'user-a',
      terminalId: 'TERM-01',
      openedAt: DateTime.parse('2026-02-01T08:00:00Z').millisecondsSinceEpoch,
      isClosed: false,
    );
    final sessionB = CashierSessionEntity(
      id: 'shift-b',
      userId: 'user-b',
      terminalId: 'TERM-01',
      openedAt: DateTime.parse('2026-02-01T08:05:00Z').millisecondsSinceEpoch,
      isClosed: false,
    );
    when(mockSessionDao.getActiveSessionForUserAndTerminal('user-a', 'TERM-01'))
        .thenAnswer((_) async => sessionA);
    when(mockSessionDao.getActiveSessionForUserAndTerminal('user-b', 'TERM-01'))
        .thenAnswer((_) async => sessionB);

    when(mockAuthRepo.getCurrentUser()).thenAnswer((_) async => userA);
    await viewModel.checkActiveSession();
    expect(viewModel.activeSession!.id, 'shift-a');

    // The same check under user B must resolve user B's session, not the
    // other concurrent register's shift.
    when(mockAuthRepo.getCurrentUser()).thenAnswer((_) async => userB);
    final viewModelB = SaleViewModel(
      mockSalesRepo,
      mockInventoryRepo,
      mockAuthRepo,
      mockDb,
      null,
      true,
      fakeTenantConfigService,
      fakeKitchenOrderService,
    );
    await viewModelB.checkActiveSession();
    expect(viewModelB.activeSession!.id, 'shift-b');
  });

  test('openSession persists CARTERA_MESERO model for cashier role', () async {
    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-1',
        name: 'Cashier',
        role: UserRole.cashier,
        isActive: true,
        tenantId: 'tenant-test',
      ),
    );
    when(mockSessionDao.insertSession(any)).thenAnswer((_) async {});

    await viewModel.openSession(
      200,
      tipoModelo: CashSessionModel.carteraMesero,
    );

    final captured =
        verify(mockSessionDao.insertSession(captureAny)).captured.single
            as CashierSessionEntity;
    expect(captured.tipoModelo, 'CARTERA_MESERO');
  });

  test('openSession persists the USD float alongside the NIO float (D-21)', () async {
    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-1',
        name: 'Cashier',
        role: UserRole.cashier,
        isActive: true,
      ),
    );
    when(mockSessionDao.insertSession(any)).thenAnswer((_) async {});

    await viewModel.openSession(1000, balanceUsd: 80);

    final captured =
        verify(mockSessionDao.insertSession(captureAny)).captured.single
            as CashierSessionEntity;
    expect(captured.openingBalanceUsd, 80.0);
    expect(captured.expectedUsd, 80.0);
    // NIO behavior must be untouched.
    expect(captured.openingBalanceNio, 1000.0);
    expect(captured.expectedNio, 1000.0);
    expect(captured.totalExpected, 1000.0);
  });

  test('openSession denies waiter role with generic message', () async {
    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-1',
        name: 'Waiter',
        role: UserRole.waiter,
        isActive: true,
      ),
    );

    await viewModel.openSession(
      200,
      tipoModelo: CashSessionModel.carteraMesero,
    );

    expect(viewModel.errorMessage, 'Acceso denegado.');
    verifyNever(mockSessionDao.insertSession(any));
  });

  test('finalizeSale in CARTERA_MESERO persists the cash/card split the Z figure aggregates', () async {
    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-1',
        name: 'Cashier',
        role: UserRole.cashier,
        isActive: true,
      ),
    );
    when(mockSessionDao.insertSession(any)).thenAnswer((_) async {});
    when(
      mockSalesRepo.saveSale(
        invoice: anyNamed('invoice'),
        items: anyNamed('items'),
        payments: anyNamed('payments'),
      ),
    ).thenAnswer((_) async {});

    await viewModel.openSession(
      100,
      tipoModelo: CashSessionModel.carteraMesero,
    );
    viewModel.addToCart(
      Product(
        id: 'p1',
        sku: 'SKU-1',
        name: 'Prod',
        uom: 'unit',
        sellPrice: 100,
        stock: 10,
        averageCost: 10,
      ),
    );

    final totalBeforeFinalize = viewModel.total;

    await viewModel.finalizeSale([PaymentMethod.cash, PaymentMethod.card]);

    // T7 (unified close): the in-memory sessionExpected counter was retired
    // with CloseBoxDialog. The Corte Z figure (effectiveExpectedNio/Usd) is
    // computed from the PERSISTED payment rows, so the surviving contract at
    // the VM level is that the split reaches the repository intact: net cash
    // = total/2, card = total/2.
    final captured = verify(
      mockSalesRepo.saveSale(
        invoice: anyNamed('invoice'),
        items: anyNamed('items'),
        payments: captureAnyNamed('payments'),
      ),
    ).captured.single as List<Payment>;
    expect(captured, hasLength(2));

    final cashPayment = captured.firstWhere((p) => p.method == PaymentMethod.cash);
    final cardPayment = captured.firstWhere((p) => p.method == PaymentMethod.card);
    expect(cashPayment.amountNio - cashPayment.changeGiven,
        closeTo(totalBeforeFinalize / 2, 0.0001));
    expect(cardPayment.amount, closeTo(totalBeforeFinalize / 2, 0.0001));
  });

  test(
    'finalizeSale in CAJA_CENTRAL persists the cash and card split the Z figure aggregates',
    () async {
      when(mockAuthRepo.getCurrentUser()).thenAnswer(
        (_) async => const User(
          id: 'u-1',
          name: 'Cashier',
          role: UserRole.cashier,
          isActive: true,
        ),
      );
      when(mockSessionDao.insertSession(any)).thenAnswer((_) async {});
      when(
        mockSalesRepo.saveSale(
          invoice: anyNamed('invoice'),
          items: anyNamed('items'),
          payments: anyNamed('payments'),
        ),
      ).thenAnswer((_) async {});

      await viewModel.openSession(
        100,
        tipoModelo: CashSessionModel.cajaCentral,
      );
      viewModel.addToCart(
        Product(
          id: 'p1',
          sku: 'SKU-1',
          name: 'Prod',
          uom: 'unit',
          sellPrice: 100,
          stock: 10,
          averageCost: 10,
        ),
      );

      await viewModel.finalizeSale([PaymentMethod.cash, PaymentMethod.card]);

      // T7 (unified close): per-method totals are now asserted on the
      // persisted payment rows — the input the Corte Z close re-queries via
      // getCashPaymentsForShift — instead of the retired in-memory counter.
      final captured = verify(
        mockSalesRepo.saveSale(
          invoice: anyNamed('invoice'),
          items: anyNamed('items'),
          payments: captureAnyNamed('payments'),
        ),
      ).captured.single as List<Payment>;
      expect(captured, hasLength(2));
      expect(
        captured.firstWhere((p) => p.method == PaymentMethod.cash).amount,
        greaterThan(0),
      );
      expect(
        captured.firstWhere((p) => p.method == PaymentMethod.card).amount,
        greaterThan(0),
      );
    },
  );

  test('processReturn denies cashier role with generic message and reports failure', () async {
    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-1',
        name: 'Cashier',
        role: UserRole.cashier,
        isActive: true,
        tenantId: 'tenant-test',
      ),
    );

    final registered =
        await viewModel.processReturn('INV-001', 'Error de cobro');

    expect(viewModel.errorMessage, 'Acceso denegado.');
    // H5: null = nothing was issued, so there is no credit-note id to print.
    expect(registered, isNull);
    verifyNever(mockSalesRepo.getInvoiceByNumber(any));
  });

  test(
    'processReturn passes selected partial lines, reason policy, and actor to repository',
    () async {
      when(mockAuthRepo.getCurrentUser()).thenAnswer(
        (_) async => const User(
          id: 'manager-1',
          name: 'Manager',
          role: UserRole.manager,
          isActive: true,
        ),
      );
      when(mockSalesRepo.getInvoiceByNumber('F001-000123')).thenAnswer(
        (_) async => Invoice(
          id: 'invoice-1',
          number: 'F001-000123',
          createdAt: DateTime(2026, 7, 13),
          userId: 'cashier-1',
          subtotal: 100,
          totalTax: 15,
          total: 115,
          paymentStatus: PaymentStatus.paid,
          syncStatus: SyncStatus.synced,
          type: InvoiceType.regular,
        ),
      );
      when(
        mockSalesRepo.createCreditNote(
          originalInvoiceId: anyNamed('originalInvoiceId'),
          reason: anyNamed('reason'),
          authorizedByUserId: anyNamed('authorizedByUserId'),
          authorizedByRole: anyNamed('authorizedByRole'),
          refundReasonPolicy: anyNamed('refundReasonPolicy'),
          lines: anyNamed('lines'),
          terminalId: anyNamed('terminalId'),
        ),
      ).thenAnswer((_) async => 'cn-returned-id');
      // No printable document for this test: the print path resolves
      // nothing and stays honestly false (asserted below).
      when(mockSalesRepo.getInvoiceById(any)).thenAnswer((_) async => null);

      const refundLines = [
        CreditNoteRefundLine(originInvoiceItemId: 'line-1', quantity: 0.5),
      ];

      final registered = await viewModel.processReturn(
        'F001-000123',
        'Damaged item',
        refundReasonPolicy: RefundReasonPolicy.wasteNoRestock,
        lines: refundLines,
      );

      verify(
        mockSalesRepo.createCreditNote(
          originalInvoiceId: 'invoice-1',
          reason: 'Damaged item',
          authorizedByUserId: 'manager-1',
          authorizedByRole: UserRole.manager,
          refundReasonPolicy: RefundReasonPolicy.wasteNoRestock,
          lines: refundLines,
          terminalId: 'TERM-01',
        ),
      ).called(1);
      expect(viewModel.errorMessage, isNull);
      // H5: the NEW credit-note id is returned so the UI can print from the
      // committed rows (H8); this test stubs no printable document, so the
      // print path resolves nothing and stays honestly false.
      expect(registered, 'cn-returned-id');
      expect(viewModel.lastCreditNotePrintSucceeded, isFalse);
    },
  );

  test('processReturn reports failure when the invoice is not found', () async {
    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'manager-1',
        name: 'Manager',
        role: UserRole.manager,
        isActive: true,
      ),
    );
    when(mockSalesRepo.getInvoiceByNumber('F001-000404')).thenAnswer(
      (_) async => null,
    );

    final registered = await viewModel.processReturn('F001-000404', 'Error');

    expect(registered, isNull);
    expect(viewModel.errorMessage, 'Factura no encontrada: F001-000404');
    verifyNever(
      mockSalesRepo.createCreditNote(
        originalInvoiceId: anyNamed('originalInvoiceId'),
        reason: anyNamed('reason'),
        authorizedByUserId: anyNamed('authorizedByUserId'),
        authorizedByRole: anyNamed('authorizedByRole'),
        refundReasonPolicy: anyNamed('refundReasonPolicy'),
        lines: anyNamed('lines'),
        terminalId: anyNamed('terminalId'),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // H8 (batch 8 slice 8a): the fiscal print path for committed credit notes.
  // Uses the production MockPrinterAdapter so the printed text is the REAL
  // formatter output; the note is printed from its OWN persisted snapshot.
  // ---------------------------------------------------------------------------
  group('H8: processReturn prints the committed credit note', () {
    const snapshotHeader = {
      'businessName': 'Café Original',
      'ruc': 'A0011234567890',
      'fiscalAuthorizationNumber': 'AUT-DGI-2026-0001',
      'taxRegime': 'REGIMEN_GENERAL',
    };
    const reason = 'Producto defectuoso';

    late MockPrinterAdapter printer;
    late MockInvoiceItemDao mockItemDao;
    late MockPaymentDao mockPaymentDao;

    InvoiceEntity creditNoteEntity() => InvoiceEntity(
          id: 'cn-new-1',
          number: '001-001-01-00000099',
          createdAt: DateTime(2026, 10, 1, 9, 30).millisecondsSinceEpoch,
          userId: 'cashier-1',
          subtotal: -100,
          totalTax: -15,
          total: -115,
          type: 'creditNote',
          relatedInvoiceId: 'invoice-1',
          originInvoiceId: 'invoice-1',
          refundReasonCode: reason,
          paymentStatus: 'paid',
          syncStatus: 'pending',
          fiscalHeaderSnapshot: jsonEncode(snapshotHeader),
        );

    void arrangeIssuableManager() {
      when(mockAuthRepo.getCurrentUser()).thenAnswer(
        (_) async => const User(
          id: 'manager-1',
          name: 'Manager',
          role: UserRole.manager,
          isActive: true,
        ),
      );
      when(mockSalesRepo.getInvoiceByNumber('F001-000123')).thenAnswer(
        (_) async => Invoice(
          id: 'invoice-1',
          number: 'F001-000123',
          createdAt: DateTime(2026, 7, 13),
          userId: 'cashier-1',
          subtotal: 100,
          totalTax: 15,
          total: 115,
          paymentStatus: PaymentStatus.paid,
          syncStatus: SyncStatus.synced,
          type: InvoiceType.regular,
        ),
      );
      when(
        mockSalesRepo.createCreditNote(
          originalInvoiceId: anyNamed('originalInvoiceId'),
          reason: anyNamed('reason'),
          authorizedByUserId: anyNamed('authorizedByUserId'),
          authorizedByRole: anyNamed('authorizedByRole'),
          refundReasonPolicy: anyNamed('refundReasonPolicy'),
          lines: anyNamed('lines'),
          terminalId: anyNamed('terminalId'),
        ),
      ).thenAnswer((_) async => 'cn-new-1');
      when(mockSalesRepo.getInvoiceById('cn-new-1')).thenAnswer(
        (_) async => Invoice(
          id: 'cn-new-1',
          number: '001-001-01-00000099',
          createdAt: DateTime(2026, 10, 1, 9, 30),
          userId: 'cashier-1',
          subtotal: -100,
          totalTax: -15,
          total: -115,
          paymentStatus: PaymentStatus.paid,
          syncStatus: SyncStatus.pending,
          type: InvoiceType.creditNote,
          relatedInvoiceId: 'invoice-1',
          originInvoiceId: 'invoice-1',
          refundReasonCode: reason,
        ),
      );
      when(mockInvoiceDao.getInvoiceById('cn-new-1'))
          .thenAnswer((_) async => creditNoteEntity());
      // REQ-8 (slice 8a): the origin invoice row carries the HUMAN fiscal
      // number the credit note must reference on paper.
      when(mockInvoiceDao.getInvoiceById('invoice-1')).thenAnswer(
        (_) async => InvoiceEntity(
          id: 'invoice-1',
          number: '001-001-01-00000042',
          createdAt: DateTime(2026, 7, 13).millisecondsSinceEpoch,
          userId: 'cashier-1',
          subtotal: 100,
          totalTax: 15,
          total: 115,
          type: 'regular',
          paymentStatus: 'paid',
          syncStatus: 'synced',
        ),
      );
      when(mockItemDao.getItemsByInvoiceId('cn-new-1')).thenAnswer(
        (_) async => [
          InvoiceItemEntity(
            id: 'cn-line-1',
            invoiceId: 'cn-new-1',
            productId: 'combo-1',
            productName: 'RETURN: Combo 1',
            quantity: -1,
            unitPrice: 50,
            originalTaxRate: 15,
            appliedTaxRate: 15,
            taxAmount: -7.5,
            total: -57.5,
            notes: reason,
          ),
        ],
      );
      when(mockPaymentDao.getPaymentsByInvoiceId('cn-new-1'))
          .thenAnswer((_) async => []);
    }

    SaleViewModel buildPrintViewModel() => SaleViewModel(
          mockSalesRepo,
          mockInventoryRepo,
          mockAuthRepo,
          mockDb,
          null,
          true,
          FakeTenantConfigService(fakeLocalConfigDao),
          FakeKitchenOrderService(mockDb),
          // Default PrinterConfigService backed by the fake DAO, plus the
          // production-adapter fake printer: the same shape the void tests use.
          null,
          printer,
        );

    setUp(() {
      printer = MockPrinterAdapter();
      mockItemDao = MockInvoiceItemDao();
      mockPaymentDao = MockPaymentDao();
      when(mockDb.invoiceItemDao).thenReturn(mockItemDao);
      when(mockDb.paymentDao).thenReturn(mockPaymentDao);
    });

    test(
      'prints the fiscal copy from the note OWN snapshot and returns the id',
      () async {
        arrangeIssuableManager();
        final vm = buildPrintViewModel();
        await vm.loadCompanyTaxRegime();

        final creditNoteId = await vm.processReturn('F001-000123', reason);

        expect(creditNoteId, 'cn-new-1');
        expect(vm.errorMessage, isNull);
        expect(vm.lastCreditNotePrintSucceeded, isTrue,
            reason: 'print failed: ${vm.lastPrintError}');
        expect(printer.printHistory, hasLength(1));
        final printed = printer.printHistory.single.printedText ?? '';
        // The paper is a credit note naming the affected origin document by
        // its HUMAN fiscal number and the persisted refund reason — never
        // live config, never the internal UUID (REQ-8, slice 8a).
        expect(printed, contains('NOTA DE CREDITO'));
        expect(printed, contains('Doc. Origen:'));
        expect(printed, contains('001-001-01-00000042'));
        expect(printed, isNot(contains('invoice-1')));
        expect(printed, contains('Motivo:'));
        expect(printed, contains(reason));
        expect(printed, contains('Café Original'));
        expect(printed, contains('AUT-DGI-2026-0001'));
      },
    );

    test(
      'a missing origin invoice prints WITHOUT the origin line and never the UUID',
      () async {
        arrangeIssuableManager();
        // REQ-8 (slice 8a) failure branch: the origin row cannot be loaded →
        // the line is omitted, the print must NOT fail, and no UUID and no
        // placeholder may be fabricated.
        when(mockInvoiceDao.getInvoiceById('invoice-1'))
            .thenAnswer((_) async => null);
        final vm = buildPrintViewModel();
        await vm.loadCompanyTaxRegime();

        final creditNoteId = await vm.processReturn('F001-000123', reason);

        expect(creditNoteId, 'cn-new-1');
        expect(vm.lastCreditNotePrintSucceeded, isTrue,
            reason: 'print failed: ${vm.lastPrintError}');
        expect(printer.printHistory, hasLength(1));
        final printed = printer.printHistory.single.printedText ?? '';
        expect(printed, contains('NOTA DE CREDITO'));
        expect(printed, isNot(contains('Doc. Origen:')));
        expect(printed, isNot(contains('invoice-1')));
        expect(printed, contains('Motivo:'));
      },
    );

    test(
      'a print failure does NOT fail the committed credit note (offline-first)',
      () async {
        arrangeIssuableManager();
        printer.shouldFail = true;
        final vm = buildPrintViewModel();
        await vm.loadCompanyTaxRegime();

        final creditNoteId = await vm.processReturn('F001-000123', reason);

        // The note was committed and its id is returned: issuance stands.
        expect(creditNoteId, 'cn-new-1');
        expect(vm.errorMessage, isNull);
        expect(vm.lastCreditNotePrintSucceeded, isFalse);
        expect(printer.printHistory, hasLength(1));
        expect(printer.printHistory.single.isSuccess, isFalse);
      },
    );

    test(
      'autoPrintInvoice=false skips the automatic copy; the id is still returned',
      () async {
        arrangeIssuableManager();
        fakeLocalConfigDao.saveConfig(
          LocalConfigEntity(key: 'printer_auto_invoice', value: 'false'),
        );
        final vm = buildPrintViewModel();
        await vm.loadCompanyTaxRegime();

        final creditNoteId = await vm.processReturn('F001-000123', reason);

        expect(creditNoteId, 'cn-new-1');
        expect(vm.lastCreditNotePrintSucceeded, isFalse);
        expect(printer.printHistory, isEmpty,
            reason: 'the operator hardware profile gates the automatic copy; '
                'the manual REIMPRIMIR path still covers credit notes');
      },
    );

    test('canIssueCreditNote gates the affordance to owner/manager', () async {
      when(mockAuthRepo.getCurrentUser()).thenAnswer(
        (_) async => const User(
          id: 'u-1',
          name: 'Cashier',
          role: UserRole.cashier,
          isActive: true,
        ),
      );
      final vm = buildPrintViewModel();
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(vm.canIssueCreditNote, isFalse);

      when(mockAuthRepo.getCurrentUser()).thenAnswer(
        (_) async => const User(
          id: 'u-2',
          name: 'Owner',
          role: UserRole.owner,
          isActive: true,
        ),
      );
      final ownerVm = buildPrintViewModel();
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(ownerVm.canIssueCreditNote, isTrue);
    });
  });

  test('voidInvoice denies a cashier an invoice he did not issue '
      '(D-15 own-invoice predicate)', () async {
    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-1',
        name: 'Cashier',
        role: UserRole.cashier,
        isActive: true,
        tenantId: 'tenant-test',
      ),
    );
    when(
      mockSessionDao.getActiveSessionForUserAndTerminal('u-1', 'pos-u-1'),
    ).thenAnswer((_) async => null);
    when(mockInvoiceDao.getInvoiceById('invoice-1')).thenAnswer(
      (_) async => _voidGuardEntity(userId: 'u-2'),
    );

    final ok = await viewModel.voidInvoice('invoice-1', 'OTRO');

    expect(ok, isFalse);
    expect(viewModel.errorMessage, VoidDecision.deniedOwnInvoice.uiMessage);
    verifyNever(mockSalesRepo.voidInvoice(any, any,
        reasonDetail: anyNamed('reasonDetail')));
  });

  test('voidInvoice denies a waiter with the permission message (D-10/D-15)',
      () async {
    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-2',
        name: 'Waiter',
        role: UserRole.waiter,
        isActive: true,
      ),
    );
    when(
      mockSessionDao.getActiveSessionForUserAndTerminal('u-2', 'pos-u-2'),
    ).thenAnswer((_) async => null);
    when(mockInvoiceDao.getInvoiceById('invoice-2')).thenAnswer(
      (_) async => _voidGuardEntity(userId: 'u-2'),
    );

    final ok = await viewModel.voidInvoice('invoice-2', 'OTRO');

    expect(ok, isFalse);
    expect(viewModel.errorMessage, VoidDecision.deniedNotPermitted.uiMessage);
    verifyNever(mockSalesRepo.voidInvoice(any, any,
        reasonDetail: anyNamed('reasonDetail')));
  });

  test('voidInvoice allows a manager (void.any bypass) and calls the '
      'repository', () async {
    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-3',
        name: 'Manager',
        role: UserRole.manager,
        isActive: true,
      ),
    );
    when(mockInvoiceDao.getInvoiceById('invoice-3')).thenAnswer(
      (_) async => _voidGuardEntity(userId: 'u-9'),
    );
    when(
      mockSessionDao.getActiveSessionForUserAndTerminal('u-3', 'pos-u-3'),
    ).thenAnswer((_) async => null);
    when(
      mockSalesRepo.voidInvoice('invoice-3', 'anulacion manager',
          reasonDetail: anyNamed('reasonDetail')),
    ).thenAnswer((_) async {});

    // No committed invoice to print: the copy step is skipped cleanly.
    when(mockSalesRepo.getInvoiceById('invoice-3'))
        .thenAnswer((_) async => null);

    final ok = await viewModel.voidInvoice('invoice-3', 'anulacion manager');

    expect(ok, isTrue);
    verify(
      mockSalesRepo.voidInvoice('invoice-3', 'anulacion manager',
          reasonDetail: null),
    ).called(1);
    expect(viewModel.errorMessage, isNull);
  });

  test('canManageCashDrawer is false for waiter role', () async {
    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-2',
        name: 'Waiter',
        role: UserRole.waiter,
        isActive: true,
      ),
    );

    final waiterViewModel = SaleViewModel(
      mockSalesRepo,
      mockInventoryRepo,
      mockAuthRepo,
      mockDb,
    );
    await Future<void>.delayed(Duration.zero);

    expect(waiterViewModel.canManageCashDrawer, isFalse);
  });

  group('Supervisor Override', () {
    test('isSupervisorOverrideActive is initially false', () {
      expect(viewModel.isSupervisorOverrideActive, isFalse);
    });

    test('grantSupervisorOverride sets state to true', () {
      viewModel.grantSupervisorOverride();
      expect(viewModel.isSupervisorOverrideActive, isTrue);
    });

    test('applyManualDiscount denies cashier without override', () async {
      when(mockAuthRepo.getCurrentUser()).thenAnswer(
        (_) async => const User(
          id: 'u-1',
          name: 'Cashier',
          role: UserRole.cashier,
          isActive: true,
          tenantId: 'tenant-test',
        ),
      );

      final cashierViewModel = SaleViewModel(
        mockSalesRepo,
        mockInventoryRepo,
        mockAuthRepo,
        mockDb,
      );
      await Future<void>.delayed(Duration.zero);

      cashierViewModel.applyManualDiscount(10.0);

      expect(cashierViewModel.errorMessage, 'Acceso denegado.');
      expect(cashierViewModel.totalDiscounts, 0.0);
    });

    test('applyManualDiscount allows cashier with override', () async {
      when(mockAuthRepo.getCurrentUser()).thenAnswer(
        (_) async => const User(
          id: 'u-1',
          name: 'Cashier',
          role: UserRole.cashier,
          isActive: true,
          tenantId: 'tenant-test',
        ),
      );

      final cashierViewModel = SaleViewModel(
        mockSalesRepo,
        mockInventoryRepo,
        mockAuthRepo,
        mockDb,
      );
      await Future<void>.delayed(Duration.zero);

      cashierViewModel.grantSupervisorOverride();
      cashierViewModel.applyManualDiscount(10.0);

      expect(cashierViewModel.errorMessage, isNull);
      expect(cashierViewModel.totalDiscounts, 10.0);
    });

    test(
      'override is consumed after finalizeSale and requires re-authorization for next restricted action',
      () async {
        when(mockAuthRepo.getCurrentUser()).thenAnswer(
          (_) async => const User(
            id: 'u-1',
            name: 'Cashier',
            role: UserRole.cashier,
            isActive: true,
          ),
        );
        when(mockSessionDao.insertSession(any)).thenAnswer((_) async {});
        when(
          mockSalesRepo.saveSale(
            invoice: anyNamed('invoice'),
            items: anyNamed('items'),
            payments: anyNamed('payments'),
          ),
        ).thenAnswer((_) async {});

        final cashierViewModel = SaleViewModel(
          mockSalesRepo,
          mockInventoryRepo,
          mockAuthRepo,
          mockDb,
        );
        await Future<void>.delayed(Duration.zero);

        await cashierViewModel.openSession(
          100,
          tipoModelo: CashSessionModel.cajaCentral,
        );
        cashierViewModel.addToCart(
          Product(
            id: 'p1',
            sku: 'SKU-1',
            name: 'Prod',
            uom: 'unit',
            sellPrice: 100,
            stock: 10,
            averageCost: 10,
          ),
        );

        cashierViewModel.grantSupervisorOverride();
        cashierViewModel.applyManualDiscount(10.0);
        expect(cashierViewModel.totalDiscounts, 10.0);
        expect(cashierViewModel.isSupervisorOverrideActive, isTrue);

        await cashierViewModel.finalizeSale([PaymentMethod.cash]);
        expect(cashierViewModel.isSupervisorOverrideActive, isFalse);

        cashierViewModel.applyManualDiscount(5.0);
        expect(cashierViewModel.errorMessage, 'Acceso denegado.');
        expect(cashierViewModel.totalDiscounts, 0.0);
      },
    );

    test(
      'reloads products automatically when syncService emits onInboundSync with products',
      () async {
        final fakeSyncService = FakeSyncService();
        final productList = [
          Product(
            id: 'p-new',
            sku: 'SKU-NEW',
            name: 'New Product',
            uom: 'unit',
            sellPrice: 120,
            stock: 5,
            averageCost: 50,
          ),
        ];
        when(
          mockInventoryRepo.getActiveProducts(),
        ).thenAnswer((_) async => productList);

        final vm = SaleViewModel(
          mockSalesRepo,
          mockInventoryRepo,
          mockAuthRepo,
          mockDb,
          null,
          false, // autoLoad = false
          fakeTenantConfigService,
          fakeKitchenOrderService,
          null,
          null,
          fakeSyncService,
        );
        vm.setCompanyTaxRegime(TaxRegime.regimenGeneral);

        expect(vm.products, isEmpty);

        fakeSyncService.emitSync(
          const InboundSyncResult(
            productsCount: 1,
            catalogValuesCount: 0,
            timestamp: '2026-08-26T18:00:00Z',
          ),
        );

        await Future<void>.delayed(Duration.zero);

        expect(vm.products, hasLength(1));
        expect(vm.products.first.id, 'p-new');
        expect(vm.products.first.sellPrice, 120);

        vm.dispose();
      },
    );

    group('Fiscal Hardening & Dynamic Regime Lifecycle', () {
      test(
        'Unconfigured tax regime allows browsing and cart building, but blocks sale finalization',
        () async {
          viewModel.setCompanyTaxRegime(null);
          await fakeLocalConfigDao.deleteConfig('tax_regime');
          expect(viewModel.companyTaxRegime, isNull);

          const product = Product(
            id: 'p-1',
            name: 'Latte',
            uom: 'UND',
            stock: 10,
            averageCost: 20,
            sellPrice: 100.0,
            taxRate: 0.15,
          );

          viewModel.addToCart(product);
          expect(viewModel.cart, hasLength(1));
          // In unconfigured state, no IVA is applied silently
          expect(viewModel.subtotal, equals(100.00));
          expect(viewModel.totalTax, equals(0.00));
          expect(viewModel.total, equals(100.00));

          when(mockAuthRepo.getCurrentUser()).thenAnswer(
            (_) async => const User(
              id: 'u-1',
              name: 'Cashier',
              role: UserRole.cashier,
              isActive: true,
            ),
          );

          // Attempting to finalize or process sale must throw FiscalConfigurationException and block sale
          await expectLater(
            () => viewModel.finalizeSale([PaymentMethod.cash]),
            throwsA(isA<FiscalConfigurationException>()),
          );
          expect(
            viewModel.errorMessage?.toLowerCase(),
            contains('régimen fiscal'),
          );
          verifyNever(
            mockSalesRepo.saveSale(
              invoice: anyNamed('invoice'),
              items: anyNamed('items'),
              payments: anyNamed('payments'),
            ),
          );
        },
      );

      test(
        'Dynamic regime change with open cart recalculates immediately without hybrid state',
        () async {
          when(mockAuthRepo.getCurrentUser()).thenAnswer(
            (_) async => const User(
              id: 'u-1',
              name: 'Cashier',
              role: UserRole.cashier,
              isActive: true,
            ),
          );

          // 1. Initial regime: Régimen General
          viewModel.setCompanyTaxRegime(TaxRegime.regimenGeneral);
          const product = Product(
            id: 'p-dinner',
            name: 'Cena Completa',
            uom: 'UND',
            stock: 10,
            averageCost: 40,
            sellPrice: 100.0,
            taxRate: 0.15,
          );

          viewModel.addToCart(product);

          expect(viewModel.companyTaxRegime, equals(TaxRegime.regimenGeneral));
          expect(viewModel.subtotal, equals(100.00));
          expect(viewModel.totalTax, equals(15.00));
          expect(viewModel.total, equals(115.00));

          // 2. User changes company regime to Cuota Fija in business settings while cart is open
          viewModel.setCompanyTaxRegime(TaxRegime.cuotaFija);

          // Cart immediately recalculates via currentFiscalCalculation
          expect(viewModel.companyTaxRegime, equals(TaxRegime.cuotaFija));
          expect(viewModel.subtotal, equals(100.00));
          expect(viewModel.totalTax, equals(0.00));
          expect(viewModel.total, equals(100.00));

          Invoice? savedInvoice;
          List<InvoiceItem>? savedItems;
          when(
            mockSalesRepo.saveSale(
              invoice: anyNamed('invoice'),
              items: anyNamed('items'),
              payments: anyNamed('payments'),
            ),
          ).thenAnswer((inv) async {
            savedInvoice = inv.namedArguments[#invoice] as Invoice;
            savedItems = inv.namedArguments[#items] as List<InvoiceItem>;
          });

          await viewModel.finalizeSale([PaymentMethod.cash]);

          expect(savedInvoice, isNotNull);
          expect(savedInvoice!.subtotal, equals(100.00));
          expect(savedInvoice!.totalTax, equals(0.00));
          expect(savedInvoice!.total, equals(100.00));

          expect(savedItems, isNotNull);
          expect(savedItems!.first.appliedTaxRate, equals(0.00));
          expect(savedItems!.first.taxAmount, equals(0.00));
          expect(savedItems!.first.total, equals(100.00));
        },
      );

      test(
        'Persistence & restart lifecycle: loads saved regime correctly and blocks on corrupt value',
        () async {
          // Case A: Cuota Fija saved in database
          fakeLocalConfigDao = FakeLocalConfigDao();
          await fakeLocalConfigDao.saveConfig(
            LocalConfigEntity(key: 'tax_regime', value: 'CUOTA_FIJA'),
          );
          when(mockDb.localConfigDao).thenReturn(fakeLocalConfigDao);

          var vm = SaleViewModel(
            mockSalesRepo,
            mockInventoryRepo,
            mockAuthRepo,
            mockDb,
            null,
            true,
            fakeTenantConfigService,
            fakeKitchenOrderService,
          );
          await vm.loadCompanyTaxRegime();
          expect(vm.companyTaxRegime, equals(TaxRegime.cuotaFija));

          // Case B: Régimen General saved in database
          await fakeLocalConfigDao.saveConfig(
            LocalConfigEntity(key: 'tax_regime', value: 'REGIMEN_GENERAL'),
          );
          vm = SaleViewModel(
            mockSalesRepo,
            mockInventoryRepo,
            mockAuthRepo,
            mockDb,
            null,
            true,
            fakeTenantConfigService,
            fakeKitchenOrderService,
          );
          await vm.loadCompanyTaxRegime();
          expect(vm.companyTaxRegime, equals(TaxRegime.regimenGeneral));

          // Case C: Corrupt / unrecognized regime in database
          await fakeLocalConfigDao.saveConfig(
            LocalConfigEntity(key: 'tax_regime', value: 'VALOR_CORRUPTO_999'),
          );
          vm = SaleViewModel(
            mockSalesRepo,
            mockInventoryRepo,
            mockAuthRepo,
            mockDb,
            null,
            true,
            fakeTenantConfigService,
            fakeKitchenOrderService,
          );
          await vm.loadCompanyTaxRegime();
          expect(vm.companyTaxRegime, isNull);
        },
      );
    });

    group('Checkout tip snapshot persistence (PRD §21 / §33.4 / AD-10)', () {
      Invoice Function() captureSavedInvoice() {
        Invoice? savedInvoice;
        when(
          mockSalesRepo.saveSale(
            invoice: anyNamed('invoice'),
            items: anyNamed('items'),
            payments: anyNamed('payments'),
          ),
        ).thenAnswer((inv) async {
          savedInvoice = inv.namedArguments[#invoice] as Invoice;
        });
        return () {
          final captured = savedInvoice;
          if (captured == null) {
            fail('saveSale was never called — checkout did not persist');
          }
          return captured;
        };
      }

      test(
        'finalizeSale snapshots the voluntary tip onto the invoice when a tip is set',
        () async {
          const product = Product(
            id: 'p-tip',
            name: 'Cena Completa',
            uom: 'UND',
            stock: 10,
            averageCost: 40,
            sellPrice: 100.0,
            taxRate: 0.15,
          );
          viewModel.addToCart(product);
          viewModel.setTip(tipType: TipType.suggestedTenPercent);
          expect(viewModel.tipAmount, equals(10.0));

          when(mockAuthRepo.getCurrentUser()).thenAnswer(
            (_) async => const User(
              id: 'u-1',
              name: 'Cashier',
              role: UserRole.cashier,
              isActive: true,
            ),
          );

          final getSavedInvoice = captureSavedInvoice();
          await viewModel.finalizeSale([PaymentMethod.cash]);
          final savedInvoice = getSavedInvoice();

          // The tip snapshot must travel with the fiscal document as issued
          // (AD-10): NIO amount, USD conversion, effective percentage and
          // the eligible base — never recomputed after the fact.
          expect(savedInvoice.tipAmountNio, equals(10.0));
          expect(savedInvoice.tipAmountUsd, closeTo(10.0 / 36.50, 0.01));
          expect(savedInvoice.tipPercentage, equals(10.0));
          expect(savedInvoice.tipEligibleBaseNio, equals(100.0));
          // DGI invariant INV-16.1: the tip is NOT part of the taxable total.
          expect(savedInvoice.total, equals(100.0));
        },
      );

      test(
        'finalizeSale leaves the tip snapshot null when no tip is selected',
        () async {
          const product = Product(
            id: 'p-notip',
            name: 'Soda',
            uom: 'UND',
            stock: 10,
            averageCost: 20,
            sellPrice: 50.0,
            taxRate: 0.15,
          );
          viewModel.addToCart(product);
          viewModel.setTip(tipType: TipType.none);
          expect(viewModel.tipAmount, equals(0.0));

          when(mockAuthRepo.getCurrentUser()).thenAnswer(
            (_) async => const User(
              id: 'u-1',
              name: 'Cashier',
              role: UserRole.cashier,
              isActive: true,
            ),
          );

          final getSavedInvoice = captureSavedInvoice();
          await viewModel.finalizeSale([PaymentMethod.cash]);
          final savedInvoice = getSavedInvoice();

          expect(savedInvoice.tipAmountNio, isNull);
          expect(savedInvoice.tipAmountUsd, isNull);
          expect(savedInvoice.tipPercentage, isNull);
          expect(savedInvoice.tipEligibleBaseNio, isNull);
        },
      );
    });
  });

  group('processSale operator-facing failure mapping (go-live fixes)', () {
    const cashier = User(
      id: 'user-cashier-golive',
      name: 'Cajero GoLive',
      role: UserRole.cashier,
      isActive: true,
    );

    const Product noRecipeProduct = Product(
      id: '7b0d5f2e-1c3a-4d5e-9f80-a1b2c3d4e5f6',
      name: 'Nachos Supremos',
      uom: 'UNIT',
      stock: 10,
      averageCost: 40.0,
      sellPrice: 100.0,
      sku: 'NACH-01',
    );

    void stubSaveSaleToThrow(Object error) {
      when(
        mockSalesRepo.saveSale(
          invoice: anyNamed('invoice'),
          items: anyNamed('items'),
          payments: anyNamed('payments'),
        ),
      ).thenThrow(error);
    }

    setUp(() {
      when(mockAuthRepo.getCurrentUser()).thenAnswer((_) async => cashier);
    });

    test(
      'maps the missing-recipe StateError to a Spanish message naming the product without the UUID',
      () async {
        viewModel.addToCart(noRecipeProduct);
        const rawUuid = '7b0d5f2e-1c3a-4d5e-9f80-a1b2c3d4e5f6';
        stubSaveSaleToThrow(
          StateError(
            'Prepared product $rawUuid cannot be sold without a published active recipe version.',
          ),
        );

        await expectLater(
          viewModel.processSale([PaymentMethod.cash]),
          throwsA(isA<StateError>()),
        );

        final message = viewModel.errorMessage!;
        expect(message, contains('Nachos Supremos'));
        expect(message, isNot(contains(rawUuid)));
        // The raw English data-layer text and the old generic wrapper
        // must never reach the operator.
        expect(message, isNot(contains('cannot be sold')));
        expect(message, isNot(contains('Error al procesar la venta')));
        expect(message, contains('receta publicada'));
      },
    );

    test(
      'missing-recipe error whose product is not in the cart falls back to a generic Spanish message',
      () async {
        viewModel.addToCart(noRecipeProduct);
        stubSaveSaleToThrow(
          StateError(
            'Prepared product cart-unknown-id-9f80 cannot be sold without a published active recipe version.',
          ),
        );

        await expectLater(
          viewModel.processSale([PaymentMethod.cash]),
          throwsA(isA<StateError>()),
        );

        final message = viewModel.errorMessage!;
        expect(message, contains('receta publicada'));
        expect(message, isNot(contains('cart-unknown-id-9f80')));
        expect(message, isNot(contains('cannot be sold')));
      },
    );

    test(
      'unmapped errors get a generic Spanish message and never leak the raw error',
      () async {
        viewModel.addToCart(noRecipeProduct);
        stubSaveSaleToThrow(
          Exception('Internal BOM explosion for node 42: engine panic'),
        );

        await expectLater(
          viewModel.processSale([PaymentMethod.cash]),
          throwsA(isA<Exception>()),
        );

        final message = viewModel.errorMessage!;
        expect(message, isNot(contains('BOM explosion')));
        expect(message, isNot(contains('engine panic')));
        expect(message, isNot(contains('Error al procesar la venta')));
        expect(message.length, greaterThan(10));
      },
    );

    test(
      'FiscalSequenceUnconfiguredError keeps its own directive message',
      () async {
        viewModel.addToCart(noRecipeProduct);
        stubSaveSaleToThrow(
          const FiscalSequenceUnconfiguredError(
            'Configure el consecutivo inicial DGI antes de facturar.',
          ),
        );

        await expectLater(
          viewModel.processSale([PaymentMethod.cash]),
          throwsA(isA<FiscalSequenceUnconfiguredError>()),
        );

        expect(
          viewModel.errorMessage,
          'Configure el consecutivo inicial DGI antes de facturar.',
        );
      },
    );

    test(
      'a second processSale cannot start while a sale is in flight',
      () async {
        viewModel.addToCart(noRecipeProduct);
        final saveGate = Completer<void>();
        when(
          mockSalesRepo.saveSale(
            invoice: anyNamed('invoice'),
            items: anyNamed('items'),
            payments: anyNamed('payments'),
          ),
        ).thenAnswer((_) => saveGate.future);

        final first = viewModel.processSale([PaymentMethod.cash]);
        expect(viewModel.isProcessingSale, isTrue);

        // A second call while the first attempt is in flight is rejected.
        await expectLater(
          viewModel.processSale([PaymentMethod.cash]),
          throwsA(isA<StateError>()),
        );

        saveGate.completeError(
          StateError(
            'Prepared product 7b0d5f2e-1c3a-4d5e-9f80-a1b2c3d4e5f6 cannot be sold without a published active recipe version.',
          ),
        );
        await expectLater(first, throwsA(isA<StateError>()));

        // Exactly ONE sale attempt was launched in total: the rejected
        // second call never reached the repository.
        expect(viewModel.isProcessingSale, isFalse);
        verify(
          mockSalesRepo.saveSale(
            invoice: anyNamed('invoice'),
            items: anyNamed('items'),
            payments: anyNamed('payments'),
          ),
        ).called(1);
      },
    );
  });

  group('Open accounts (F1): re-parking a recalled account REPLACES, never accumulates', () {
    late AppDatabase realDb;
    late TableOrderService realTableOrderService;
    late SaleViewModel holdVm;

    setUpAll(() {
      sqfliteFfiInit();
      databaseFactory = databaseFactoryFfi;
    });

    setUp(() async {
      realDb = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
      realTableOrderService = TableOrderService(realDb);
      holdVm = SaleViewModel(
        mockSalesRepo,
        mockInventoryRepo,
        mockAuthRepo,
        realDb,
        realTableOrderService,
        false,
      );
    });

    tearDown(() async {
      holdVm.dispose();
      await realDb.close();
    });

    Product productAt(double price, String id, String name) => Product(
          id: id,
          sku: id,
          name: name,
          uom: 'UND',
          stock: 100,
          averageCost: price / 2,
          sellPrice: price,
          taxRate: 0.15,
        );

    test(
        'park -> recall -> re-park keeps the exact 3 lines / C\$440 instead of doubling (device bug A5)',
        () async {
      // Same shape the S23 rig reproduced: 3 lines / C\$440.00 pre-tax.
      holdVm.addToCart(productAt(180, 'p-plato', 'Plato Fuerte'));
      holdVm.addToCart(productAt(130, 'p-espresso', 'Espresso Doble'));
      holdVm.addToCart(productAt(130, 'p-latte', 'Latte'));
      expect(holdVm.cart, hasLength(3));
      expect(holdVm.subtotal, 440.0);

      // A1: park as "Cuenta 1" — cart clears, exactly one open account.
      await holdVm.holdCurrentTicket('Cuenta 1');
      expect(holdVm.cart, isEmpty);
      expect(holdVm.holdTickets, hasLength(1));

      // A2: recall loads the WHOLE ticket back into the cart.
      final cuenta1 = holdVm.holdTickets.single;
      await holdVm.recallTicket(cuenta1);
      expect(holdVm.cart, hasLength(3));
      expect(holdVm.subtotal, 440.0);

      // A4/A5: re-parking under a NEW name must rename the SAME account and
      // replace its contents with the cart — never accumulate on top of it.
      await holdVm.holdCurrentTicket('Cuenta 2');

      expect(holdVm.holdTickets, hasLength(1),
          reason: 'a typed name renames the existing account; it never creates a second one');
      final reparked = holdVm.holdTickets.single;
      expect(reparked.id, cuenta1.id);
      expect(reparked.name, 'Cuenta 2',
          reason: 'the typed name was discarded by the old append branch (A4)');
      expect(reparked.version, 2);
      expect(reparked.items, hasLength(3),
          reason: 'A5 device bug: each recover+park cycle doubled 3 -> 6 lines');
      final gross = reparked.items.fold<double>(0, (sum, item) => sum + item.grossAmount);
      expect(gross, 440.0,
          reason: 'A5 device bug: each recover+park cycle doubled C\$440 -> C\$880');
    });
  });

  group('Open accounts (F4): abandoning a held account discards it and releases its table', () {
    late AppDatabase realDb;
    late TableOrderService realTableOrderService;
    late SaleViewModel holdVm;

    setUpAll(() {
      sqfliteFfiInit();
      databaseFactory = databaseFactoryFfi;
    });

    setUp(() async {
      realDb = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
      realTableOrderService = TableOrderService(realDb);
      holdVm = SaleViewModel(
        mockSalesRepo,
        mockInventoryRepo,
        mockAuthRepo,
        realDb,
        realTableOrderService,
        false,
      );
      await realDb.restaurantAreaDao.insertArea(
        RestaurantAreaEntity(id: 'area-1', name: 'Salón Principal', displayOrder: 1),
      );
      await realDb.restaurantTableDao.insertTables([
        RestaurantTableEntity(
            id: 'tbl-9', areaId: 'area-1', tableNumber: 'Mesa 9', capacity: 4),
      ]);
    });

    tearDown(() async {
      holdVm.dispose();
      await realDb.close();
    });

    Product productAt(double price, String id, String name) => Product(
          id: id,
          sku: id,
          name: name,
          uom: 'UND',
          stock: 100,
          averageCost: price / 2,
          sellPrice: price,
          taxRate: 0.15,
        );

    test(
        'abandonHoldTicket removes the account from the open orders and releases its occupied table',
        () async {
      holdVm.addToCart(productAt(180, 'p-plato', 'Plato Fuerte'));
      await holdVm.holdCurrentTicket('Mesa 9', tableId: 'tbl-9');
      expect(holdVm.holdTickets, hasLength(1));

      // Parking occupied the table; the abandonment must hand it back.
      final occupied = await realDb.restaurantTableDao.getTableById('tbl-9');
      expect(occupied?.status, 'OCUPADA');
      expect(occupied?.currentTicketId, holdVm.holdTickets.single.id);

      await holdVm.abandonHoldTicket(holdVm.holdTickets.single);

      expect(holdVm.holdTickets, isEmpty,
          reason: 'the abandoned account must disappear from getAllOpenOrders()');
      final released = await realDb.restaurantTableDao.getTableById('tbl-9');
      expect(released?.status, 'DISPONIBLE',
          reason: 'liquidateOrder must release the occupied table');
      expect(released?.currentTicketId, isNull);
    });

    test('abandoning the currently loaded account clears the cart and the loaded ticket', () async {
      holdVm.addToCart(productAt(180, 'p-plato', 'Plato Fuerte'));
      holdVm.addToCart(productAt(130, 'p-espresso', 'Espresso Doble'));
      await holdVm.holdCurrentTicket('Cuenta 1');
      await holdVm.recallTicket(holdVm.holdTickets.single);
      expect(holdVm.cart, hasLength(2));
      expect(holdVm.activeLoadedHoldTicket, isNotNull);

      final loaded = holdVm.activeLoadedHoldTicket!;
      await holdVm.abandonHoldTicket(loaded);

      expect(holdVm.cart, isEmpty,
          reason: 'the cart was the abandoned account; it must not linger as a phantom sale');
      expect(holdVm.activeLoadedHoldTicket, isNull,
          reason: 're-parking after abandonment must create a NEW account, never resurrect it');
      expect(holdVm.holdTickets, isEmpty);
    });
  });
}

/// Minimal data-layer invoice for the D-15 guard inputs (the domain Invoice
/// deliberately does not carry shift membership or the local issue date).
InvoiceEntity _voidGuardEntity({required String userId}) => InvoiceEntity(
      id: 'guard-entity',
      number: '001-001-01-00000001',
      createdAt: DateTime.now().millisecondsSinceEpoch,
      userId: userId,
      subtotal: 100,
      totalTax: 15,
      total: 115,
      isCanceled: false,
      syncStatus: 'synced',
      paymentStatus: 'paid',
      type: 'regular',
      shiftId: 'shift-1',
      localIssueDate:
          '${DateTime.now().year.toString().padLeft(4, '0')}-'
          '${DateTime.now().month.toString().padLeft(2, '0')}-'
          '${DateTime.now().day.toString().padLeft(2, '0')}',
    );
