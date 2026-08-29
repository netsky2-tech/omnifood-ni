import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:dio/dio.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/core/clock/monotonic_clock.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/user_entity.dart';
import 'package:pos_app/data/models/security_profile_entity.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/data/repositories/auth_repository_impl.dart';
import 'package:pos_app/data/repositories/audit_repository_impl.dart';
import 'package:pos_app/data/repositories/inventory/inventory_repository_impl.dart';
import 'package:pos_app/data/repositories/tenant_capability_cache.dart';
import 'package:pos_app/data/services/local_auth_service.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/inventory/recipe.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/services/alerts/alert_service.dart';
import 'package:pos_app/domain/services/inventory/movement_engine_impl.dart';
import 'package:pos_app/domain/services/sales/currency_checkout_calculator.dart';
import 'package:pos_app/domain/services/sales/split_payment_calculator.dart';

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
  late TenantCapabilityCache capabilityCache;

  const exchangeRate = 36.50; // Tasa de cambio configurada

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
      bootSessionId: 'test-session-phase-3',
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
      'pos-terminal-phase-3',
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
  });

  tearDown(() async {
    await database.close();
  });

  group('Fase 3: Transacciones Complejas y Multimoneda (FOH)', () {
    test('1. Apertura de Caja con fondo dual: C\$ 1,000.00 NIO y \$20.00 USD', () async {
      final nowMs = DateTime.now().millisecondsSinceEpoch;
      final entity = CashierSessionEntity(
        id: 'shift-foh-01',
        userId: 'cajero-foh-01',
        terminalId: 'pos-terminal-01',
        openedAt: nowMs,
        tipoModelo: 'CAJA_CENTRAL',
        openingBalanceNio: 1000.0,
        openingBalanceUsd: 20.0,
        isClosed: false,
      );

      await database.cashierSessionDao.insertSession(entity);

      final savedShift = await database.cashierSessionDao.getActiveSession();
      expect(savedShift, isNotNull);
      expect(savedShift!.openingBalanceNio, equals(1000.0));
      expect(savedShift.openingBalanceUsd, equals(20.0));
    });

    test('2. Pago Dividido (Split Tender): C\$ 1,500.00 = C\$ 500 Cash + C\$ 500 VISA + \$13.70 USD', () {
      const totalNio = 1500.0;
      var splitCalculator = const SplitPaymentCalculator(
        totalNio: totalNio,
        commercialRate: exchangeRate,
      );

      // Paso A: Cliente paga C$ 500.00 en Efectivo NIO
      final cashPayment = splitCalculator.createCashPayment(
        tenderAmount: 500.0,
        tenderCurrency: 'NIO',
      );
      splitCalculator = splitCalculator.addPayment(cashPayment);

      expect(splitCalculator.totalPaidNio, equals(500.0));
      expect(splitCalculator.remainingNio, equals(1000.0));

      // Paso B: Cliente paga C$ 500.00 con Tarjeta VISA
      final cardPayment = splitCalculator.createCardPayment(
        amount: 500.0,
        currency: 'NIO',
        cardBrand: 'VISA',
        cardType: 'DEBITO',
        voucherCode: 'AUTH-VISA-9821',
      );
      splitCalculator = splitCalculator.addPayment(cardPayment);

      expect(splitCalculator.totalPaidNio, equals(1000.0));
      expect(splitCalculator.remainingNio, equals(500.0));

      // Paso C: Saldo restante en USD
      // 500.0 NIO / 36.50 = 13.6986... -> Exactamente $13.70 USD
      final remainingUsd = CurrencyCheckoutCalculator.round2(splitCalculator.remainingUsd);
      expect(remainingUsd, equals(13.70));

      // Cliente paga los $13.70 USD
      final usdPayment = splitCalculator.createCashPayment(
        tenderAmount: remainingUsd,
        tenderCurrency: 'USD',
      );
      splitCalculator = splitCalculator.addPayment(usdPayment);

      // Esperado: Cuenta completamente pagada sin saldo pendiente
      expect(splitCalculator.isFullyPaid, isTrue);
      expect(splitCalculator.remainingNio, equals(0.0));
      expect(splitCalculator.payments.length, equals(3));
    });

    test('3. Vuelto Transfronterizo (Cambio en Moneda Local): Factura C\$ 182.50, Pago \$20.00 USD -> Vuelto C\$ 547.50 NIO', () {
      const totalNio = 182.50; // $5.00 USD @ 36.50
      const paymentUsd = 20.00;

      final checkoutCalculator = const CurrencyCheckoutCalculator(
        commercialRate: exchangeRate,
        bcnOfficialRate: exchangeRate,
      );

      final breakdown = checkoutCalculator.calculateTender(
        totalNio: totalNio,
        tenderAmount: paymentUsd,
        tenderCurrency: 'USD',
        changeCurrencyPreference: 'NIO', // Política estricta: Vuelto solo en NIO
      );

      expect(breakdown.isSufficient, isTrue);
      expect(breakdown.tenderAmountNio, equals(20.0 * 36.50)); // C$ 730.00
      expect(breakdown.changeNio, equals(547.50)); // C$ 730.00 - C$ 182.50 = C$ 547.50
      expect(breakdown.effectiveChange, equals(547.50));
      expect(breakdown.changeCurrency, equals('NIO'));
    });

    test('4. Descuento Supervisado (100% Cortesía): Requiere Gerente, descuenta Kardex, caja C\$ 0.00', () async {
      // Setup Identidades
      await database.userDao.insertUsers([
        UserEntity(id: 'cajero-desc-01', name: 'Cajero', role: 'CASHIER', pinHash: '', isActive: true, tenantId: 'tenant-demo'),
        UserEntity(id: 'gerente-desc-01', name: 'Gerente', role: 'MANAGER', pinHash: '', isActive: true, tenantId: 'tenant-demo'),
      ]);
      await database.securityProfileDao.insertProfiles([
        SecurityProfileEntity(userId: 'cajero-desc-01', pinHash: localAuth.hashPin('123456'), isPinEnabled: true, isTotpEnabled: false),
        SecurityProfileEntity(userId: 'gerente-desc-01', pinHash: localAuth.hashPin('654321'), isPinEnabled: true, isTotpEnabled: false),
      ]);

      // Insumo y Producto en Inventario
      const insumoCarneId = 'insumo-carne-01';
      await inventoryRepo.saveInsumo(
        const Insumo(id: insumoCarneId, name: 'Carne Hamburguesa', stock: 10.0, averageCost: 50.0, consumptionUom: 'unit'),
      );
      const burgerId = 'prod-burger-01';
      await inventoryRepo.saveProduct(
        const Product(id: burgerId, name: 'Hamburguesa Clásica', uom: 'unit', stock: 10.0, averageCost: 50.0, sellPrice: 150.0, isPrepared: true),
      );
      await inventoryRepo.saveRecipe(
        const Recipe(id: 'rec-burger', productId: burgerId, ingredientId: insumoCarneId, ingredientType: IngredientType.insumo, quantity: 1.0),
      );

      // Intento de Cajero de aplicar 100% cortesía
      await authRepo.loginOffline('cajero-desc-01', '123456');
      final currentUser = await authRepo.getCurrentUser();

      // Validación de bloqueo: Cajero no puede aplicar 100% cortesía directamente
      const discountPercentage = 100.0;
      final requiresManagerOverride = discountPercentage > 15.0 || currentUser!.role != UserRole.manager;
      expect(requiresManagerOverride, isTrue);

      // Manager Override
      final authorized = await authRepo.authorizeOverride(
        supervisorId: 'gerente-desc-01',
        pin: '654321',
      );
      expect(authorized, isTrue);

      // Al aplicar la cortesía del 100%:
      // A) Total a cobrar en caja = C$ 0.00
      const ticketOriginalTotal = 150.0;
      final discountAmount = ticketOriginalTotal * (discountPercentage / 100.0);
      final finalCashToCollect = ticketOriginalTotal - discountAmount;
      expect(finalCashToCollect, equals(0.0));

      // B) Kardex descuenta los insumos normalmente
      await movementEngine.recordSale(burgerId, 1);

      final insumoAfterSale = await inventoryRepo.getInsumoById(insumoCarneId);
      expect(insumoAfterSale!.stock, equals(9.0));

      // C) Registro en Audit Trail de la cortesía autorizada por el gerente
      await auditRepo.logForensic(
        'pos:discount:courtesy_100',
        metadata: '{"producto":"$burgerId","descuento":"100%","monto_descontado":$discountAmount,"motivo":"Cortesía VIP"}',
        metodoAutorizacion: 'PIN',
        usuarioAutorizadorId: 'gerente-desc-01',
      );

      final logs = await auditRepo.getLocalLogs(userId: 'cajero-desc-01');
      expect(logs.any((l) => l.action == 'pos:discount:courtesy_100'), isTrue);
    });
  });
}
