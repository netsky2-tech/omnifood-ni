import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/models/sales/invoice_item_entity.dart';
import 'package:pos_app/data/models/sales/payment_entity.dart';
import 'package:pos_app/data/models/sales/restaurant_area_entity.dart';
import 'package:pos_app/data/models/sales/restaurant_table_entity.dart';
import 'package:pos_app/data/repositories/sales/sales_repository_impl.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/services/kitchen/kitchen_order_service.dart';
import 'package:pos_app/domain/services/sales/table_order_service.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/features/kitchen/kitchen_display_view_model.dart';

import '../sales/multi_currency_checkout_e2e_test.mocks.dart';

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
  late TableOrderService tableOrderService;
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

    // 2. Seed Restaurant Areas & Tables
    await database.restaurantAreaDao.insertAreas([
      RestaurantAreaEntity(id: 'area-salon', name: 'Salón Principal', displayOrder: 1),
    ]);
    await database.restaurantTableDao.insertTables([
      RestaurantTableEntity(id: 'tbl-1', areaId: 'area-salon', tableNumber: 'Mesa 1', capacity: 4),
    ]);

    // 3. Seed Open Cashier Session
    final now = DateTime.now().millisecondsSinceEpoch;
    await database.cashierSessionDao.insertSession(
      CashierSessionEntity(
        id: 'shift-kds-1',
        userId: 'u-cashier-1',
        terminalId: 'POS-KDS-01',
        openedAt: now,
        tipoModelo: 'CAJA_CENTRAL',
        openingBalanceNio: 2000.0,
        openingBalanceUsd: 50.0,
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
      (_) async => '001-001-01-${(seq++).toString().padLeft(8, '0')}',
    );
    when(mockTransactionDao.getNextInvoiceSourceSequence(any))
        .thenAnswer((_) async => seq);

    // Execute real SQLite persistence in transaction mock
    when(mockTransactionDao.executeSaleWithDgiTransaction(any, any, any, any, any, any, any, any))
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
        id: 'u-cashier-1',
        name: 'Carlos Mesero',
        role: UserRole.cashier,
        isActive: true,
      ),
    );

    tableOrderService = TableOrderService(database);
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
      tableOrderService,
      false,
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

  group('Full Restaurant & Kitchen Display E2E Integration (Slice 5.4)', () {
    test('End-to-End: FOH Open Mesa -> KDS Split Routing -> Cocina & Barra Prep -> Bump -> Recall -> DGI Invoice', () async {
      // --- STEP 1: Waiter opens Mesa 1 with food & drinks ---
      final tacoItem = const CartItem(
        productId: 'prod-tacos',
        productName: 'Tacos de Res Especiales',
        quantity: 2,
        unitPrice: 120.0,
        taxRate: 0.15,
        selectedModifiers: [
          Modifier(id: 'm-1', name: 'Extra Queso', extraPrice: 25.0),
          Modifier(id: 'm-2', name: 'Sin Cebolla', extraPrice: 0.0),
        ],
      );

      final burgerItem = const CartItem(
        productId: 'prod-burger',
        productName: 'Hamburguesa Artesanal',
        quantity: 1,
        unitPrice: 150.0,
        taxRate: 0.15,
        notes: 'Término Medio',
      );

      final beerItem = const CartItem(
        productId: 'prod-beer',
        productName: 'Cerveza Toña 350ml',
        quantity: 2,
        unitPrice: 50.0,
        taxRate: 0.15,
      );

      final mojitoItem = const CartItem(
        productId: 'prod-mojito',
        productName: 'Mojito Cubano',
        quantity: 1,
        unitPrice: 90.0,
        taxRate: 0.15,
      );

      // Park order on Mesa 1
      final parkedTicket = await tableOrderService.parkOrder(
        tableId: 'tbl-1',
        areaId: 'area-salon',
        name: 'Mesa 1 - Almuerzo Ejecutivo',
        waiterName: 'Carlos Mesero',
        guestCount: 3,
        items: [tacoItem, burgerItem, beerItem, mojitoItem],
      );

      expect(parkedTicket.items.length, 4);

      // --- STEP 2: Dispatch Comanda to KDS Stations (COCINA vs BARRA) ---
      final createdKitchenOrders = await kitchenOrderService.sendTicketToKitchen(ticket: parkedTicket);

      expect(createdKitchenOrders.length, 2);

      final cocinaOrder = createdKitchenOrders.firstWhere((o) => o.station == 'COCINA');
      final barraOrder = createdKitchenOrders.firstWhere((o) => o.station == 'BARRA');

      expect(cocinaOrder.items.length, 2);
      expect(cocinaOrder.items.first.modifiers, contains('Extra Queso'));
      expect(cocinaOrder.items.first.modifiers, contains('Sin Cebolla'));
      expect(cocinaOrder.items.last.notes, 'Término Medio');

      expect(barraOrder.items.length, 2);
      expect(barraOrder.station, 'BARRA');

      // --- STEP 3: Kitchen Display Screen updates ---
      await kitchenViewModel.loadOrders();
      expect(kitchenViewModel.pendingCount, 2);
      expect(kitchenViewModel.cocinaCount, 1);
      expect(kitchenViewModel.barraCount, 1);

      // --- STEP 4: Barra prepares drinks & bumps ---
      await kitchenViewModel.startPreparation(barraOrder.id);
      await kitchenViewModel.markOrderReady(barraOrder.id);
      await kitchenViewModel.bumpOrder(barraOrder.id);

      expect(kitchenViewModel.barraCount, 0);
      expect(kitchenViewModel.cocinaCount, 1);

      // --- STEP 5: Cocina prepares food step-by-step & bumps ---
      await kitchenViewModel.startPreparation(cocinaOrder.id);

      // Cook marks tacos ready
      final tacoItemId = cocinaOrder.items.first.id;
      await kitchenViewModel.markItemReady(cocinaOrder.id, tacoItemId);

      // Cook marks burger ready -> Cocina order automatically flips to LISTO
      final burgerItemId = cocinaOrder.items.last.id;
      await kitchenViewModel.markItemReady(cocinaOrder.id, burgerItemId);

      final cocinaOrderAfterItems = await kitchenOrderService.getOrderById(cocinaOrder.id);
      expect(cocinaOrderAfterItems?.status, 'LISTO');

      // Waiter picks up and bumps cocina order
      await kitchenViewModel.bumpOrder(cocinaOrder.id);

      // All initial orders are now served
      expect(kitchenViewModel.pendingCount, 0);

      // --- STEP 6: Customer orders Flan & Coffee later (Append with Optimistic Lock) ---
      final flanItem = const CartItem(
        productId: 'prod-flan',
        productName: 'Flan Casero',
        quantity: 1,
        unitPrice: 60.0,
        taxRate: 0.15,
      );

      final coffeeItem = const CartItem(
        productId: 'prod-coffee',
        productName: 'Café Americano',
        quantity: 2,
        unitPrice: 40.0,
        taxRate: 0.15,
      );

      final updatedTicket = await tableOrderService.appendItemsToOrder(
        ticketId: parkedTicket.id,
        newItems: [flanItem, coffeeItem],
        expectedVersion: 1,
      );

      expect(updatedTicket.version, 2);
      expect(updatedTicket.items.length, 6);

      // Append to KDS
      final additionalKdsOrders = await kitchenOrderService.appendTicketItemsToKitchen(
        ticketId: updatedTicket.id,
        newItems: [flanItem, coffeeItem],
        tableNumber: 'tbl-1',
        tableName: 'Mesa 1 - Almuerzo Ejecutivo',
        waiterName: 'Carlos Mesero',
      );

      expect(additionalKdsOrders.length, 2);

      // Rapid prep and bump for dessert and coffee
      for (final addOrder in additionalKdsOrders) {
        await kitchenOrderService.markOrderReady(addOrder.id);
        await kitchenOrderService.bumpOrder(addOrder.id);
      }

      final activeAfterDessert = await kitchenOrderService.getActiveOrders();
      expect(activeAfterDessert, isEmpty);

      // --- STEP 7: Customer asks for the Check -> Recall & Invoice ---
      await saleViewModel.recallTicket(updatedTicket);

      // Cart total verification:
      // Tacos: 2 * (120 + 25) = 290
      // Burger: 1 * 150 = 150
      // Beer: 2 * 50 = 100
      // Mojito: 1 * 90 = 90
      // Flan: 1 * 60 = 60
      // Coffee: 2 * 40 = 80
      // Subtotal = 290 + 150 + 100 + 90 + 60 + 80 = 770.0
      // Tax 15% = 115.50
      // Total NIO = 885.50
      expect(saleViewModel.cart.length, 6);
      expect(saleViewModel.subtotal, 770.0);
      expect(saleViewModel.totalTax, 115.50);
      expect(saleViewModel.total, 885.50);

      // Multi-currency checkout: Pay $20.00 USD Cash ($20 * 36.50 = C$ 730.00) + C$ 155.50 NIO Card
      final usdPayment = Payment(
        id: 'pay-usd-kds',
        invoiceId: '',
        method: PaymentMethod.cash,
        amount: 20.00,
        currency: 'USD',
        exchangeRate: 36.50,
        amountNio: 730.00,
        changeGiven: 0.0,
        changeCurrency: 'NIO',
        createdAt: DateTime.now(),
      );

      final cardPayment = Payment(
        id: 'pay-card-kds',
        invoiceId: '',
        method: PaymentMethod.card,
        amount: 155.50,
        currency: 'NIO',
        exchangeRate: 1.0,
        amountNio: 155.50,
        voucherCode: 'KDS-VOUCH-100',
        bankPos: 'BAC_CREDOMATIC',
        reconciliationStatus: 'RECONCILED',
        createdAt: DateTime.now(),
      );

      await saleViewModel.processSale(
        [PaymentMethod.cash, PaymentMethod.card],
        customPayments: [usdPayment, cardPayment],
      );

      // Verify Invoice Persisted in SQLite
      final invoices = await database.invoiceDao.getAllInvoices();
      expect(invoices.length, 1);
      final persistedInvoice = invoices.first;
      expect(persistedInvoice.total, 885.50);
      expect(persistedInvoice.isCanceled, false);
      expect(persistedInvoice.number, startsWith('001-001-01-'));

      // --- STEP 8: Liquidate Mesa 1 & Final Cleanup ---
      await tableOrderService.liquidateOrder(updatedTicket.id);

      final table1After = await database.restaurantTableDao.getTableById('tbl-1');
      expect(table1After?.status, 'DISPONIBLE');
      expect(table1After?.currentTicketId, isNull);

      final holdTicketAfter = await database.holdTicketDao.getHoldTicketById(updatedTicket.id);
      expect(holdTicketAfter, isNull);
    });
  });
}
