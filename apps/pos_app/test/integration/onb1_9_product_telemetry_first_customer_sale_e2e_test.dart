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
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/models/sales/invoice_item_entity.dart';
import 'package:pos_app/data/models/sales/payment_entity.dart';
import 'package:pos_app/data/repositories/audit_repository_impl.dart';
import 'package:pos_app/data/repositories/auth_repository_impl.dart';
import 'package:pos_app/data/repositories/inventory/inventory_repository_impl.dart';
import 'package:pos_app/data/repositories/sales/sales_repository_impl.dart';
import 'package:pos_app/data/repositories/tenant_capability_cache.dart';
import 'package:pos_app/data/services/activation_clock_manager.dart';
import 'package:pos_app/data/services/activation_controlled_sale_runner.dart';
import 'package:pos_app/data/services/local_auth_service.dart';
import 'package:pos_app/data/services/sales/dgi_numbering_service_impl.dart';
import 'package:pos_app/data/services/pos_first_customer_sale_observer.dart';
import 'package:pos_app/data/services/pos_product_telemetry_service.dart';
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

  group('ONB1.9E–G — Product Telemetry & First Customer Sale with Real Floor SQLite Persistence (AC-07, AC-08, AC-40, AC-41)', () {
    late Directory tempDir;
    late String dbPath;
    late AppDatabase database;
    late MockPrinterAdapter printerAdapter;
    late SalesRepositoryImpl salesRepository;
    late ActivationControlledSaleRunner saleRunner;
    late ActivationClockManager clockManager;
    late PosProductTelemetryService telemetryService;
    late PosFirstCustomerSaleObserver customerSaleObserver;

    const tenantId = 'tenant-telemetry-custsale-e2e';
    const candidateTerminalId = 'terminal-founder-telemetry-01';
    const authorizedUserId = 'user-owner-telemetry-001';
    const pin = '1357';
    const bootSession = 'boot-session-telemetry-1';
    const fiscalFingerprint = 'fp-fiscal-telemetry-001';
    const attemptId = 'attempt-telemetry-activated-001';
    const testProductId = 'prod-commercial-soda-001';

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('pos_telemetry_custsale_e2e_');
      dbPath = p.join(tempDir.path, 'telemetry_custsale_e2e.db');
      database = await $FloorAppDatabase.databaseBuilder(dbPath).build();

      printerAdapter = MockPrinterAdapter();
      final mockDio = MockDio();
      final mockAlertService = MockAlertService();
      final localAuth = LocalAuthService();
      telemetryService = PosProductTelemetryService();
      customerSaleObserver = PosFirstCustomerSaleObserver(database, telemetryService);

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
          payload: '{"businessName": "OmniFood Telemetry POS"}',
          appliedAt: '2026-09-04T12:00:00.000Z',
        ),
      );

      // Seed owner user & security profile
      await database.userDao.insertUsers([
        UserEntity(
          id: authorizedUserId,
          name: 'Telemetry Founder Owner',
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

      // Seed sellable product
      await database.productDao.insertProducts([
        ProductEntity(
          id: testProductId,
          name: 'Gaseosa Super Fria 500ml',
          sellPrice: 30.0,
          averageCost: 12.5,
          stock: 40.0,
          uom: 'UN',
          barcode: 'BAR-SODA-500',
          isActive: true,
          isPrepared: false,
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
          verificationProductId: testProductId,
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

    test('demonstrates ONB1.9E–G: Verification sale claims TTFSS, subsequent commercial sale observes First Customer Sale, and historical TTFSS claim remains immutable across SQLite power cuts', () async {
      // 1. Controlled verification sale during Activation (Hito M6)
      final verificationSaleRes = await saleRunner.executeControlledOfflineSale(
        const ControlledSaleParams(
          tenantId: tenantId,
          attemptId: attemptId,
          cashierUserId: authorizedUserId,
        ),
      );

      expect(verificationSaleRes.isSuccess, isTrue);
      final verificationTicketId = verificationSaleRes.verificationTicketId!;

      // Verify TTFSS claim is physically persisted in Floor SQLite
      final ttfssClaim = await database.firstSuccessfulSaleClaimDao.getClaimByTenantId(tenantId);
      expect(ttfssClaim, isNotNull);
      expect(ttfssClaim!.ticketId, equals(verificationTicketId));
      expect(ttfssClaim.activationAttemptId, equals(attemptId));
      expect(ttfssClaim.clockConfidence, equals('ANCHORED'));

      // Promote attempt to ACTIVATED (as finalizer would upon reconnect)
      await database.activationAttemptLocalDao.saveAttempt(
        ActivationAttemptLocalEntity(
          attemptId: attemptId,
          tenantId: tenantId,
          candidateTerminalId: candidateTerminalId,
          localStatus: 'ACTIVATED',
          requiredFiscalRevision: 1,
          requiredFiscalFingerprint: fiscalFingerprint,
          verificationProductId: testProductId,
          serverTimeAnchorAt: '2026-09-04T12:00:00.000Z',
          anchorMonotonicTicks: 0,
          bootSessionId: bootSession,
          assignedAt: '2026-09-04T12:00:00.000Z',
          updatedAt: '2026-09-04T12:05:00.000Z',
        ),
      );

      // 2. Commercial customer sale (walk-in customer buys soda)
      final commercialOccurredAt = DateTime.parse('2026-09-04T14:45:00.000Z');
      const commercialInvoiceId = 'inv-commercial-walkin-002';
      const commercialInvoiceNumber = '001-001-01-00000002';

      await database.invoiceDao.insertInvoice(
        InvoiceEntity(
          id: commercialInvoiceId,
          number: commercialInvoiceNumber,
          createdAt: commercialOccurredAt.millisecondsSinceEpoch,
          userId: authorizedUserId,
          subtotal: 30.0,
          totalTax: 0.0,
          total: 30.0,
          isCanceled: false,
          syncStatus: 'pending',
          paymentStatus: 'paid',
          globalTaxOverride: false,
          type: 'regular',
        ),
      );

      await database.invoiceItemDao.insertItems([
        InvoiceItemEntity(
          id: 'item-commercial-002',
          invoiceId: commercialInvoiceId,
          productId: testProductId,
          productName: 'Gaseosa Super Fria 500ml',
          quantity: 1.0,
          unitPrice: 30.0,
          originalTaxRate: 0.0,
          appliedTaxRate: 0.0,
          taxAmount: 0.0,
          discount: 0.0,
          total: 30.0,
        ),
      ]);

      await database.paymentDao.insertPayments([
        PaymentEntity(
          id: 'pay-commercial-002',
          invoiceId: commercialInvoiceId,
          amount: 30.0,
          method: 'cash',
          currency: 'NIO',
          createdAt: commercialOccurredAt.millisecondsSinceEpoch,
        ),
      ]);

      // Verify commercial sale persisted in Floor SQLite
      final commercialInvoiceInDb = await database.invoiceDao.getInvoiceById(commercialInvoiceId);
      expect(commercialInvoiceInDb, isNotNull);
      expect(commercialInvoiceInDb!.number, equals(commercialInvoiceNumber));
      expect(commercialInvoiceInDb.total, equals(30.0));
      expect(commercialInvoiceInDb.paymentStatus, equals('paid'));

      // 3. Observe First Customer Sale through observer
      final obsResult = await customerSaleObserver.observeCustomerSale(
        tenantId: tenantId,
        terminalId: candidateTerminalId,
        ticketId: commercialInvoiceId,
        occurredAt: commercialOccurredAt,
      );

      expect(obsResult.isFirstCustomerSale, isTrue);
      expect(obsResult.observation, isNotNull);
      expect(obsResult.observation!.ticketId, equals(commercialInvoiceId));
      expect(obsResult.historicalTtfssTicketId, equals(verificationTicketId));

      // CRUCIAL INVARIANT CHECK: Verify that historical TTFSS claim is STILL the verification ticket!
      final preservedClaim = await database.firstSuccessfulSaleClaimDao.getClaimByTenantId(tenantId);
      expect(preservedClaim, isNotNull);
      expect(preservedClaim!.ticketId, equals(verificationTicketId)); // NOT overridden!
      expect(preservedClaim.activationAttemptId, equals(attemptId));

      // Verify outbox envelope queued
      final outboxEnv = await database.activationOutboxDao.getEnvelopeByIdempotencyKey(
        tenantId,
        'onboarding:first-customer-sale:$tenantId',
      );
      expect(outboxEnv, isNotNull);
      expect(outboxEnv!.eventType, equals('FIRST_CUSTOMER_SALE_OBSERVED'));

      // Verify telemetry event emitted
      expect(telemetryService.emittedEvents.any((e) => e.eventName == 'FIRST_CUSTOMER_SALE'), isTrue);

      // 4. Force sudden power loss & close SQLite disk connection
      await database.close();

      // 5. Reboot POS terminal & reopen SQLite from disk
      database = await $FloorAppDatabase.databaseBuilder(dbPath).build();
      customerSaleObserver = PosFirstCustomerSaleObserver(database, telemetryService);

      // Verify durability across power cycles
      final rehydratedTtfss = await database.firstSuccessfulSaleClaimDao.getClaimByTenantId(tenantId);
      expect(rehydratedTtfss, isNotNull);
      expect(rehydratedTtfss!.ticketId, equals(verificationTicketId)); // TTFSS STILL PRESERVED!

      final rehydratedCustSale = await database.firstCustomerSaleObservationDao.getObservationByTenantId(tenantId);
      expect(rehydratedCustSale, isNotNull);
      expect(rehydratedCustSale!.ticketId, equals(commercialInvoiceId)); // Customer sale durable!

      // 6. Second commercial customer sale (ticket 3)
      final secondCustomerOccurredAt = DateTime.parse('2026-09-04T16:10:00.000Z');
      const secondCommercialTicketId = 'inv-commercial-walkin-003';

      final secondObs = await customerSaleObserver.observeCustomerSale(
        tenantId: tenantId,
        terminalId: candidateTerminalId,
        ticketId: secondCommercialTicketId,
        occurredAt: secondCustomerOccurredAt,
      );

      // Write-once invariant: second sale does NOT overwrite observation or TTFSS
      expect(secondObs.isFirstCustomerSale, isFalse);
      expect(secondObs.observation!.ticketId, equals(commercialInvoiceId));

      final finalClaim = await database.firstSuccessfulSaleClaimDao.getClaimByTenantId(tenantId);
      expect(finalClaim!.ticketId, equals(verificationTicketId));
    });
  });
}
