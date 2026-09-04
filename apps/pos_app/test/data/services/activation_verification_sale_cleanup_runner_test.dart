import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:mockito/mockito.dart';
import 'package:dio/dio.dart';

import 'package:pos_app/core/clock/monotonic_clock.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/activation/activation_attempt_local_entity.dart';
import 'package:pos_app/data/models/activation/first_successful_sale_claim_entity.dart';
import 'package:pos_app/data/models/inventory/product_entity.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/security_profile_entity.dart';
import 'package:pos_app/data/models/user_entity.dart';
import 'package:pos_app/data/repositories/audit_repository_impl.dart';
import 'package:pos_app/data/repositories/auth_repository_impl.dart';
import 'package:pos_app/data/repositories/inventory/inventory_repository_impl.dart';
import 'package:pos_app/data/repositories/sales/sales_repository_impl.dart';
import 'package:pos_app/data/repositories/tenant_capability_cache.dart';
import 'package:pos_app/data/services/activation_clock_manager.dart';
import 'package:pos_app/data/services/activation_controlled_sale_runner.dart';
import 'package:pos_app/data/services/activation_verification_sale_cleanup_runner.dart';
import 'package:pos_app/data/services/local_auth_service.dart';
import 'package:pos_app/data/services/sales/dgi_numbering_service_impl.dart';
import 'package:pos_app/domain/services/alerts/alert_service.dart';
import 'package:pos_app/domain/services/inventory/movement_engine_impl.dart';
import 'package:pos_app/domain/usecases/inventory/process_sale_inventory_use_case.dart';
import 'package:pos_app/domain/usecases/inventory/reverse_sale_inventory_use_case.dart';

class MockDio extends Mock implements Dio {}

class MockAlertService extends Mock implements AlertService {
  @override
  Future<void> createStockAlert(dynamic insumo, double? currentStock) =>
      Future<void>.value();
}

void main() {
  late AppDatabase database;
  late MockPrinterAdapter printerAdapter;
  late LocalAuthService localAuth;
  late MockDio mockDio;
  late MockAlertService mockAlertService;
  late TenantCapabilityCache capabilityCache;
  late AuthRepositoryImpl authRepo;
  late AuditRepositoryImpl auditRepo;
  late InventoryRepositoryImpl inventoryRepo;
  late MovementEngineImpl movementEngine;
  late DgiNumberingServiceImpl numberingService;
  late SalesRepositoryImpl salesRepo;
  late ActivationClockManager clockManager;
  late ActivationControlledSaleRunner saleRunner;
  late ActivationVerificationSaleCleanupRunner cleanupRunner;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    printerAdapter = MockPrinterAdapter();
    localAuth = LocalAuthService();
    mockDio = MockDio();
    mockAlertService = MockAlertService();

    capabilityCache = TenantCapabilityCache(
      configDao: database.localConfigDao,
      clock: StopwatchMonotonicClock(),
      bootSessionId: 'test-session-pr21-void',
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
      'pos-terminal-founder-01',
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

    clockManager = ActivationClockManager(initialBootSessionId: 'boot-session-pr21');

    saleRunner = ActivationControlledSaleRunner(
      database: database,
      salesRepository: salesRepo,
      printerPort: printerAdapter,
      clockManager: clockManager,
    );

    cleanupRunner = ActivationVerificationSaleCleanupRunner(
      database: database,
      salesRepository: salesRepo,
    );
  });

  tearDown(() async {
    await database.close();
  });

  group('ONB1.8H — Verification Sale Cleanup Path (Normal VOID & TTFSS Preservation)', () {
    const tenantId = 'tenant-founder-01';
    const attemptId = 'attempt-pr21-void-test';
    const verificationProductId = 'prod-pin-001';
    const cashierId = 'cashier-off-01';

    Future<String> executeInitialVerificationSale() async {
      await database.localConfigDao.saveConfig(LocalConfigEntity(key: 'dgi_prefix', value: '001-001-01'));
      await database.localConfigDao.saveConfig(LocalConfigEntity(key: 'dgi_current_seq', value: '1'));
      await database.localConfigDao.saveConfig(LocalConfigEntity(key: 'dgi_range_end', value: '1000'));

      await database.userDao.insertUsers([
        UserEntity(id: cashierId, name: 'Cajero Offline', role: 'CASHIER', pinHash: '', isActive: true, tenantId: tenantId),
      ]);
      await database.securityProfileDao.insertProfiles([
        SecurityProfileEntity(userId: cashierId, pinHash: localAuth.hashPin('123456'), isPinEnabled: true, isTotpEnabled: false),
      ]);
      await database.productDao.insertProducts([
        ProductEntity(id: verificationProductId, name: 'Café de Prueba', sellPrice: 50.0, averageCost: 15.0, stock: 100.0, uom: 'CUP', barcode: 'PROD-01', isActive: true, isPrepared: false, tenantId: tenantId),
      ]);
      await database.activationAttemptLocalDao.saveAttempt(
        const ActivationAttemptLocalEntity(
          attemptId: attemptId,
          tenantId: tenantId,
          candidateTerminalId: 'pos-terminal-founder-01',
          localStatus: 'RUNNING',
          requiredFiscalRevision: 1,
          requiredFiscalFingerprint: 'fiscal-fp-123',
          verificationProductId: verificationProductId,
          serverTimeAnchorAt: '2026-09-04T12:00:00.000Z',
          anchorMonotonicTicks: 0,
          bootSessionId: 'boot-session-pr21',
          assignedAt: '2026-09-04T12:00:00.000Z',
          updatedAt: '2026-09-04T12:00:00.000Z',
        ),
      );

      final saleResult = await saleRunner.executeControlledOfflineSale(
        const ControlledSaleParams(
          tenantId: tenantId,
          attemptId: attemptId,
          cashierUserId: cashierId,
        ),
      );
      expect(saleResult.isSuccess, isTrue);
      return saleResult.verificationTicketId!;
    }

    test('voids verification sale using normal Sales VOID path (is_canceled: true, NEVER DELETE)', () async {
      final ticketId = await executeInitialVerificationSale();

      final cleanupResult = await cleanupRunner.voidVerificationSale(
        const VoidVerificationSaleParams(
          tenantId: tenantId,
          attemptId: attemptId,
          reason: 'Anulación de prueba de activación controlada',
        ),
      );

      expect(cleanupResult.isSuccess, isTrue);
      expect(cleanupResult.ticketId, equals(ticketId));

      // 1. Verify DGI compliance: invoice is NEVER deleted from SQLite
      final invoice = await database.invoiceDao.getInvoiceById(ticketId);
      expect(invoice, isNotNull, reason: 'Invoice row must NOT be deleted from SQLite (DGI 09-2007)');
      expect(invoice!.isCanceled, isTrue);
      expect(invoice.voidReason, equals('Anulación de prueba de activación controlada'));
    });

    test('demonstrates that VOID of verification ticket does NOT delete or invalidate historical firstSuccessfulSale claim', () async {
      final ticketId = await executeInitialVerificationSale();

      // Read claim before VOID
      final claimBefore = await database.firstSuccessfulSaleClaimDao.getClaimByTenantId(tenantId);
      expect(claimBefore, isNotNull);
      expect(claimBefore!.ticketId, equals(ticketId));
      expect(claimBefore.clockConfidence, equals('ANCHORED'));

      // Perform VOID on the ticket
      final cleanupResult = await cleanupRunner.voidVerificationSale(
        const VoidVerificationSaleParams(
          tenantId: tenantId,
          attemptId: attemptId,
          reason: 'Anulación de verificación post-activación',
        ),
      );
      expect(cleanupResult.isSuccess, isTrue);

      // Read claim after VOID: must be completely intact
      final claimAfter = await database.firstSuccessfulSaleClaimDao.getClaimByTenantId(tenantId);
      expect(claimAfter, isNotNull, reason: 'first_successful_sale_claims row must survive invoice VOID');
      expect(claimAfter!.ticketId, equals(ticketId));
      expect(claimAfter.deviceOccurredAt, equals(claimBefore.deviceOccurredAt));
      expect(claimAfter.anchoredOccurredAt, equals(claimBefore.anchoredOccurredAt));
      expect(claimAfter.clockConfidence, equals('ANCHORED'));
      expect(claimAfter.createdAtLocal, equals(claimBefore.createdAtLocal));
      expect(claimAfter.outboxEventId, equals(claimBefore.outboxEventId));

      // Verification ticket reference on attempt still remains intact
      final attempt = await database.activationAttemptLocalDao.getAttemptById(attemptId);
      expect(attempt!.verificationTicketId, equals(ticketId));
    });
  });
}
