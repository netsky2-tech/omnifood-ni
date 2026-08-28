import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/models/config/tenant_config.dart';
import 'package:pos_app/domain/models/kitchen/kitchen_order.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/services/kitchen/kitchen_order_service.dart';
import 'package:pos_app/domain/services/config/tenant_config_service.dart';
import 'package:pos_app/domain/models/config/printer_config.dart';
import 'package:pos_app/domain/services/config/printer_config_service.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/features/sales/widgets/multi_currency_checkout_dialog.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import '../../../presentation/features/sales/sale_view_model_test.mocks.dart';

import 'package:pos_app/domain/models/config/tenant_operation_mode.dart';

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

class FakePrinterConfigService extends PrinterConfigService {
  FakePrinterConfigService(super.configDao);

  @override
  Future<PrinterConfig> getPrinterConfig() async => const PrinterConfig();

  @override
  Stream<PrinterConfig> get onConfigChanged => const Stream.empty();
}

void main() {
  late MockSalesRepository mockSalesRepo;
  late MockInventoryRepository mockInventoryRepo;
  late MockAuthRepository mockAuthRepo;
  late FakeKitchenOrderService fakeKitchenOrderService;
  late FakeTenantConfigService fakeTenantConfigService;
  late FakePrinterConfigService fakePrinterConfigService;
  late AppDatabase database;
  late SaleViewModel saleViewModel;

  setUpAll(() async {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
  });

  tearDownAll(() async {
    await database.close();
  });

  setUp(() async {
    mockSalesRepo = MockSalesRepository();
    mockInventoryRepo = MockInventoryRepository();
    mockAuthRepo = MockAuthRepository();
    fakeKitchenOrderService = FakeKitchenOrderService(database);
    fakeTenantConfigService = FakeTenantConfigService(database.localConfigDao);
    fakePrinterConfigService = FakePrinterConfigService(database.localConfigDao);

    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-1',
        name: 'Carlos Cajero',
        role: UserRole.cashier,
        isActive: true,
      ),
    );
    when(mockInventoryRepo.getActiveProducts()).thenAnswer((_) async => []);
    when(mockInventoryRepo.getProductById(any)).thenAnswer((_) async => null);
    when(mockSalesRepo.saveSale(
      invoice: anyNamed('invoice'),
      items: anyNamed('items'),
      payments: anyNamed('payments'),
    )).thenAnswer((_) async {});

    saleViewModel = SaleViewModel(
      mockSalesRepo,
      mockInventoryRepo,
      mockAuthRepo,
      database,
      null,
      false,
      fakeTenantConfigService,
      fakeKitchenOrderService,
      fakePrinterConfigService,
      MockPrinterAdapter(),
    );

    // Set 1000 NIO total (tax exempt for clean rounding in test)
    saleViewModel.toggleGlobalTaxExempt();
    saleViewModel.addToCart(
      const Product(
        id: 'p1',
        name: 'Plato Familiar',
        uom: 'UND',
        stock: 10,
        averageCost: 500,
        sellPrice: 1000.0,
      ),
    );
  });

  tearDown(() {
    saleViewModel.dispose();
  });

  Widget createWidgetUnderTest() {
    return MaterialApp(
      home: ChangeNotifierProvider<SaleViewModel>.value(
        value: saleViewModel,
        child: const Scaffold(
          body: Center(
            child: SizedBox(
              width: 800,
              height: 900,
              child: MultiCurrencyCheckoutDialog(),
            ),
          ),
        ),
      ),
    );
  }

  group('MultiCurrencyCheckoutDialog - Split Payments & Two-Layer Card (Slice 3.2)', () {
    testWidgets('Card selection displays Two-Layer datáfono instructions and Fast-Checkout mode',
        (tester) async {
      tester.view.physicalSize = const Size(1024, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      // 1. Select Card payment method
      final cardChoice = find.widgetWithText(ChoiceChip, 'Tarjeta');
      expect(cardChoice, findsOneWidget);
      await tester.tap(cardChoice);
      await tester.pumpAndSettle();

      // 2. Verify Datáfono instruction and Bank POS selectors
      expect(find.textContaining('Procese el cobro en el datáfono físico'), findsOneWidget);
      expect(find.text('BAC'), findsOneWidget);
      expect(find.text('BANPRO'), findsOneWidget);
      expect(find.text('LAFISE'), findsOneWidget);

      // 3. Fast-Checkout 1-Tap button is visible
      expect(find.textContaining('⚡ Cobro Rápido'), findsOneWidget);

      // 4. Click Fast-Checkout and submit
      await tester.tap(find.text('COBRAR'));
      await tester.pumpAndSettle();

      // Verify saveSale called with Payment marked as PENDIENTE
      final captured = verify(
        mockSalesRepo.saveSale(
          invoice: anyNamed('invoice'),
          items: anyNamed('items'),
          payments: captureAnyNamed('payments'),
        ),
      ).captured;

      final payments = captured.first as List<Payment>;
      expect(payments.length, 1);
      expect(payments.first.method, PaymentMethod.card);
      expect(payments.first.voucherCode, 'PENDIENTE');
      expect(payments.first.reconciliationStatus, 'PENDIENTE');
      expect(payments.first.bankPos, 'BAC');
    });

    testWidgets('Card selection allows entering manual authorization code',
        (tester) async {
      tester.view.physicalSize = const Size(1024, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      await tester.tap(find.widgetWithText(ChoiceChip, 'Tarjeta'));
      await tester.pumpAndSettle();

      // Toggle off fast-checkout switch to show manual voucher fields
      final fastSwitch = find.byType(Switch);
      expect(fastSwitch, findsOneWidget);
      await tester.ensureVisible(fastSwitch);
      await tester.tap(fastSwitch);
      await tester.pumpAndSettle();

      // Enter authorization code and last 4
      final authField = find.byKey(const Key('voucher_auth_code_field'));
      expect(authField, findsOneWidget);
      await tester.ensureVisible(authField);
      await tester.enterText(authField, '789123');
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.text('COBRAR'));
      await tester.tap(find.text('COBRAR'));
      await tester.pumpAndSettle();

      final captured = verify(
        mockSalesRepo.saveSale(
          invoice: anyNamed('invoice'),
          items: anyNamed('items'),
          payments: captureAnyNamed('payments'),
        ),
      ).captured;

      final payments = captured.first as List<Payment>;
      expect(payments.first.voucherCode, '789123');
      expect(payments.first.reconciliationStatus, 'CONCILIADO');
      expect(payments.first.bankPos, 'BAC');
    });

    testWidgets('Split Payment mode allows multi-tender combinations until balance is zero',
        (tester) async {
      tester.view.physicalSize = const Size(1024, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      // 1. Switch to Split Payment mode tab
      final splitTab = find.text('Pago Dividido');
      expect(splitTab, findsOneWidget);
      await tester.tap(splitTab);
      await tester.pumpAndSettle();

      // 2. Initial state: Total = C$ 1000.00, Restante = C$ 1000.00
      expect(find.textContaining('Resta: C\$ 1000.00'), findsOneWidget);

      // 3. Add Tender 1: USD Cash $10.00 (C$ 365.00 NIO)
      final usdChip = find.widgetWithText(ChoiceChip, 'USD (\$)');
      await tester.ensureVisible(usdChip);
      await tester.tap(usdChip);
      await tester.pumpAndSettle();

      final tenderInput = find.byKey(const Key('split_tender_amount_field'));
      await tester.enterText(tenderInput, '10.00');
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.text('Agregar Pago'));
      await tester.tap(find.text('Agregar Pago'));
      await tester.pumpAndSettle();

      // Remaining should now be C$ 635.00
      expect(find.textContaining('Resta: C\$ 635.00'), findsOneWidget);
      expect(find.textContaining('\$ 10.00'), findsOneWidget);

      // 4. Add Tender 2: Card BAC C$ 500.00 (Fast-Checkout) in NIO
      await tester.ensureVisible(find.widgetWithText(ChoiceChip, 'Tarjeta'));
      await tester.tap(find.widgetWithText(ChoiceChip, 'Tarjeta'));
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.widgetWithText(ChoiceChip, 'NIO (C\$)'));
      await tester.tap(find.widgetWithText(ChoiceChip, 'NIO (C\$)'));
      await tester.pumpAndSettle();

      await tester.ensureVisible(tenderInput);
      await tester.enterText(tenderInput, '500.00');
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.text('Agregar Pago'));
      await tester.tap(find.text('Agregar Pago'));
      await tester.pumpAndSettle();

      // Remaining should now be C$ 135.00
      expect(find.textContaining('Resta: C\$ 135.00'), findsOneWidget);

      // 5. Add Tender 3: Cash NIO C$ 135.00
      await tester.ensureVisible(find.widgetWithText(ChoiceChip, 'Efectivo'));
      await tester.tap(find.widgetWithText(ChoiceChip, 'Efectivo'));
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.widgetWithText(ChoiceChip, 'NIO (C\$)'));
      await tester.tap(find.widgetWithText(ChoiceChip, 'NIO (C\$)'));
      await tester.pumpAndSettle();

      await tester.ensureVisible(tenderInput);
      await tester.enterText(tenderInput, '135.00');
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.text('Agregar Pago'));
      await tester.tap(find.text('Agregar Pago'));
      await tester.pumpAndSettle();

      // Remaining is 0.00 -> Complete!
      expect(find.textContaining('Resta: C\$ 0.00'), findsOneWidget);

      // 6. Submit finalized sale
      final finalizeBtn = find.text('FINALIZAR VENTA');
      expect(finalizeBtn, findsOneWidget);
      await tester.ensureVisible(finalizeBtn);
      await tester.tap(finalizeBtn);
      await tester.pumpAndSettle();

      final captured = verify(
        mockSalesRepo.saveSale(
          invoice: anyNamed('invoice'),
          items: anyNamed('items'),
          payments: captureAnyNamed('payments'),
        ),
      ).captured;

      final payments = captured.first as List<Payment>;
      expect(payments.length, 3);
      expect(payments[0].method, PaymentMethod.cash);
      expect(payments[0].currency, 'USD');
      expect(payments[0].amount, 10.0);

      expect(payments[1].method, PaymentMethod.card);
      expect(payments[1].amount, 500.0);
      expect(payments[1].voucherCode, 'PENDIENTE');

      expect(payments[2].method, PaymentMethod.cash);
      expect(payments[2].amount, 135.0);
      expect(payments[2].currency, 'NIO');
    });
  });
}
