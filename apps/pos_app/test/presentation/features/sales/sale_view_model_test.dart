import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/daos/sales/cashier_session_dao.dart';
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
import 'package:pos_app/data/models/sales/tax_config_entity.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/services/sales/invoice_fiscal_calculator.dart';
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
  Stream<TenantOperationMode> get onOperationModeChanged => const Stream.empty();
}

@GenerateMocks([
  SalesRepository,
  InventoryRepository,
  AuthRepository,
  AppDatabase,
  CashierSessionDao,
  HoldTicketDao,
  PromotionDao,
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
    fakeLocalConfigDao = FakeLocalConfigDao();
    fakeLocalConfigDao.saveConfig(LocalConfigEntity(key: 'tax_regime', value: 'CUOTA_FIJA'));

    when(mockDb.cashierSessionDao).thenReturn(mockSessionDao);
    when(mockDb.holdTicketDao).thenReturn(mockHoldDao);
    when(mockDb.promotionDao).thenReturn(mockPromoDao);
    when(mockDb.localConfigDao).thenReturn(fakeLocalConfigDao);
    when(mockDb.kitchenOrderDao).thenReturn(FakeKitchenOrderDao());
    when(mockDb.taxConfigDao).thenReturn(FakeTaxConfigDao());

    fakeKitchenOrderService = FakeKitchenOrderService(mockDb);
    fakeTenantConfigService = FakeTenantConfigService(mockDb.localConfigDao);
    when(mockAuthRepo.getCurrentUser()).thenAnswer((_) async => null);

    // Initial loads
    when(mockInventoryRepo.getActiveProducts()).thenAnswer((_) async => []);
    when(mockSessionDao.getActiveSession()).thenAnswer((_) async => null);
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

  test('Initial state should be empty', () {
    expect(viewModel.cart, isEmpty);
    expect(viewModel.total, 0.0);
    expect(viewModel.activeSession, isNull);
  });

  test('openSession persists CARTERA_MESERO model for cashier role', () async {
    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-1',
        name: 'Cashier',
        role: UserRole.cashier,
        isActive: true,
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

  test('finalizeSale in CARTERA_MESERO tracks only cash expected', () async {
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

    expect(
      viewModel.sessionExpected[PaymentMethod.cash],
      closeTo(100 + (totalBeforeFinalize / 2), 0.0001),
    );
    expect(viewModel.sessionExpected[PaymentMethod.card], 0.0);
  });

  test(
    'finalizeSale in CAJA_CENTRAL tracks cash and card expected totals',
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

      expect(viewModel.sessionExpected[PaymentMethod.cash], greaterThan(100));
      expect(viewModel.sessionExpected[PaymentMethod.card], greaterThan(0));
    },
  );

  test('processReturn denies cashier role with generic message', () async {
    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-1',
        name: 'Cashier',
        role: UserRole.cashier,
        isActive: true,
      ),
    );

    await viewModel.processReturn('INV-001', 'Error de cobro');

    expect(viewModel.errorMessage, 'Acceso denegado.');
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
        ),
      ).thenAnswer((_) async {});

      const refundLines = [
        CreditNoteRefundLine(originInvoiceItemId: 'line-1', quantity: 0.5),
      ];

      await viewModel.processReturn(
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
        ),
      ).called(1);
      expect(viewModel.errorMessage, isNull);
    },
  );

  test('voidInvoice denies cashier role with generic message', () async {
    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-1',
        name: 'Cashier',
        role: UserRole.cashier,
        isActive: true,
      ),
    );

    await viewModel.voidInvoice('invoice-1', 'anulacion');

    expect(viewModel.errorMessage, 'Acceso denegado.');
    verifyNever(mockSalesRepo.voidInvoice(any, any));
  });

  test('voidInvoice denies waiter role with generic message', () async {
    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-2',
        name: 'Waiter',
        role: UserRole.waiter,
        isActive: true,
      ),
    );

    await viewModel.voidInvoice('invoice-2', 'anulacion');

    expect(viewModel.errorMessage, 'Acceso denegado.');
    verifyNever(mockSalesRepo.voidInvoice(any, any));
  });

  test('voidInvoice allows manager role and calls repository', () async {
    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-3',
        name: 'Manager',
        role: UserRole.manager,
        isActive: true,
      ),
    );
    when(
      mockSalesRepo.voidInvoice('invoice-3', 'anulacion manager'),
    ).thenAnswer((_) async {});

    await viewModel.voidInvoice('invoice-3', 'anulacion manager');

    verify(
      mockSalesRepo.voidInvoice('invoice-3', 'anulacion manager'),
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
        when(mockInventoryRepo.getActiveProducts()).thenAnswer((_) async => productList);

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
      test('Unconfigured tax regime allows browsing and cart building, but blocks sale finalization', () async {
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
          (_) async => const User(id: 'u-1', name: 'Cashier', role: UserRole.cashier, isActive: true),
        );

        // Attempting to finalize or process sale must throw FiscalConfigurationException and block sale
        await expectLater(
          () => viewModel.finalizeSale([PaymentMethod.cash]),
          throwsA(isA<FiscalConfigurationException>()),
        );
        expect(viewModel.errorMessage?.toLowerCase(), contains('régimen fiscal'));
        verifyNever(mockSalesRepo.saveSale(
          invoice: anyNamed('invoice'),
          items: anyNamed('items'),
          payments: anyNamed('payments'),
        ));
      });

      test('Dynamic regime change with open cart recalculates immediately without hybrid state', () async {
        when(mockAuthRepo.getCurrentUser()).thenAnswer(
          (_) async => const User(id: 'u-1', name: 'Cashier', role: UserRole.cashier, isActive: true),
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
        when(mockSalesRepo.saveSale(
          invoice: anyNamed('invoice'),
          items: anyNamed('items'),
          payments: anyNamed('payments'),
        )).thenAnswer((inv) async {
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
      });

      test('Persistence & restart lifecycle: loads saved regime correctly and blocks on corrupt value', () async {
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
      });
    });
  });
}
