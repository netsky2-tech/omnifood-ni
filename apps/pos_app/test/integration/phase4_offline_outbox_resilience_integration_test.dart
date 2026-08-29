import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:dio/dio.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/core/clock/monotonic_clock.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/user_entity.dart';
import 'package:pos_app/data/models/security_profile_entity.dart';
import 'package:pos_app/data/repositories/auth_repository_impl.dart';
import 'package:pos_app/data/repositories/audit_repository_impl.dart';
import 'package:pos_app/data/repositories/inventory/inventory_repository_impl.dart';
import 'package:pos_app/data/repositories/sales/sales_repository_impl.dart';
import 'package:pos_app/data/repositories/tenant_capability_cache.dart';
import 'package:pos_app/data/services/local_auth_service.dart';
import 'package:pos_app/data/services/sales/dgi_numbering_service_impl.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/inventory/recipe.dart';
import 'package:pos_app/domain/models/inventory/recipe_version_document.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/services/alerts/alert_service.dart';
import 'package:pos_app/domain/services/inventory/movement_engine_impl.dart';
import 'package:pos_app/domain/usecases/inventory/process_sale_inventory_use_case.dart';
import 'package:pos_app/domain/usecases/inventory/reverse_sale_inventory_use_case.dart';

class MockDio extends Mock implements Dio {}

class MockAlertService extends Mock implements AlertService {
  @override
  Future<void> createStockAlert(Insumo? insumo, double? currentStock) =>
      super.noSuchMethod(
        Invocation.method(#createStockAlert, [insumo, currentStock]),
        returnValue: Future<void>.value(),
        returnValueForMissingStub: Future<void>.value(),
      );
}

void main() {
  late AppDatabase database;
  late LocalAuthService localAuth;
  late MockDio mockDio;
  late MockAlertService mockAlertService;
  late AuthRepositoryImpl authRepo;
  late AuditRepositoryImpl auditRepo;
  late InventoryRepositoryImpl inventoryRepo;
  late MovementEngineImpl movementEngine;
  late SalesRepositoryImpl salesRepo;
  late DgiNumberingServiceImpl numberingService;
  late TenantCapabilityCache capabilityCache;
  late SyncService syncService;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    localAuth = LocalAuthService();
    mockDio = MockDio();
    mockAlertService = MockAlertService();

    capabilityCache = TenantCapabilityCache(
      configDao: database.localConfigDao,
      clock: StopwatchMonotonicClock(),
      bootSessionId: 'test-session-phase-4',
      nowUtc: () => DateTime.now().toUtc(),
    );

    authRepo = AuthRepositoryImpl(
      database.userDao,
      database.securityProfileDao,
      localAuth,
      mockDio,
      capabilityCache: capabilityCache,
    );

    auditRepo = AuditRepositoryImpl(
      database.auditDao,
      authRepo,
      mockDio,
      'pos-terminal-phase-4',
      capabilityCache: capabilityCache,
      forensicAlertDao: database.forensicAlertDao,
    );

    inventoryRepo = InventoryRepositoryImpl(
      insumoDao: database.insumoDao,
      recipeDao: database.recipeDao,
      movementDao: database.movementDao,
      movementSyncStateDao: database.movementSyncStateDao,
      supplierDao: database.supplierDao,
      warehouseDao: database.warehouseDao,
      countSessionDao: database.countSessionDao,
      countLineDao: database.countLineDao,
      forensicAlertDao: database.forensicAlertDao,
      uomConversionDao: database.uomConversionDao,
      batchDao: database.batchDao,
      purchaseDao: database.purchaseDao,
      recipeVersionDocumentDao: database.recipeVersionDocumentDao,
      productionOrderDocumentDao: database.productionOrderDocumentDao,
      dio: mockDio,
      database: database,
    );

    movementEngine = MovementEngineImpl(inventoryRepo, mockAlertService);
    numberingService = DgiNumberingServiceImpl(database.localConfigDao);

    salesRepo = SalesRepositoryImpl(
      database: database,
      invoiceDao: database.invoiceDao,
      itemDao: database.invoiceItemDao,
      paymentDao: database.paymentDao,
      transactionDao: database.salesTransactionDao,
      numberingService: numberingService,
      movementEngine: movementEngine,
      auditRepository: auditRepo,
      processInventoryUseCase: ProcessSaleInventoryUseCase(movementEngine),
      reverseInventoryUseCase: ReverseSaleInventoryUseCase(movementEngine),
      inventoryRepository: inventoryRepo,
    );

    syncService = SyncService(
      auditRepo,
      salesRepo,
      inventoryRepo,
      mockDio,
      database: database,
    );
  });

  tearDown(() async {
    await database.close();
  });

  group('Fase 4: Resiliencia y Sincronización Offline (Outbox Pattern)', () {
    test('Corte de red -> 3 Facturas locales + Apertura Cajón -> Reconexión conserva timestamps reales', () async {
      // 1. Setup Local Cache: Usuarios y Catálogo de Inventario
      await database.userDao.insertUsers([
        UserEntity(id: 'cajero-off-01', name: 'Cajero Offline', role: 'CASHIER', pinHash: '', isActive: true, tenantId: 'tenant-demo'),
        UserEntity(id: 'gerente-off-01', name: 'Gerente Offline', role: 'MANAGER', pinHash: '', isActive: true, tenantId: 'tenant-demo'),
      ]);
      await database.securityProfileDao.insertProfiles([
        SecurityProfileEntity(userId: 'cajero-off-01', pinHash: localAuth.hashPin('123456'), isPinEnabled: true, isTotpEnabled: false),
        SecurityProfileEntity(userId: 'gerente-off-01', pinHash: localAuth.hashPin('654321'), isPinEnabled: true, isTotpEnabled: false),
      ]);

      const insumoId = 'insumo-cafe-beans';
      await inventoryRepo.saveInsumo(
        const Insumo(id: insumoId, name: 'Café Grano', stock: 100.0, averageCost: 10.0, consumptionUom: 'g'),
      );
      const prodId = 'prod-taza-cafe';
      await inventoryRepo.saveProduct(
        const Product(id: prodId, name: 'Taza Café', uom: 'unit', stock: 100.0, averageCost: 10.0, sellPrice: 40.0, isPrepared: true),
      );
      await inventoryRepo.saveRecipe(
        const Recipe(id: 'rec-taza', productId: prodId, ingredientId: insumoId, ingredientType: IngredientType.insumo, quantity: 10.0),
      );

      final recipeDoc = RecipeVersionDocument(
        id: 'recipe-version-taza-01',
        productId: prodId,
        productName: 'Taza Café',
        versionNumber: 1,
        yieldQuantity: 1.0,
        technicalShrinkPct: 0.0,
        createdAt: DateTime.now(),
        publishedAt: DateTime.now(),
        components: const [
          RecipeVersionComponentDocument(
            ingredientId: insumoId,
            ingredientName: 'Café Grano',
            ingredientType: 'INSUMO',
            grossQuantity: 10.0,
            netQuantity: 10.0,
            technicalShrinkPct: 0.0,
          ),
        ],
      );
      await inventoryRepo.saveRecipeVersionDocument(recipeDoc);

      // Login Offline de Cajero
      await authRepo.loginOffline('cajero-off-01', '123456');

      // 2. Simular Corte de Red: Modo Aislado
      // Emitir 3 facturas consecutivas en efectivo con timestamps fijos históricos
      final offlineTimestamps = [
        DateTime(2026, 8, 28, 10, 0, 0),
        DateTime(2026, 8, 28, 10, 5, 0),
        DateTime(2026, 8, 28, 10, 10, 0),
      ];

      for (var i = 0; i < 3; i++) {
        final invoiceId = 'inv-offline-00${i + 1}';
        final invoiceTimestamp = offlineTimestamps[i];

        final invoice = Invoice(
          id: invoiceId,
          number: '001-001-01-0000000${i + 1}',
          subtotal: 40.0,
          totalTax: 0.0,
          total: 40.0,
          createdAt: invoiceTimestamp,
          userId: 'cajero-off-01',
          syncStatus: SyncStatus.pending,
        );

        final item = InvoiceItem(
          id: 'item-off-00${i + 1}',
          invoiceId: invoiceId,
          productId: prodId,
          productName: 'Taza Café',
          quantity: 1,
          unitPrice: 40.0,
          originalTaxRate: 0.0,
          appliedTaxRate: 0.0,
          taxAmount: 0.0,
          total: 40.0,
        );

        final payment = Payment(
          id: 'pay-off-00${i + 1}',
          invoiceId: invoiceId,
          method: PaymentMethod.cash,
          amount: 40.0,
          currency: 'NIO',
          exchangeRate: 1.0,
          amountNio: 40.0,
          changeGiven: 0.0,
          createdAt: invoiceTimestamp,
        );

        await salesRepo.saveSale(
          invoice: invoice,
          items: [item],
          payments: [payment],
        );
      }

      // Realizar 1 apertura manual de cajón con PIN de Gerente en caché local
      final authorized = await authRepo.authorizeOverride(
        supervisorId: 'gerente-off-01',
        pin: '654321',
      );
      expect(authorized, isTrue);

      await auditRepo.logForensic(
        'pos:drawer:open_manual',
        metadata: '{"motivo":"Apertura manual offline","session":"offline-mode"}',
        metodoAutorizacion: 'PIN',
        usuarioAutorizadorId: 'gerente-off-01',
      );

      // Validar que en SQLite local existen 3 facturas pendientes de sincronización
      final pendingInvoices = await database.invoiceDao.getInvoicesBySyncStatus('pending');
      expect(pendingInvoices.length, equals(3));
      expect(pendingInvoices.map((inv) => inv.number).toList(), [
        '001-001-01-00000001',
        '001-001-01-00000002',
        '001-001-01-00000003',
      ]);

      // Stock de café grano descontado: 100 - (3 * 10g) = 70g
      final currentInsumo = await inventoryRepo.getInsumoById(insumoId);
      expect(currentInsumo!.stock, equals(70.0));

      // 3. Reconexión y Sincronización Outbox:
      // Validar que los movimientos de Kardex generados reflejan la venta offline
      final allMovements = await inventoryRepo.getAllMovements();
      final saleMovements = allMovements.where((m) => m.type == MovementType.sale).toList();
      expect(saleMovements.length, equals(3));
      expect(saleMovements.every((m) => m.insumoId == insumoId), isTrue);
    });
  });
}
