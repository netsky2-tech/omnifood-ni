import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/models/sales/invoice_item_entity.dart';
import 'package:pos_app/data/models/sales/payment_entity.dart';
import 'package:pos_app/data/repositories/sales/sales_repository_impl.dart';
import 'package:pos_app/domain/models/config/tenant_config.dart';
import 'package:pos_app/domain/models/config/tenant_operation_mode.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/services/config/tenant_config_service.dart';
import 'package:pos_app/domain/services/kitchen/kitchen_order_service.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/features/kitchen/kitchen_display_view_model.dart';

import 'multi_currency_checkout_e2e_test.mocks.dart';

void main() {
  late AppDatabase database;
  late MockAuditRepository mockAuditRepo;
  late MockInventoryRepository mockInventoryRepo;
  late MockProcessSaleInventoryUseCase mockProcessUseCase;
  late MockReverseSaleInventoryUseCase mockReverseUseCase;
  late MockSalesTransactionDao mockTransactionDao;
  late MockDgiNumberingService mockNumberingService;
  late MockMovementEngine mockMovementEngine;
  late MockAuthRepository mockAuthRepo;
  late SalesRepositoryImpl salesRepository;
  late TenantConfigService tenantConfigService;
  late KitchenOrderService kitchenOrderService;
  late SaleViewModel saleViewModel;
  late KitchenDisplayViewModel kitchenViewModel;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();

    // 1. Seed FX Rates in SQLite
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'commercial_exchange_rate', value: '36.50'),
    );
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'bcn_official_exchange_rate', value: '36.6241'),
    );

    // 2. Seed Tenant Config in FOODPARK_QSR mode with Buzzer Required
    tenantConfigService = TenantConfigService(database.localConfigDao);
    await tenantConfigService.saveTenantConfig(
      const TenantConfig(
        operationMode: TenantOperationMode.foodparkQsr,
        buzzerPagerRequired: true,
      ),
    );

    // 3. Seed Open Cashier Session
    final now = DateTime.now().millisecondsSinceEpoch;
    await database.cashierSessionDao.insertSession(
      CashierSessionEntity(
        id: 'shift-qsr-01',
        userId: 'u-cashier-qsr',
        terminalId: 'POS-QSR-01',
        openedAt: now,
        tipoModelo: 'CAJA_CENTRAL',
        openingBalanceNio: 1500.0,
        openingBalanceUsd: 100.0,
        isClosed: false,
        syncStatus: 'synced',
      ),
    );

    // 4. Setup Mocks & Services
    mockAuditRepo = MockAuditRepository();
    mockInventoryRepo = MockInventoryRepository();
    mockProcessUseCase = MockProcessSaleInventoryUseCase();
    mockReverseUseCase = MockReverseSaleInventoryUseCase();
    mockTransactionDao = MockSalesTransactionDao();
    mockNumberingService = MockDgiNumberingService();
    mockMovementEngine = MockMovementEngine();
    mockAuthRepo = MockAuthRepository();

    when(mockAuditRepo.log(any)).thenAnswer((_) async {});
    when(mockInventoryRepo.getActiveProducts()).thenAnswer((_) async => []);
    when(mockInventoryRepo.getProductById(any)).thenAnswer((_) async => null);
    when(mockProcessUseCase.execute(any)).thenAnswer((_) async => []);
    when(mockNumberingService.isRangeExhausted()).thenAnswer((_) async => false);

    var seq = 1;
    when(mockNumberingService.getNextNumber()).thenAnswer(
      (_) async => '001-002-01-${(seq++).toString().padLeft(8, '0')}',
    );
    when(mockTransactionDao.getNextInvoiceSourceSequence(any))
        .thenAnswer((_) async => seq);

    // Execute real SQLite persistence in transaction mock
    when(mockTransactionDao.executeSaleTransaction(any, any, any, any, any, any, any))
        .thenAnswer((invocation) async {
      final inv = invocation.positionalArguments[0] as InvoiceEntity;
      final items = invocation.positionalArguments[1] as List<InvoiceItemEntity>;
      final payments = invocation.positionalArguments[3] as List<PaymentEntity>;
      await database.invoiceDao.insertInvoice(inv);
      await database.invoiceItemDao.insertItems(items);
      await database.paymentDao.insertPayments(payments);
    });

    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-cashier-qsr',
        name: 'Ana Mostrador',
        role: UserRole.cashier,
        isActive: true,
      ),
    );

    kitchenOrderService = KitchenOrderService(database);

    salesRepository = SalesRepositoryImpl(
      database: database,
      invoiceDao: database.invoiceDao,
      itemDao: database.invoiceItemDao,
      paymentDao: database.paymentDao,
      transactionDao: mockTransactionDao,
      numberingService: mockNumberingService,
      movementEngine: mockMovementEngine,
      auditRepository: mockAuditRepo,
      processInventoryUseCase: mockProcessUseCase,
      reverseInventoryUseCase: mockReverseUseCase,
      inventoryRepository: mockInventoryRepo,
    );

    saleViewModel = SaleViewModel(
      salesRepository,
      mockInventoryRepo,
      mockAuthRepo,
      database,
      null, // tableOrderService is null in QSR mode
      false,
      tenantConfigService,
      kitchenOrderService,
    );

    kitchenViewModel = KitchenDisplayViewModel(
      kitchenOrderService: kitchenOrderService,
      autoStartTimer: false,
    );

    await saleViewModel.loadExchangeRates();
    await saleViewModel.checkActiveSession();
  });

  tearDown(() async {
    kitchenViewModel.dispose();
    await database.close();
  });

  group('Full Food Park QSR E2E Integration Flow (Slice 6.4)', () {
    test('End-to-End: FOODPARK_QSR Config -> Counter Sale with Buzzer #42 -> Direct KDS Routing (Cocina & Barra) -> Prep -> Buzzer Ready Call -> Bump', () async {
      // --- STEP 1: Verify QSR Tenant Mode Flags in SaleViewModel ---
      final tenantConfig = await tenantConfigService.getTenantConfig();
      expect(tenantConfig.operationMode, TenantOperationMode.foodparkQsr);
      expect(saleViewModel.isFoodParkQsr, isTrue);
      expect(saleViewModel.supportsTables, isFalse);
      expect(saleViewModel.supportsBuzzerPager, isTrue);

      // --- STEP 2: Cashier Adds Food & Drinks to Counter Cart ---
      const burgerProduct = Product(
        id: 'prod-burger-fp',
        name: 'Hamburguesa FoodPark Especial',
        uom: 'UN',
        stock: 100.0,
        averageCost: 60.0,
        sku: 'BUR-001',
        sellPrice: 180.0,
        isActive: true,
      );

      const tacosProduct = Product(
        id: 'prod-tacos-fp',
        name: 'Tacos al Pastor FoodPark',
        uom: 'UN',
        stock: 100.0,
        averageCost: 20.0,
        sku: 'TAC-001',
        sellPrice: 60.0,
        isActive: true,
      );

      const beerProduct = Product(
        id: 'prod-beer-fp',
        name: 'Cerveza Toña 350ml',
        uom: 'UN',
        stock: 100.0,
        averageCost: 30.0,
        sku: 'BEER-001',
        sellPrice: 60.0,
        isActive: true,
      );

      const smoothieProduct = Product(
        id: 'prod-smoothie-fp',
        name: 'Smoothie Pitahaya con Fresa',
        uom: 'UN',
        stock: 100.0,
        averageCost: 25.0,
        sku: 'SMOOTH-001',
        sellPrice: 80.0,
        isActive: true,
      );

      saleViewModel.addToCart(
        burgerProduct,
        quantity: 1,
        modifiers: const [Modifier(id: 'm-bacon', name: 'Extra Bacon', extraPrice: 30.0)],
      );
      saleViewModel.addToCart(tacosProduct, quantity: 2);
      saleViewModel.addToCart(beerProduct, quantity: 2);
      saleViewModel.addToCart(smoothieProduct, quantity: 1);

      expect(saleViewModel.cart.length, 4);

      // Subtotal: (180 + 30) + (120) + (120) + (80) = C$530.00
      expect(saleViewModel.subtotal, 530.0);
      // Tax (15%): 530 * 0.15 = C$79.50
      expect(saleViewModel.totalTax, 79.50);
      // Total: C$609.50
      expect(saleViewModel.total, 609.50);

      // --- STEP 3: Assign Buzzer #42 & Customer Name ---
      saleViewModel.setBuzzerNumber('42');
      saleViewModel.setCustomerName('Roberto Gómez');

      expect(saleViewModel.buzzerNumber, '42');
      expect(saleViewModel.customerName, 'Roberto Gómez');

      // --- STEP 4: Process Multi-Currency Mixed Payment ($10.00 USD + C$244.50 NIO Card) ---
      // At TC Comercial 36.50: $10 USD = C$365.00 NIO
      // Remaining = 609.50 - 365.00 = C$244.50 NIO
      final usdPayment = Payment(
        id: 'pay-usd-1',
        invoiceId: 'temp-inv',
        amount: 10.0,
        method: PaymentMethod.cash,
        currency: 'USD',
        exchangeRate: 36.50,
        amountNio: 365.0,
      );

      final cardPayment = Payment(
        id: 'pay-card-1',
        invoiceId: 'temp-inv',
        amount: 244.50,
        method: PaymentMethod.card,
        currency: 'NIO',
        exchangeRate: 1.0,
        amountNio: 244.50,
        voucherCode: 'V-998811',
      );

      await saleViewModel.processSale(
        [PaymentMethod.cash, PaymentMethod.card],
        customPayments: [usdPayment, cardPayment],
        buzzerNumber: '42',
        customerName: 'Roberto Gómez',
      );

      // Cart and buzzer state in viewModel should be reset for next customer
      expect(saleViewModel.cart, isEmpty);
      expect(saleViewModel.buzzerNumber, isNull);

      // --- STEP 5: Verify SQLite Persistence of Invoice & Payments ---
      final storedInvoices = await database.invoiceDao.getAllInvoices();
      expect(storedInvoices.length, 1);
      final storedInvoice = storedInvoices.first;
      expect(storedInvoice.total, 609.50);
      expect(storedInvoice.bcnOfficialRate, 36.6241);
      expect(storedInvoice.commercialRate, 36.50);

      final storedPayments = await database.paymentDao.getPaymentsByInvoiceId(storedInvoice.id);
      expect(storedPayments.length, 2);

      // --- STEP 6: Verify Direct KDS Routing & Station Partitioning ---
      final activeKitchenOrders = await kitchenOrderService.getActiveOrders();
      expect(activeKitchenOrders.length, 2);

      final cocinaOrder = activeKitchenOrders.firstWhere((o) => o.station == 'COCINA');
      final barraOrder = activeKitchenOrders.firstWhere((o) => o.station == 'BARRA');

      // Cocina Order checks
      expect(cocinaOrder.tableName, 'Buzzer #42');
      expect(cocinaOrder.tableNumber, '42');
      expect(cocinaOrder.items.length, 2);
      expect(cocinaOrder.items.map((i) => i.productName), containsAll(['Hamburguesa FoodPark Especial', 'Tacos al Pastor FoodPark']));

      final burgerKdsItem = cocinaOrder.items.firstWhere((i) => i.productName == 'Hamburguesa FoodPark Especial');
      expect(burgerKdsItem.modifiers, contains('Extra Bacon'));

      // Barra Order checks
      expect(barraOrder.tableName, 'Buzzer #42');
      expect(barraOrder.tableNumber, '42');
      expect(barraOrder.items.length, 2);
      expect(barraOrder.items.map((i) => i.productName), containsAll(['Cerveza Toña 350ml', 'Smoothie Pitahaya con Fresa']));

      // --- STEP 7: KDS Kitchen Display Workflow (Preparation -> Ready -> Buzzer Callout -> Bump) ---
      await kitchenViewModel.loadOrders();
      expect(kitchenViewModel.orders.length, 2);
      expect(kitchenViewModel.pendingCount, 2);
      expect(kitchenViewModel.cocinaCount, 1);
      expect(kitchenViewModel.barraCount, 1);

      // Cocina starts preparation
      await kitchenViewModel.startPreparation(cocinaOrder.id);
      expect(kitchenViewModel.pendingCount, 2);

      // Cocina finishes food -> marks ready
      await kitchenViewModel.markOrderReady(cocinaOrder.id);

      final updatedCocinaOrder = (await kitchenOrderService.getActiveOrders()).firstWhere((o) => o.id == cocinaOrder.id);
      expect(updatedCocinaOrder.status, 'LISTO');
      expect(updatedCocinaOrder.readyAt, isNotNull);

      // Cocina / Expo bumps and delivers order to customer with Buzzer #42
      await kitchenViewModel.bumpOrder(cocinaOrder.id);

      // Barra does the same
      await kitchenViewModel.startPreparation(barraOrder.id);
      await kitchenViewModel.markOrderReady(barraOrder.id);
      await kitchenViewModel.bumpOrder(barraOrder.id);

      // All orders completed and bumped
      final remainingActiveOrders = await kitchenOrderService.getActiveOrders();
      expect(remainingActiveOrders, isEmpty);
    });
  });
}
