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
import 'package:pos_app/data/daos/sales/invoice_dao.dart';
import 'package:pos_app/data/daos/sales/tax_config_dao.dart';
import 'package:pos_app/data/daos/kitchen/kitchen_order_dao.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/sales/tax_config_entity.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/config/tenant_config.dart';
import 'package:pos_app/domain/models/config/tenant_operation_mode.dart';
import 'package:pos_app/domain/models/kitchen/kitchen_order.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/services/config/tenant_config_service.dart';
import 'package:pos_app/domain/services/kitchen/kitchen_order_service.dart';

import 'sale_view_model_test.mocks.dart';

/// #67/T2a — the terminal must NEVER invent an exchange rate.
///
/// An absent, corrupt, non-positive or unreadable rate is a STATE (unknown),
/// not a number. The sale fails closed with a directive Spanish message that
/// names who can fix it (the FX fields are owner/manager-only since #66),
/// BEFORE any fiscal sequence number is consumed.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late MockSalesRepository mockSalesRepo;
  late MockInventoryRepository mockInventoryRepo;
  late MockAuthRepository mockAuthRepo;
  late MockAppDatabase mockDb;
  late ControllableLocalConfigDao configDao;
  late SaleViewModel viewModel;

  const cashier = User(
    id: 'user-fx-guard',
    name: 'Cajera FX',
    role: UserRole.cashier,
    isActive: true,
  );

  // The exact directive copy the operator must see (no UUID, no English,
  // no raw exception text).
  const commercialAbsentMessage =
      'No se puede vender: la tasa de cambio comercial no está configurada en este terminal. Pedile al dueño o a un encargado que la configure en Perfil del Negocio.';
  const commercialUnverifiableMessage =
      'No se puede vender: la tasa de cambio comercial no pudo verificarse en este terminal. Pedile al dueño o a un encargado que la revise en Perfil del Negocio.';
  const bcnAbsentMessage =
      'No se puede vender: la tasa oficial BCN no está configurada en este terminal. Pedile al dueño o a un encargado que la configure en Perfil del Negocio.';
  const bcnUnverifiableMessage =
      'No se puede vender: la tasa oficial BCN no pudo verificarse en este terminal. Pedile al dueño o a un encargado que la revise en Perfil del Negocio.';

  setUp(() {
    mockSalesRepo = MockSalesRepository();
    mockInventoryRepo = MockInventoryRepository();
    mockAuthRepo = MockAuthRepository();
    mockDb = MockAppDatabase();
    configDao = ControllableLocalConfigDao();

    configDao.saveConfig(
      LocalConfigEntity(key: 'tax_regime', value: 'CUOTA_FIJA'),
    );

    when(mockDb.localConfigDao).thenReturn(configDao);
    when(mockDb.cashierSessionDao).thenReturn(MockCashierSessionDao());
    when(mockDb.holdTicketDao).thenReturn(MockHoldTicketDao());
    when(mockDb.promotionDao).thenReturn(MockPromotionDao());
    when(mockDb.invoiceDao).thenReturn(MockInvoiceDao());
    when(mockDb.kitchenOrderDao).thenReturn(FakeKitchenOrderDaoForFxGuard());
    when(mockDb.taxConfigDao).thenReturn(FakeTaxConfigDaoForFxGuard());

    when(mockInventoryRepo.getActiveProducts()).thenAnswer((_) async => []);
    when(mockAuthRepo.getCurrentUser()).thenAnswer((_) async => cashier);
    final sessionDao = mockDb.cashierSessionDao as MockCashierSessionDao;
    when(sessionDao.getActiveSessionForUserAndTerminal(any, any))
        .thenAnswer((_) async => null);
    final holdDao = mockDb.holdTicketDao as MockHoldTicketDao;
    when(holdDao.getAllHoldTickets()).thenAnswer((_) async => []);
    final promoDao = mockDb.promotionDao as MockPromotionDao;
    when(promoDao.getActivePromotions()).thenAnswer((_) async => []);
    when(promoDao.getAllPromotions()).thenAnswer((_) async => []);

    viewModel = SaleViewModel(
      mockSalesRepo,
      mockInventoryRepo,
      mockAuthRepo,
      mockDb,
      null,
      true,
      FakeTenantConfigServiceForFxGuard(mockDb.localConfigDao),
      FakeKitchenOrderServiceForFxGuard(mockDb),
    );
  });

  void stubSaveSaleSuccess() {
    when(
      mockSalesRepo.saveSale(
        invoice: anyNamed('invoice'),
        items: anyNamed('items'),
        payments: anyNamed('payments'),
      ),
    ).thenAnswer((_) async {});
  }

  void verifySaleNeverReachedRepository() {
    // The block must happen BEFORE the repository (and therefore the DGI
    // numbering service behind it) is ever reached.
    verifyNever(
      mockSalesRepo.saveSale(
        invoice: anyNamed('invoice'),
        items: anyNamed('items'),
        payments: anyNamed('payments'),
      ),
    );
  }

  void expectDirectiveMessage(String message) {
    expect(message, isNot(contains('Error al procesar la venta')));
    expect(
      RegExp(
        r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',
      ).hasMatch(message),
      isFalse,
      reason: 'the operator-facing message must never carry a UUID',
    );
    expect(
      message,
      isNot(contains('Exception')),
      reason: 'the operator-facing message must never carry raw error text',
    );
  }

  group('sale blocked when a recorded rate is unreliable (#67/T2a)', () {
    test('absent commercial rate row blocks the sale and names the fix', () async {
      configDao.saveConfig(
        LocalConfigEntity(
          key: 'bcn_official_exchange_rate',
          value: '36.6241',
        ),
      );
      await viewModel.loadExchangeRates();

      await expectLater(
        viewModel.processSale([PaymentMethod.cash]),
        throwsA(isA<Exception>()),
      );

      expect(viewModel.errorMessage, commercialAbsentMessage);
      expectDirectiveMessage(viewModel.errorMessage!);
      verifySaleNeverReachedRepository();
    });

    test('corrupt commercial value blocks the sale', () async {
      configDao.saveConfig(
        LocalConfigEntity(key: 'commercial_exchange_rate', value: 'abc'),
      );
      configDao.saveConfig(
        LocalConfigEntity(
          key: 'bcn_official_exchange_rate',
          value: '36.6241',
        ),
      );
      await viewModel.loadExchangeRates();

      await expectLater(
        viewModel.processSale([PaymentMethod.cash]),
        throwsA(isA<Exception>()),
      );

      expect(viewModel.errorMessage, commercialUnverifiableMessage);
      expectDirectiveMessage(viewModel.errorMessage!);
      verifySaleNeverReachedRepository();
    });

    test('non-positive commercial value blocks the sale', () async {
      configDao.saveConfig(
        LocalConfigEntity(key: 'commercial_exchange_rate', value: '0'),
      );
      configDao.saveConfig(
        LocalConfigEntity(
          key: 'bcn_official_exchange_rate',
          value: '36.6241',
        ),
      );
      await viewModel.loadExchangeRates();

      await expectLater(
        viewModel.processSale([PaymentMethod.cash]),
        throwsA(isA<Exception>()),
      );

      expect(viewModel.errorMessage, commercialUnverifiableMessage);
      verifySaleNeverReachedRepository();
    });

    test('absent BCN rate row blocks the sale and names the fix', () async {
      configDao.saveConfig(
        LocalConfigEntity(key: 'commercial_exchange_rate', value: '36.50'),
      );
      await viewModel.loadExchangeRates();

      await expectLater(
        viewModel.processSale([PaymentMethod.cash]),
        throwsA(isA<Exception>()),
      );

      expect(viewModel.errorMessage, bcnAbsentMessage);
      expectDirectiveMessage(viewModel.errorMessage!);
      verifySaleNeverReachedRepository();
    });

    test('corrupt BCN value blocks the sale', () async {
      configDao.saveConfig(
        LocalConfigEntity(key: 'commercial_exchange_rate', value: '36.50'),
      );
      configDao.saveConfig(
        LocalConfigEntity(key: 'bcn_official_exchange_rate', value: 'abc'),
      );
      await viewModel.loadExchangeRates();

      await expectLater(
        viewModel.processSale([PaymentMethod.cash]),
        throwsA(isA<Exception>()),
      );

      expect(viewModel.errorMessage, bcnUnverifiableMessage);
      verifySaleNeverReachedRepository();
    });

    test('DAO read failure blocks the sale', () async {
      configDao.saveConfig(
        LocalConfigEntity(key: 'commercial_exchange_rate', value: '36.50'),
      );
      configDao.saveConfig(
        LocalConfigEntity(
          key: 'bcn_official_exchange_rate',
          value: '36.6241',
        ),
      );
      configDao.failingKeys.addAll({
        'commercial_exchange_rate',
        'bcn_official_exchange_rate',
      });
      await viewModel.loadExchangeRates();

      await expectLater(
        viewModel.processSale([PaymentMethod.cash]),
        throwsA(isA<Exception>()),
      );

      expect(viewModel.errorMessage, commercialUnverifiableMessage);
      verifySaleNeverReachedRepository();
    });

    test('both valid rates keep the sale flow unchanged', () async {
      configDao.saveConfig(
        LocalConfigEntity(key: 'commercial_exchange_rate', value: '36.50'),
      );
      configDao.saveConfig(
        LocalConfigEntity(
          key: 'bcn_official_exchange_rate',
          value: '36.6241',
        ),
      );
      await viewModel.loadExchangeRates();

      expect(viewModel.commercialRate, 36.50);
      expect(viewModel.bcnOfficialRate, 36.6241);

      stubSaveSaleSuccess();
      viewModel.addToCart(
        const Product(
          id: 'p-fx-ok',
          name: 'Café',
          uom: 'UND',
          stock: 10,
          averageCost: 20,
          sellPrice: 100.0,
        ),
      );

      await viewModel.processSale([PaymentMethod.cash]);

      verify(
        mockSalesRepo.saveSale(
          invoice: anyNamed('invoice'),
          items: anyNamed('items'),
          payments: anyNamed('payments'),
        ),
      ).called(1);
      expect(viewModel.errorMessage, isNull);
    });
  });

  group('unknown rate is a state, not a number (#67/T2a)', () {
    test('commercial label reports the not-configured state', () async {
      await viewModel.loadExchangeRates();

      expect(viewModel.activeCheckoutRateLabel, 'TC Comercial: no configurada');
      expect(viewModel.activeCheckoutRateLabel, isNot(contains('36.50')));
    });

    test('BCN label reports the not-configured state in BCN mode', () async {
      configDao.saveConfig(
        LocalConfigEntity(key: 'checkout_fx_mode', value: 'BCN_OFFICIAL'),
      );
      await viewModel.loadExchangeRates();

      expect(viewModel.activeCheckoutRateLabel, 'TC BCN: no configurada');
      expect(viewModel.activeCheckoutRateLabel, isNot(contains('36.6241')));
    });

    test(
      'currentFiscalCalculation degrades the preview without a fabricated USD figure',
      () async {
        viewModel.addToCart(
          const Product(
            id: 'p-fx-preview',
            name: 'Desayuno',
            uom: 'UND',
            stock: 10,
            averageCost: 40,
            sellPrice: 100.0,
          ),
        );

        final calc = viewModel.currentFiscalCalculation;

        // NIO figures stay real; the USD figure is NOT fabricated.
        expect(calc.total, greaterThan(0.0));
        expect(calc.total, calc.subtotal);
        expect(calc.commercialRate, 0.0);
        expect(calc.bcnOfficialRate, 0.0);
        expect(calc.totalUsd, 0.0);
      },
    );

    test(
      'preview with an unknown rate keeps exact NIO tax and only withholds USD (Régimen General)',
      () {
        viewModel.setCompanyTaxRegime(TaxRegime.regimenGeneral);
        viewModel.addToCart(
          const Product(
            id: 'p-fx-tax',
            name: 'Plato Fuerte',
            uom: 'UND',
            stock: 10,
            averageCost: 40,
            sellPrice: 100.0,
            taxRate: 0.15,
          ),
        );

        final calc = viewModel.currentFiscalCalculation;

        // The DGI tax base never uses a rate: NIO figures stay exact.
        expect(calc.subtotal, 100.0);
        expect(calc.totalTax, 15.0);
        expect(calc.total, 115.0);
        // Only the USD block is withheld — never fabricated.
        expect(calc.commercialRate, 0.0);
        expect(calc.bcnOfficialRate, 0.0);
        expect(calc.totalUsd, 0.0);
      },
    );

    test(
      'gateCheckoutOnFxRates surfaces the directive reason before the dialog opens',
      () async {
        await viewModel.loadExchangeRates();

        final reason = viewModel.gateCheckoutOnFxRates();

        expect(reason, commercialAbsentMessage);
        expect(viewModel.errorMessage, commercialAbsentMessage);
      },
    );

    test(
      'gateCheckoutOnFxRates returns null when both rates are reliable',
      () async {
        configDao.saveConfig(
          LocalConfigEntity(
            key: 'commercial_exchange_rate',
            value: '36.50',
          ),
        );
        configDao.saveConfig(
          LocalConfigEntity(
            key: 'bcn_official_exchange_rate',
            value: '36.6241',
          ),
        );
        await viewModel.loadExchangeRates();

        expect(viewModel.gateCheckoutOnFxRates(), isNull);
        expect(viewModel.errorMessage, isNull);
      },
    );
  });
}

class ControllableLocalConfigDao extends Mock implements LocalConfigDao {
  final Map<String, String> configs = {};
  final Set<String> failingKeys = {};

  @override
  Future<LocalConfigEntity?> getConfigByKey(String key) async {
    if (failingKeys.contains(key)) {
      throw StateError('simulated DAO read failure');
    }
    final value = configs[key];
    if (value == null) return null;
    return LocalConfigEntity(key: key, value: value);
  }

  @override
  Future<void> saveConfig(LocalConfigEntity config) async {
    configs[config.key] = config.value;
  }

  @override
  Future<void> deleteConfig(String key) async {
    configs.remove(key);
    failingKeys.remove(key);
  }
}

class FakeKitchenOrderDaoForFxGuard extends Mock implements KitchenOrderDao {}

class FakeTaxConfigDaoForFxGuard extends Mock implements TaxConfigDao {
  @override
  Future<List<TaxConfigEntity>> getAllTaxConfigs() async => [];
}

class FakeTenantConfigServiceForFxGuard extends TenantConfigService {
  FakeTenantConfigServiceForFxGuard(super.localConfigDao);

  @override
  Future<TenantConfig> getTenantConfig() async => const TenantConfig();

  @override
  Stream<TenantOperationMode> get onOperationModeChanged =>
      const Stream.empty();
}

class FakeKitchenOrderServiceForFxGuard extends KitchenOrderService {
  FakeKitchenOrderServiceForFxGuard(super.database);

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
