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
import 'package:pos_app/domain/models/config/tenant_config.dart';
import 'package:pos_app/domain/models/config/tenant_operation_mode.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/sales/cashier_session.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/services/config/tenant_config_service.dart';
import 'package:pos_app/domain/services/sales/split_bill_engine.dart';
import 'package:pos_app/domain/services/sales/table_order_service.dart';
import 'package:pos_app/domain/services/sales/tip_engine.dart';
import 'package:pos_app/domain/services/sales/waiter_settlement_service.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/features/sales/tables/table_layout_view_model.dart';

import 'multi_currency_checkout_e2e_test.mocks.dart';

class FakeTenantConfigService extends TenantConfigService {
  final TenantConfig _config;
  FakeTenantConfigService(super.localConfigDao, {TenantConfig config = const TenantConfig()})
      : _config = config;

  @override
  Future<TenantConfig> getTenantConfig() async => _config;

  @override
  Stream<TenantOperationMode> get onOperationModeChanged => const Stream.empty();
}

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
  late FakeTenantConfigService fakeTenantConfigService;
  late SalesRepositoryImpl salesRepository;
  late TableOrderService tableOrderService;
  late WaiterSettlementService waiterSettlementService;
  late SaleViewModel saleViewModel;
  late TableLayoutViewModel tableLayoutViewModel;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();

    // 1. Local FX Config
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'commercial_exchange_rate', value: '36.50'),
    );
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'bcn_official_exchange_rate', value: '36.6241'),
    );

    // 2. Restaurant Areas & Tables
    await database.restaurantAreaDao.insertAreas([
      RestaurantAreaEntity(id: 'area-salon', name: 'Salón Principal', displayOrder: 1),
      RestaurantAreaEntity(id: 'area-terraza', name: 'Terraza Exterior', displayOrder: 2),
    ]);

    await database.restaurantTableDao.insertTables([
      RestaurantTableEntity(id: 'tbl-1', areaId: 'area-salon', tableNumber: 'Mesa 1', capacity: 4),
      RestaurantTableEntity(id: 'tbl-2', areaId: 'area-salon', tableNumber: 'Mesa 2', capacity: 6),
      RestaurantTableEntity(id: 'tbl-3', areaId: 'area-terraza', tableNumber: 'Mesa T1', capacity: 4),
    ]);

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
    when(mockTransactionDao.getNextInvoiceSourceSequence(any)).thenAnswer((_) async => seq);

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
        id: 'u-waiter-carlos',
        name: 'Carlos Mesero',
        role: UserRole.cashier,
        isActive: true,
      ),
    );

    tableOrderService = TableOrderService(database);
    waiterSettlementService = WaiterSettlementService(database);
    fakeTenantConfigService = FakeTenantConfigService(
      database.localConfigDao,
      config: const TenantConfig(
        operationMode: TenantOperationMode.restaurant,
        tenantName: 'Restaurante El Güegüense',
      ),
    );

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
      fakeTenantConfigService,
    );

    tableLayoutViewModel = TableLayoutViewModel(
      database: database,
      tableOrderService: tableOrderService,
      autoLoad: false,
    );
  });

  tearDown(() async {
    await database.close();
  });

  group('Full Restaurant E2E Lifecycle: Shift -> Table -> Transfer -> Split & Tip -> Settlement', () {
    test('End-to-End Restaurant Flow with Split Bill & Waiter Settlement', () async {
      // Step 1: Open Waiter Shift (CARTERA_MESERO)
      await saleViewModel.openSession(
        500.0,
        tipoModelo: CashSessionModel.carteraMesero,
      );
      final openedShift = saleViewModel.activeSession;
      expect(openedShift, isNotNull);
      expect(openedShift!.tipoModelo, CashSessionModel.carteraMesero);

      // Step 2: Park Order on Mesa 1 (4 guests)
      const pizza = Product(
        id: 'p-pizza',
        name: 'Pizza Suprema',
        uom: 'UND',
        stock: 50.0,
        averageCost: 100.0,
        sellPrice: 250.00,
      );
      const beverage = Product(
        id: 'p-coke',
        name: 'Gaseosa 500ml',
        uom: 'UND',
        stock: 100.0,
        averageCost: 25.0,
        sellPrice: 50.00,
      );

      saleViewModel.addToCart(pizza, quantity: 2); // 500
      saleViewModel.addToCart(beverage, quantity: 4); // 200 -> Subtotal: 700.00 NIO

      final parkedTicket = await tableOrderService.parkOrder(
        name: 'Mesa 1',
        tableId: 'tbl-1',
        areaId: 'area-salon',
        waiterId: 'u-waiter-carlos',
        waiterName: 'Carlos Mesero',
        guestCount: 4,
        items: saleViewModel.cart,
      );
      expect(parkedTicket.tableId, 'tbl-1');
      expect(parkedTicket.items.length, 2);

      // Verify Mesa 1 is OCUPADA
      final tbl1 = await database.restaurantTableDao.getTableById('tbl-1');
      expect(tbl1?.status, 'OCUPADA');

      // Step 3: Transfer Mesa 1 to Mesa T1 (Terraza)
      final transferred = await tableOrderService.transferOrder(
        ticketId: parkedTicket.id,
        sourceTableId: 'tbl-1',
        targetTableId: 'tbl-3',
      );
      expect(transferred.tableId, 'tbl-3');

      final tbl1After = await database.restaurantTableDao.getTableById('tbl-1');
      final tbl3After = await database.restaurantTableDao.getTableById('tbl-3');
      expect(tbl1After?.status, 'DISPONIBLE');
      expect(tbl3After?.status, 'OCUPADA');

      // Step 4: Split Bill Calculation for 4 covers with 10% voluntary tip
      // Subtotal: 700.00, Tax 15%: 105.00, Tip (10% of 700): 70.00 -> Grand Total: 875.00
      saleViewModel.setTip(tipType: TipType.suggestedTenPercent);
      expect(saleViewModel.tipAmount, 70.00);
      expect(saleViewModel.grandTotalWithTip, 875.00);

      final splitResult = saleViewModel.calculateEqualSplit(4);
      expect(splitResult.shares.length, 4);
      expect(splitResult.totalDistributedNio, 875.00);

      for (final share in splitResult.shares) {
        expect(share.totalNio, 218.75); // 875 / 4
        expect(share.tipNio, 17.50); // 70 / 4
      }

      // Step 5: Pay shares and emit invoices
      // Share 1 & 2 pay Cash (218.75 each = 437.50)
      // Share 3 & 4 pay Card (218.75 each = 437.50)
      final now = DateTime.now().millisecondsSinceEpoch;
      await database.invoiceDao.insertInvoice(
        InvoiceEntity(
          id: 'inv-share-1',
          number: '001-001-01-00000001',
          createdAt: now,
          userId: 'u-waiter-carlos',
          subtotal: 175.0,
          totalTax: 26.25,
          total: 218.75,
        ),
      );
      await database.paymentDao.insertPayments([
        PaymentEntity(
          id: 'pay-share-1',
          invoiceId: 'inv-share-1',
          method: 'cash',
          amount: 218.75,
          currency: 'NIO',
          exchangeRate: 1.0,
          amountNio: 218.75,
        ),
      ]);

      await database.invoiceDao.insertInvoice(
        InvoiceEntity(
          id: 'inv-share-2',
          number: '001-001-01-00000002',
          createdAt: now,
          userId: 'u-waiter-carlos',
          subtotal: 175.0,
          totalTax: 26.25,
          total: 218.75,
        ),
      );
      await database.paymentDao.insertPayments([
        PaymentEntity(
          id: 'pay-share-2',
          invoiceId: 'inv-share-2',
          method: 'cash',
          amount: 218.75,
          currency: 'NIO',
          exchangeRate: 1.0,
          amountNio: 218.75,
        ),
      ]);

      await database.invoiceDao.insertInvoice(
        InvoiceEntity(
          id: 'inv-share-3',
          number: '001-001-01-00000003',
          createdAt: now,
          userId: 'u-waiter-carlos',
          subtotal: 175.0,
          totalTax: 26.25,
          total: 218.75,
        ),
      );
      await database.paymentDao.insertPayments([
        PaymentEntity(
          id: 'pay-share-3',
          invoiceId: 'inv-share-3',
          method: 'card',
          amount: 218.75,
          currency: 'NIO',
          exchangeRate: 1.0,
          amountNio: 218.75,
          bankPos: 'BAC',
          cardBrand: 'VISA',
          reconciliationStatus: 'CONCILIADO',
        ),
      ]);

      await database.invoiceDao.insertInvoice(
        InvoiceEntity(
          id: 'inv-share-4',
          number: '001-001-01-00000004',
          createdAt: now,
          userId: 'u-waiter-carlos',
          subtotal: 175.0,
          totalTax: 26.25,
          total: 218.75,
        ),
      );
      await database.paymentDao.insertPayments([
        PaymentEntity(
          id: 'pay-share-4',
          invoiceId: 'inv-share-4',
          method: 'card',
          amount: 218.75,
          currency: 'NIO',
          exchangeRate: 1.0,
          amountNio: 218.75,
          bankPos: 'BAC',
          cardBrand: 'VISA',
          reconciliationStatus: 'CONCILIADO',
        ),
      ]);

      // Liquidate Table Order
      await tableOrderService.liquidateOrder(parkedTicket.id);

      final tbl3Final = await database.restaurantTableDao.getTableById('tbl-3');
      expect(tbl3Final?.status, 'DISPONIBLE');

      // Step 6: Waiter Settlement Report & Shift Closure
      final settlementReport = await waiterSettlementService.calculateSettlement(
        shiftId: openedShift.id,
        waiterUserId: 'u-waiter-carlos',
      );

      expect(settlementReport.invoicesCount, 4);
      expect(settlementReport.totalSalesNio, 875.0);
      expect(settlementReport.totalCashCollectedNio, 437.50);
      expect(settlementReport.totalCardCollectedNio, 437.50);
      expect(settlementReport.hasOpenTables, isFalse);
      expect(settlementReport.canCloseShift, isTrue);

      final closedShift = await waiterSettlementService.closeWaiterShift(
        shiftId: openedShift.id,
        waiterUserId: 'u-waiter-carlos',
        declaredCashNio: 500.0 + 437.50, // Float + Collected Cash
      );

      expect(closedShift.isClosed, isTrue);
      expect(closedShift.closingCountedNio, 937.50);
    });
  });
}
