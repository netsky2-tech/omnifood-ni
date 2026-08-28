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
import 'package:pos_app/domain/services/sales/table_order_service.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/features/sales/tables/table_layout_view_model.dart';

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
  late TableOrderService tableOrderService;
  late SaleViewModel saleViewModel;
  late TableLayoutViewModel tableLayoutViewModel;

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

    // 2. Seed Restaurant Areas
    await database.restaurantAreaDao.insertAreas([
      RestaurantAreaEntity(id: 'area-salon', name: 'Salón Principal', displayOrder: 1),
      RestaurantAreaEntity(id: 'area-terraza', name: 'Terraza Exterior', displayOrder: 2),
    ]);

    // 3. Seed Restaurant Tables
    await database.restaurantTableDao.insertTables([
      RestaurantTableEntity(id: 'tbl-1', areaId: 'area-salon', tableNumber: 'Mesa 1', capacity: 4),
      RestaurantTableEntity(id: 'tbl-2', areaId: 'area-salon', tableNumber: 'Mesa 2', capacity: 6),
      RestaurantTableEntity(id: 'tbl-3', areaId: 'area-terraza', tableNumber: 'Mesa T1', capacity: 4),
    ]);

    // 4. Seed Open Cashier Session
    final now = DateTime.now().millisecondsSinceEpoch;
    await database.cashierSessionDao.insertSession(
      CashierSessionEntity(
        id: 'shift-rest-1',
        userId: 'u-waiter-1',
        terminalId: 'POS-REST-01',
        openedAt: now,
        tipoModelo: 'CAJA_CENTRAL',
        openingBalanceNio: 2000.0,
        openingBalanceUsd: 50.0,
        isClosed: false,
        syncStatus: 'synced',
      ),
    );

    // 5. Setup Mocks & Services
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
        id: 'u-waiter-1',
        name: 'Carlos Mesero',
        role: UserRole.cashier,
        isActive: true,
      ),
    );

    tableOrderService = TableOrderService(database);

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

    tableLayoutViewModel = TableLayoutViewModel(
      database: database,
      tableOrderService: tableOrderService,
      autoLoad: false,
    );

    // Load initial states
    await saleViewModel.loadHoldTickets();
    await saleViewModel.loadExchangeRates();
    await saleViewModel.checkActiveSession();
    await tableLayoutViewModel.loadData();
  });

  tearDown(() async {
    await database.close();
  });

  group('Restaurant Full Flow Integration E2E Tests (Slice 4.4)', () {
    test('Complete Lifecycle: Open Table -> Modifiers -> Append -> Recall -> Multi-Currency Checkout -> DGI Invoice -> Liquidate', () async {
      // --- STEP 1: FOH opens Mesa 1 with initial comanda ---
      const initialModifiers = [
        Modifier(id: 'mod-1', name: 'Extra Queso', extraPrice: 25.0),
      ];

      final tacoItem = CartItem(
        productId: 'prod-tacos',
        productName: 'Tacos de Res Especiales',
        quantity: 2,
        unitPrice: 120.0,
        taxRate: 0.15,
        selectedModifiers: initialModifiers,
      );

      final sodaItem = const CartItem(
        productId: 'prod-soda',
        productName: 'Gaseosa 500ml',
        quantity: 2,
        unitPrice: 40.0,
        taxRate: 0.15,
      );

      final parkedTicket = await tableOrderService.parkOrder(
        tableId: 'tbl-1',
        areaId: 'area-salon',
        name: 'Mesa 1 - Cumpleaños',
        waiterName: 'Carlos Mesero',
        guestCount: 3,
        items: [tacoItem, sodaItem],
      );

      // Verify persistence in SQLite
      final table1 = await database.restaurantTableDao.getTableById('tbl-1');
      expect(table1?.status, 'OCUPADA');
      expect(table1?.activeGuests, 3);
      expect(table1?.currentTicketId, parkedTicket.id);

      final holdTicketEntity = await database.holdTicketDao.getHoldTicketById(parkedTicket.id);
      expect(holdTicketEntity?.name, 'Mesa 1 - Cumpleaños');
      expect(holdTicketEntity?.tableId, 'tbl-1');
      expect(holdTicketEntity?.version, 1);

      final holdItems = await database.holdTicketDao.getItemsByHoldTicketId(parkedTicket.id);
      expect(holdItems.length, 2);
      expect(holdItems.first.modifiersJson, contains('Extra Queso'));

      // --- STEP 2: Customer orders dessert later (Append Items with Optimistic Lock) ---
      final dessertItem = const CartItem(
        productId: 'prod-dessert',
        productName: 'Flan Casero',
        quantity: 1,
        unitPrice: 80.0,
        taxRate: 0.15,
      );

      final updatedTicket = await tableOrderService.appendItemsToOrder(
        ticketId: parkedTicket.id,
        newItems: [dessertItem],
        expectedVersion: 1,
      );

      expect(updatedTicket.version, 2);
      expect(updatedTicket.items.length, 3);

      final updatedHoldItems = await database.holdTicketDao.getItemsByHoldTicketId(parkedTicket.id);
      expect(updatedHoldItems.length, 3);

      // --- STEP 3: Cashier recalls comanda into SaleViewModel ---
      await saleViewModel.recallTicket(updatedTicket);

      expect(saleViewModel.cart.length, 3);
      // Math: (2 * (120 + 25)) + (2 * 40) + (1 * 80) = 290 + 80 + 80 = 450.0 subtotal
      // Tax: 450 * 0.15 = 67.50
      // Total NIO: 517.50
      expect(saleViewModel.subtotal, 450.0);
      expect(saleViewModel.totalTax, 67.50);
      expect(saleViewModel.total, 517.50);

      // --- STEP 4: Multi-Currency Split Payment Checkout ---
      // Pay $10.00 USD Cash (at 36.50 commercial rate = C$ 365.00)
      final usdPayment = Payment(
        id: 'pay-usd-1',
        invoiceId: '',
        method: PaymentMethod.cash,
        amount: 10.00,
        currency: 'USD',
        exchangeRate: 36.50,
        amountNio: 365.00,
        changeGiven: 0.0,
        changeCurrency: 'NIO',
        createdAt: DateTime.now(),
      );

      // Pay Remaining C$ 152.50 NIO with Debit Card
      final cardPayment = Payment(
        id: 'pay-card-1',
        invoiceId: '',
        method: PaymentMethod.card,
        amount: 152.50,
        currency: 'NIO',
        exchangeRate: 1.0,
        amountNio: 152.50,
        voucherCode: 'VOUCH-7890',
        bankPos: 'BAC_CREDOMATIC',
        reconciliationStatus: 'RECONCILED',
        createdAt: DateTime.now(),
      );

      // Execute Sale
      await saleViewModel.processSale(
        [PaymentMethod.cash, PaymentMethod.card],
        customPayments: [usdPayment, cardPayment],
      );

      // Verify Invoice Persisted in SQLite
      final invoices = await database.invoiceDao.getAllInvoices();
      expect(invoices.length, 1);
      final persistedInvoice = invoices.first;
      expect(persistedInvoice.total, 517.50);
      expect(persistedInvoice.isCanceled, false);
      expect(persistedInvoice.number, startsWith('001-001-01-'));

      // --- STEP 5: Liquidate and Release Mesa 1 ---
      await tableOrderService.liquidateOrder(updatedTicket.id);

      // Verify Table 1 is back to DISPONIBLE
      final table1AfterLiquidation = await database.restaurantTableDao.getTableById('tbl-1');
      expect(table1AfterLiquidation?.status, 'DISPONIBLE');
      expect(table1AfterLiquidation?.activeGuests, isNull);
      expect(table1AfterLiquidation?.currentTicketId, isNull);

      // Verify Hold Ticket is cleared
      final holdTicketAfter = await database.holdTicketDao.getHoldTicketById(updatedTicket.id);
      expect(holdTicketAfter, isNull);
      final remainingHoldItems = await database.holdTicketDao.getItemsByHoldTicketId(updatedTicket.id);
      expect(remainingHoldItems, isEmpty);
    });

    test('Table Operations: Transfer Table -> Merge Tables -> Clean Liquidation', () async {
      // 1. Park Comanda A on Mesa 1
      final burgerItem = const CartItem(
        productId: 'p-burger',
        productName: 'Hamburguesa Doble',
        quantity: 2,
        unitPrice: 150.0,
        taxRate: 0.15,
      );

      final ticketA = await tableOrderService.parkOrder(
        tableId: 'tbl-1',
        areaId: 'area-salon',
        name: 'Mesa 1 - Grupo Amigos',
        guestCount: 2,
        items: [burgerItem],
      );

      // 2. Transfer Mesa 1 -> Mesa 2 (empty) via TableOrderService
      await tableOrderService.transferOrder(
        ticketId: ticketA.id,
        sourceTableId: 'tbl-1',
        targetTableId: 'tbl-2',
      );

      // Mesa 1 must be DISPONIBLE, Mesa 2 must be OCUPADA
      final t1 = await database.restaurantTableDao.getTableById('tbl-1');
      final t2 = await database.restaurantTableDao.getTableById('tbl-2');
      expect(t1?.status, 'DISPONIBLE');
      expect(t2?.status, 'OCUPADA');
      expect(t2?.currentTicketId, ticketA.id);

      // 3. Park Comanda B on Mesa 3 (Terraza)
      final sodaItem = const CartItem(
        productId: 'p-soda',
        productName: 'Gaseosa Lata',
        quantity: 2,
        unitPrice: 35.0,
        taxRate: 0.15,
      );

      final ticketB = await tableOrderService.parkOrder(
        tableId: 'tbl-3',
        areaId: 'area-terraza',
        name: 'Mesa T1 - Bebidas',
        guestCount: 2,
        items: [sodaItem],
      );

      // 4. Merge Mesa 3 into Mesa 2
      final mergedTicket = await tableOrderService.mergeOrders(
        sourceTicketId: ticketB.id,
        targetTicketId: ticketA.id,
        targetExpectedVersion: 1,
      );

      // Mesa 3 must be freed, Mesa 2 holds merged ticket with 2 burgers + 2 sodas
      final t3 = await database.restaurantTableDao.getTableById('tbl-3');
      expect(t3?.status, 'DISPONIBLE');
      expect(mergedTicket.items.length, 2);
      expect(mergedTicket.items.fold<double>(0, (sum, i) => sum + i.quantity), 4.0);

      // 5. Liquidate Mesa 2
      await tableOrderService.liquidateOrder(mergedTicket.id);

      final t2After = await database.restaurantTableDao.getTableById('tbl-2');
      expect(t2After?.status, 'DISPONIBLE');
      expect(t2After?.currentTicketId, isNull);
    });

    test('Concurrency & Optimistic Lock: stale expectedVersion triggers OptimisticLockException', () async {
      final initialTicket = await tableOrderService.parkOrder(
        tableId: 'tbl-1',
        areaId: 'area-salon',
        name: 'Mesa 1 - Concurrencia',
        guestCount: 2,
        items: [
          const CartItem(productId: 'p-1', productName: 'Item 1', quantity: 1, unitPrice: 50.0, taxRate: 0.0),
        ],
      );

      expect(initialTicket.version, 1);

      // Tablet A updates ticket (expectedVersion = 1 -> version becomes 2)
      await tableOrderService.appendItemsToOrder(
        ticketId: initialTicket.id,
        newItems: [
          const CartItem(productId: 'p-2', productName: 'Item 2', quantity: 1, unitPrice: 60.0, taxRate: 0.0),
        ],
        expectedVersion: 1,
      );

      // Tablet B attempts update with stale expectedVersion = 1
      expect(
        () async => await tableOrderService.appendItemsToOrder(
          ticketId: initialTicket.id,
          newItems: [
            const CartItem(productId: 'p-3', productName: 'Item 3', quantity: 1, unitPrice: 70.0, taxRate: 0.0),
          ],
          expectedVersion: 1,
        ),
        throwsA(isA<OptimisticLockException>()),
      );
    });
  });
}
