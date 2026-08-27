import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:dio/dio.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/inventory/product_entity.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/models/sales/invoice_item_entity.dart';
import 'package:pos_app/data/models/sales/payment_entity.dart';
import 'package:pos_app/data/repositories/sales/sales_repository_impl.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/data/services/network_connectivity_service.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';

import 'multi_currency_checkout_e2e_test.mocks.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late AppDatabase database;
  late Dio dio;
  late MockAuditRepository mockAuditRepo;
  late MockInventoryRepository mockInventoryRepo;
  late MockProcessSaleInventoryUseCase mockProcessUseCase;
  late MockReverseSaleInventoryUseCase mockReverseUseCase;
  late MockSalesTransactionDao mockTransactionDao;
  late MockDgiNumberingService mockNumberingService;
  late MockMovementEngine mockMovementEngine;
  late MockAuthRepository mockAuthRepo;
  late SalesRepositoryImpl salesRepo;
  late NetworkConnectivityService connectivityService;
  late SyncService syncService;
  late SaleViewModel saleViewModel;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();

    // 1. Seed FX Rates and Configs in SQLite
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'commercial_exchange_rate', value: '36.50'),
    );
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'bcn_official_exchange_rate', value: '36.6241'),
    );
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'terminal_source_sequence_sales', value: '0'),
    );

    // 2. Seed initial catalog product
    await database.productDao.insertProducts([
      ProductEntity(
        id: 'prod-latte',
        name: 'Café Latte Clásico',
        category: 'Bebidas',
        sellPrice: 45.0,
        averageCost: 15.0,
        stock: 50.0,
        uom: 'CUP',
        isActive: true,
      ),
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
    when(mockAuditRepo.deviceId).thenReturn('terminal-pos-01');
    when(mockAuditRepo.syncLogs()).thenAnswer((_) async {});

    when(mockInventoryRepo.getActiveProducts()).thenAnswer(
      (_) async {
        final entities = await database.productDao.findAllActiveProducts();
        return entities
            .where((e) => e.isActive)
            .map((e) => Product(
                  id: e.id,
                  name: e.name,
                  category: e.category,
                  sellPrice: e.sellPrice,
                  averageCost: e.averageCost,
                  stock: e.stock,
                  uom: e.uom,
                  isActive: e.isActive,
                ))
            .toList();
      },
    );

    when(mockInventoryRepo.getProductById(any)).thenAnswer((_) async => null);
    when(mockInventoryRepo.getUnsyncedMovements()).thenAnswer((_) async => []);
    when(mockInventoryRepo.getUnsyncedPurchases()).thenAnswer((_) async => []);
    when(mockInventoryRepo.getUnsyncedRecipeVersionDocuments()).thenAnswer((_) async => []);
    when(mockInventoryRepo.getUnsyncedProductionOrders()).thenAnswer((_) async => []);
    when(mockInventoryRepo.getUnsyncedCountSessionDocuments()).thenAnswer((_) async => []);
    when(mockInventoryRepo.getUnsyncedForensicAlerts()).thenAnswer((_) async => []);
    when(mockProcessUseCase.execute(any)).thenAnswer((_) async => []);
    when(mockNumberingService.isRangeExhausted()).thenAnswer((_) async => false);

    var seq = 1;
    when(mockNumberingService.getNextNumber()).thenAnswer(
      (_) async => '001-001-01-${(seq++).toString().padLeft(8, '0')}',
    );
    when(mockTransactionDao.getNextInvoiceSourceSequence(any))
        .thenAnswer((_) async => seq);

    // Transaction DAO executes and persists real entities in SQLite
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
        id: 'u-cashier-1',
        name: 'Carlos Cajero',
        role: UserRole.cashier,
        isActive: true,
      ),
    );

    salesRepo = SalesRepositoryImpl(
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

    dio = Dio();
    connectivityService = NetworkConnectivityService(dio);
    syncService = SyncService(
      mockAuditRepo,
      salesRepo,
      mockInventoryRepo,
      dio,
      database: database,
      connectivityService: connectivityService,
    );

    saleViewModel = SaleViewModel(
      salesRepo,
      mockInventoryRepo,
      mockAuthRepo,
      database,
      null,
      false,
      null,
      null,
      null,
      null,
      syncService,
    );
  });

  tearDown(() async {
    syncService.dispose();
    connectivityService.dispose();
    saleViewModel.dispose();
    await database.close();
  });

  group('Bidirectional Cloud Sync Full E2E Lifecycle Suite', () {
    test('Offline sale in Outbox -> Network Online -> Outbox Pushed -> Inbound Delta updates Live Catalog', () async {
      // 1. Initial State: Catalog has 1 product
      await saleViewModel.loadProducts();
      expect(saleViewModel.products.length, 1);
      expect(saleViewModel.products.first.name, 'Café Latte Clásico');

      // 2. Add product to cart & tender exact amount
      final latte = saleViewModel.products.first;
      saleViewModel.addToCart(latte);

      final payment = Payment(
        id: 'pay-001',
        invoiceId: '',
        method: PaymentMethod.cash,
        amount: 45.0,
        currency: 'NIO',
        exchangeRate: 1.0,
        amountNio: 45.0,
        changeGiven: 0.0,
        changeCurrency: 'NIO',
        createdAt: DateTime.now(),
      );

      // 3. Complete Sale while OFFLINE
      connectivityService.setOnlineStateForTest(false);
      await saleViewModel.processSale([PaymentMethod.cash], customPayments: [payment]);

      // 4. Verify Local Outbox has 1 pending sales aggregate in Floor SQLite
      final pendingCount = await syncService.getPendingOutboxCount();
      expect(pendingCount, 1);

      final unsyncedAggregates = await salesRepo.getUnsyncedAggregates();
      expect(unsyncedAggregates.length, 1);
      final saleAggregate = unsyncedAggregates.first;
      expect(saleAggregate['documentType'], 'SALE');

      // 5. Configure Mock Backend for Network Recovery:
      // - Batch POST /v1/sync/batch succeeds and accepts the invoice
      // - Inbound GET /v1/sync/inbound/deltas returns new product created on Cloud Admin
      dio.interceptors.clear();
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            if (options.path == '/v1/sync/batch') {
              handler.resolve(
                Response<dynamic>(
                  statusCode: 200,
                  requestOptions: options,
                  data: {
                    'status': 'OK',
                    'received': 1,
                    'results': [
                      {
                        'idempotencyKey': saleAggregate['idempotencyKey'],
                        'terminalId': saleAggregate['terminalId'],
                        'flowType': 'sales',
                        'sourceSequence': saleAggregate['sourceSequence'],
                        'status': 'ACCEPTED',
                      },
                    ],
                  },
                ),
              );
              return;
            }

            if (options.path == '/v1/sync/inbound/deltas') {
              handler.resolve(
                Response<dynamic>(
                  statusCode: 200,
                  requestOptions: options,
                  data: {
                    'sinceVersion': 0,
                    'currentVersion': 2,
                    'serverTime': '2026-08-26T20:00:00Z',
                    'deltas': {
                      'products': [
                        {
                          'id': 'prod-taza-especial',
                          'name': 'Taza Café Especial Nube',
                          'category': 'Bebidas',
                          'uom': 'CUP',
                          'stock': 100.0,
                          'averageCost': 25.0,
                          'sellPrice': 85.0,
                          'isActive': true,
                        },
                      ],
                      'catalogValues': [],
                      'insumos': [],
                      'recipes': [],
                      'users': [],
                    },
                  },
                ),
              );
              return;
            }

            handler.resolve(
              Response<dynamic>(
                statusCode: 200,
                requestOptions: options,
                data: {'ok': true},
              ),
            );
          },
        ),
      );

      // 6. Network Reconnection: Trigger Full Bidirectional Sync
      connectivityService.setOnlineStateForTest(true);
      await syncService.triggerManualSync();

      // 7. Verify Outbox State: Invoice is marked synced in SQLite
      final unsyncedAfter = await salesRepo.getUnsyncedAggregates();
      expect(unsyncedAfter, isEmpty);
      final remainingPending = await syncService.getPendingOutboxCount();
      expect(remainingPending, 0);

      // 8. Verify Inbound Hydration & Live Reactive Update in SaleViewModel:
      // SaleViewModel automatically reloads its catalog through onInboundSync subscription!
      await Future<void>.delayed(Duration.zero);
      expect(saleViewModel.products.length, 2);
      expect(
        saleViewModel.products.map((p) => p.name),
        containsAll(['Café Latte Clásico', 'Taza Café Especial Nube']),
      );

      // 9. Verify Watermark was persisted in local_configs
      final savedVersion = await database.localConfigDao.getConfigByKey('last_inbound_sync_version');
      expect(savedVersion?.value, '2');
    });
  });
}
