import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/daos/kitchen/kitchen_order_dao.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/daos/sales/cashier_session_dao.dart';
import 'package:pos_app/data/daos/sales/hold_ticket_dao.dart';
import 'package:pos_app/data/daos/sales/invoice_dao.dart';
import 'package:pos_app/data/daos/sales/promotion_dao.dart';
import 'package:pos_app/data/daos/sales/tax_config_dao.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/sales/tax_config_entity.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/kitchen/kitchen_order.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/config/tenant_config.dart';
import 'package:pos_app/domain/models/config/tenant_operation_mode.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/services/config/tenant_config_service.dart';
import 'package:pos_app/domain/services/kitchen/kitchen_order_service.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/features/sales/sale_view.dart';
import 'package:provider/provider.dart';

import '../../../presentation/features/sales/sale_view_model_test.mocks.dart';

/// #805 U4 — the FX checkout block reason must be a persistent, prominent,
/// actionable banner inside the cart panel, directly above the EN ESPERA /
/// COBRAR row, not a transient SnackBar that the cart overlays.
///
/// The view model is seeded exactly like
/// `sale_view_model_fx_guard_test.dart` (same ControllableLocalConfigDao
/// approach), so the directive Spanish copy asserted here is the real
/// directive copy produced by the FX guard, not a stubbed string.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late MockSalesRepository mockSalesRepo;
  late MockInventoryRepository mockInventoryRepo;
  late MockAuthRepository mockAuthRepo;
  late MockAppDatabase mockDb;
  late ControllableLocalConfigDaoForBanner configDao;
  late SaleViewModel viewModel;

  const bannerKey = Key('fx_rate_block_banner');

  const cashier = User(
    id: 'user-fx-banner',
    name: 'Cajera FX',
    role: UserRole.cashier,
    isActive: true,
  );

  // Exact directive copy produced by SaleViewModel (mirrors the fx guard
  // test constants; kept here so a copy regression in the banner path fails
  // loudly instead of silently matching any string).
  const commercialAbsentMessage =
      'No se puede vender: la tasa de cambio comercial no está configurada en este terminal. Pedile al dueño o a un encargado que la configure en Perfil del Negocio.';
  const bcnAbsentMessage =
      'No se puede vender: la tasa oficial BCN no está configurada en este terminal. Pedile al dueño o a un encargado que la configure en Perfil del Negocio.';

  setUp(() {
    mockSalesRepo = MockSalesRepository();
    mockInventoryRepo = MockInventoryRepository();
    mockAuthRepo = MockAuthRepository();
    mockDb = MockAppDatabase();
    configDao = ControllableLocalConfigDaoForBanner();

    configDao.saveConfig(
      LocalConfigEntity(key: 'tax_regime', value: 'CUOTA_FIJA'),
    );

    when(mockDb.localConfigDao).thenReturn(configDao);
    when(mockDb.cashierSessionDao).thenReturn(MockCashierSessionDao());
    when(mockDb.holdTicketDao).thenReturn(MockHoldTicketDao());
    when(mockDb.promotionDao).thenReturn(MockPromotionDao());
    when(mockDb.invoiceDao).thenReturn(MockInvoiceDao());
    when(mockDb.kitchenOrderDao).thenReturn(FakeKitchenOrderDaoForBanner());
    when(mockDb.taxConfigDao).thenReturn(FakeTaxConfigDaoForBanner());

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
      FakeTenantConfigServiceForBanner(mockDb.localConfigDao),
      FakeKitchenOrderServiceForBanner(mockDb),
    );
  });

  Future<void> pumpCart(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1024, 1400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());
    addTearDown(() => tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      ChangeNotifierProvider<SaleViewModel>.value(
        value: viewModel,
        child: MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: CartSummary(),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets(
    'blocked with commercial rate absent: banner renders the full directive '
    'message above COBRAR with a Reintentar action',
    (tester) async {
      await viewModel.loadExchangeRates();
      await pumpCart(tester);

      expect(find.byKey(bannerKey), findsOneWidget);
      expect(find.text(commercialAbsentMessage), findsOneWidget);
      expect(find.widgetWithText(TextButton, 'Reintentar'), findsOneWidget);
    },
  );

  testWidgets(
    'blocked with BCN official rate absent: banner renders the BCN directive '
    'message',
    (tester) async {
      configDao.saveConfig(
        LocalConfigEntity(key: 'commercial_exchange_rate', value: '36.50'),
      );
      await viewModel.loadExchangeRates();
      await pumpCart(tester);

      expect(find.byKey(bannerKey), findsOneWidget);
      expect(find.text(bcnAbsentMessage), findsOneWidget);
    },
  );

  testWidgets(
    'not blocked (both rates recorded): no banner at all and COBRAR still '
    'rendered',
    (tester) async {
      configDao.saveConfig(
        LocalConfigEntity(key: 'commercial_exchange_rate', value: '36.50'),
      );
      configDao.saveConfig(
        LocalConfigEntity(key: 'bcn_official_exchange_rate', value: '36.6241'),
      );
      await viewModel.loadExchangeRates();
      await pumpCart(tester);

      expect(find.byKey(bannerKey), findsNothing);
      expect(find.widgetWithText(ElevatedButton, 'COBRAR'), findsOneWidget);
    },
  );

  testWidgets(
    'banner does not consume the block reason: it stays on screen across '
    'rebuilds and errorMessage stays null (no SnackBar channel push)',
    (tester) async {
      await viewModel.loadExchangeRates();
      await pumpCart(tester);

      expect(find.byKey(bannerKey), findsOneWidget);
      // Reading the reason again yields the same message (non-consuming).
      expect(viewModel.fxCheckoutBlockReason, commercialAbsentMessage);
      // The banner path never pushes into the transient SnackBar channel.
      expect(viewModel.errorMessage, isNull);

      // Still visible across another rebuild of the same tree.
      await tester.pump();
      await tester.pumpAndSettle();
      expect(find.byKey(bannerKey), findsOneWidget);
      expect(find.text(commercialAbsentMessage), findsOneWidget);
    },
  );

  testWidgets(
    'cart with items but blocked: banner is rendered ABOVE the COBRAR '
    'action in the same column (the field-reported overlay regression)',
    (tester) async {
      configDao.saveConfig(
        LocalConfigEntity(key: 'commercial_exchange_rate', value: 'abc'),
      );
      configDao.saveConfig(
        LocalConfigEntity(key: 'bcn_official_exchange_rate', value: '36.6241'),
      );
      viewModel.addToCart(
        const Product(
          id: 'p-fx-banner',
          name: 'Café',
          uom: 'UND',
          stock: 10,
          averageCost: 20,
          sellPrice: 100.0,
        ),
      );
      await viewModel.loadExchangeRates();
      await pumpCart(tester);

      expect(find.byKey(bannerKey), findsOneWidget);
      final cobrarButton = find.widgetWithText(ElevatedButton, 'COBRAR');
      expect(cobrarButton, findsOneWidget);

      final bannerTop = tester.getTopLeft(find.byKey(bannerKey)).dy;
      final cobrarTop = tester.getTopLeft(cobrarButton).dy;
      expect(bannerTop, lessThan(cobrarTop));
    },
  );

  testWidgets(
    'R-4 general checkout error: when sale fails, banner surfaces the error '
    'visibly above COBRAR in the cart with a Descartar action',
    (tester) async {
      configDao.saveConfig(
        LocalConfigEntity(key: 'commercial_exchange_rate', value: '36.50'),
      );
      configDao.saveConfig(
        LocalConfigEntity(key: 'bcn_official_exchange_rate', value: '36.6241'),
      );
      viewModel.addToCart(
        const Product(
          id: 'p-err-1',
          name: 'Taco',
          uom: 'UND',
          stock: 5,
          averageCost: 10,
          sellPrice: 50.0,
        ),
      );
      await viewModel.loadExchangeRates();

      when(mockSalesRepo.saveSale(
        invoice: anyNamed('invoice'),
        items: anyNamed('items'),
        payments: anyNamed('payments'),
      )).thenThrow(Exception('Simulated sale database failure'));

      try {
        await viewModel.processSale([PaymentMethod.cash]);
      } catch (_) {}

      await pumpCart(tester);

      expect(find.byKey(bannerKey), findsOneWidget);
      expect(
        find.textContaining('No se pudo procesar la venta'),
        findsOneWidget,
      );
      expect(find.widgetWithText(TextButton, 'Descartar'), findsOneWidget);

      await tester.tap(find.widgetWithText(TextButton, 'Descartar'));
      await tester.pumpAndSettle();
      expect(find.byKey(bannerKey), findsNothing);
    },
  );
}

class ControllableLocalConfigDaoForBanner extends Mock
    implements LocalConfigDao {
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

class FakeKitchenOrderDaoForBanner extends Mock implements KitchenOrderDao {}

class FakeTaxConfigDaoForBanner extends Mock implements TaxConfigDao {
  @override
  Future<List<TaxConfigEntity>> getAllTaxConfigs() async => [];
}

class FakeTenantConfigServiceForBanner extends TenantConfigService {
  FakeTenantConfigServiceForBanner(super.localConfigDao);

  @override
  Future<TenantConfig> getTenantConfig() async => const TenantConfig();

  @override
  Stream<TenantOperationMode> get onOperationModeChanged =>
      const Stream.empty();
}

class FakeKitchenOrderServiceForBanner extends KitchenOrderService {
  FakeKitchenOrderServiceForBanner(super.database);

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
