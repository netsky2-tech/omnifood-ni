import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/data/repositories/sales/sales_repository_impl.dart';
import 'package:pos_app/domain/models/config/tenant_config.dart';
import 'package:pos_app/domain/models/config/tenant_operation_mode.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/services/config/tenant_config_service.dart';
import 'package:pos_app/domain/services/sales/split_bill_engine.dart';
import 'package:pos_app/domain/services/sales/table_order_service.dart';
import 'package:pos_app/domain/services/sales/tip_engine.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';

import 'multi_currency_checkout_e2e_test.mocks.dart';

class FakeTenantConfigService extends TenantConfigService {
  TenantConfig _config;

  FakeTenantConfigService(super.localConfigDao, {TenantConfig config = const TenantConfig()})
      : _config = config;

  void setConfig(TenantConfig config) {
    _config = config;
  }

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
  late SaleViewModel saleViewModel;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();

    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'commercial_exchange_rate', value: '36.50'),
    );
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'bcn_official_exchange_rate', value: '36.6241'),
    );

    final now = DateTime.now().millisecondsSinceEpoch;
    await database.cashierSessionDao.insertSession(
      CashierSessionEntity(
        id: 'shift-split-01',
        userId: 'u-waiter-01',
        terminalId: 'POS-REST-01',
        openedAt: now,
        tipoModelo: 'CAJA_CENTRAL',
        openingBalanceNio: 1000.0,
        openingBalanceUsd: 50.0,
        isClosed: false,
        syncStatus: 'synced',
      ),
    );

    mockAuditRepo = MockAuditRepository();
    mockInventoryRepo = MockInventoryRepository();
    mockProcessUseCase = MockProcessSaleInventoryUseCase();
    mockReverseUseCase = MockReverseSaleInventoryUseCase();
    mockTransactionDao = MockSalesTransactionDao();
    mockNumberingService = MockDgiNumberingService();
    mockMovementEngine = MockMovementEngine();
    mockAuthRepo = MockAuthRepository();
    fakeTenantConfigService = FakeTenantConfigService(database.localConfigDao);

    when(mockAuditRepo.log(any)).thenAnswer((_) async {});
    when(mockInventoryRepo.getActiveProducts()).thenAnswer((_) async => []);
    when(mockInventoryRepo.getProductById(any)).thenAnswer((_) async => null);
    when(mockProcessUseCase.execute(any)).thenAnswer((_) async => []);
    when(mockNumberingService.isRangeExhausted()).thenAnswer((_) async => false);

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

    tableOrderService = TableOrderService(database);
  });

  tearDown(() async {
    await database.close();
  });

  group('Split Bill & Tip Integration Flow - SaleViewModel Evaluation', () {
    test('Flow 1: Food Park QSR mode evaluates fast counter workflow with split bills disabled', () async {
      fakeTenantConfigService.setConfig(
        const TenantConfig(
          operationMode: TenantOperationMode.foodparkQsr,
          tenantName: 'QSR Food Park Express',
        ),
      );

      saleViewModel = SaleViewModel(
        salesRepository,
        mockInventoryRepo,
        mockAuthRepo,
        database,
        tableOrderService,
        false, // autoLoad
        fakeTenantConfigService,
      );

      await saleViewModel.loadTenantConfig();

      final evaluator = saleViewModel.businessModeEvaluator;
      expect(evaluator.isFoodParkQsr, isTrue);
      expect(evaluator.canUseTableService, isFalse);
      expect(evaluator.canUseBuzzerPager, isTrue);
      expect(evaluator.isSplitBillAllowed, isFalse);
      expect(evaluator.isSuggestedTipPromptEnabled, isFalse);
    });

    test('Flow 2: Restaurant mode evaluates table service, computes 10% voluntary tip & splits equally', () async {
      fakeTenantConfigService.setConfig(
        const TenantConfig(
          operationMode: TenantOperationMode.restaurant,
          tenantName: 'Restaurante Managua Gourmet',
        ),
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

      await saleViewModel.loadTenantConfig();

      final evaluator = saleViewModel.businessModeEvaluator;
      expect(evaluator.isRestaurant, isTrue);
      expect(evaluator.canUseTableService, isTrue);
      expect(evaluator.isSplitBillAllowed, isTrue);
      expect(evaluator.isSuggestedTipPromptEnabled, isTrue);

      // Add items to cart: 2 Pizzas (C$ 250 each = 500) + 2 Bebidas (C$ 50 each = 100)
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

      saleViewModel.addToCart(pizza, quantity: 2);
      saleViewModel.addToCart(beverage, quantity: 2);

      // Subtotal: 600.00 NIO, Tax (15%): 90.00 NIO, Total: 690.00 NIO
      expect(saleViewModel.subtotal, 600.00);
      expect(saleViewModel.totalTax, 90.00);
      expect(saleViewModel.total, 690.00);

      // Set voluntary 10% tip
      saleViewModel.setTip(tipType: TipType.suggestedTenPercent);
      expect(saleViewModel.tipAmount, 60.00); // 10% of 600
      expect(saleViewModel.grandTotalWithTip, 750.00); // 600 + 90 + 60

      // Split 3 equal covers
      final splitResult = saleViewModel.calculateEqualSplit(3);
      expect(splitResult.shares.length, 3);
      expect(splitResult.totalDistributedNio, 750.00);

      for (final share in splitResult.shares) {
        expect(share.subtotalNio, 200.00); // 600 / 3
        expect(share.taxNio, 30.00); // 90 / 3
        expect(share.tipNio, 20.00); // 60 / 3
        expect(share.totalNio, 250.00); // 750 / 3
      }
    });

    test('Flow 3: Hybrid mode calculates itemized split across covers with distinct consumption', () async {
      fakeTenantConfigService.setConfig(
        const TenantConfig(
          operationMode: TenantOperationMode.hybrid,
          tenantName: 'Bistro & Counter Híbrido',
        ),
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

      await saleViewModel.loadTenantConfig();

      final evaluator = saleViewModel.businessModeEvaluator;
      expect(evaluator.isHybrid, isTrue);
      expect(evaluator.canUseTableService, isTrue);
      expect(evaluator.canUseBuzzerPager, isTrue);

      const itemSteak = CartItem(
        productId: 'p-steak',
        productName: 'Churrasco 12oz',
        unitPrice: 350.00,
        quantity: 1,
        taxRate: 0.15,
      );

      const itemWine = CartItem(
        productId: 'p-wine',
        productName: 'Copa de Vino Tinto',
        unitPrice: 150.00,
        quantity: 2,
        taxRate: 0.15,
      );

      final sharesInput = [
        const ItemizedShareInput(
          shareIndex: 1,
          label: 'Mesa 4 - Comensal 1 (Churrasco)',
          items: [itemSteak],
          tipType: TipType.suggestedTenPercent,
        ),
        const ItemizedShareInput(
          shareIndex: 2,
          label: 'Mesa 4 - Comensal 2 (Vinos)',
          items: [itemWine],
          tipType: TipType.customPercentage,
          customTipPercentage: 15.0,
        ),
      ];

      final splitResult = saleViewModel.calculateItemizedSplit(sharesInput);
      expect(splitResult.shares.length, 2);

      // Comensal 1: Subtotal 350.00, Tax (15%) 52.50, Tip (10%) 35.00 -> Total 437.50
      final s1 = splitResult.shares[0];
      expect(s1.subtotalNio, 350.00);
      expect(s1.taxNio, 52.50);
      expect(s1.tipNio, 35.00);
      expect(s1.totalNio, 437.50);

      // Comensal 2: Subtotal 300.00 (150*2), Tax (15%) 45.00, Tip (15%) 45.00 -> Total 390.00
      final s2 = splitResult.shares[1];
      expect(s2.subtotalNio, 300.00);
      expect(s2.taxNio, 45.00);
      expect(s2.tipNio, 45.00);
      expect(s2.totalNio, 390.00);

      expect(splitResult.totalDistributedNio, 827.50);
    });
  });
}
