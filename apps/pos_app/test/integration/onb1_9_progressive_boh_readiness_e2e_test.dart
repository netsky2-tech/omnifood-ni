import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:path/path.dart' as p;
import 'package:mockito/mockito.dart';
import 'package:dio/dio.dart';

import 'package:pos_app/core/clock/monotonic_clock.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/activation/activation_attempt_local_entity.dart';
import 'package:pos_app/data/models/fiscal_config_local_entity.dart';
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
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  group('ONB1.9A–D — Progressive BOH Readiness with Real Floor SQLite Persistence (AC-07, AC-08, AC-40, AC-41)', () {
    late Directory tempDir;
    late String dbPath;
    late AppDatabase database;
    late MockPrinterAdapter printerAdapter;
    late SalesRepositoryImpl salesRepository;
    late ActivationControlledSaleRunner saleRunner;
    late ActivationClockManager clockManager;

    const tenantId = 'tenant-boh-progressive-e2e';
    const candidateTerminalId = 'terminal-founder-boh-01';
    const authorizedUserId = 'user-owner-boh-001';
    const pin = '5678';
    const bootSession = 'boot-session-boh-1';
    const fiscalFingerprint = 'fp-fiscal-boh-001';
    const attemptId = 'attempt-boh-activated-001';
    const zeroStockProductId = 'prod-zero-stock-uncosted-001';

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('pos_boh_e2e_');
      dbPath = p.join(tempDir.path, 'boh_readiness_e2e.db');
      database = await $FloorAppDatabase.databaseBuilder(dbPath).build();

      printerAdapter = MockPrinterAdapter();
      final mockDio = MockDio();
      final mockAlertService = MockAlertService();
      final localAuth = LocalAuthService();

      // Configure terminal device & DGI sequencing
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(key: 'terminal_device_id', value: candidateTerminalId),
      );
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(key: 'dgi_prefix', value: '001-001-01'),
      );
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(key: 'dgi_current_seq', value: '1'),
      );
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(key: 'dgi_range_end', value: '1000'),
      );

      // Seed fiscal configuration
      await database.fiscalConfigLocalDao.applyFiscalConfig(
        const FiscalConfigLocalEntity(
          tenantId: tenantId,
          revision: 1,
          fingerprint: fiscalFingerprint,
          payload: '{"businessName": "OmniFood Progressive BOH Cafe"}',
          appliedAt: '2026-09-04T12:00:00.000Z',
        ),
      );

      // Seed owner user & security profile
      await database.userDao.insertUsers([
        UserEntity(
          id: authorizedUserId,
          name: 'BOH Founder Owner',
          role: 'ADMIN',
          pinHash: '',
          isActive: true,
          tenantId: tenantId,
        ),
      ]);
      await database.securityProfileDao.insertProfiles([
        SecurityProfileEntity(
          userId: authorizedUserId,
          pinHash: localAuth.hashPin(pin),
          isPinEnabled: true,
          isTotpEnabled: false,
        ),
      ]);

      // Seed product with ZERO physical stock and ZERO averageCost (COST_PENDING, AC-07, AC-08)
      await database.productDao.insertProducts([
        ProductEntity(
          id: zeroStockProductId,
          name: 'Gaseosa Zero Stock BOH',
          sellPrice: 35.0,
          averageCost: 0.0, // unknown cost / COST_PENDING (AC-08)
          stock: 0.0, // zero physical stock (AC-07)
          uom: 'UN',
          barcode: 'BAR-ZERO-BOH',
          isActive: true,
          isPrepared: false, // no recipes or complex BOH required
          tenantId: tenantId,
        ),
      ]);

      // Seed established attempt with server time anchor
      clockManager = ActivationClockManager(initialBootSessionId: bootSession);
      clockManager.setAnchor(
        serverTimeAnchorAt: DateTime.parse('2026-09-04T12:00:00.000Z'),
        anchorMonotonicTicks: 0,
        serverTimeAnchorId: 'anchor-001',
        bootSessionId: bootSession,
      );

      await database.activationAttemptLocalDao.saveAttempt(
        const ActivationAttemptLocalEntity(
          attemptId: attemptId,
          tenantId: tenantId,
          candidateTerminalId: candidateTerminalId,
          localStatus: 'RUNNING',
          requiredFiscalRevision: 1,
          requiredFiscalFingerprint: fiscalFingerprint,
          verificationProductId: zeroStockProductId,
          serverTimeAnchorAt: '2026-09-04T12:00:00.000Z',
          anchorMonotonicTicks: 0,
          bootSessionId: bootSession,
          assignedAt: '2026-09-04T12:00:00.000Z',
          updatedAt: '2026-09-04T12:00:00.000Z',
        ),
      );

      final capCache = TenantCapabilityCache(
        configDao: database.localConfigDao,
        clock: StopwatchMonotonicClock(),
        bootSessionId: bootSession,
        nowUtc: () => DateTime.now().toUtc(),
      );
      final authRepo = AuthRepositoryImpl(
        database.userDao,
        database.securityProfileDao,
        localAuth,
        mockDio,
        capabilityCache: capCache,
      );
      final auditRepo = AuditRepositoryImpl(
        database.auditDao,
        authRepo,
        mockDio,
        candidateTerminalId,
        capabilityCache: capCache,
        forensicAlertDao: database.forensicAlertDao,
      );
      final invRepo = InventoryRepositoryImpl(
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
      final movementEngine = MovementEngineImpl(invRepo, mockAlertService);
      final numberingService = DgiNumberingServiceImpl(database.localConfigDao);

      salesRepository = SalesRepositoryImpl(
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
        inventoryRepository: invRepo,
      );

      saleRunner = ActivationControlledSaleRunner(
        database: database,
        salesRepository: salesRepository,
        printerPort: printerAdapter,
        clockManager: clockManager,
      );
    });

    tearDown(() async {
      await database.close();
      if (await tempDir.exists()) {
        await tempDir.delete(recursive: true);
      }
    });

    test('demonstrates AC-07 & AC-08: sellable product with stock=0 and averageCost=0 (COST_PENDING) completes sales & print lifecycle without blocking caja or failing inventory', () async {
      // 1. Execute controlled sale using the uncosted, zero-stock product (AC-07, AC-08)
      final saleResult = await saleRunner.executeControlledOfflineSale(
        const ControlledSaleParams(
          tenantId: tenantId,
          attemptId: attemptId,
          cashierUserId: authorizedUserId,
        ),
      );

      // 2. Verify sale is PAID, persisted in real SQLite, and sequential invoice generated
      expect(saleResult.isSuccess, isTrue);
      expect(saleResult.attemptStatus, equals('LOCAL_ACTIVATION_EVIDENCE_COMPLETE'));
      final ticketId = saleResult.verificationTicketId!;

      final persistedInvoice = await database.invoiceDao.getInvoiceById(ticketId);
      expect(persistedInvoice, isNotNull);
      expect(persistedInvoice!.paymentStatus, equals('paid'));
      expect(persistedInvoice.total, equals(35.0));
      expect(persistedInvoice.isCanceled, isFalse);

      // 3. Verify real thermal printer formatted output
      final printedText = printerAdapter.lastPrintedText;
      expect(printedText, isNotNull);
      expect(printedText, contains('OMNIFOOD NI'));
      expect(printedText, contains('Gaseosa Zero Stock BOH'));
      expect(printedText, contains('35.00'));

      // 4. Verify TTFSS claim is registered atomically
      final claim = await database.firstSuccessfulSaleClaimDao.getClaimByTenantId(tenantId);
      expect(claim, isNotNull);
      expect(claim!.ticketId, equals(ticketId));
      expect(claim.clockConfidence, equals('ANCHORED'));
    });

    test('demonstrates AC-40 & AC-41: subsequent BOH enrichment (adding stock, Kardex, and cost) preserves ACTIVATED state and TTFSS claim across SQLite restarts', () async {
      // 1. Perform sale with uncosted product
      final saleResult = await saleRunner.executeControlledOfflineSale(
        const ControlledSaleParams(
          tenantId: tenantId,
          attemptId: attemptId,
          cashierUserId: authorizedUserId,
        ),
      );
      expect(saleResult.isSuccess, isTrue);
      final ticketId = saleResult.verificationTicketId!;

      // Manually promote attempt to ACTIVATED (as finalizer would upon reconnect)
      final completedAt = DateTime.parse('2026-09-04T12:15:00.000Z');
      await database.activationAttemptLocalDao.saveAttempt(
        ActivationAttemptLocalEntity(
          attemptId: attemptId,
          tenantId: tenantId,
          candidateTerminalId: candidateTerminalId,
          localStatus: 'ACTIVATED',
          requiredFiscalRevision: 1,
          requiredFiscalFingerprint: fiscalFingerprint,
          verificationProductId: zeroStockProductId,
          serverTimeAnchorAt: '2026-09-04T12:00:00.000Z',
          anchorMonotonicTicks: 0,
          bootSessionId: bootSession,
          assignedAt: '2026-09-04T12:00:00.000Z',
          updatedAt: completedAt.toIso8601String(),
        ),
      );

      // 2. Subsequent BOH progressive enrichment: Add physical stock and cost
      await database.productDao.insertProducts([
        ProductEntity(
          id: zeroStockProductId,
          name: 'Gaseosa Zero Stock BOH',
          sellPrice: 35.0,
          averageCost: 15.25, // Cost now KNOWN
          stock: 120.0, // Stock now loaded
          uom: 'UN',
          barcode: 'BAR-ZERO-BOH',
          isActive: true,
          isPrepared: false,
          tenantId: tenantId,
        ),
      ]);

      // 3. Force sudden power cut & close SQLite connection to disk
      await database.close();

      // 4. Re-open SQLite from disk (simulating POS reboot after BOH enrichment)
      database = await $FloorAppDatabase.databaseBuilder(dbPath).build();

      // 5. Verify enriched product state is durable
      final enrichedProduct = await database.productDao.findProductById(zeroStockProductId);
      expect(enrichedProduct, isNotNull);
      expect(enrichedProduct!.stock, equals(120.0));
      expect(enrichedProduct.averageCost, equals(15.25));

      // 6. Verify ACTIVATED attempt and TTFSS claim survived reboot without mutation (AC-40, AC-41)
      final attempt = await database.activationAttemptLocalDao.getAttemptById(attemptId);
      expect(attempt!.localStatus, equals('ACTIVATED'));

      final claim = await database.firstSuccessfulSaleClaimDao.getClaimByTenantId(tenantId);
      expect(claim, isNotNull);
      expect(claim!.ticketId, equals(ticketId));
    });
  });
}
